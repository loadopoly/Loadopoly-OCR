/**
 * Deduplication Service v3 - Vector-Based
 * 
 * Uses pgvector embeddings for O(n log n) similarity search.
 * Falls back to V2 (text-based) when embeddings unavailable.
 * 
 * Features:
 * - Gemini embeddings for semantic similarity
 * - pgvector cosine similarity for fast ANN search
 * - Hybrid approach: vector + text matching
 * - Pre-computed cluster caching
 */

import { DigitalAsset } from '../types';
import { supabase, isSupabaseConfigured } from '../lib/supabaseClient';
import { logger } from '../lib/logger';
import { 
  findDuplicateClustersV2, 
  calculateSimilarityV2,
  DeduplicationResult,
  DeduplicationCluster,
  SimilarityMatch,
  DEFAULT_CONFIG,
  DeduplicationConfig
} from './deduplicationServiceV2';

// ============================================
// Types
// ============================================

export interface VectorSearchResult {
  assetId: string;
  documentTitle: string;
  similarity: number;
  sourceCollection?: string;
}

export interface EmbeddingData {
  assetId: string;
  titleEmbedding: number[];
  contentEmbedding: number[];
  combinedEmbedding: number[];
}

export interface DuplicateCandidate {
  assetA: string;
  assetB: string;
  similarity: number;
  titleA: string;
  titleB: string;
}

// ============================================
// Embedding Generation (via Gemini)
// ============================================

/**
 * Generate text embedding using Gemini's embedding model
 */
async function generateEmbedding(text: string): Promise<number[] | null> {
  const apiKey = localStorage.getItem('geograph-gemini-key') || 
                 localStorage.getItem('geograph-llm-key-Gemini 2.5 Flash');
  
  if (!apiKey || !text || text.length < 5) {
    return null;
  }

  try {
    // Use Gemini's embedding endpoint
    const response = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/text-embedding-004:embedContent?key=${apiKey}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          model: 'models/text-embedding-004',
          content: { parts: [{ text }] },
          taskType: 'SEMANTIC_SIMILARITY'
        })
      }
    );

    if (!response.ok) {
      logger.warn('Embedding generation failed', { status: response.status });
      return null;
    }

    const data = await response.json();
    return data.embedding?.values || null;
  } catch (error) {
    logger.error('Failed to generate embedding', error);
    return null;
  }
}

/**
 * Generate combined embedding for a document
 */
export async function generateDocumentEmbeddings(asset: DigitalAsset): Promise<EmbeddingData | null> {
  const record = asset.sqlRecord;
  if (!record) return null;

  const title = record.DOCUMENT_TITLE || '';
  const content = [
    record.DOCUMENT_DESCRIPTION || '',
    asset.ocrText || '',
    (record.ENTITIES_EXTRACTED || []).join(' '),
    (record.KEYWORDS_TAGS || []).join(' ')
  ].join(' ').slice(0, 5000); // Limit to 5000 chars

  const [titleEmb, contentEmb] = await Promise.all([
    generateEmbedding(title),
    generateEmbedding(content)
  ]);

  if (!titleEmb && !contentEmb) return null;

  // Combined embedding: weighted average of title (30%) and content (70%)
  let combined: number[];
  if (titleEmb && contentEmb) {
    combined = titleEmb.map((v, i) => v * 0.3 + contentEmb[i] * 0.7);
  } else {
    combined = titleEmb || contentEmb!;
  }

  return {
    assetId: asset.id,
    titleEmbedding: titleEmb || [],
    contentEmbedding: contentEmb || [],
    combinedEmbedding: combined
  };
}

// ============================================
// Vector Storage & Search
// ============================================

/**
 * Store document embedding in Supabase
 */
export async function storeEmbedding(
  asset: DigitalAsset,
  embedding: EmbeddingData,
  userId: string
): Promise<boolean> {
  if (!isSupabaseConfigured() || !supabase) {
    logger.warn('Cannot store embedding: Supabase not configured');
    return false;
  }

  try {
    const record = asset.sqlRecord;
    const { error } = await (supabase as any).rpc('upsert_document_embedding', {
      p_asset_id: asset.id,
      p_user_id: userId,
      p_title_embedding: `[${embedding.titleEmbedding.join(',')}]`,
      p_content_embedding: `[${embedding.contentEmbedding.join(',')}]`,
      p_combined_embedding: `[${embedding.combinedEmbedding.join(',')}]`,
      p_document_title: record?.DOCUMENT_TITLE || 'Untitled',
      p_source_collection: record?.SOURCE_COLLECTION,
      p_gis_zone: record?.LOCAL_GIS_ZONE,
      p_scan_type: record?.SCAN_TYPE,
      p_content_hash: record?.FIXITY_CHECKSUM
    });

    if (error) {
      logger.error('Failed to store embedding', error);
      return false;
    }

    return true;
  } catch (error) {
    logger.error('Exception storing embedding', error);
    return false;
  }
}

