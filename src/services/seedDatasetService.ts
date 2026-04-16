/**
 * Seed Dataset Service
 *
 * Manages the lifecycle of seed datasets — curated, frozen snapshots of
 * shareable documents that are delivered to new users during onboarding
 * so they immediately experience the app's integrative features.
 *
 * Public API:
 *  - createSeedFromWindow  — snapshot shareable documents + graph from a window
 *  - getActiveSeed         — fetch the current active onboarding seed
 *  - hydrateSeed           — load seed data into local IndexedDB (Dexie)
 *  - isSeedData            — true if a document ID was loaded from a seed
 *  - recordAdoption        — record that this user has adopted a seed
 *  - deactivateSeed        — deactivate a seed (used before activating another)
 *
 * @module seedDatasetService
 */

import { supabase } from '../lib/supabaseClient';
import { logger } from '../lib/logger';
import {
  db,
  saveAssets,
  markAssetsAsSeed,
  isSeedAsset,
} from '../lib/indexeddb';
import type { SeedDataset, SeedFeatureHighlight, GraphData, DigitalAsset } from '../types';
import type { SeedDatasetInsert } from '../lib/database.types';
import { getShareableDocumentsForPeriod } from './sharingWindowService';

// ============================================================
// Internal helpers
// ============================================================

function rowToSeedDataset(row: Record<string, unknown>): SeedDataset {
  return {
    id:               row.id as string,
    creatorId:        row.creator_id as string,
    title:            row.title as string,
    description:      (row.description as string) ?? undefined,
    sharingWindowId:  (row.sharing_window_id as string) ?? undefined,
    documentIds:      (row.document_ids as string[]) ?? [],
    graphSnapshot:    (row.graph_snapshot as GraphData | null) ?? undefined,
    clusterSnapshot:  (row.cluster_snapshot as Record<string, unknown> | null) ?? undefined,
    gisBounds:        (row.gis_bounds as SeedDataset['gisBounds']) ?? undefined,
    isActive:         row.is_active as boolean,
    featureHighlights:(row.feature_highlights as SeedFeatureHighlight[]) ?? [],
    adoptionCount:    (row.adoption_count as number) ?? 0,
    createdAt:        row.created_at as string,
  };
}

// ============================================================
// Create a seed dataset from a sharing window
// ============================================================

/**
 * Creates a seed dataset snapshot from a sharing window.
 *
 * Steps:
 *  1. Load the sharing window to determine date bounds and label.
 *  2. Fetch all document IDs within that window for the current user.
 *  3. Load the graph nodes/edges for those documents from Supabase.
 *  4. Derive GIS bounds from document lat/lng values.
 *  5. Determine feature highlights from available data.
 *  6. Persist the seed_dataset row.
 *
 * @param windowId - UUID of the data_sharing_windows row
 * @returns The created SeedDataset or null on failure
 */
