import { DigitalAsset, AssetStatus, GraphNode, GraphLink } from '../types';
import { v4 as uuidv4 } from 'uuid';
import { supabase, masterSupabase, isSupabaseConfigured, isMasterConfigured, isDualWriteRequired, testSupabaseConnection } from '../lib/supabaseClient';
import { encryptData, decryptData } from '../lib/encryption';
import type { Database } from '../lib/database.types';
import { logger } from '../lib/logger';
import { dualWriteUpsert } from './dualWriteService';

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

  // Parse JSONB fields — guard JSON.parse to prevent a single malformed row
  // from crashing the entire data pipeline.
  let entities: string[] = [];
  try {
    entities = Array.isArray(row.ENTITIES_EXTRACTED) 
      ? row.ENTITIES_EXTRACTED 
      : (typeof row.ENTITIES_EXTRACTED === 'string' ? JSON.parse(row.ENTITIES_EXTRACTED) : []);
  } catch { entities = []; }
  
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
  // At minimum, the master Loadopoly DB must be reachable
  if (!masterSupabase && !supabase) {
    logger.warn('No Supabase client configured. Skipping cloud contribution.');
    return { success: false, reason: 'CONFIG_MISSING' };
  }

  // Only anonymous users without auto-save need contributor ID
  const finalContributorId = userId || `anon_${uuidv4()}`;

  if (!asset.sqlRecord || !asset.imageUrl) {
    throw new Error('Asset missing critical contribution data');
  }

  try {
    // 1. Storage Upload: Only if it's a local blob
    //    Always upload to master storage first, then mirror to user storage
    let publicUrl = asset.imageUrl;
    if (asset.imageUrl.startsWith('blob:') || (asset as any).imageBlob) {
      // Prefer the raw imageBlob (survives page navigations) over fetching the blob URL
      let blob: Blob;
      if ((asset as any).imageBlob) {
        blob = (asset as any).imageBlob;
      } else {
        const response = await fetch(asset.imageUrl);
        blob = await response.blob();
      }
      const fileExt = asset.sqlRecord.FILE_FORMAT.split('/').pop() || 'jpg';
      const fileName = `${asset.id}_${Date.now()}.${fileExt}`;

      // Upload to master storage (Loadopoly)
      const storageClient = masterSupabase || supabase;
      if (storageClient) {
        const { error: uploadError } = await storageClient.storage
          .from('corpus-images')
          .upload(fileName, blob, {
            upsert: true,
            contentType: blob.type,
          });

        if (uploadError) throw uploadError;

        const { data: publicUrlData } = storageClient.storage
          .from('corpus-images')
          .getPublicUrl(fileName);

        publicUrl = publicUrlData.publicUrl;
      }

      // Mirror to user storage if dual-write is active
      if (isDualWriteRequired() && supabase) {
        try {
          await supabase.storage
            .from('corpus-images')
            .upload(fileName, blob, { upsert: true, contentType: blob.type });
        } catch (mirrorErr) {
          logger.warn('Image mirror to user storage failed (non-fatal)', {
            module: 'supabaseService',
            error: mirrorErr,
          });
        }
      }
    }

    // 2. Database Upsert — via dual-write to guarantee master persistence
    let sqlRecord = { ...asset.sqlRecord };

    // Encrypt sensitive data if user is authenticated
    if (userId && sqlRecord.RAW_OCR_TRANSCRIPTION) {
      sqlRecord.RAW_OCR_TRANSCRIPTION = await encryptData(sqlRecord.RAW_OCR_TRANSCRIPTION, userId);
      if (sqlRecord.DOCUMENT_DESCRIPTION) {
        sqlRecord.DOCUMENT_DESCRIPTION = await encryptData(sqlRecord.DOCUMENT_DESCRIPTION, userId);
      }
    }

    const upsertRecord = {
      ...sqlRecord,
      CONTRIBUTOR_ID: finalContributorId,
      CONTRIBUTED_AT: new Date().toISOString(),
      DATA_LICENSE: licenseType,
      ORIGINAL_IMAGE_URL: publicUrl,
      USER_ID: userId || null,
      IS_ENTERPRISE: sqlRecord.IS_ENTERPRISE || false,
    };

    const writeResult = await dualWriteUpsert(
      'historical_documents_global',
      upsertRecord as Record<string, unknown>,
    );

    if (!writeResult.master) {
      logger.error('CRITICAL: Master DB write failed during contribution', {
        module: 'supabaseService',
        operation: 'contributeAssetToGlobalCorpus',
        assetId: asset.id,
        errors: writeResult.errors,
      });
      throw new Error(
        `Master DB write failed: ${writeResult.errors.master ?? 'unknown error'}`,
      );
    }

    if (writeResult.user === false) {
      logger.warn('User-DB write failed during contribution (data safe in master)', {
        module: 'supabaseService',
        assetId: asset.id,
      });
    }

    return { success: true, publicUrl, contributorId: finalContributorId };
  } catch (err) {
    logger.error('Supabase sync failed', { module: 'supabaseService', error: err });
    throw err;
  }
};