/**
 * Find similar documents using vector search
 */
export async function findSimilarVectors(
  embedding: number[],
  userId?: string,
  threshold: number = 0.7,
  limit: number = 10,
  excludeAssetId?: string
): Promise<VectorSearchResult[]> {
  if (!isSupabaseConfigured() || !supabase) {
    return [];
  }

  try {
    const { data, error } = await (supabase as any).rpc('find_similar_documents', {
      p_embedding: `[${embedding.join(',')}]`,
      p_user_id: userId || null,
      p_threshold: threshold,
      p_limit: limit,
      p_exclude_asset_id: excludeAssetId || null
    });

    if (error) {
      logger.error('Vector search failed', error);
      return [];
    }

    return (data || []).map((row: any) => ({
      assetId: row.asset_id,
      documentTitle: row.document_title,
      similarity: row.similarity,
      sourceCollection: row.source_collection
    }));
  } catch (error) {
    logger.error('Exception in vector search', error);
    return [];
  }
}

/**
 * Find duplicate candidates using pgvector
 */
export async function findDuplicateCandidatesVector(
  userId: string,
  threshold: number = 0.75,
  limit: number = 100
): Promise<DuplicateCandidate[]> {
  if (!isSupabaseConfigured() || !supabase) {
    return [];
  }

  try {
    const { data, error } = await (supabase as any).rpc('find_duplicate_candidates', {
      p_user_id: userId,
      p_threshold: threshold,
      p_limit: limit
    });

    if (error) {
      logger.error('Duplicate candidate search failed', error);
      return [];
    }

    return (data || []).map((row: any) => ({
      assetA: row.asset_a,
      assetB: row.asset_b,
      similarity: row.similarity,
      titleA: row.title_a,
      titleB: row.title_b
    }));
  } catch (error) {
    logger.error('Exception finding duplicate candidates', error);
    return [];
  }
}

// ============================================
// Hybrid Deduplication (Vector + Text)
// ============================================

/**
 * Enhanced deduplication using vector similarity when available,
 * falling back to text-based similarity
 */
export async function findDuplicateClustersV3(
  assets: DigitalAsset[],
  userId?: string,
  config: DeduplicationConfig = DEFAULT_CONFIG
): Promise<DeduplicationResult> {
  const startTime = Date.now();
  
  logger.info('Starting hybrid deduplication', { 
    assetCount: assets.length,
    userId: userId ? 'set' : 'not set'
  });

  // Try vector-based dedup first if we have user ID and Supabase
  if (userId && isSupabaseConfigured()) {
    try {
      const candidates = await findDuplicateCandidatesVector(userId, config.threshold);
      
      if (candidates.length > 0) {
        logger.info('Using vector-based deduplication', { candidates: candidates.length });
        
        // Build clusters from vector candidates
        const assetMap = new Map(assets.map(a => [a.id, a]));
        const clusters = buildClustersFromCandidates(candidates, assetMap, config);
        
        // Identify unique assets (not in any cluster)
        const clusteredIds = new Set<string>();
        clusters.forEach(c => {
          clusteredIds.add(c.primaryAsset.id);
          c.duplicates.forEach(d => clusteredIds.add(d.id));
        });
        const uniqueAssets = assets.filter(a => !clusteredIds.has(a.id));
        
        return {
          clusters,
          uniqueAssets,
          totalDuplicatesFound: clusters.reduce((sum, c) => sum + c.duplicates.length, 0),
          processingTime: Date.now() - startTime
        };
      }
    } catch (error) {
      logger.warn('Vector dedup failed, falling back to text-based', { error });
    }
  }

  // Fallback to V2 text-based deduplication
  logger.info('Using text-based deduplication (V2 fallback)');
  return findDuplicateClustersV2(assets, config);
}

/**
 * Build clusters from vector similarity candidates
 */
