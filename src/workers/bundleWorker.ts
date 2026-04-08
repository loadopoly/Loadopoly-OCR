/**
 * Bundle Worker — Off-main-thread duplicate detection & bundle assembly
 *
 * Runs the O(n²) deduplication (findDuplicateClustersV2) plus traditional
 * bundling in a Web Worker so the main thread stays responsive.
 * For ~387 assets this performs ~75K similarity calculations
 * (Levenshtein, n-gram, shingle, phonetic) — 10-50s on mobile.
 *
 * IMPORTANT: This worker must NOT import from '../types' (which pulls in
 * lucide-react → React → crashes in Worker context). All types are defined
 * locally as plain interfaces matching the shapes we receive via postMessage.
 *
 * Protocol:
 *   Main→Worker  { gen, assets: MinBundleAsset[] }
 *   Worker→Main  { gen, groups: BundleGroupAssignment[], singleIds: string[] }
 */

// Minimal asset shape — only the fields dedup + bundling actually access.
// These are plain objects received via structured clone (no class instances).
interface MinBundleAsset {
  id: string;
  ocrText?: string;
  location?: { latitude: number; longitude: number };
  status: string;
  sqlRecord: {
    DOCUMENT_TITLE?: string;
    DOCUMENT_DESCRIPTION?: string;
    ENTITIES_EXTRACTED?: string[];
    KEYWORDS_TAGS?: string[];
    SOURCE_COLLECTION?: string;
    NLP_DERIVED_GIS_ZONE?: string;
    LOCAL_GIS_ZONE?: string;
    NLP_DERIVED_TIMESTAMP?: string;
    CONFIDENCE_SCORE?: number;
    USER_BUNDLE_ID?: string;
  } | null;
  graphData?: { nodes: { id: string }[] };
}

/** What the main thread sends us */
interface BundleWorkerRequest {
  gen: number;
  assets: MinBundleAsset[];
}

/**
 * A lightweight bundle assignment — only IDs and metadata, no heavy objects.
 * The main thread reconstructs full ImageBundle objects from these.
 */
interface BundleGroupAssignment {
  bundleId: string;
  /** Ordered asset IDs in this bundle (first = primary) */
  assetIds: string[];
  isUserDefined: boolean;
  /** Source of grouping */
  source: 'dedup' | 'traditional' | 'user';
}

interface BundleWorkerResult {
  gen: number;
  /** Bundle groups — each contains the asset IDs that belong together */
  groups: BundleGroupAssignment[];
  /** Asset IDs that didn't match any bundle (singles) */
  singleIds: string[];
}

// ---------- Bundling logic (mirrors bundleService.ts but returns IDs only) ----------

// ---------- Bundling logic (mirrors bundleService.ts but returns IDs only) ----------

function extractYear(ts: string | null | undefined): number {
  if (!ts) return 9999;
  const match = ts.match(/\d{4}/);
  return match ? parseInt(match[0]) : 9999;
}

function normalizeTitle(t: string): string {
  return t.replace(/[^a-z]/gi, '').slice(0, 20).toLowerCase();
}

function generateBundleKey(asset: MinBundleAsset, allAssets: MinBundleAsset[]): string | null {
  const rec = asset.sqlRecord;
  if (!rec) return null;

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

  const entities = rec.ENTITIES_EXTRACTED || [];
  if (entities.length >= 2) {
    const topEntities = [...entities].sort().slice(0, 2).map(e => e.replace(/[^a-z0-9]/gi, '').toLowerCase());
    return `entities_${topEntities.join('_')}`;
  }

  const title = rec.DOCUMENT_TITLE || 'Untitled';
  if (title.length < 3) return null;
  const year = extractYear(rec.NLP_DERIVED_TIMESTAMP);
  const era = Math.floor(year / 25) * 25;
  const normalized = normalizeTitle(title);
  if (normalized.length < 3) return null;
  return `title_${normalized.substring(0, 10)}_${era}`;
}

self.onmessage = async (e: MessageEvent<BundleWorkerRequest>) => {
  const { gen, assets } = e.data;

  // Dynamic import avoids pulling ../types → lucide-react → React into the worker.
  // deduplicationServiceV2 is self-contained once we pass plain objects.
  const { findDuplicateClustersV2, DEFAULT_CONFIG } = await import('../services/deduplicationServiceV2');
  const BUNDLE_DEDUP_CONFIG = { ...DEFAULT_CONFIG, threshold: 0.40 };

  const groups: BundleGroupAssignment[] = [];
  const singleIds: string[] = [];

  // Split: auto-bundle vs user-defined
  const autoBundleAssets = assets.filter(a => !a.sqlRecord?.USER_BUNDLE_ID);
  const userBundledAssets = assets.filter(a => !!a.sqlRecord?.USER_BUNDLE_ID);

  // PHASE 1: Enhanced semantic deduplication (the O(n²) heavy operation)
  const dedupResult = findDuplicateClustersV2(
    autoBundleAssets as any[],
    BUNDLE_DEDUP_CONFIG,
  );

  // Collect dedup cluster assignments
  dedupResult.clusters.forEach(cluster => {
    const ids = [cluster.primaryAsset.id, ...cluster.duplicates.map(d => d.id)];
    groups.push({
      bundleId: `DEDUP_${cluster.primaryAsset.id}`,
      assetIds: ids,
      isUserDefined: false,
      source: 'dedup',
    });
  });

  // PHASE 2: Traditional bundling for unique assets
  const traditionalBuckets: Record<string, string[]> = {};
  dedupResult.uniqueAssets.forEach((asset: any) => {
    const ma = asset as MinBundleAsset;
    const key = generateBundleKey(ma, dedupResult.uniqueAssets as unknown as MinBundleAsset[]);
    if (key && ma.sqlRecord?.CONFIDENCE_SCORE && ma.sqlRecord.CONFIDENCE_SCORE > 0.6) {
      if (!traditionalBuckets[key]) traditionalBuckets[key] = [];
      traditionalBuckets[key].push(ma.id);
    } else {
      singleIds.push(ma.id);
    }
  });

  Object.entries(traditionalBuckets).forEach(([, ids]) => {
    if (ids.length > 1) {
      groups.push({
        bundleId: `TRAD_${ids[0]}`,
        assetIds: ids,
        isUserDefined: false,
        source: 'traditional',
      });
    } else {
      singleIds.push(...ids);
    }
  });

  // PHASE 3: User-defined bundles
  const userBuckets: Record<string, string[]> = {};
  userBundledAssets.forEach(a => {
    const bid = a.sqlRecord!.USER_BUNDLE_ID!;
    if (!userBuckets[bid]) userBuckets[bid] = [];
    userBuckets[bid].push(a.id);
  });

  Object.entries(userBuckets).forEach(([bid, ids]) => {
    groups.push({
      bundleId: bid,
      assetIds: ids,
      isUserDefined: true,
      source: 'user',
    });
  });

  const result: BundleWorkerResult = { gen, groups, singleIds };
  self.postMessage(result);
};
