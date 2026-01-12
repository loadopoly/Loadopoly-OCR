/**
 * Parallel Processing Worker
 * 
 * Web Worker for offloading CPU-intensive tasks from the main thread.
 * Supports:
 * - Parallel Gemini API calls
 * - Image similarity calculations for deduplication
 * - N-gram/shingle generation
 * 
 * Communication Protocol:
 * - Main thread sends { type: 'task_type', payload: {...}, id: 'unique_id' }
 * - Worker responds with { type: 'result', id: 'unique_id', data: {...} }
 * - Errors: { type: 'error', id: 'unique_id', error: 'message' }
 * 
 * Note: This file should be compiled separately and loaded as a Worker.
 * For Vite, use: new Worker(new URL('./parallelWorker.ts', import.meta.url))
 */

// ============================================
// Types
// ============================================

interface WorkerMessage {
  type: string;
  id: string;
  payload: unknown;
}

interface WorkerResponse {
  type: 'result' | 'error' | 'progress';
  id: string;
  data?: unknown;
  error?: string;
  progress?: number;
}

interface GeminiTask {
  imageBase64: string;
  mimeType: string;
  scanType: string;
  location?: { lat: number; lng: number };
}

interface SimilarityTask {
  textA: string;
  textB: string;
  method: 'ngram' | 'shingle' | 'jaccard' | 'levenshtein';
}

interface BatchSimilarityTask {
  texts: string[];
  threshold: number;
}

// ============================================
// Worker Context
// ============================================

const ctx: Worker = self as unknown as Worker;

// ============================================
// Message Handler
// ============================================

ctx.onmessage = async (event: MessageEvent<WorkerMessage>) => {
  const { type, id, payload } = event.data;
  
  try {
    let result: unknown;
    
    switch (type) {
      case 'similarity':
        result = calculateSimilarity(payload as SimilarityTask);
        break;
        
      case 'batchSimilarity':
        result = await calculateBatchSimilarity(payload as BatchSimilarityTask, id);
        break;
        
      case 'ngrams':
        result = generateNgrams(payload as { text: string; n: number });
        break;
        
      case 'shingles':
        result = generateShingles(payload as { text: string; n: number });
        break;
        
      case 'simhash':
        result = computeSimHash(payload as { text: string });
        break;
        
      case 'cluster':
        result = await clusterTexts(payload as { texts: string[]; threshold: number }, id);
        break;
        
      default:
        throw new Error(`Unknown task type: ${type}`);
    }
    
    respond({ type: 'result', id, data: result });
  } catch (error) {
    respond({
      type: 'error',
      id,
      error: error instanceof Error ? error.message : 'Unknown error',
    });
  }
};

function respond(response: WorkerResponse): void {
  ctx.postMessage(response);
}

function reportProgress(id: string, progress: number): void {
  ctx.postMessage({ type: 'progress', id, progress });
}

// ============================================
// Similarity Functions
// ============================================

function calculateSimilarity(task: SimilarityTask): number {
  switch (task.method) {
    case 'ngram':
      return ngramSimilarity(task.textA, task.textB, 3);
    case 'shingle':
      return shingleSimilarity(task.textA, task.textB, 2);
    case 'jaccard':
      return jaccardSimilarity(task.textA, task.textB);
    case 'levenshtein':
      return levenshteinSimilarity(task.textA, task.textB);
    default:
      return 0;
  }
}

async function calculateBatchSimilarity(
  task: BatchSimilarityTask,
  jobId: string
): Promise<Array<{ i: number; j: number; score: number }>> {
  const { texts, threshold } = task;
  const results: Array<{ i: number; j: number; score: number }> = [];
  const total = (texts.length * (texts.length - 1)) / 2;
  let processed = 0;
  
  for (let i = 0; i < texts.length; i++) {
    for (let j = i + 1; j < texts.length; j++) {
      const score = combinedSimilarity(texts[i], texts[j]);
      
      if (score >= threshold) {
        results.push({ i, j, score });
      }
      
      processed++;
      if (processed % 100 === 0) {
        reportProgress(jobId, (processed / total) * 100);
        // Yield to prevent blocking
        await new Promise(resolve => setTimeout(resolve, 0));
      }
    }
  }
  
  return results;
}

