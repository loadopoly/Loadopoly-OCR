import { DigitalAsset, ImageBundle, HistoricalDocumentMetadata, AssetStatus } from '../types';
import type { ConsolidatedMetadata } from './deduplicationServiceV2';
import { logger } from '../lib/logger';

// PERF v2.16.3: deduplicationServiceV2 is NOT imported statically.
// It was pulling 1000+ lines of string algorithms into the App chunk parse path,
// blocking the main thread for hundreds of ms on startup. Now dynamically imported
// inside createBundlesSync() (which is only the fallback — the worker handles the normal path).

// ============================================
// Worker-backed bundle creation (off-main-thread)
// ============================================
//
// The synchronous deduplication path runs an O(n²) pairwise comparison
// (Levenshtein, n-gram, jaccard, shingle, phonetic) on every asset pair —
// for a 600-asset library that's ~180 000 string comparisons, blocking the
// main thread for 5+ seconds and causing browsers (Edge, Chrome) to surface
// a "page isn't responding" warning.
//
// `bundleWorker.ts` performs the same dedup + bundling logic in a Web Worker
// and returns lightweight ID-only group assignments. We rebuild the full
// ImageBundle objects on the main thread (a cheap O(n) pass) using
// `createBundleFromGroup`. This keeps the heavy work off the UI thread.

interface BundleGroupAssignment {
  bundleId: string;
  assetIds: string[];
  isUserDefined: boolean;
  source: 'dedup' | 'traditional' | 'user';
}

interface BundleWorkerResult {
  gen: number;
  groups: BundleGroupAssignment[];
  singleIds: string[];
}

/**
 * Plain-object asset shape posted to the worker. Mirrors `MinBundleAsset`
 * in `bundleWorker.ts` — keep the two definitions in sync. Fields are
 * widened to allow `null` because several `HistoricalDocumentMetadata`
 * fields are `string | null` in the source type.
 */
interface MinBundleAssetPayload {
  id: string;
  ocrText?: string;
  location?: { latitude: number; longitude: number };
  status: string;
  sqlRecord: {
    DOCUMENT_TITLE?: string | null;
    DOCUMENT_DESCRIPTION?: string | null;
    ENTITIES_EXTRACTED?: string[];
    KEYWORDS_TAGS?: string[];
    SOURCE_COLLECTION?: string | null;
    NLP_DERIVED_GIS_ZONE?: string | null;
    LOCAL_GIS_ZONE?: string | null;
    NLP_DERIVED_TIMESTAMP?: string | null;
    CONFIDENCE_SCORE?: number | null;
    USER_BUNDLE_ID?: string | null;
  } | null;
  graphData?: { nodes: { id: string }[] };
}

let _bundleWorker: Worker | null = null;
let _bundleWorkerGen = 0;
let _bundleWorkerBroken = false; // sticky: once we know the worker can't run, stop retrying

function getBundleWorker(): Worker | null {
  if (_bundleWorkerBroken) return null;
  if (typeof Worker === 'undefined') return null;
  if (_bundleWorker) return _bundleWorker;
  try {
    _bundleWorker = new Worker(
      new URL('../workers/bundleWorker.ts', import.meta.url),
      { type: 'module' }
    );
    _bundleWorker.addEventListener('error', (e) => {
      logger.warn('Bundle worker error — falling back to main-thread dedup', { message: e.message });
      _bundleWorkerBroken = true;
      try { _bundleWorker?.terminate(); } catch { /* ignore */ }
      _bundleWorker = null;
    });
    return _bundleWorker;
  } catch (err) {
    logger.warn('Bundle worker unavailable — falling back to main-thread dedup', { error: String(err) });
    _bundleWorkerBroken = true;
    return null;
  }
}

/**
 * Strip the asset down to the plain-object fields the worker actually reads.
 * Avoids structured-cloning large image blobs / object URLs across the
 * worker boundary on every recompute.
 */
function toMinAsset(a: DigitalAsset): MinBundleAssetPayload {
  const rec = a.sqlRecord;
  return {
    id: a.id,
    ocrText: a.ocrText,
    location: a.location,
    status: a.status,
    sqlRecord: rec ? {
      DOCUMENT_TITLE: rec.DOCUMENT_TITLE,
      DOCUMENT_DESCRIPTION: rec.DOCUMENT_DESCRIPTION,
      ENTITIES_EXTRACTED: rec.ENTITIES_EXTRACTED,
      KEYWORDS_TAGS: rec.KEYWORDS_TAGS,
      SOURCE_COLLECTION: rec.SOURCE_COLLECTION,
      NLP_DERIVED_GIS_ZONE: rec.NLP_DERIVED_GIS_ZONE,
      LOCAL_GIS_ZONE: rec.LOCAL_GIS_ZONE,
      NLP_DERIVED_TIMESTAMP: rec.NLP_DERIVED_TIMESTAMP,
      CONFIDENCE_SCORE: rec.CONFIDENCE_SCORE,
      USER_BUNDLE_ID: rec.USER_BUNDLE_ID,
    } : null,
    graphData: a.graphData ? { nodes: a.graphData.nodes.map(n => ({ id: n.id })) } : undefined,
  };
}

