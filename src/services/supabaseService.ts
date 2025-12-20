import { DigitalAsset, AssetStatus, GraphNode, GraphLink, HistoricalDocumentMetadata } from '../types';
import { v4 as uuidv4 } from 'uuid';
import { supabase, isSupabaseConfigured, testSupabaseConnection } from '../lib/supabaseClient';
import { encryptData, decryptData } from '../lib/encryption';
import type { Database } from '../lib/database.types';

// Re-export utilities for convenience
export { supabase, isSupabaseConfigured, testSupabaseConnection };

/**
 * Fetches the entire global corpus and transforms it into DigitalAsset format.
 * Reconstructs the Knowledge Graph from flattened SQL relationships.
 */
export const fetchGlobalCorpus = async (): Promise<DigitalAsset[]> => {
  if (!supabase) return [];

  const { data, error } = await supabase
    .from('historical_documents_global')
    .select('*')
    .order('created_at', { ascending: false })
    .limit(2000);

  if (error) {
    console.error("Error fetching global corpus:", error);
    throw error;
  }

  return data.map((row: any) => {
    // 1. Parse JSONB fields
    const entities: string[] = Array.isArray(row.ENTITIES_EXTRACTED) 
      ? row.ENTITIES_EXTRACTED 
      : (typeof row.ENTITIES_EXTRACTED === 'string' ? JSON.parse(row.ENTITIES_EXTRACTED) : []);
    
    // 2. Reconstruct Nodes
    const nodes: GraphNode[] = [
      { 
        id: row.ASSET_ID, 
        label: row.DOCUMENT_TITLE, 
        type: 'DOCUMENT', 
        relevance: 1.0,
        license: row.DATA_LICENSE 
      }
    ];

    // 3. Reconstruct Links & Entity Nodes
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
        source: row.ASSET_ID,
        target: entityId,
        relationship: 'CONTAINS'
      });
    });

    // 4. Return complete DigitalAsset
    return {
      id: row.ASSET_ID,
      imageUrl: row.original_image_url || '', 
      timestamp: row.LOCAL_TIMESTAMP,
      ocrText: row.RAW_OCR_TRANSCRIPTION,
      status: AssetStatus.MINTED,
      graphData: { nodes, links },
      sqlRecord: {
        ...row,
        ENTITIES_EXTRACTED: entities,
        KEYWORDS_TAGS: Array.isArray(row.KEYWORDS_TAGS) ? row.KEYWORDS_TAGS : [],
        PRESERVATION_EVENTS: Array.isArray(row.PRESERVATION_EVENTS) ? row.PRESERVATION_EVENTS : []
      }
    };
  });
};

/**
 * Fetches assets belonging to a specific authenticated user.
 */
export const fetchUserAssets = async (userId: string): Promise<DigitalAsset[]> => {
  if (!supabase || !userId) return [];

  const { data, error } = await supabase
    .from('historical_documents_global')
    .select('*')
    .eq('user_id', userId)
    .order('created_at', { ascending: false });

  if (error) {
    console.error("Error fetching user assets:", error);
    throw error;
  }

  const assets = await Promise.all(data.map(async (row: any) => {
    // Decrypt sensitive data if it looks encrypted (base64)
    let ocrText = row.RAW_OCR_TRANSCRIPTION;
    let description = row.DOCUMENT_DESCRIPTION;

    if (ocrText && ocrText.length > 20 && !ocrText.includes(' ')) {
      ocrText = await decryptData(ocrText, userId);
    }
    if (description && description.length > 20 && !description.includes(' ')) {
      description = await decryptData(description, userId);
    }

    // Parse JSONB fields
    const entities: string[] = Array.isArray(row.ENTITIES_EXTRACTED) 
      ? row.ENTITIES_EXTRACTED 
      : (typeof row.ENTITIES_EXTRACTED === 'string' ? JSON.parse(row.ENTITIES_EXTRACTED) : []);
    
    // Reconstruct Nodes
    const nodes: GraphNode[] = [
      { 
        id: row.ASSET_ID, 
        label: row.DOCUMENT_TITLE, 
        type: 'DOCUMENT', 
        relevance: 1.0,
        license: row.DATA_LICENSE 
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
        source: row.ASSET_ID,
        target: entityId,
        relationship: 'CONTAINS'
      });
    });

    // Return complete DigitalAsset
    return {
      id: row.ASSET_ID,
      imageUrl: row.original_image_url || '', 
      timestamp: row.LOCAL_TIMESTAMP,
      ocrText: ocrText,
      status: AssetStatus.MINTED,
      graphData: { nodes, links },
      sqlRecord: {
        ...row,
        RAW_OCR_TRANSCRIPTION: ocrText,
        DOCUMENT_DESCRIPTION: description,
        ENTITIES_EXTRACTED: entities,
        KEYWORDS_TAGS: Array.isArray(row.KEYWORDS_TAGS) ? row.KEYWORDS_TAGS : [],
        PRESERVATION_EVENTS: Array.isArray(row.PRESERVATION_EVENTS) ? row.PRESERVATION_EVENTS : []
      }
    };
  }));

  return assets;
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
  isAutoSave: boolean = false,
  processingFailed: boolean = false,
  errorMessage?: string
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

    // Determine if this should go to anonymous corpus (failed processing)
    const isAnonymousCorpus = processingFailed || asset.status === AssetStatus.FAILED;
    const requiresSuperuserReview = isAnonymousCorpus;

    const { error } = await supabase
      .from('historical_documents_global')
      .upsert({
        ...sqlRecord,
        CONTRIBUTOR_ID: finalContributorId,
        CONTRIBUTED_AT: new Date().toISOString(),
        DATA_LICENSE: licenseType,
        original_image_url: publicUrl,
        user_id: userId || null,
        PROCESSING_ERROR_MESSAGE: errorMessage || null,
        REQUIRES_SUPERUSER_REVIEW: requiresSuperuserReview,
        IS_ANONYMOUS_CORPUS: isAnonymousCorpus,
        ENTERPRISE_ONLY: isAnonymousCorpus // Anonymous corpus is enterprise-only
      } as any);

    if (error) throw error;

    return { success: true, publicUrl, contributorId: finalContributorId };
  } catch (err) {
    console.error("Supabase sync failed:", err);
    throw err;
  }
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

    const insertData: Database['public']['Tables']['web3_transactions']['Insert'] = {
      user_id: userId,
      asset_id: assetId,
      tx_hash: txHash,
      details: encryptedDetails
    };

    const { error } = await (supabase as any)
      .from('web3_transactions')
      .insert(insertData);

    if (error) throw error;
  } catch (err) {
    console.error("Failed to record web3 transaction:", err);
  }
};

