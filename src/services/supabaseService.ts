import { DigitalAsset, AssetStatus, GraphNode, GraphLink } from '../types';
import { v4 as uuidv4 } from 'uuid';
import { supabase, isSupabaseConfigured, testSupabaseConnection } from '../lib/supabaseClient';
import { encryptData, decryptData } from '../lib/encryption';
import type { Database } from '../lib/database.types';
import { logger } from '../lib/logger';

// Re-export utilities for convenience
export { supabase, isSupabaseConfigured, testSupabaseConnection };

/**
 * Helper to map a Supabase row to a DigitalAsset, handling case inconsistencies.
 */
const mapRowToAsset = async (row: any, userId?: string): Promise<DigitalAsset> => {
  const assetId = row.ASSET_ID || row.ID;
  const docTitle = row.DOCUMENT_TITLE || 'Untitled Document';
  const dataLicense = row.DATA_LICENSE || 'GEOGRAPH_CORPUS_1.0';
  
  // Decrypt sensitive data if it looks encrypted (base64) and userId is provided
  let ocrText = row.RAW_OCR_TRANSCRIPTION || '';
  let description = row.DOCUMENT_DESCRIPTION || '';

  if (userId) {
    if (ocrText && ocrText.length > 20 && !ocrText.includes(' ')) {
      try { ocrText = await decryptData(ocrText, userId); } catch (e) {}
    }
    if (description && description.length > 20 && !description.includes(' ')) {
      try { description = await decryptData(description, userId); } catch (e) {}
    }
  }

  // Parse JSONB fields
  const entities: string[] = Array.isArray(row.ENTITIES_EXTRACTED) 
    ? row.ENTITIES_EXTRACTED 
    : (typeof row.ENTITIES_EXTRACTED === 'string' ? JSON.parse(row.ENTITIES_EXTRACTED) : []);
  
  // Reconstruct Nodes
  const nodes: GraphNode[] = [
    { 
      id: assetId, 
      label: docTitle, 
      type: 'DOCUMENT', 
      relevance: 1.0,
      license: dataLicense 
    }
  ];

  // Reconstruct Links & Entity Nodes
  const links: GraphLink[] = [];
  entities.forEach(entity => {
    const entityId = `ENT_${entity.replace(/\s+/g, '_').toUpperCase()}`;
    nodes.push({
      id: entityId,
      label: entity,
      type: 'CONCEPT',
      relevance: 0.8
    });
    links.push({
      source: assetId,
      target: entityId,
      relationship: 'CONTAINS'
    });
  });

  return {
    id: assetId,
    imageUrl: row.ORIGINAL_IMAGE_URL || '', 
    timestamp: row.LOCAL_TIMESTAMP || row.CREATED_AT,
    ocrText: ocrText,
    status: (row.PROCESSING_STATUS as AssetStatus) || AssetStatus.MINTED,
    graphData: { nodes, links },
    tokenization: {
      tokenCount: row.TOKEN_COUNT || 0,
      vocabularySize: 0,
      topTokens: [],
      embeddingVectorPreview: []
    },
    gisMetadata: row.LOCAL_GIS_ZONE ? {
      zoneType: row.LOCAL_GIS_ZONE,
      estimatedElevation: row.ESTIMATED_ELEVATION || '',
      nearbyLandmarks: Array.isArray(row.NEARBY_LANDMARKS) ? row.NEARBY_LANDMARKS : [],
      environmentalContext: row.ENVIRONMENTAL_CONTEXT || '',
      coordinateSystem: row.COORDINATE_SYSTEM || 'WGS84'
    } : undefined,
    sqlRecord: {
      ...row,
      ASSET_ID: assetId,
      DOCUMENT_TITLE: docTitle,
      DOCUMENT_DESCRIPTION: description,
      RAW_OCR_TRANSCRIPTION: ocrText,
      DATA_LICENSE: dataLicense,
      ENTITIES_EXTRACTED: entities,
      KEYWORDS_TAGS: Array.isArray(row.KEYWORDS_TAGS) ? row.KEYWORDS_TAGS : [],
      PRESERVATION_EVENTS: Array.isArray(row.PRESERVATION_EVENTS) ? row.PRESERVATION_EVENTS : [],
      IS_ENTERPRISE: row.IS_ENTERPRISE || false,
      SCAN_TYPE: row.SCAN_TYPE || 'DOCUMENT',
      ALT_TEXT_SHORT: row.ALT_TEXT_SHORT,
      ALT_TEXT_LONG: row.ALT_TEXT_LONG,
      READING_ORDER: row.READING_ORDER,
      ACCESSIBILITY_SCORE: row.ACCESSIBILITY_SCORE
    }
  };
};

