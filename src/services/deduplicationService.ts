/**
 * Deduplication Service
 * 
 * Identifies and consolidates duplicate or highly similar assets
 * to prevent data dilution and improve training corpus quality.
 * 
 * Multiple views of the same subject should be bundled together
 * rather than existing as separate entries with redundant metadata.
 */

import { DigitalAsset, HistoricalDocumentMetadata } from '../types';
import { logger } from '../lib/logger';

// ============================================
// Types
// ============================================

export interface SimilarityMatch {
  assetA: DigitalAsset;
  assetB: DigitalAsset;
  score: number;
  matchReasons: string[];
}

export interface DeduplicationResult {
  clusters: DeduplicationCluster[];
  uniqueAssets: DigitalAsset[];
  totalDuplicatesFound: number;
}

export interface DeduplicationCluster {
  primaryAsset: DigitalAsset;
  duplicates: DigitalAsset[];
  similarity: number;
  consolidatedMetadata: ConsolidatedMetadata;
}

export interface ConsolidatedMetadata {
  title: string;
  description: string;
  entities: string[];
  keywords: string[];
  category: string;
  confidence: number;
}

// ============================================
// Similarity Scoring
// ============================================

/**
 * Calculate Jaccard similarity between two sets of strings
 */
function jaccardSimilarity(setA: string[], setB: string[]): number {
  if (setA.length === 0 && setB.length === 0) return 0;
  
  const a = new Set(setA.map(s => s.toLowerCase().trim()));
  const b = new Set(setB.map(s => s.toLowerCase().trim()));
  
  const intersection = new Set([...a].filter(x => b.has(x)));
  const union = new Set([...a, ...b]);
  
  return intersection.size / union.size;
}

/**
 * Calculate normalized Levenshtein distance between two strings
 */
function levenshteinSimilarity(strA: string, strB: string): number {
  const a = strA.toLowerCase().trim();
  const b = strB.toLowerCase().trim();
  
  if (a === b) return 1;
  if (a.length === 0 || b.length === 0) return 0;
  
  const matrix: number[][] = [];
  
  for (let i = 0; i <= a.length; i++) {
    matrix[i] = [i];
  }
  for (let j = 0; j <= b.length; j++) {
    matrix[0][j] = j;
  }
  
  for (let i = 1; i <= a.length; i++) {
    for (let j = 1; j <= b.length; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      matrix[i][j] = Math.min(
        matrix[i - 1][j] + 1,
        matrix[i][j - 1] + 1,
        matrix[i - 1][j - 1] + cost
      );
    }
  }
  
  const distance = matrix[a.length][b.length];
  const maxLength = Math.max(a.length, b.length);
  
  return 1 - (distance / maxLength);
}

/**
 * Extract significant words from text (remove stopwords)
 */
function extractSignificantWords(text: string): string[] {
  const stopwords = new Set([
    'the', 'a', 'an', 'and', 'or', 'but', 'in', 'on', 'at', 'to', 'for',
    'of', 'with', 'by', 'from', 'as', 'is', 'was', 'are', 'were', 'been',
    'be', 'have', 'has', 'had', 'do', 'does', 'did', 'will', 'would',
    'could', 'should', 'may', 'might', 'must', 'shall', 'can', 'this',
    'that', 'these', 'those', 'it', 'its', 'they', 'them', 'their',
    'public', 'art', 'installation', 'collection', 'document', 'image'
  ]);
  
  return text
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, ' ')
    .split(/\s+/)
    .filter(word => word.length > 2 && !stopwords.has(word));
}

/**
 * Calculate comprehensive similarity score between two assets
 */