function buildClustersFromCandidates(
  candidates: DuplicateCandidate[],
  assetMap: Map<string, DigitalAsset>,
  config: DeduplicationConfig
): DeduplicationCluster[] {
  // Union-Find for clustering
  const parent = new Map<string, string>();
  
  const find = (id: string): string => {
    if (!parent.has(id)) parent.set(id, id);
    if (parent.get(id) !== id) {
      parent.set(id, find(parent.get(id)!));
    }
    return parent.get(id)!;
  };
  
  const union = (a: string, b: string) => {
    const rootA = find(a);
    const rootB = find(b);
    if (rootA !== rootB) parent.set(rootB, rootA);
  };

  // Union all candidates
  candidates.forEach(c => union(c.assetA, c.assetB));

  // Group by cluster root
  const clusterGroups = new Map<string, { assets: DigitalAsset[]; similarities: number[] }>();
  
  candidates.forEach(c => {
    const root = find(c.assetA);
    if (!clusterGroups.has(root)) {
      clusterGroups.set(root, { assets: [], similarities: [] });
    }
    const group = clusterGroups.get(root)!;
    
    const assetA = assetMap.get(c.assetA);
    const assetB = assetMap.get(c.assetB);
    
    if (assetA && !group.assets.some(a => a.id === assetA.id)) {
      group.assets.push(assetA);
    }
    if (assetB && !group.assets.some(a => a.id === assetB.id)) {
      group.assets.push(assetB);
    }
    group.similarities.push(c.similarity);
  });

  // Build DeduplicationCluster objects
  const clusters: DeduplicationCluster[] = [];
  
  clusterGroups.forEach((group, clusterId) => {
    if (group.assets.length < 2) return;
    
    // Sort by confidence to pick primary
    const sorted = group.assets.sort((a, b) => 
      (b.sqlRecord?.CONFIDENCE_SCORE || 0) - (a.sqlRecord?.CONFIDENCE_SCORE || 0)
    );
    
    const primary = sorted[0];
    const duplicates = sorted.slice(1);
    const avgSimilarity = group.similarities.reduce((a, b) => a + b, 0) / group.similarities.length;

    clusters.push({
      id: `vector_${clusterId}_${Date.now()}`,
      primaryAsset: primary,
      duplicates,
      similarity: avgSimilarity,
      consolidatedMetadata: {
        title: primary.sqlRecord?.DOCUMENT_TITLE || 'Untitled',
        description: primary.sqlRecord?.DOCUMENT_DESCRIPTION || '',
        entities: primary.sqlRecord?.ENTITIES_EXTRACTED || [],
        keywords: primary.sqlRecord?.KEYWORDS_TAGS || [],
        category: primary.sqlRecord?.NLP_NODE_CATEGORIZATION || 'Unknown',
        confidence: avgSimilarity,
        imageCount: group.assets.length
      },
      matchReasons: [`Vector similarity: ${(avgSimilarity * 100).toFixed(0)}%`]
    });
  });

  return clusters;
}

// ============================================
// Real-time Similarity Check
// ============================================

/**
 * Check if a new asset is similar to existing ones
 * Call this during ingestion to detect duplicates early
 */
export async function checkForDuplicatesOnIngestion(
  newAsset: DigitalAsset,
  userId: string
): Promise<SimilarityMatch[]> {
  // Generate embedding for new asset
  const embedding = await generateDocumentEmbeddings(newAsset);
  
  if (embedding && embedding.combinedEmbedding.length > 0) {
    // Vector-based search
    const similar = await findSimilarVectors(
      embedding.combinedEmbedding,
      userId,
      0.6, // Lower threshold for early detection
      5,
      newAsset.id
    );
    
    if (similar.length > 0) {
      // Store the embedding for future searches
      await storeEmbedding(newAsset, embedding, userId);
      
      // Return as SimilarityMatch format (simplified)
      return similar.map(s => ({
        assetA: newAsset,
        assetB: { id: s.assetId, sqlRecord: { DOCUMENT_TITLE: s.documentTitle } } as DigitalAsset,
        score: s.similarity,
        matchReasons: [`Vector similarity: ${(s.similarity * 100).toFixed(0)}%`],
        breakdown: {
          titleScore: s.similarity,
          entityScore: 0,
          keywordScore: 0,
          semanticScore: s.similarity,
          temporalScore: 0,
          spatialScore: 0,
          contentScore: 0
        }
      }));
    }
    
    // Store embedding even if no duplicates found
    await storeEmbedding(newAsset, embedding, userId);
  }

  return [];
}

// ============================================
// Batch Embedding Generation
// ============================================

/**
 * Generate and store embeddings for all assets
 * Call this to backfill embeddings for existing corpus
 */
export async function backfillEmbeddings(
  assets: DigitalAsset[],
  userId: string,
  onProgress?: (completed: number, total: number) => void
): Promise<{ success: number; failed: number }> {
  let success = 0;
  let failed = 0;
  
  for (let i = 0; i < assets.length; i++) {
    try {
      const embedding = await generateDocumentEmbeddings(assets[i]);
      if (embedding) {
        const stored = await storeEmbedding(assets[i], embedding, userId);
        if (stored) {
          success++;
        } else {
          failed++;
        }
      } else {
        failed++;
      }
    } catch (error) {
      failed++;
      logger.warn('Failed to generate embedding for asset', { assetId: assets[i].id });
    }
    
    onProgress?.(i + 1, assets.length);
    
    // Rate limit to avoid API throttling
    if ((i + 1) % 10 === 0) {
      await new Promise(resolve => setTimeout(resolve, 1000));
    }
  }
  
  logger.info('Embedding backfill complete', { success, failed });
  return { success, failed };
}

export default {
  generateDocumentEmbeddings,
  storeEmbedding,
  findSimilarVectors,
  findDuplicateCandidatesVector,
  findDuplicateClustersV3,
  checkForDuplicatesOnIngestion,
  backfillEmbeddings
};