/**
 * Fetches the entire global corpus and transforms it into DigitalAsset format.
 * Reconstructs the Knowledge Graph from flattened SQL relationships.
 */
export const fetchGlobalCorpus = async (onlyEnterprise: boolean = false): Promise<DigitalAsset[]> => {
  if (!supabase) return [];

  let query = supabase
    .from('historical_documents_global')
    .select('*')
    .order('CREATED_AT', { ascending: false })
    .limit(2000);

  // Try to filter by IS_ENTERPRISE if requested, but handle cases where column might be missing
  if (onlyEnterprise) {
    query = query.eq('IS_ENTERPRISE', true);
  }

  let { data, error } = await query;

  // Fallback: If the query failed (likely due to missing IS_ENTERPRISE column), try without the filter
  if (error && onlyEnterprise) {
    console.warn("Filtering by IS_ENTERPRISE failed, fetching all assets instead.", error);
    const fallbackQuery = supabase
      .from('historical_documents_global')
      .select('*')
      .order('CREATED_AT', { ascending: false })
      .limit(2000);
    const fallbackResult = await fallbackQuery;
    data = fallbackResult.data;
    error = fallbackResult.error;
  }

  if (error) {
    console.error("Error fetching global corpus:", error);
    throw error;
  }

  if (!data) return [];

  return Promise.all(data.map(row => mapRowToAsset(row)));
};

/**
 * Fetches assets belonging to a specific authenticated user.
 */
export const fetchUserAssets = async (userId: string): Promise<DigitalAsset[]> => {
  if (!supabase || !userId) return [];

  const { data, error } = await supabase
    .from('historical_documents_global')
    .select('*')
    .eq('USER_ID', userId)
    .order('CREATED_AT', { ascending: false });

  if (error) {
    console.error("Error fetching user assets:", error);
    throw error;
  }

  if (!data) return [];
  return Promise.all(data.map(row => mapRowToAsset(row, userId)));
};

/**
 * Uploads local processing results to the Supabase repository.
 * Handles both the relational SQL record and the binary image storage.
 * For authenticated users, this is automatic. For anonymous users, it's opt-in.
 */
