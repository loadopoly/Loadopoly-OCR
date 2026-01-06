/**
 * Deduplication Service v2
 * 
 * Enhanced duplicate detection using modern NLP techniques:
 * - N-gram similarity for word order independence
 * - TF-IDF inspired keyword weighting
 * - Semantic concept extraction (dates, names, places)
 * - Hierarchical clustering with adjustable thresholds
 * - Phonetic matching for OCR error tolerance
 * 
 * Research basis:
 * - "Near-Duplicate Detection" (Henzinger, 2006)
 * - "SimHash" fingerprinting (Charikar, 2002)
 * - "MinHash" for Jaccard estimation (Broder, 1997)
 * - "Fuzzy String Matching" (Navarro, 2001)
 */

import { DigitalAsset } from '../types';
import { logger } from '../lib/logger';

// ============================================
// Types
// ============================================

export interface SimilarityMatch {
  assetA: DigitalAsset;
  assetB: DigitalAsset;
  score: number;
  matchReasons: string[];
  breakdown: SimilarityBreakdown;
}

export interface SimilarityBreakdown {
  titleScore: number;
  entityScore: number;
  keywordScore: number;
  semanticScore: number;
  temporalScore: number;
  spatialScore: number;
  contentScore: number;
}

export interface DeduplicationResult {
  clusters: DeduplicationCluster[];
  uniqueAssets: DigitalAsset[];
  totalDuplicatesFound: number;
  processingTime: number;
}

export interface DeduplicationCluster {
  id: string;
  primaryAsset: DigitalAsset;
  duplicates: DigitalAsset[];
  similarity: number;
  consolidatedMetadata: ConsolidatedMetadata;
  matchReasons: string[];
}

export interface ConsolidatedMetadata {
  title: string;
  description: string;
  entities: string[];
  keywords: string[];
  category: string;
  confidence: number;
  imageCount: number;
}

export interface DeduplicationConfig {
  /** Minimum similarity to consider as duplicate (0-1) */
  threshold: number;
  /** Weight for title similarity */
  titleWeight: number;
  /** Weight for entity overlap */
  entityWeight: number;
  /** Weight for semantic concept matching */
  semanticWeight: number;
  /** Weight for temporal (date/year) matching */
  temporalWeight: number;
  /** Weight for spatial proximity */
  spatialWeight: number;
  /** Enable phonetic matching for OCR tolerance */
  usePhonetic: boolean;
  /** Enable n-gram matching */
  useNgrams: boolean;
}

export const DEFAULT_CONFIG: DeduplicationConfig = {
  threshold: 0.45, // Lower threshold for better recall
  titleWeight: 3,
  entityWeight: 4,
  semanticWeight: 3.5,
  temporalWeight: 3,
  spatialWeight: 2,
  usePhonetic: true,
  useNgrams: true,
};

// ============================================
// Advanced Similarity Functions
// ============================================

/**
 * Generate character n-grams from text
 */
function generateNgrams(text: string, n: number = 3): Set<string> {
  const normalized = text.toLowerCase().replace(/[^a-z0-9]/g, '');
  const ngrams = new Set<string>();
  for (let i = 0; i <= normalized.length - n; i++) {
    ngrams.add(normalized.slice(i, i + n));
  }
  return ngrams;
}

/**
 * Generate word shingles (word n-grams) for semantic comparison
 */
function generateShingles(text: string, n: number = 2): Set<string> {
  const words = text.toLowerCase()
    .replace(/[^a-z0-9\s]/g, ' ')
    .split(/\s+/)
    .filter(w => w.length > 1);
  
  const shingles = new Set<string>();
  // Single words
  words.forEach(w => shingles.add(w));
  // Word pairs
  for (let i = 0; i < words.length - 1; i++) {
    shingles.add(`${words[i]}_${words[i + 1]}`);
  }
  // Word triplets for longer text
  if (words.length >= 3) {
    for (let i = 0; i < words.length - 2; i++) {
      shingles.add(`${words[i]}_${words[i + 1]}_${words[i + 2]}`);
    }
  }
  return shingles;
}