export async function createSeedFromWindow(windowId: string): Promise<SeedDataset | null> {
  if (!supabase) {
    logger.error('[SeedDataset] Supabase client is not configured', { module: 'seedDataset' });
    return null;
  }

  try {
    // 1. Load the sharing window
    const { data: windowRow, error: wErr } = await supabase
      .from('data_sharing_windows')
      .select('*')
      .eq('id', windowId)
      .single();

    if (wErr || !windowRow) {
      logger.error(`[SeedDataset] Window not found: ${wErr?.message}`, { module: 'seedDataset' });
      return null;
    }

    const win = windowRow as Record<string, unknown>;
    const ownerId  = win['user_id'] as string;
    const startDate = (win['start_date'] as string) ?? new Date(0).toISOString();
    const endDate   = (win['end_date']   as string) ?? new Date().toISOString();
    const windowLabel = win['label'] as string;

    // 2. Get shareable document IDs for this window's period
    const documentIds = await getShareableDocumentsForPeriod(ownerId, startDate, endDate);

    if (!documentIds.length) {
      logger.warn('[SeedDataset] No shareable documents found for window', { module: 'seedDataset' });
      return null;
    }

    // 3. Load graph nodes & edges for these documents
    const [nodesResult, edgesResult] = await Promise.all([
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (supabase as any)
        .from('graph_nodes')
        .select('id, LABEL, NODE_TYPE, PHYSICAL_HEIGHT_M, PHYSICAL_WIDTH_M, IS_REFERENCE_OBJECT, CANONICAL_ID')
        .in('CANONICAL_ID', documentIds)
        .limit(500),
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (supabase as any)
        .from('graph_edges')
        .select('source_id, target_id, relationship')
        .limit(1000),
    ]);

    const graphSnapshot: GraphData = {
      nodes: (nodesResult.data ?? []).map((n: any) => ({
        id:                  n.id,
        label:               n.LABEL ?? '',
        type:                (n.NODE_TYPE ?? 'CONCEPT') as GraphData['nodes'][number]['type'],
        relevance:           1,
        PHYSICAL_HEIGHT_M:   n.PHYSICAL_HEIGHT_M,
        IS_REFERENCE_OBJECT: n.IS_REFERENCE_OBJECT,
        CANONICAL_ID:        n.CANONICAL_ID,
        LABEL:               n.LABEL,
      })),
      links: (edgesResult.data ?? []).map((e: any) => ({
        source:       e.source_id,
        target:       e.target_id,
        relationship: e.relationship ?? '',
      })),
    };

    // 4. Load document lat/lng to compute GIS bounds
    const { data: geoRows } = await supabase
      .from('historical_documents_global')
      .select('ID')
      .in('ID', documentIds)
      .limit(1);

    // GIS bounds are not available from historical_documents_global (no lat/lng columns)
    const gisRows = geoRows as unknown as Array<{ LATITUDE: number; LONGITUDE: number }>;

    const gisBounds = gisRows.length > 0 ? {
      minLat: Math.min(...gisRows.map(r => r.LATITUDE)),
      maxLat: Math.max(...gisRows.map(r => r.LATITUDE)),
      minLng: Math.min(...gisRows.map(r => r.LONGITUDE)),
      maxLng: Math.max(...gisRows.map(r => r.LONGITUDE)),
    } : undefined;

    // 5. Determine feature highlights
    const featureHighlights: SeedFeatureHighlight[] = ['ocr'];
    if (graphSnapshot.nodes.length > 0) featureHighlights.push('graph');
    if (gisBounds)                       featureHighlights.push('gis');
    // GARD and metaverse are always present in the platform
    featureHighlights.push('gard', 'metaverse');

    // 6. Persist the seed dataset
    const insert: SeedDatasetInsert = {
      creator_id:        ownerId,
      title:             `Seed: ${windowLabel}`,
      description:       `Auto-generated from sharing window "${windowLabel}" (${documentIds.length} documents).`,
      sharing_window_id: windowId,
      document_ids:      documentIds,
      graph_snapshot:    graphSnapshot as any,
      gis_bounds:        gisBounds as any ?? null,
      is_active:         false,
      feature_highlights: featureHighlights,
    };

    const { data: seedRow, error: sErr } = await supabase
      .from('seed_datasets')
      .insert(insert)
      .select()
      .single();

    if (sErr || !seedRow) {
      logger.error(`[SeedDataset] Failed to insert seed dataset: ${sErr?.message}`, { module: 'seedDataset' });
      return null;
    }

    return rowToSeedDataset(seedRow as Record<string, unknown>);
  } catch (err: any) {
    logger.error(`[SeedDataset] Unexpected error: ${err?.message}`, { module: 'seedDataset' });
    return null;
  }
}

// ============================================================
// Fetch the active onboarding seed
// ============================================================

/**
 * Returns the currently active seed dataset (is_active = true).
 * Returns null if none exists or if the request fails.
 */
export async function getActiveSeed(): Promise<SeedDataset | null> {
  if (!supabase) return null;

  const { data, error } = await supabase
    .from('seed_datasets')
    .select('*')
    .eq('is_active', true)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error) {
    logger.warn(`[SeedDataset] Failed to fetch active seed: ${error.message}`, { module: 'seedDataset' });
    return null;
  }

  return data ? rowToSeedDataset(data as Record<string, unknown>) : null;
}

// ============================================================
// Hydrate seed into local IndexedDB (Dexie)
// ============================================================

/**
 * Loads seed dataset document snapshots into local IndexedDB so new users
 * can experience the app's features immediately, even offline.
 *
 * Documents are inserted as read-only demo assets tagged with the seed ID.
 * The Dexie `seedAssetMeta` table tracks which assets came from a seed.
 *
 * @param seedId - UUID of the seed dataset to hydrate
 * @returns Number of assets loaded
 */