/**
 * Run dedup + bundling in a Web Worker, then reconstruct full ImageBundle
 * objects on the main thread. Resolves with `null` if the worker is
 * unavailable or fails — callers should then fall back to the sync path.
 */
function createBundlesViaWorker(assets: DigitalAsset[]): Promise<(DigitalAsset | ImageBundle)[] | null> {
  const worker = getBundleWorker();
  if (!worker) return Promise.resolve(null);

  const gen = ++_bundleWorkerGen;
  const minAssets = assets.map(toMinAsset);

  return new Promise((resolve) => {
    let settled = false;
    const finish = (value: (DigitalAsset | ImageBundle)[] | null) => {
      if (settled) return;
      settled = true;
      worker.removeEventListener('message', onMessage);
      worker.removeEventListener('error', onError);
      clearTimeout(timeoutId);
      resolve(value);
    };

    const onMessage = (event: MessageEvent<BundleWorkerResult>) => {
      const data = event.data;
      // Stale generation — a newer call superseded us; ignore this result.
      if (!data || data.gen !== gen) return;
      try {
        finish(reconstructBundles(assets, data));
      } catch (err) {
        logger.error('Bundle reconstruction failed; falling back to sync path', { error: String(err) });
        finish(null);
      }
    };

    const onError = (err: ErrorEvent) => {
      logger.warn('Bundle worker reported error during job; falling back', { message: err.message });
      finish(null);
    };

    // Hard timeout — if the worker never replies (shouldn't happen, but be
    // safe so a wedged worker can't leave callers hanging forever) drop back
    // to the sync path. Generous because dedup of huge libraries can take a
    // few seconds even on a worker thread.
    const timeoutId = setTimeout(() => {
      logger.warn('Bundle worker timed out; falling back to main-thread dedup');
      finish(null);
    }, 60_000);

    worker.addEventListener('message', onMessage);
    worker.addEventListener('error', onError);

    try {
      worker.postMessage({ gen, assets: minAssets });
    } catch (err) {
      logger.warn('Bundle worker postMessage failed; falling back', { error: String(err) });
      finish(null);
    }
  });
}

/**
 * Rebuild full ImageBundle objects from the worker's lightweight ID
 * assignments. Iterates groups + singles in O(n).
 */
function reconstructBundles(
  assets: DigitalAsset[],
  result: BundleWorkerResult,
): (DigitalAsset | ImageBundle)[] {
  const byId = new Map(assets.map(a => [a.id, a]));
  const usedIds = new Set<string>();
  const out: (DigitalAsset | ImageBundle)[] = [];
  let missingFromGroups = 0;
  let missingFromSingles = 0;

  for (const group of result.groups) {
    const groupAssets: DigitalAsset[] = [];
    for (const id of group.assetIds) {
      const a = byId.get(id);
      if (a) groupAssets.push(a);
      else missingFromGroups++;
    }
    if (groupAssets.length === 0) continue;
    groupAssets.forEach(a => usedIds.add(a.id));

    if (groupAssets.length === 1 && !group.isUserDefined) {
      // Degenerate "bundle" — emit as a single asset to match the sync path's behaviour.
      out.push(groupAssets[0]);
      continue;
    }

    try {
      const bundle = createBundleFromGroup(groupAssets);
      bundle.bundleId = group.bundleId;
      if (group.isUserDefined) bundle.isUserDefined = true;
      out.push(bundle);
    } catch (e) {
      logger.error('Failed to reconstruct bundle from worker group', { bundleId: group.bundleId, error: String(e) });
      // Treat the failed group's members as singles so no asset is lost.
      out.push(...groupAssets);
    }
  }

  for (const id of result.singleIds) {
    const a = byId.get(id);
    if (a && !usedIds.has(id)) {
      out.push(a);
      usedIds.add(id);
    } else if (!a) {
      missingFromSingles++;
    }
  }

  // Safety net: any asset the worker forgot about gets emitted as a single
  // so it never silently disappears from the UI.
  let unassigned = 0;
  for (const a of assets) {
    if (!usedIds.has(a.id)) {
      out.push(a);
      unassigned++;
    }
  }

  if (missingFromGroups || missingFromSingles || unassigned) {
    // Indicates the worker's view of the asset set diverged from ours
    // (race between rapid recomputes, ID corruption, etc.) — surface it
    // so it shows up in diagnostics rather than silently swallowing items.
    logger.warn('Bundle worker reply did not match main-thread asset set', {
      missingFromGroups,
      missingFromSingles,
      unassignedFallbacks: unassigned,
      totalAssets: assets.length,
    });
  }

  return out;
}

