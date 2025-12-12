import { createClient } from '@supabase/supabase-js';
import { DigitalAsset } from '../types';
import { v4 as uuidv4 } from 'uuid';

// Helper to safely access env vars in different environments (Vite vs standard)
const getEnvVar = (key: string) => {
  // @ts-ignore
  if (typeof import.meta !== 'undefined' && import.meta.env && import.meta.env[key]) {
    // @ts-ignore
    return import.meta.env[key];
  }
  if (typeof process !== 'undefined' && process.env && process.env[key]) {
    return process.env[key];
  }
  return '';
};

const supabaseUrl = getEnvVar('VITE_SUPABASE_URL');
const supabaseAnonKey = getEnvVar('VITE_SUPABASE_ANON_KEY');

// Conditional initialization prevents crash if keys are missing
// If keys are missing, supabase is null, preventing the "supabaseUrl is required" error
export const supabase = (supabaseUrl && supabaseAnonKey) 
  ? createClient(supabaseUrl, supabaseAnonKey) 
  : null;

export const contributeAssetToGlobalCorpus = async (
  asset: DigitalAsset,
  walletAddress?: string
) => {
  // Fallback simulation if Supabase is not configured
  if (!supabase) {
    console.warn("Supabase is not configured (missing VITE_SUPABASE_URL). Simulating contribution...");
    // Simulate network delay
    await new Promise(resolve => setTimeout(resolve, 1500));
    return { success: true, contributorId: walletAddress || uuidv4() };
  }

  if (!asset.sqlRecord || !asset.imageUrl) {
    throw new Error("Asset is missing SQL record or Image URL");
  }

  const contributorId = walletAddress || uuidv4();

  try {
    // 1. Upload original image to Supabase Storage
    const response = await fetch(asset.imageUrl);
    const blob = await response.blob();
    // Default to jpg if format is generic or missing
    const fileExt = asset.sqlRecord.FILE_FORMAT.includes('/') ? asset.sqlRecord.FILE_FORMAT.split('/').pop() : 'jpg';
    const fileName = `${asset.id}.${fileExt}`;

    const { error: uploadError } = await supabase.storage
      .from('corpus-images')
      .upload(fileName, blob, {
        upsert: true,
        contentType: asset.sqlRecord.FILE_FORMAT
      });

    if (uploadError) throw uploadError;

    const { data: publicUrlData } = supabase.storage
      .from('corpus-images')
      .getPublicUrl(fileName);

    // 2. Save full enriched record to global table
    const { error } = await supabase
      .from('historical_documents_global')
      .upsert({
        ...asset.sqlRecord,
        CONTRIBUTOR_ID: contributorId,
        CONTRIBUTED_AT: new Date().toISOString(),
        DATA_LICENSE: 'GEOGRAPH_CORPUS_1.0',
        CONTRIBUTOR_NFT_MINTED: false,
        original_image_url: publicUrlData.publicUrl,
        // We don't store the raw blob in the DB row, just the URL
      });

    if (error) throw error;

    return { success: true, contributorId };
  } catch (err) {
    console.error("Supabase contribution failed:", err);
    throw err;
  }
};