export const contributeAssetToGlobalCorpus = async (
  asset: DigitalAsset,
  userId?: string,
  licenseType: 'GEOGRAPH_CORPUS_1.0' | 'CC0' = 'GEOGRAPH_CORPUS_1.0',
  isAutoSave: boolean = false
) => {
  if (!supabase) {
    console.warn("Supabase not configured. Skipping cloud contribution.");
    return { success: false, reason: "CONFIG_MISSING" };
  }

  // Only anonymous users without auto-save need contributor ID
  const finalContributorId = userId || `anon_${uuidv4()}`;

  if (!asset.sqlRecord || !asset.imageUrl) {
    throw new Error("Asset missing critical contribution data");
  }

  try {
    // 1. Storage Upload: Only if it's a local blob
    let publicUrl = asset.imageUrl;
    if (asset.imageUrl.startsWith('blob:')) {
      const response = await fetch(asset.imageUrl);
      const blob = await response.blob();
      const fileExt = asset.sqlRecord.FILE_FORMAT.split('/').pop() || 'jpg';
      const fileName = `${asset.id}_${Date.now()}.${fileExt}`;

      const { error: uploadError } = await supabase.storage
        .from('corpus-images')
        .upload(fileName, blob, {
          upsert: true,
          contentType: blob.type
        });

      if (uploadError) throw uploadError;

      const { data: publicUrlData } = supabase.storage
        .from('corpus-images')
        .getPublicUrl(fileName);
        
      publicUrl = publicUrlData.publicUrl;
    }

    // 2. Database Upsert
    let sqlRecord = { ...asset.sqlRecord };
    
    // Encrypt sensitive data if user is authenticated
    if (userId && sqlRecord.RAW_OCR_TRANSCRIPTION) {
      sqlRecord.RAW_OCR_TRANSCRIPTION = await encryptData(sqlRecord.RAW_OCR_TRANSCRIPTION, userId);
      if (sqlRecord.DOCUMENT_DESCRIPTION) {
        sqlRecord.DOCUMENT_DESCRIPTION = await encryptData(sqlRecord.DOCUMENT_DESCRIPTION, userId);
      }
    }

    const { data, error } = await supabase
      .from('historical_documents_global')
      .upsert({
        ...sqlRecord,
        CONTRIBUTOR_ID: finalContributorId,
        CONTRIBUTED_AT: new Date().toISOString(),
        DATA_LICENSE: licenseType,
        ORIGINAL_IMAGE_URL: publicUrl,
        USER_ID: userId || null,
        IS_ENTERPRISE: sqlRecord.IS_ENTERPRISE || false
      } as any);

    if (error) {
      console.error("Supabase upsert error details:", error);
      throw error;
    }
    
    return { success: true, publicUrl, contributorId: finalContributorId };
  } catch (err) {
    console.error("Supabase sync failed:", err);
    throw err;
  }
};

/**
 * Subscribe to real-time asset updates for a user.
 * This is more efficient than polling processing_queue - we watch the final destination table.
 */
export const subscribeToAssetUpdates = (
  userId: string,
  onAssetUpdated: (asset: DigitalAsset) => void,
  onAssetInserted: (asset: DigitalAsset) => void
): (() => void) => {
  if (!supabase || !userId) {
    logger.warn('Cannot subscribe to asset updates: Supabase not configured or no userId');
    return () => {};
  }

  const channel = supabase
    .channel(`assets:${userId}`)
    .on(
      'postgres_changes',
      {
        event: 'UPDATE',
        schema: 'public',
        table: 'historical_documents_global',
        filter: `USER_ID=eq.${userId}`,
      },
      async (payload) => {
        try {
          const asset = await mapRowToAsset(payload.new, userId);
          logger.debug('Asset updated via Realtime', { assetId: asset.id, status: asset.status });
          onAssetUpdated(asset);
        } catch (err) {
          logger.error('Failed to map updated asset', { error: err });
        }
      }
    )
    .on(
      'postgres_changes',
      {
        event: 'INSERT',
        schema: 'public',
        table: 'historical_documents_global',
        filter: `USER_ID=eq.${userId}`,
      },
      async (payload) => {
        try {
          const asset = await mapRowToAsset(payload.new, userId);
          logger.debug('Asset inserted via Realtime', { assetId: asset.id });
          onAssetInserted(asset);
        } catch (err) {
          logger.error('Failed to map inserted asset', { error: err });
        }
      }
    )
    .subscribe((status) => {
      if (status === 'SUBSCRIBED') {
        logger.info(`Subscribed to asset updates for user ${userId}`);
      }
    });

  // Return unsubscribe function
  return () => {
    supabase?.removeChannel(channel);
  };
};

/**
 * Records a Web3 transaction in Supabase with optional encryption.
 */
export const recordWeb3Transaction = async (
  userId: string,
  assetId: string,
  txHash: string,
  details: any
) => {
  if (!supabase) return;

  try {
    const detailsString = JSON.stringify(details);
    const encryptedDetails = await encryptData(detailsString, userId);

    const insertData: any = {
      USER_ID: userId,
      ASSET_ID: assetId,
      TX_HASH: txHash,
      DETAILS: encryptedDetails
    };

    const { error } = await (supabase as any)
      .from('web3_transactions')
      .insert(insertData);

    if (error) throw error;
  } catch (err) {
    console.error("Failed to record web3 transaction:", err);
  }
};