export const createBundles = async (assets: DigitalAsset[]): Promise<(DigitalAsset | ImageBundle)[]> => {
  // Fast path: do the heavy O(n²) dedup off the main thread.
  // Falls back to the synchronous implementation below if the Worker API
  // isn't available (e.g. SSR, very old browsers, sandboxed iframes).
  const workerResult = await createBundlesViaWorker(assets);
  if (workerResult) return workerResult;

  return createBundlesSync(assets);
};

const createBundlesSync = async (assets: DigitalAsset[]): Promise<(DigitalAsset | ImageBundle)[]> => {
  const { findDuplicateClustersV2, DEFAULT_CONFIG } = await import('./deduplicationServiceV2');
  const BUNDLE_DEDUP_CONFIG = { ...DEFAULT_CONFIG, threshold: 0.40 };

  const bundles: Record<string, DigitalAsset[]> = {};
  const singles: DigitalAsset[] = [];

  // Filter out assets that are already in a user-defined bundle
  const autoBundleAssets = assets.filter(a => !a.sqlRecord?.USER_BUNDLE_ID);
  const userBundledAssets = assets.filter(a => !!a.sqlRecord?.USER_BUNDLE_ID);

  // PHASE 1: Enhanced semantic deduplication
  const deduplicationResult = findDuplicateClustersV2(autoBundleAssets, BUNDLE_DEDUP_CONFIG);
  
  logger.info('Enhanced deduplication analysis complete', {
    clusters: deduplicationResult.clusters.length,
    duplicatesFound: deduplicationResult.totalDuplicatesFound,
    uniqueAssets: deduplicationResult.uniqueAssets.length,
    processingTime: deduplicationResult.processingTime,
  });

  // Create bundles from deduplication clusters
  const dedupBundles: ImageBundle[] = [];
  deduplicationResult.clusters.forEach(cluster => {
    try {
      const allAssets = [cluster.primaryAsset, ...cluster.duplicates];
      const bundle = createBundleFromGroup(allAssets, cluster.consolidatedMetadata);
      bundle.bundleId = `DEDUP_${cluster.primaryAsset.id}`;
      dedupBundles.push(bundle);
    } catch (e) {
      logger.error('Failed to create dedup bundle', { error: e });
      // Fallback: add as singles
      singles.push(cluster.primaryAsset, ...cluster.duplicates);
    }
  });

  // PHASE 2: Traditional bundling for remaining unique assets
  deduplicationResult.uniqueAssets.forEach(asset => {
    try {
        const key = generateBundleKey(asset, deduplicationResult.uniqueAssets);
        // Only bundle if we have a valid key and decent confidence
        if (key && asset.sqlRecord?.CONFIDENCE_SCORE && asset.sqlRecord.CONFIDENCE_SCORE > 0.6) {
            if (!bundles[key]) bundles[key] = [];
            bundles[key].push(asset);
        } else {
            singles.push(asset);
        }
    } catch (e) {
        console.warn("Failed to generate bundle key for asset", asset.id, e);
        singles.push(asset);
    }
  });

  // Explicitly type the array to handle the union of DigitalAsset and ImageBundle
  const bundledItems: (DigitalAsset | ImageBundle)[] = [...dedupBundles];
  
  Object.values(bundles).forEach(group => {
    try {
        if (group.length > 1) {
            bundledItems.push(createBundleFromGroup(group));
        } else {
            // If a group only has 1 item, treat it as a single asset
            bundledItems.push(...group);
        }
    } catch (e) {
        console.error("Failed to create bundle from group:", group, e);
        // Fallback: treat all items in failed bundle as singles
        bundledItems.push(...group);
    }
  });

  // Group user-defined bundles
  const userBundlesMap: Record<string, DigitalAsset[]> = {};
  userBundledAssets.forEach(asset => {
    const bid = asset.sqlRecord!.USER_BUNDLE_ID!;
    if (!userBundlesMap[bid]) userBundlesMap[bid] = [];
    userBundlesMap[bid].push(asset);
  });

  Object.entries(userBundlesMap).forEach(([bid, group]) => {
    const bundle = createBundleFromGroup(group);
    bundle.bundleId = bid;
    bundle.isUserDefined = true;
    bundledItems.push(bundle);
  });

  return [...bundledItems, ...singles];
};