/**
 * Ensures assets created by server-side queue/edge processing are mirrored into
 * the Loadopoly master corpus when users run a separate Supabase instance.
 *
 * Guardrails:
 * - Runs only when dual-write mode is active
 * - Runs only for fully processed assets
 * - Skips rows already marked with CONTRIBUTED_AT to prevent loops
 */
export const mirrorEdgeAssetToMasterIfNeeded = async (
  asset: DigitalAsset,
  userId?: string,
): Promise<void> => {
  if (!isDualWriteRequired()) return;
  if (!asset?.sqlRecord) return;

  const record = asset.sqlRecord as Record<string, any>;
  const isMinted =
    asset.status === AssetStatus.MINTED ||
    record.PROCESSING_STATUS === AssetStatus.MINTED;
  const alreadyContributed = Boolean(record.CONTRIBUTED_AT);

  if (!isMinted || alreadyContributed) return;

  const licenseType: 'GEOGRAPH_CORPUS_1.0' | 'CC0' =
    record.DATA_LICENSE === 'CC0' ? 'CC0' : 'GEOGRAPH_CORPUS_1.0';

  await contributeAssetToGlobalCorpus(
    asset,
    userId || record.USER_ID || undefined,
    licenseType,
    true,
  );
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
 * Uses dual-write to ensure the transaction is persisted to the Loadopoly master DB.
 */
export const recordWeb3Transaction = async (
  userId: string,
  assetId: string,
  txHash: string,
  details: any
) => {
  if (!masterSupabase && !supabase) return;

  try {
    const detailsString = JSON.stringify(details);
    const encryptedDetails = await encryptData(detailsString, userId);

    const insertData: Record<string, unknown> = {
      USER_ID: userId,
      ASSET_ID: assetId,
      TX_HASH: txHash,
      DETAILS: encryptedDetails,
    };

    // Always write to master DB
    if (masterSupabase) {
      const { error } = await (masterSupabase as any)
        .from('web3_transactions')
        .insert(insertData);

      if (error) {
        logger.error('Master DB web3 transaction insert failed', {
          module: 'supabaseService',
          assetId,
          error,
        });
      }
    }

    // Mirror to user DB if dual-write is active
    if (isDualWriteRequired() && supabase) {
      try {
        const { error } = await (supabase as any)
          .from('web3_transactions')
          .insert(insertData);

        if (error) throw error;
      } catch (userErr) {
        logger.warn('User-DB web3 transaction insert failed (non-fatal)', {
          module: 'supabaseService',
          assetId,
          error: userErr,
        });
      }
    }
  } catch (err) {
    logger.error('Failed to record web3 transaction', {
      module: 'supabaseService',
      assetId,
      error: err,
    });
  }
};
