import { createClient } from '@supabase/supabase-js';
import { DigitalAsset, AssetStatus, GraphNode, GraphLink } from '../types';
import { v4 as uuidv4 } from 'uuid';

const getEnvVar = (key: string) => {
  if (typeof process !== 'undefined' && process.env && process.env[key]) {
    return process.env[key];
  }
  return '';
};

const supabaseUrl = getEnvVar('VITE_SUPABASE_URL');
const supabaseAnonKey = getEnvVar('VITE_SUPABASE_ANON_KEY');

export const supabase = (supabaseUrl && supabaseAnonKey) 
  ? createClient(supabaseUrl, supabaseAnonKey) 
  : null;

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
    const entities: string[] = Array.isArray(row.ENTITIES_EXTRACTED) 
      ? row.ENTITIES_EXTRACTED 
      : (typeof row.ENTITIES_EXTRACTED === 'string' ? JSON.parse(row.ENTITIES_EXTRACTED) : []);
    
    const nodes: GraphNode[] = [
      { 
        id: row.ASSET_ID, 
        label: row.DOCUMENT_TITLE, 
        type: 'DOCUMENT', 
        relevance: 1.0,
        license: row.DATA_LICENSE 
      }
    ];

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

export const contributeAssetToGlobalCorpus = async (
  asset: DigitalAsset,
  contributorId?: string,
  licenseType: 'GEOGRAPH_CORPUS_1.0' | 'CC0' = 'GEOGRAPH_CORPUS_1.0'
) => {
  const finalContributorId = contributorId || `anon_${uuidv4()}`;

  if (!supabase) {
    console.warn("Supabase not configured. Skipping cloud contribution.");
    return { success: false, reason: "CONFIG_MISSING" };
  }

  if (!asset.sqlRecord || !asset.imageUrl) {
    throw new Error("Asset missing critical contribution data");
  }

  try {
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

    const { error } = await supabase
      .from('historical_documents_global')
      .upsert({
        ...asset.sqlRecord,
        CONTRIBUTOR_ID: finalContributorId,
        CONTRIBUTED_AT: new Date().toISOString(),
        DATA_LICENSE: licenseType,
        original_image_url: publicUrl,
        user_id: contributorId && !contributorId.startsWith('anon_') ? contributorId : null
      });

    if (error) throw error;

    return { success: true, publicUrl, contributorId: finalContributorId };
  } catch (err) {
    console.error("Supabase sync failed:", err);
    throw err;
  }
};