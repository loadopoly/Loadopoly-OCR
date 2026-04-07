/**
 * Dimension Worker — Off-main-thread dimension extraction
 *
 * Receives asset data via postMessage, computes ALL Tier 1 + Tier 2 dimensions,
 * and posts the results back in a single message.  This keeps the main thread
 * 100 % responsive — clicks, scrolls, and paints are never blocked by regex-heavy
 * derive functions or O(n²) cross-asset comparisons.
 *
 * Protocol:
 *   Main→Worker  { gen, assets, graphData }
 *   Worker→Main  { gen, dimensions: Record<dim, values[]> }
 */

import {
  type FilterDimension,
  TIER1_DIMENSIONS,
  TIER2_DIMENSIONS,
  DIMENSION_LABELS,
  extractDimensionValues,
  extractExpensiveDimensionsBatch,
  extractNodeTypes,
} from '../lib/dimensionExtraction';

export interface DimWorkerRequest {
  gen: number;
  assets: Array<{ id: string; sqlRecord: any; graphData?: { nodes: any[]; links: any[] } }>;
  graphData: { nodes: any[]; links: any[] };
}

export interface DimWorkerResponse {
  gen: number;
  dimensions: Record<string, any[]>;
}

self.onmessage = (e: MessageEvent<DimWorkerRequest>) => {
  const { gen, assets, graphData } = e.data;
  const result: Record<string, any[]> = {};

  // --- Tier 1: field lookups + regex-heavy derives ---
  for (const dim of TIER1_DIMENSIONS) {
    if (!DIMENSION_LABELS[dim]) continue;
    const values = dim === 'nodeType'
      ? extractNodeTypes(graphData as any)
      : extractDimensionValues(assets as any, dim);
    result[dim] = values;
  }

  // --- Tier 2: cross-asset O(n²) comparisons ---
  const expensive = extractExpensiveDimensionsBatch(assets as any);
  for (const dim of TIER2_DIMENSIONS) {
    result[dim] = expensive.get(dim) || [];
  }

  (self as any).postMessage({ gen, dimensions: result } satisfies DimWorkerResponse);
};