export async function hydrateSeed(seedId: string): Promise<number> {
  if (!supabase) return 0;

  try {
    // Check if already hydrated (avoid duplicating demo data)
    const existing = await db.seedAssetMeta.where('seedId').equals(seedId).count();
    if (existing > 0) {
      logger.info('[SeedDataset] Seed already hydrated, skipping', { module: 'seedDataset' });
      return existing;
    }

    // Fetch seed
    const { data: seedRow, error } = await supabase
      .from('seed_datasets')
      .select('*')
      .eq('id', seedId)
      .single();

    if (error || !seedRow) {
      logger.warn(`[SeedDataset] Could not load seed ${seedId}: ${error?.message}`, { module: 'seedDataset' });
      return 0;
    }

    const seed = rowToSeedDataset(seedRow as Record<string, unknown>);
    if (!seed.documentIds.length) return 0;

    // Fetch document rows
    const { data: docRows, error: dErr } = await supabase
      .from('historical_documents_global')
      .select('*')
      .in('"ID"', seed.documentIds)
      .limit(200);

    if (dErr || !docRows?.length) return 0;

    // Convert document rows to DigitalAsset shape for local storage
    const now = Date.now();
    const demoAssets: DigitalAsset[] = (docRows as Array<Record<string, unknown>>).map((row) => ({
      id:        row['ID'] as string,
      imageUrl:  (row['ASSET_STORAGE_PATH'] as string) ?? '',
      ocrText:   (row['RAW_OCR_TRANSCRIPTION'] as string) ?? '',
      status:    'MINTED' as const,
      progress:  100,
      timestamp: (row['INGEST_DATE'] as string) ?? new Date(now).toISOString(),
      location:  {
        latitude:  (row['LATITUDE'] as number) ?? 0,
        longitude: (row['LONGITUDE'] as number) ?? 0,
        accuracy:  0,
      },
      gisMetadata: {
        zoneType:            (row['LOCAL_GIS_ZONE'] as string) ?? '',
        estimatedElevation:  '',
        nearbyLandmarks:     [],
        environmentalContext:'',
        coordinateSystem:    'WGS84',
      },
      graphData: seed.graphSnapshot ?? { nodes: [], links: [] },
      // Mark as seed/demo so the UI can show a badge and block edits
      isSeedData: true,
    } as DigitalAsset & { isSeedData: boolean }));

    await saveAssets(demoAssets);
    await markAssetsAsSeed(demoAssets.map(a => a.id), seedId);

    // Record the adoption in Supabase
    await recordAdoption(seedId);

    logger.info(`[SeedDataset] Hydrated ${demoAssets.length} seed assets from seed ${seedId}`, {
      module: 'seedDataset',
    });

    return demoAssets.length;
  } catch (err: any) {
    logger.error(`[SeedDataset] hydrateSeed failed: ${err?.message}`, { module: 'seedDataset' });
    return 0;
  }
}

// ============================================================
// Adoption tracking
// ============================================================

/**
 * Records that the current user has adopted the given seed dataset.
 * Idempotent — duplicate adoption rows are silently ignored via UNIQUE constraint.
 */
export async function recordAdoption(seedId: string): Promise<void> {
  if (!supabase) return;

  const { error } = await supabase
    .from('seed_adoptions')
    .insert({ seed_id: seedId })
    .select()
    .maybeSingle();

  if (error && !error.message.includes('duplicate')) {
    logger.warn(`[SeedDataset] recordAdoption failed: ${error.message}`, { module: 'seedDataset' });
  }
}

// ============================================================
// Convenience helpers
// ============================================================

/**
 * Returns true if the given asset ID was loaded from a seed dataset
 * (i.e. it is read-only demo data that the user should not edit).
 */
export async function isSeedData(assetId: string): Promise<boolean> {
  return isSeedAsset(assetId);
}

/**
 * Deactivate a seed dataset so it is no longer delivered to new users.
 * Used before activating a different seed.
 */
export async function deactivateSeed(seedId: string): Promise<boolean> {
  if (!supabase) return false;

  const { error } = await supabase
    .from('seed_datasets')
    .update({ is_active: false })
    .eq('id', seedId);

  if (error) {
    logger.error(`[SeedDataset] deactivateSeed failed: ${error.message}`, { module: 'seedDataset' });
    return false;
  }
  return true;
}

/**
 * Activate a seed dataset as the current onboarding seed.
 * Deactivates all other seeds first to enforce the single-active invariant.
 */
export async function activateSeed(seedId: string): Promise<boolean> {
  if (!supabase) return false;

  // Deactivate all currently active seeds
  await supabase
    .from('seed_datasets')
    .update({ is_active: false })
    .eq('is_active', true);

  const { error } = await supabase
    .from('seed_datasets')
    .update({ is_active: true })
    .eq('id', seedId);

  if (error) {
    logger.error(`[SeedDataset] activateSeed failed: ${error.message}`, { module: 'seedDataset' });
    return false;
  }
  return true;
}