const extractYear = (ts: string | null | undefined): number => {
  if (!ts) return 9999;
  const match = ts.match(/\d{4}/);
  return match ? parseInt(match[0]) : 9999;
};

const normalizeTitle = (t: string) => {
  // Remove numbers and special chars to group "Aircraft 1" and "Aircraft 2"
  return t.replace(/[^a-z]/gi, '').slice(0, 20).toLowerCase();
};

const generateBundleKey = (asset: DigitalAsset, allAssets: DigitalAsset[]): string | null => {
  const rec = asset.sqlRecord;
  if (!rec) return null;

  // Strategy 1: Exact location match (GPS ±10m)
  if (asset.location) {
    const matches = allAssets.filter(a =>
      a.location &&
      Math.abs(a.location.latitude - asset.location!.latitude) < 0.0001 &&
      Math.abs(a.location.longitude - asset.location!.longitude) < 0.0001
    );
    if (matches.length > 1) {
        return `gps_${asset.location.latitude.toFixed(4)}_${asset.location.longitude.toFixed(4)}`;
    }
  }

  // Strategy 2: Shared Entities (High confidence clustering)
  const entities = rec.ENTITIES_EXTRACTED || [];
  if (entities.length >= 2) {
      // Use the top 2 entities as a cluster key
      const topEntities = [...entities].sort().slice(0, 2).map(e => e.replace(/[^a-z0-9]/gi, '').toLowerCase());
      return `entities_${topEntities.join('_')}`;
  }

  // Strategy 3: Title similarity (Fuzzy)
  const title = rec.DOCUMENT_TITLE || "Untitled";
  if (title.length < 3) return null;
  
  const year = extractYear(rec.NLP_DERIVED_TIMESTAMP);
  // Use a larger window for years (25 years) to group related historical items
  const era = Math.floor(year / 25) * 25;
  
  const normalized = normalizeTitle(title);
  if (normalized.length < 3) return null;

  return `title_${normalized.substring(0, 10)}_${era}`;
};

export const createBundleFromGroup = (group: DigitalAsset[], preComputedMetadata?: ConsolidatedMetadata): ImageBundle => {
  if (!group || group.length === 0) throw new Error("Empty group passed to bundle creator");

  const resolveAssetImageUrl = (asset: DigitalAsset): string => {
    const original = typeof asset.sqlRecord?.ORIGINAL_IMAGE_URL === 'string'
      ? asset.sqlRecord.ORIGINAL_IMAGE_URL
      : '';
    return asset.imageUrl || original || '';
  };

  const sorted = group.sort((a, b) => 
    (extractYear(a.sqlRecord?.NLP_DERIVED_TIMESTAMP) || 0) - 
    (extractYear(b.sqlRecord?.NLP_DERIVED_TIMESTAMP) || 0)
  );

  const lastItem = sorted[sorted.length - 1];

  const timeRange = {
    earliest: sorted[0].sqlRecord?.OCR_DERIVED_TIMESTAMP || sorted[0].sqlRecord?.NLP_DERIVED_TIMESTAMP || null,
    latest: lastItem?.sqlRecord?.OCR_DERIVED_TIMESTAMP || lastItem?.sqlRecord?.NLP_DERIVED_TIMESTAMP || null
  };

  // Merge graphs intelligently
  const allNodes = new Map<string, any>();
  const allLinks: any[] = [];

  group.forEach(asset => {
    asset.graphData?.nodes.forEach(n => {
      // Use ID as key to dedupe
      if (!allNodes.has(n.id)) {
          allNodes.set(n.id, { ...n });
      } else {
          // Boost relevance if found in multiple docs
          const existing = allNodes.get(n.id);
          existing.relevance = Math.min(1, existing.relevance + 0.1);
      }
    });
    
    // Annotate links with the year of the document they came from
    const year = extractYear(asset.sqlRecord?.NLP_DERIVED_TIMESTAMP);
    allLinks.push(...(asset.graphData?.links || []).map(l => ({
      ...l,
      relationship: `${l.relationship} (${year !== 9999 ? year : 'Unknown'})`,
    })));
  });

  // Create a combined record representing the whole bundle
  const validRecords = group.map(a => a.sqlRecord!).filter(r => !!r);
  if (validRecords.length === 0) throw new Error("No valid SQL records in group");
  
  // Use pre-computed consolidated metadata if available (from deduplication)
  const combinedRecord = preComputedMetadata 
    ? mergeRecordsWithConsolidated(validRecords, preComputedMetadata)
    : mergeRecords(validRecords);

  // Use consolidated title if available, otherwise fall back to first asset
  const title = preComputedMetadata?.title || 
    `${sorted[0].sqlRecord?.DOCUMENT_TITLE?.split(' – ')[0] || 'Untitled Collection'}`;

  return {
    bundleId: `BUNDLE_${sorted[0].id}`,
    title,
    primaryImageUrl: resolveAssetImageUrl(sorted[0]),
    imageUrls: group.map(resolveAssetImageUrl),
    assetIds: group.map(a => a.id),
    timeRange,
    combinedTokens: group.reduce((sum, a) => sum + (a.tokenization?.tokenCount || 0), 0),
    combinedGraph: { nodes: Array.from(allNodes.values()), links: allLinks },
    combinedRecord: combinedRecord,
    status: AssetStatus.MINTED
  };
};