// ============================================
// N-gram Functions
// ============================================

function generateNgrams(params: { text: string; n: number }): string[] {
  const { text, n } = params;
  const normalized = text.toLowerCase().replace(/[^a-z0-9]/g, '');
  const ngrams: string[] = [];
  
  for (let i = 0; i <= normalized.length - n; i++) {
    ngrams.push(normalized.slice(i, i + n));
  }
  
  return ngrams;
}

function ngramSimilarity(textA: string, textB: string, n: number = 3): number {
  const ngramsA = new Set(generateNgrams({ text: textA, n }));
  const ngramsB = new Set(generateNgrams({ text: textB, n }));
  
  if (ngramsA.size === 0 && ngramsB.size === 0) return 0;
  
  let intersection = 0;
  ngramsA.forEach(ng => {
    if (ngramsB.has(ng)) intersection++;
  });
  
  const union = ngramsA.size + ngramsB.size - intersection;
  return union > 0 ? intersection / union : 0;
}

// ============================================
// Shingle Functions
// ============================================

function generateShingles(params: { text: string; n: number }): string[] {
  const { text, n } = params;
  const words = text
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, ' ')
    .split(/\s+/)
    .filter(w => w.length > 1);
  
  const shingles: string[] = [];
  
  // Single words
  shingles.push(...words);
  
  // Word n-grams
  for (let size = 2; size <= n; size++) {
    for (let i = 0; i <= words.length - size; i++) {
      shingles.push(words.slice(i, i + size).join('_'));
    }
  }
  
  return shingles;
}

function shingleSimilarity(textA: string, textB: string, n: number = 2): number {
  const shinglesA = new Set(generateShingles({ text: textA, n }));
  const shinglesB = new Set(generateShingles({ text: textB, n }));
  
  if (shinglesA.size === 0 && shinglesB.size === 0) return 0;
  
  let intersection = 0;
  shinglesA.forEach(sh => {
    if (shinglesB.has(sh)) intersection++;
  });
  
  const union = shinglesA.size + shinglesB.size - intersection;
  return union > 0 ? intersection / union : 0;
}

// ============================================
// Jaccard Similarity (word-level)
// ============================================

function jaccardSimilarity(textA: string, textB: string): number {
  const wordsA = new Set(
    textA.toLowerCase().replace(/[^a-z0-9\s]/g, '').split(/\s+/).filter(Boolean)
  );
  const wordsB = new Set(
    textB.toLowerCase().replace(/[^a-z0-9\s]/g, '').split(/\s+/).filter(Boolean)
  );
  
  if (wordsA.size === 0 && wordsB.size === 0) return 0;
  
  let intersection = 0;
  wordsA.forEach(w => {
    if (wordsB.has(w)) intersection++;
  });
  
  const union = wordsA.size + wordsB.size - intersection;
  return union > 0 ? intersection / union : 0;
}

// ============================================
// Levenshtein Distance
// ============================================

function levenshteinDistance(a: string, b: string): number {
  const m = a.length;
  const n = b.length;
  
  // Use single array for space optimization
  let prev = new Array(n + 1).fill(0).map((_, i) => i);
  let curr = new Array(n + 1).fill(0);
  
  for (let i = 1; i <= m; i++) {
    curr[0] = i;
    for (let j = 1; j <= n; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      curr[j] = Math.min(
        prev[j] + 1,      // deletion
        curr[j - 1] + 1,  // insertion
        prev[j - 1] + cost // substitution
      );
    }
    [prev, curr] = [curr, prev];
  }
  
  return prev[n];
}

function levenshteinSimilarity(textA: string, textB: string): number {
  const a = textA.toLowerCase().trim();
  const b = textB.toLowerCase().trim();
  
  if (a.length === 0 && b.length === 0) return 1;
  if (a.length === 0 || b.length === 0) return 0;
  
  const maxLen = Math.max(a.length, b.length);
  const distance = levenshteinDistance(a, b);
  
  return 1 - distance / maxLen;
}