export function calculateSimilarity(assetA: DigitalAsset, assetB: DigitalAsset): SimilarityMatch {
  const recA = assetA.sqlRecord;
  const recB = assetB.sqlRecord;
  
  const matchReasons: string[] = [];
  let totalScore = 0;
  let weights = 0;
  
  // 1. Title similarity (weight: 3)
  if (recA?.DOCUMENT_TITLE && recB?.DOCUMENT_TITLE) {
    const titleSim = levenshteinSimilarity(recA.DOCUMENT_TITLE, recB.DOCUMENT_TITLE);
    totalScore += titleSim * 3;
    weights += 3;
    if (titleSim > 0.7) {
      matchReasons.push(`Similar titles (${(titleSim * 100).toFixed(0)}%)`);
    }
  }
  
  // 2. Entity overlap (weight: 4)
  const entitiesA = recA?.ENTITIES_EXTRACTED || [];
  const entitiesB = recB?.ENTITIES_EXTRACTED || [];
  if (entitiesA.length > 0 && entitiesB.length > 0) {
    const entitySim = jaccardSimilarity(entitiesA, entitiesB);
    totalScore += entitySim * 4;
    weights += 4;
    if (entitySim > 0.5) {
      matchReasons.push(`Shared entities (${(entitySim * 100).toFixed(0)}%)`);
    }
  }
  
  // 3. Collection match (weight: 2)
  if (recA?.SOURCE_COLLECTION && recB?.SOURCE_COLLECTION) {
    const collectionSim = levenshteinSimilarity(recA.SOURCE_COLLECTION, recB.SOURCE_COLLECTION);
    totalScore += collectionSim * 2;
    weights += 2;
    if (collectionSim > 0.8) {
      matchReasons.push('Same collection');
    }
  }
  
  // 4. Category match (weight: 2)
  if (recA?.NLP_NODE_CATEGORIZATION && recB?.NLP_NODE_CATEGORIZATION) {
    const catSim = levenshteinSimilarity(recA.NLP_NODE_CATEGORIZATION, recB.NLP_NODE_CATEGORIZATION);
    totalScore += catSim * 2;
    weights += 2;
    if (catSim > 0.7) {
      matchReasons.push('Similar category');
    }
  }
  
  // 5. Description content similarity (weight: 3)
  if (recA?.DOCUMENT_DESCRIPTION && recB?.DOCUMENT_DESCRIPTION) {
    const wordsA = extractSignificantWords(recA.DOCUMENT_DESCRIPTION);
    const wordsB = extractSignificantWords(recB.DOCUMENT_DESCRIPTION);
    const descSim = jaccardSimilarity(wordsA, wordsB);
    totalScore += descSim * 3;
    weights += 3;
    if (descSim > 0.4) {
      matchReasons.push(`Similar descriptions (${(descSim * 100).toFixed(0)}%)`);
    }
  }
  
  // 6. Keywords overlap (weight: 2)
  const keywordsA = recA?.KEYWORDS_TAGS || [];
  const keywordsB = recB?.KEYWORDS_TAGS || [];
  if (keywordsA.length > 0 && keywordsB.length > 0) {
    const kwSim = jaccardSimilarity(keywordsA, keywordsB);
    totalScore += kwSim * 2;
    weights += 2;
    if (kwSim > 0.5) {
      matchReasons.push(`Shared keywords (${(kwSim * 100).toFixed(0)}%)`);
    }
  }
  
  // 7. GIS Zone match (weight: 1.5)
  const gisA = recA?.NLP_DERIVED_GIS_ZONE || recA?.LOCAL_GIS_ZONE;
  const gisB = recB?.NLP_DERIVED_GIS_ZONE || recB?.LOCAL_GIS_ZONE;
  if (gisA && gisB) {
    const gisMatch = gisA.toLowerCase() === gisB.toLowerCase();
    totalScore += gisMatch ? 1.5 : 0;
    weights += 1.5;
    if (gisMatch) {
      matchReasons.push('Same GIS zone');
    }
  }
  
  // 8. GPS proximity (weight: 2)
  if (assetA.location && assetB.location) {
    const latDiff = Math.abs(assetA.location.latitude - assetB.location.latitude);
    const lonDiff = Math.abs(assetA.location.longitude - assetB.location.longitude);
    // Within ~100 meters
    if (latDiff < 0.001 && lonDiff < 0.001) {
      totalScore += 2;
      matchReasons.push('Same location');
    }
    weights += 2;
  }
  
  const finalScore = weights > 0 ? totalScore / weights : 0;
  
  return {
    assetA,
    assetB,
    score: finalScore,
    matchReasons,
  };
}

// ============================================
// Clustering
// ============================================

/**
 * Find all duplicate clusters in a set of assets
 */