/**
 * N-gram based similarity (order-independent)
 */
function ngramSimilarity(textA: string, textB: string, n: number = 3): number {
  const ngramsA = generateNgrams(textA, n);
  const ngramsB = generateNgrams(textB, n);
  
  if (ngramsA.size === 0 && ngramsB.size === 0) return 0;
  
  const intersection = new Set([...ngramsA].filter(x => ngramsB.has(x)));
  const union = new Set([...ngramsA, ...ngramsB]);
  
  return intersection.size / union.size;
}

/**
 * Shingle-based similarity (semantic order independence)
 */
function shingleSimilarity(textA: string, textB: string): number {
  const shinglesA = generateShingles(textA);
  const shinglesB = generateShingles(textB);
  
  if (shinglesA.size === 0 && shinglesB.size === 0) return 0;
  
  const intersection = new Set([...shinglesA].filter(x => shinglesB.has(x)));
  const union = new Set([...shinglesA, ...shinglesB]);
  
  return intersection.size / union.size;
}

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
 * Extract semantic concepts from text (dates, years, proper nouns, key subjects)
 */
function extractSemanticConcepts(text: string): {
  years: string[];
  dates: string[];
  properNouns: string[];
  numbers: string[];
  keySubjects: string[];
} {
  // Extract years (4-digit numbers starting with 1 or 2)
  const years: string[] = text.match(/\b(1[0-9]{3}|20[0-9]{2})\b/g) || [];
  
  // Extract dates (various formats)
  const monthMatches: string[] = text.match(/\b(?:jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)[a-z]*\s+\d{1,2}/gi) || [];
  const numericDates: string[] = text.match(/\b\d{1,2}\/\d{1,2}\/\d{2,4}\b/g) || [];
  const dateMatches: string[] = [...monthMatches, ...numericDates];
  
  // Extract likely proper nouns (capitalized words)
  const properNounMatches = text.match(/\b[A-Z][a-z]+(?:\s+[A-Z][a-z]+)*/g) || [];
  const properNouns = properNounMatches.filter(n => n.length > 2);
  
  // Extract numbers (for exhibit numbers, room numbers, etc.)
  const numbers = (text.match(/\b\d+\b/g) || []).filter(n => n.length <= 4 && n.length > 0);
  
  // Extract key subject indicators
  const subjectPatterns = [
    /\b(bust|statue|sculpture|painting|exhibit|panel|sign|display|artifact|document|photograph|memorial|portrait|figure)\b/gi,
    /\b(airport|museum|gallery|hall|building|terminal|station|deck|observation|lobby)\b/gi,
    /\b(aviation|history|historical|opening|day|ceremony|event|dedication|anniversary)\b/gi,
    /\b(bronze|marble|stone|metal|wood|glass|ceramic)\b/gi,
    /\b(courtesy|phone|information|emergency|service|utility)\b/gi,
  ];
  
  const keySubjects: string[] = [];
  subjectPatterns.forEach(pattern => {
    const matches = text.match(pattern) || [];
    keySubjects.push(...matches.map(m => m.toLowerCase()));
  });
  
  return {
    years: [...new Set(years)],
    dates: [...new Set(dateMatches.map(d => d.toLowerCase()))],
    properNouns: [...new Set(properNouns)],
    numbers: [...new Set(numbers)],
    keySubjects: [...new Set(keySubjects)],
  };
}

/**
 * Calculate semantic concept overlap score
 */