// ============================================
// SimHash (Locality Sensitive Hashing)
// ============================================

function computeSimHash(params: { text: string }): bigint {
  const { text } = params;
  const shingles = generateShingles({ text, n: 2 });
  
  // 64-bit hash
  const bits = 64;
  const v = new Array(bits).fill(0);
  
  for (const shingle of shingles) {
    const hash = simpleHash(shingle);
    
    for (let i = 0; i < bits; i++) {
      if ((hash >> BigInt(i)) & 1n) {
        v[i]++;
      } else {
        v[i]--;
      }
    }
  }
  
  let fingerprint = 0n;
  for (let i = 0; i < bits; i++) {
    if (v[i] > 0) {
      fingerprint |= 1n << BigInt(i);
    }
  }
  
  return fingerprint;
}

function simpleHash(str: string): bigint {
  // FNV-1a hash
  let hash = 14695981039346656037n;
  const fnvPrime = 1099511628211n;
  
  for (let i = 0; i < str.length; i++) {
    hash ^= BigInt(str.charCodeAt(i));
    hash *= fnvPrime;
    hash &= 0xFFFFFFFFFFFFFFFFn; // Keep 64 bits
  }
  
  return hash;
}

function hammingDistance(a: bigint, b: bigint): number {
  let xor = a ^ b;
  let count = 0;
  
  while (xor > 0n) {
    count += Number(xor & 1n);
    xor >>= 1n;
  }
  
  return count;
}

// ============================================
// Combined Similarity
// ============================================

function combinedSimilarity(textA: string, textB: string): number {
  // Weight different similarity methods
  const weights = {
    ngram: 0.3,
    shingle: 0.4,
    jaccard: 0.3,
  };
  
  const ngScore = ngramSimilarity(textA, textB, 3);
  const shScore = shingleSimilarity(textA, textB, 2);
  const jaScore = jaccardSimilarity(textA, textB);
  
  return (
    ngScore * weights.ngram +
    shScore * weights.shingle +
    jaScore * weights.jaccard
  );
}

// ============================================
// Clustering
// ============================================

async function clusterTexts(
  params: { texts: string[]; threshold: number },
  jobId: string
): Promise<number[][]> {
  const { texts, threshold } = params;
  const n = texts.length;
  
  // Union-Find data structure
  const parent = texts.map((_, i) => i);
  const rank = new Array(n).fill(0);
  
  function find(x: number): number {
    if (parent[x] !== x) {
      parent[x] = find(parent[x]); // Path compression
    }
    return parent[x];
  }
  
  function union(x: number, y: number): void {
    const px = find(x);
    const py = find(y);
    
    if (px === py) return;
    
    // Union by rank
    if (rank[px] < rank[py]) {
      parent[px] = py;
    } else if (rank[px] > rank[py]) {
      parent[py] = px;
    } else {
      parent[py] = px;
      rank[px]++;
    }
  }
  
  // Compare all pairs and union similar ones
  const total = (n * (n - 1)) / 2;
  let processed = 0;
  
  for (let i = 0; i < n; i++) {
    for (let j = i + 1; j < n; j++) {
      const score = combinedSimilarity(texts[i], texts[j]);
      
      if (score >= threshold) {
        union(i, j);
      }
      
      processed++;
      if (processed % 50 === 0) {
        reportProgress(jobId, (processed / total) * 100);
        await new Promise(resolve => setTimeout(resolve, 0));
      }
    }
  }
  
  // Group by cluster
  const clusters = new Map<number, number[]>();
  
  for (let i = 0; i < n; i++) {
    const root = find(i);
    if (!clusters.has(root)) {
      clusters.set(root, []);
    }
    clusters.get(root)!.push(i);
  }
  
  return Array.from(clusters.values());
}

// ============================================
// Export for TypeScript (when not in worker context)
// ============================================

export {
  calculateSimilarity,
  generateNgrams,
  generateShingles,
  ngramSimilarity,
  shingleSimilarity,
  jaccardSimilarity,
  levenshteinSimilarity,
  computeSimHash,
  combinedSimilarity,
};