export function findDuplicateClusters(
  assets: DigitalAsset[],
  similarityThreshold: number = 0.6
): DeduplicationResult {
  logger.info('Starting duplicate detection', { 
    module: 'Deduplication',
    assetCount: assets.length,
    threshold: similarityThreshold 
  });
  
  const matches: SimilarityMatch[] = [];
  
  // Compare all pairs
  for (let i = 0; i < assets.length; i++) {
    for (let j = i + 1; j < assets.length; j++) {
      const match = calculateSimilarity(assets[i], assets[j]);
      if (match.score >= similarityThreshold) {
        matches.push(match);
      }
    }
  }
  
  // Build clusters using Union-Find
  const parent = new Map<string, string>();
  
  const find = (id: string): string => {
    if (!parent.has(id)) parent.set(id, id);
    if (parent.get(id) !== id) {
      parent.set(id, find(parent.get(id)!));
    }
    return parent.get(id)!;
  };
  
  const union = (idA: string, idB: string) => {
    const rootA = find(idA);
    const rootB = find(idB);
    if (rootA !== rootB) {
      parent.set(rootA, rootB);
    }
  };
  
  // Union similar assets
  matches.forEach(match => {
    union(match.assetA.id, match.assetB.id);
  });
  
  // Group by cluster root
  const clusterMap = new Map<string, DigitalAsset[]>();
  assets.forEach(asset => {
    const root = find(asset.id);
    if (!clusterMap.has(root)) clusterMap.set(root, []);
    clusterMap.get(root)!.push(asset);
  });
  
  // Build result
  const clusters: DeduplicationCluster[] = [];
  const uniqueAssets: DigitalAsset[] = [];
  let totalDuplicatesFound = 0;
  
  clusterMap.forEach((clusterAssets) => {
    if (clusterAssets.length > 1) {
      // Sort by confidence score to pick primary
      const sorted = clusterAssets.sort((a, b) => 
        (b.sqlRecord?.CONFIDENCE_SCORE || 0) - (a.sqlRecord?.CONFIDENCE_SCORE || 0)
      );
      
      const primary = sorted[0];
      const duplicates = sorted.slice(1);
      
      // Calculate average similarity within cluster
      let avgSim = 0;
      let simCount = 0;
      for (const dup of duplicates) {
        const match = calculateSimilarity(primary, dup);
        avgSim += match.score;
        simCount++;
      }
      avgSim = simCount > 0 ? avgSim / simCount : 0;
      
      clusters.push({
        primaryAsset: primary,
        duplicates,
        similarity: avgSim,
        consolidatedMetadata: consolidateMetadata(clusterAssets),
      });
      
      totalDuplicatesFound += duplicates.length;
    } else {
      uniqueAssets.push(clusterAssets[0]);
    }
  });
  
  logger.info('Duplicate detection complete', {
    module: 'Deduplication',
    clustersFound: clusters.length,
    duplicatesFound: totalDuplicatesFound,
    uniqueAssets: uniqueAssets.length,
  });
  
  return { clusters, uniqueAssets, totalDuplicatesFound };
}

// ============================================
// Metadata Consolidation
// ============================================

/**
 * Consolidate metadata from multiple similar assets into one canonical record
 */