function semanticConceptSimilarity(textA: string, textB: string): number {
  const conceptsA = extractSemanticConcepts(textA);
  const conceptsB = extractSemanticConcepts(textB);
  
  let score = 0;
  let weights = 0;
  
  // Year matches are very strong signals (weight: 4)
  if (conceptsA.years.length > 0 || conceptsB.years.length > 0) {
    if (conceptsA.years.length > 0 && conceptsB.years.length > 0) {
      const yearOverlap = jaccardSimilarity(conceptsA.years, conceptsB.years);
      score += yearOverlap * 4;
    }
    weights += 4;
  }
  
  // Proper noun matches (weight: 3)
  if (conceptsA.properNouns.length > 0 || conceptsB.properNouns.length > 0) {
    if (conceptsA.properNouns.length > 0 && conceptsB.properNouns.length > 0) {
      const nounOverlap = jaccardSimilarity(conceptsA.properNouns, conceptsB.properNouns);
      score += nounOverlap * 3;
    }
    weights += 3;
  }
  
  // Key subject matches (weight: 3)
  if (conceptsA.keySubjects.length > 0 || conceptsB.keySubjects.length > 0) {
    if (conceptsA.keySubjects.length > 0 && conceptsB.keySubjects.length > 0) {
      const subjectOverlap = jaccardSimilarity(conceptsA.keySubjects, conceptsB.keySubjects);
      score += subjectOverlap * 3;
    }
    weights += 3;
  }
  
  return weights > 0 ? score / weights : 0;
}

/**
 * Soundex-like phonetic encoding for OCR error tolerance
 */
function phoneticEncode(text: string): string {
  return text
    .toLowerCase()
    .replace(/[aeiouyhw]/g, '') // Remove vowels
    .replace(/[bfpv]/g, '1')
    .replace(/[cgjkqsxz]/g, '2')
    .replace(/[dt]/g, '3')
    .replace(/[l]/g, '4')
    .replace(/[mn]/g, '5')
    .replace(/[r]/g, '6')
    .replace(/(.)\1+/g, '$1') // Remove consecutive duplicates
    .slice(0, 8);
}

/**
 * Phonetic similarity for OCR error tolerance
 */
function phoneticSimilarity(textA: string, textB: string): number {
  const wordsA = textA.toLowerCase().split(/\s+/).filter(w => w.length > 3);
  const wordsB = textB.toLowerCase().split(/\s+/).filter(w => w.length > 3);
  
  if (wordsA.length === 0 || wordsB.length === 0) return 0;
  
  const phoneticA = new Set(wordsA.map(phoneticEncode));
  const phoneticB = new Set(wordsB.map(phoneticEncode));
  
  const intersection = new Set([...phoneticA].filter(x => phoneticB.has(x)));
  const union = new Set([...phoneticA, ...phoneticB]);
  
  return intersection.size / union.size;
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
    'public', 'collection', 'document', 'image', 'view', 'views', 
    'scene', 'scenes', 'photo', 'photograph', 'picture'
  ]);
  
  return text
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, ' ')
    .split(/\s+/)
    .filter(word => word.length > 2 && !stopwords.has(word));
}

// ============================================
// Enhanced Similarity Calculation
// ============================================

/**
 * Calculate comprehensive similarity score between two assets
 * using multiple advanced techniques
 */