export const createUserBundle = (assets: DigitalAsset[], title: string): ImageBundle => {
  if (!assets || assets.length === 0) throw new Error("Cannot create empty bundle");
  
  const bundle = createBundleFromGroup(assets);
  return {
    ...bundle,
    title: title || bundle.title,
    isUserDefined: true
  };
};

const mergeRecords = (records: HistoricalDocumentMetadata[]): HistoricalDocumentMetadata => {
  if (records.length === 0) throw new Error("Cannot bundle empty records");

  // Use the record with highest confidence as the base
  const best = records.reduce((prev, current) => 
    (prev.CONFIDENCE_SCORE || 0) > (current.CONFIDENCE_SCORE || 0) ? prev : current
  );

  return {
    ...best,
    ASSET_ID: `BUNDLE_${best.ASSET_ID}`,
    DOCUMENT_TITLE: `${best.DOCUMENT_TITLE} (Bundle)`,
    DOCUMENT_DESCRIPTION: `${best.DOCUMENT_DESCRIPTION}\n\n[BUNDLED with ${records.length - 1} other images spanning ${records.length > 2 ? 'multiple periods' : 'similar era'}]`,
    NODE_COUNT: records.reduce((s, r) => s + r.NODE_COUNT, 0),
    FILE_SIZE_BYTES: records.reduce((s, r) => s + r.FILE_SIZE_BYTES, 0),
    SOURCE_COLLECTION: best.SOURCE_COLLECTION + " (Bundled)"
  };
};

/**
 * Merge records using pre-computed consolidated metadata from deduplication
 * This provides better quality metadata by combining insights from all duplicates
 */
const mergeRecordsWithConsolidated = (
  records: HistoricalDocumentMetadata[], 
  consolidated: ConsolidatedMetadata
): HistoricalDocumentMetadata => {
  if (records.length === 0) throw new Error("Cannot bundle empty records");

  // Use the record with highest confidence as the base
  const best = records.reduce((prev, current) => 
    (prev.CONFIDENCE_SCORE || 0) > (current.CONFIDENCE_SCORE || 0) ? prev : current
  );

  // Merge all entities from all records (deduplicated)
  const allEntities = new Set<string>();
  records.forEach(r => {
    (r.ENTITIES_EXTRACTED || []).forEach(e => allEntities.add(e));
  });

  // Merge all keywords from all records (deduplicated)
  const allKeywords = new Set<string>();
  records.forEach(r => {
    (r.KEYWORDS_TAGS || []).forEach(k => allKeywords.add(k.toLowerCase()));
  });

  return {
    ...best,
    ASSET_ID: `BUNDLE_${best.ASSET_ID}`,
    DOCUMENT_TITLE: consolidated.title,
    DOCUMENT_DESCRIPTION: consolidated.description,
    NLP_NODE_CATEGORIZATION: consolidated.category,
    ENTITIES_EXTRACTED: Array.from(allEntities),
    KEYWORDS_TAGS: Array.from(allKeywords),
    NODE_COUNT: records.reduce((s, r) => s + r.NODE_COUNT, 0),
    FILE_SIZE_BYTES: records.reduce((s, r) => s + r.FILE_SIZE_BYTES, 0),
    SOURCE_COLLECTION: best.SOURCE_COLLECTION + " (Consolidated)",
    CONFIDENCE_SCORE: consolidated.confidence,
  };
};