export function consolidateMetadata(assets: DigitalAsset[]): ConsolidatedMetadata {
  if (assets.length === 0) {
    throw new Error('Cannot consolidate empty asset list');
  }
  
  // Sort by confidence to prioritize higher quality metadata
  const sorted = assets.sort((a, b) => 
    (b.sqlRecord?.CONFIDENCE_SCORE || 0) - (a.sqlRecord?.CONFIDENCE_SCORE || 0)
  );
  
  const primary = sorted[0].sqlRecord;
  
  // Merge entities from all assets (deduplicated)
  const allEntities = new Set<string>();
  assets.forEach(asset => {
    (asset.sqlRecord?.ENTITIES_EXTRACTED || []).forEach(e => {
      allEntities.add(e.trim());
    });
  });
  
  // Merge keywords from all assets (deduplicated)
  const allKeywords = new Set<string>();
  assets.forEach(asset => {
    (asset.sqlRecord?.KEYWORDS_TAGS || []).forEach(k => {
      allKeywords.add(k.trim().toLowerCase());
    });
  });
  
  // Find most common category
  const categoryCount = new Map<string, number>();
  assets.forEach(asset => {
    const cat = asset.sqlRecord?.NLP_NODE_CATEGORIZATION || 'Unknown';
    categoryCount.set(cat, (categoryCount.get(cat) || 0) + 1);
  });
  const topCategory = [...categoryCount.entries()]
    .sort((a, b) => b[1] - a[1])[0]?.[0] || 'Unknown';
  
  // Build consolidated title (use primary, note bundle size)
  const baseTitle = primary?.DOCUMENT_TITLE?.split(' – ')[0] || 'Untitled';
  const consolidatedTitle = assets.length > 1 
    ? `${baseTitle} (${assets.length} views)`
    : baseTitle;
  
  // Build consolidated description
  const consolidatedDescription = buildConsolidatedDescription(assets);
  
  // Average confidence weighted by individual scores
  const avgConfidence = assets.reduce((sum, a) => 
    sum + (a.sqlRecord?.CONFIDENCE_SCORE || 0), 0
  ) / assets.length;
  
  return {
    title: consolidatedTitle,
    description: consolidatedDescription,
    entities: Array.from(allEntities),
    keywords: Array.from(allKeywords),
    category: topCategory,
    confidence: avgConfidence,
  };
}

/**
 * Build a rich consolidated description from multiple asset descriptions
 */
function buildConsolidatedDescription(assets: DigitalAsset[]): string {
  // Get the best (longest, most detailed) description
  const descriptions = assets
    .map(a => a.sqlRecord?.DOCUMENT_DESCRIPTION || '')
    .filter(d => d.length > 0)
    .sort((a, b) => b.length - a.length);
  
  const primary = descriptions[0] || 'No description available.';
  
  if (assets.length === 1) {
    return primary;
  }
  
  // Extract unique details from other descriptions that aren't in primary
  const primaryWords = new Set(extractSignificantWords(primary));
  const additionalDetails: string[] = [];
  
  for (const desc of descriptions.slice(1)) {
    const words = extractSignificantWords(desc);
    const newWords = words.filter(w => !primaryWords.has(w));
    if (newWords.length >= 3) {
      // This description has significant unique content
      additionalDetails.push(desc);
    }
  }
  
  if (additionalDetails.length > 0) {
    return `${primary}\n\n[Additional perspectives from ${assets.length} images: ${additionalDetails.slice(0, 2).join(' | ')}]`;
  }
  
  return `${primary}\n\n[Consolidated from ${assets.length} similar images for enhanced accuracy]`;
}

// ============================================
// Suggestion Generation
// ============================================

export interface DeduplicationSuggestion {
  id: string;
  assets: DigitalAsset[];
  suggestedTitle: string;
  matchReasons: string[];
  similarity: number;
  action: 'MERGE' | 'REVIEW' | 'KEEP_SEPARATE';
}

/**
 * Generate user-friendly suggestions for deduplication
 */
export function generateDeduplicationSuggestions(
  assets: DigitalAsset[]
): DeduplicationSuggestion[] {
  const result = findDuplicateClusters(assets, 0.5); // Lower threshold for suggestions
  
  return result.clusters.map((cluster, idx) => {
    const allAssets = [cluster.primaryAsset, ...cluster.duplicates];
    
    // Determine suggested action based on similarity
    let action: 'MERGE' | 'REVIEW' | 'KEEP_SEPARATE';
    if (cluster.similarity >= 0.8) {
      action = 'MERGE';
    } else if (cluster.similarity >= 0.6) {
      action = 'REVIEW';
    } else {
      action = 'KEEP_SEPARATE';
    }
    
    // Collect all match reasons
    const matchReasons: string[] = [];
    for (const dup of cluster.duplicates) {
      const match = calculateSimilarity(cluster.primaryAsset, dup);
      matchReasons.push(...match.matchReasons);
    }
    const uniqueReasons = [...new Set(matchReasons)];
    
    return {
      id: `dedup_${idx}_${Date.now()}`,
      assets: allAssets,
      suggestedTitle: cluster.consolidatedMetadata.title,
      matchReasons: uniqueReasons,
      similarity: cluster.similarity,
      action,
    };
  });
}

export default {
  calculateSimilarity,
  findDuplicateClusters,
  consolidateMetadata,
  generateDeduplicationSuggestions,
};