export function calculateSimilarityV2(
  assetA: DigitalAsset, 
  assetB: DigitalAsset,
  config: DeduplicationConfig = DEFAULT_CONFIG
): SimilarityMatch {
  const recA = assetA.sqlRecord;
  const recB = assetB.sqlRecord;
  
  const matchReasons: string[] = [];
  const breakdown: SimilarityBreakdown = {
    titleScore: 0,
    entityScore: 0,
    keywordScore: 0,
    semanticScore: 0,
    temporalScore: 0,
    spatialScore: 0,
    contentScore: 0,
  };
  
  let totalScore = 0;
  let totalWeight = 0;
  
  // ============================================
  // 1. Title Similarity (multi-technique)
  // ============================================
  if (recA?.DOCUMENT_TITLE && recB?.DOCUMENT_TITLE) {
    const titleA = recA.DOCUMENT_TITLE;
    const titleB = recB.DOCUMENT_TITLE;
    
    // Levenshtein for direct similarity
    const levenScore = levenshteinSimilarity(titleA, titleB);
    
    // N-gram for character-level similarity
    const ngramScore = config.useNgrams ? ngramSimilarity(titleA, titleB) : 0;
    
    // Shingle for word-order independence
    const shingleScore = shingleSimilarity(titleA, titleB);
    
    // Phonetic for OCR tolerance
    const phoneticScore = config.usePhonetic ? phoneticSimilarity(titleA, titleB) : 0;
    
    // Take best of multiple approaches
    const titleSim = Math.max(
      levenScore,
      ngramScore * 0.9,
      shingleScore * 0.95,
      phoneticScore * 0.85
    );
    
    breakdown.titleScore = titleSim;
    totalScore += titleSim * config.titleWeight;
    totalWeight += config.titleWeight;
    
    if (titleSim > 0.5) {
      matchReasons.push(`Similar titles (${(titleSim * 100).toFixed(0)}%)`);
    }
  }
  
  // ============================================
  // 2. Entity Overlap
  // ============================================
  const entitiesA = recA?.ENTITIES_EXTRACTED || [];
  const entitiesB = recB?.ENTITIES_EXTRACTED || [];
  if (entitiesA.length > 0 || entitiesB.length > 0) {
    if (entitiesA.length > 0 && entitiesB.length > 0) {
      const entitySim = jaccardSimilarity(entitiesA, entitiesB);
      breakdown.entityScore = entitySim;
      totalScore += entitySim * config.entityWeight;
      
      if (entitySim > 0.3) {
        matchReasons.push(`Shared entities (${(entitySim * 100).toFixed(0)}%)`);
      }
    }
    totalWeight += config.entityWeight;
  }
  
  // ============================================
  // 3. Semantic Concept Matching (NEW)
  // ============================================
  const fullTextA = [
    recA?.DOCUMENT_TITLE || '',
    recA?.DOCUMENT_DESCRIPTION || '',
    assetA.ocrText || ''
  ].join(' ');
  
  const fullTextB = [
    recB?.DOCUMENT_TITLE || '',
    recB?.DOCUMENT_DESCRIPTION || '',
    assetB.ocrText || ''
  ].join(' ');
  
  if (fullTextA.length > 10 && fullTextB.length > 10) {
    const semanticSim = semanticConceptSimilarity(fullTextA, fullTextB);
    breakdown.semanticScore = semanticSim;
    totalScore += semanticSim * config.semanticWeight;
    totalWeight += config.semanticWeight;
    
    if (semanticSim > 0.4) {
      matchReasons.push(`Semantic concepts match (${(semanticSim * 100).toFixed(0)}%)`);
    }
  }
  
  // ============================================
  // 4. Temporal Matching (dates/years)
  // ============================================
  const conceptsA = extractSemanticConcepts(fullTextA);
  const conceptsB = extractSemanticConcepts(fullTextB);
  
  if (conceptsA.years.length > 0 && conceptsB.years.length > 0) {
    const yearMatch = jaccardSimilarity(conceptsA.years, conceptsB.years);
    breakdown.temporalScore = yearMatch;
    totalScore += yearMatch * config.temporalWeight;
    totalWeight += config.temporalWeight;
    
    if (yearMatch > 0.5) {
      matchReasons.push(`Same time period (${conceptsA.years.join(', ')})`);
    }
  }
  
  // ============================================
  // 5. Keywords Overlap
  // ============================================
  const keywordsA = recA?.KEYWORDS_TAGS || [];
  const keywordsB = recB?.KEYWORDS_TAGS || [];
  if (keywordsA.length > 0 || keywordsB.length > 0) {
    if (keywordsA.length > 0 && keywordsB.length > 0) {
      const kwSim = jaccardSimilarity(keywordsA, keywordsB);
      breakdown.keywordScore = kwSim;
      totalScore += kwSim * 2;
      
      if (kwSim > 0.3) {
        matchReasons.push(`Shared keywords (${(kwSim * 100).toFixed(0)}%)`);
      }
    }
    totalWeight += 2;
  }
  
  // ============================================
  // 6. Collection Match
  // ============================================
  if (recA?.SOURCE_COLLECTION && recB?.SOURCE_COLLECTION) {
    const collSim = levenshteinSimilarity(recA.SOURCE_COLLECTION, recB.SOURCE_COLLECTION);
    if (collSim > 0.7) {
      totalScore += 1.5;
      matchReasons.push('Same collection');
    }
    totalWeight += 1.5;
  }
  
  // ============================================
  // 7. GIS Zone Match
  // ============================================
  const gisA = recA?.NLP_DERIVED_GIS_ZONE || recA?.LOCAL_GIS_ZONE;
  const gisB = recB?.NLP_DERIVED_GIS_ZONE || recB?.LOCAL_GIS_ZONE;
  if (gisA && gisB) {
    const gisMatch = gisA.toLowerCase().includes(gisB.toLowerCase()) || 
                     gisB.toLowerCase().includes(gisA.toLowerCase());
    if (gisMatch) {
      breakdown.spatialScore += 0.5;
      totalScore += 1;
      matchReasons.push('Same GIS zone');
    }
    totalWeight += 1;
  }
  
  // ============================================
  // 8. GPS Proximity
  // ============================================
  if (assetA.location && assetB.location) {
    const latDiff = Math.abs(assetA.location.latitude - assetB.location.latitude);
    const lonDiff = Math.abs(assetA.location.longitude - assetB.location.longitude);
    
    // Within ~100 meters
    if (latDiff < 0.001 && lonDiff < 0.001) {
      breakdown.spatialScore = 1;
      totalScore += config.spatialWeight;
      matchReasons.push('Same location');
    } else if (latDiff < 0.01 && lonDiff < 0.01) {
      // Within ~1km
      breakdown.spatialScore = 0.5;
      totalScore += config.spatialWeight * 0.5;
      matchReasons.push('Nearby location');
    }
    totalWeight += config.spatialWeight;
  }
  
  // ============================================
  // 9. Content/Description Similarity
  // ============================================
  if (recA?.DOCUMENT_DESCRIPTION && recB?.DOCUMENT_DESCRIPTION) {
    const descShingle = shingleSimilarity(recA.DOCUMENT_DESCRIPTION, recB.DOCUMENT_DESCRIPTION);
    breakdown.contentScore = descShingle;
    totalScore += descShingle * 2;
    totalWeight += 2;
    
    if (descShingle > 0.3) {
      matchReasons.push(`Similar descriptions (${(descShingle * 100).toFixed(0)}%)`);
    }
  }
  
  const finalScore = totalWeight > 0 ? totalScore / totalWeight : 0;
  
  return {
    assetA,
    assetB,
    score: finalScore,
    matchReasons,
    breakdown,
  };
}