/**
 * Fetches assets that require superuser review (failed processing).
 * Only accessible to users with SUPERUSER role.
 */
export const fetchFailedAssets = async (): Promise<DigitalAsset[]> => {
  if (!supabase) return [];

  const { data, error } = await supabase
    .from('historical_documents_global')
    .select('*')
    .eq('REQUIRES_SUPERUSER_REVIEW', true)
    .order('created_at', { ascending: false });

  if (error) {
    console.error("Error fetching failed assets:", error);
    throw error;
  }

  return data.map((row: any) => {
    // Parse JSONB fields
    const entities: string[] = Array.isArray(row.ENTITIES_EXTRACTED) 
      ? row.ENTITIES_EXTRACTED 
      : (typeof row.ENTITIES_EXTRACTED === 'string' ? JSON.parse(row.ENTITIES_EXTRACTED) : []);
    
    // Reconstruct Nodes
    const nodes: GraphNode[] = [
      { 
        id: row.ASSET_ID, 
        label: row.DOCUMENT_TITLE || 'Failed Asset', 
        type: 'DOCUMENT', 
        relevance: 1.0,
        license: row.DATA_LICENSE 
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
        source: row.ASSET_ID,
        target: entityId,
        relationship: 'CONTAINS'
      });
    });

    // Return complete DigitalAsset
    return {
      id: row.ASSET_ID,
      imageUrl: row.original_image_url || '', 
      timestamp: row.LOCAL_TIMESTAMP,
      ocrText: row.RAW_OCR_TRANSCRIPTION || '',
      status: AssetStatus.FAILED,
      errorMessage: row.PROCESSING_ERROR_MESSAGE,
      graphData: { nodes, links },
      sqlRecord: {
        ...row,
        ENTITIES_EXTRACTED: entities,
        KEYWORDS_TAGS: Array.isArray(row.KEYWORDS_TAGS) ? row.KEYWORDS_TAGS : [],
        PRESERVATION_EVENTS: Array.isArray(row.PRESERVATION_EVENTS) ? row.PRESERVATION_EVENTS : []
      }
    };
  });
};

/**
 * Updates an asset's processing status after superuser review.
 * Only accessible to users with SUPERUSER role.
 */
export const updateAssetAfterReview = async (
  assetId: string,
  newStatus: AssetStatus,
  updates: Partial<HistoricalDocumentMetadata>
) => {
  if (!supabase) {
    console.warn("Supabase not configured.");
    return { success: false };
  }

  try {
    const { error } = await supabase
      .from('historical_documents_global')
      .update({
        ...updates,
        PROCESSING_STATUS: newStatus,
        REQUIRES_SUPERUSER_REVIEW: newStatus === AssetStatus.FAILED,
        IS_ANONYMOUS_CORPUS: newStatus === AssetStatus.FAILED,
        LAST_MODIFIED: new Date().toISOString()
      } as any)
      .eq('ASSET_ID', assetId);

    if (error) throw error;

    return { success: true };
  } catch (err) {
    console.error("Failed to update asset:", err);
    throw err;
  }
};