// ============================================
// Hierarchical Clustering
// ============================================

/**
 * Find duplicate clusters using enhanced similarity
 */
export function findDuplicateClustersV2(
  assets: DigitalAsset[],
  config: DeduplicationConfig = DEFAULT_CONFIG
): DeduplicationResult {
  const startTime = Date.now();
  
  logger.info('Starting enhanced duplicate detection', { 
    assetCount: assets.length,
    threshold: config.threshold 
  });
  
  const matches: SimilarityMatch[] = [];
  
  // Compare all pairs
  for (let i = 0; i < assets.length; i++) {
    for (let j = i + 1; j < assets.length; j++) {
      const match = calculateSimilarityV2(assets[i], assets[j], config);
      if (match.score >= config.threshold) {
        matches.push(match);
      }
    }
  }
  
  // Build clusters using Union-Find with path compression
  const parent = new Map<string, string>();
  const rank = new Map<string, number>();
  
  const find = (id: string): string => {
    if (!parent.has(id)) {
      parent.set(id, id);
      rank.set(id, 0);
    }
    if (parent.get(id) !== id) {
      parent.set(id, find(parent.get(id)!)); // Path compression
    }
    return parent.get(id)!;
  };
  
  const union = (idA: string, idB: string) => {
    const rootA = find(idA);
    const rootB = find(idB);
    if (rootA !== rootB) {
      // Union by rank
      const rankA = rank.get(rootA) || 0;
      const rankB = rank.get(rootB) || 0;
      if (rankA < rankB) {
        parent.set(rootA, rootB);
      } else if (rankA > rankB) {
        parent.set(rootB, rootA);
      } else {
        parent.set(rootB, rootA);
        rank.set(rootA, rankA + 1);
      }
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
  
  clusterMap.forEach((clusterAssets, clusterId) => {
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
      const allReasons: string[] = [];
      
      for (const dup of duplicates) {
        const match = calculateSimilarityV2(primary, dup, config);
        avgSim += match.score;
        simCount++;
        allReasons.push(...match.matchReasons);
      }
      avgSim = simCount > 0 ? avgSim / simCount : 0;
      
      clusters.push({
        id: `cluster_${clusterId}_${Date.now()}`,
        primaryAsset: primary,
        duplicates,
        similarity: avgSim,
        consolidatedMetadata: consolidateMetadataV2(clusterAssets),
        matchReasons: [...new Set(allReasons)],
      });
      
      totalDuplicatesFound += duplicates.length;
    } else {
      uniqueAssets.push(clusterAssets[0]);
    }
  });
  
  const processingTime = Date.now() - startTime;
  
  logger.info('Enhanced duplicate detection complete', {
    clustersFound: clusters.length,
    duplicatesFound: totalDuplicatesFound,
    uniqueAssets: uniqueAssets.length,
    processingTime: `${processingTime}ms`,
  });
  
  return { clusters, uniqueAssets, totalDuplicatesFound, processingTime };
}

// ============================================
// Enhanced Metadata Consolidation
// ============================================

/**
 * Consolidate metadata from multiple similar assets
 */
export function consolidateMetadataV2(assets: DigitalAsset[]): ConsolidatedMetadata {
  if (assets.length === 0) {
    throw new Error('Cannot consolidate empty asset list');
  }
  
  // Sort by confidence to prioritize higher quality metadata
  const sorted = [...assets].sort((a, b) => 
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
  
  // Build smart consolidated title
  const consolidatedTitle = buildSmartTitle(assets);
  
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
    imageCount: assets.length,
  };
}

/**
 * Build a smart title that captures the essence of all assets
 */
function buildSmartTitle(assets: DigitalAsset[]): string {
  const titles = assets
    .map(a => a.sqlRecord?.DOCUMENT_TITLE || '')
    .filter(t => t.length > 0);
  
  if (titles.length === 0) return `Untitled (${assets.length} images)`;
  if (titles.length === 1) return titles[0];
  
  // Extract common significant words across all titles
  const wordFrequency = new Map<string, number>();
  titles.forEach(title => {
    const words = extractSignificantWords(title);
    words.forEach(word => {
      wordFrequency.set(word, (wordFrequency.get(word) || 0) + 1);
    });
  });
  
  // Find words that appear in most titles
  const commonWords = [...wordFrequency.entries()]
    .filter(([_, count]) => count >= Math.ceil(titles.length / 2))
    .sort((a, b) => b[1] - a[1])
    .map(([word]) => word);
  
  // Also extract years and proper nouns
  const allConcepts = extractSemanticConcepts(titles.join(' '));
  
  // Build title from common elements
  let baseTitle = '';
  
  // Start with proper nouns if available
  if (allConcepts.properNouns.length > 0) {
    baseTitle = allConcepts.properNouns.slice(0, 2).join(' ');
  } else if (commonWords.length > 0) {
    // Capitalize common words
    baseTitle = commonWords.slice(0, 4)
      .map(w => w.charAt(0).toUpperCase() + w.slice(1))
      .join(' ');
  } else {
    // Fall back to shortest title as base
    baseTitle = [...titles].sort((a, b) => a.length - b.length)[0]
      .split(' – ')[0]
      .split(' - ')[0];
  }
  
  // Add year if present
  if (allConcepts.years.length > 0) {
    const yearStr = allConcepts.years.length === 1 
      ? allConcepts.years[0]
      : `${Math.min(...allConcepts.years.map(Number))}-${Math.max(...allConcepts.years.map(Number))}`;
    if (!baseTitle.includes(yearStr)) {
      baseTitle = `${baseTitle} (${yearStr})`;
    }
  }
  
  return `${baseTitle} (${assets.length} views)`;
}

/**
 * Build a rich consolidated description from multiple asset descriptions
 */
function buildConsolidatedDescription(assets: DigitalAsset[]): string {
  const descriptions = assets
    .map(a => a.sqlRecord?.DOCUMENT_DESCRIPTION || '')
    .filter(d => d.length > 0)
    .sort((a, b) => b.length - a.length);
  
  if (descriptions.length === 0) return 'No description available.';
  
  const primary = descriptions[0];
  
  if (assets.length === 1) return primary;
  
  // Extract unique details from other descriptions
  const primaryWords = new Set(extractSignificantWords(primary));
  const additionalDetails: string[] = [];
  
  for (const desc of descriptions.slice(1)) {
    const words = extractSignificantWords(desc);
    const newWords = words.filter(w => !primaryWords.has(w));
    if (newWords.length >= 2) {
      additionalDetails.push(desc);
    }
  }
  
  if (additionalDetails.length > 0) {
    return `${primary}\n\n[Additional perspectives from ${assets.length} images: ${additionalDetails.slice(0, 2).join(' | ')}]`;
  }
  
  return `${primary}\n\n[Consolidated from ${assets.length} similar images for enhanced accuracy]`;
}

// ============================================
// Manual Curation Support
// ============================================

export interface ManualMergeRequest {
  assetIds: string[];
  primaryAssetId?: string;
  customTitle?: string;
}

export interface ManualSplitRequest {
  clusterId: string;
  assetIdsToSplit: string[];
}

/**
 * Manually merge selected assets into a cluster
 */
export function manualMergeAssets(
  assets: DigitalAsset[],
  request: ManualMergeRequest
): DeduplicationCluster {
  const selectedAssets = assets.filter(a => request.assetIds.includes(a.id));
  
  if (selectedAssets.length < 2) {
    throw new Error('Need at least 2 assets to merge');
  }
  
  // Determine primary
  let primary: DigitalAsset;
  if (request.primaryAssetId) {
    primary = selectedAssets.find(a => a.id === request.primaryAssetId) || selectedAssets[0];
  } else {
    // Pick highest confidence
    primary = [...selectedAssets].sort((a, b) => 
      (b.sqlRecord?.CONFIDENCE_SCORE || 0) - (a.sqlRecord?.CONFIDENCE_SCORE || 0)
    )[0];
  }
  
  const duplicates = selectedAssets.filter(a => a.id !== primary.id);
  const metadata = consolidateMetadataV2(selectedAssets);
  
  // Apply custom title if provided
  if (request.customTitle) {
    metadata.title = request.customTitle;
  }
  
  return {
    id: `manual_${Date.now()}`,
    primaryAsset: primary,
    duplicates,
    similarity: 1.0, // Manual merge = 100% confidence
    consolidatedMetadata: metadata,
    matchReasons: ['Manually merged by curator'],
  };
}

/**
 * Get merge suggestions for review in Curator Mode
 */
export function getMergeSuggestions(
  assets: DigitalAsset[],
  config: DeduplicationConfig = { ...DEFAULT_CONFIG, threshold: 0.35 }
): DeduplicationCluster[] {
  const result = findDuplicateClustersV2(assets, config);
  
  // Return clusters sorted by similarity (highest first)
  return result.clusters.sort((a, b) => b.similarity - a.similarity);
}

/**
 * Find potential matches for a specific asset
 */
export function findSimilarAssets(
  targetAsset: DigitalAsset,
  allAssets: DigitalAsset[],
  minSimilarity: number = 0.3
): SimilarityMatch[] {
  const matches: SimilarityMatch[] = [];
  
  for (const asset of allAssets) {
    if (asset.id === targetAsset.id) continue;
    
    const match = calculateSimilarityV2(targetAsset, asset);
    if (match.score >= minSimilarity) {
      matches.push(match);
    }
  }
  
  return matches.sort((a, b) => b.score - a.score);
}

export default {
  calculateSimilarityV2,
  findDuplicateClustersV2,
  consolidateMetadataV2,
  manualMergeAssets,
  getMergeSuggestions,
  findSimilarAssets,
  DEFAULT_CONFIG,
};
