import Dexie, { Table } from 'dexie';
import { DigitalAsset, SeedAssetMeta } from '../types';

export interface SyncHandle {
  id: number;
  handle: any; // FileSystemDirectoryHandle
}

export interface SyncFile {
  name: string;
  lastModified: number;
}

export interface BatchFileEntry {
  id: string;        // Matches BatchItemState.id
  blob: Blob;
  fileName: string;
  fileType: string;
  fileSize: number;
  createdAt: number;
}

export interface ArQueueEntry {
  id: string;
  blob: Blob;
  fileName: string;
  fileType: string;
  fileSize: number;
  createdAt: number;
}

class GeoGraphDB extends Dexie {
  handles!: Table<SyncHandle, number>;
  files!: Table<SyncFile, string>;
  assets!: Table<DigitalAsset, string>;
  batchFiles!: Table<BatchFileEntry, string>;
  arQueue!: Table<ArQueueEntry, string>;
  /**
   * Lightweight metadata for assets that came from a seed dataset.
   * Keyed by assetId, indexed by seedId so we can quickly find all
   * demo assets or clear them when the user dismisses the tour.
   */
  seedAssetMeta!: Table<SeedAssetMeta, string>;

  constructor() {
    super('GeoGraphSync');
    
    (this as any).version(1).stores({
      handles: 'id',
      files: 'name,lastModified'
    });
    
    // Add assets table in version 2
    (this as any).version(2).stores({
      handles: 'id',
      files: 'name,lastModified',
      assets: 'id, timestamp, status' // Index useful fields
    });

    // Add batchFiles + arQueue tables in version 3
    (this as any).version(3).stores({
      handles: 'id',
      files: 'name,lastModified',
      assets: 'id, timestamp, status',
      batchFiles: 'id, createdAt',
      arQueue: 'id, createdAt',
    });

    // Add seedAssetMeta table in version 4
    (this as any).version(4).stores({
      handles: 'id',
      files: 'name,lastModified',
      assets: 'id, timestamp, status',
      batchFiles: 'id, createdAt',
      arQueue: 'id, createdAt',
      seedAssetMeta: 'assetId, seedId, loadedAt',
    });
  }
}

export const db = new GeoGraphDB();

// Helper functions for Asset Persistence
export const saveAsset = async (asset: DigitalAsset) => {
    // Clone to avoid mutating the original object's references if needed
    // Ensure imageBlob is present if imageUrl is a blob URL
    if (asset.imageUrl.startsWith('blob:') && !asset.imageBlob) {
        // Warning: We can't easily fetch blob from blob URL here if it's not passed. 
        // Logic in App.tsx should ensure imageBlob is attached before calling save.
        console.warn("Saving asset without imageBlob - persistence may fail for image.");
    }
    await db.assets.put(asset);
};

/** Bulk-write multiple assets in a single IndexedDB transaction */
export const saveAssets = async (assets: DigitalAsset[]) => {
    await db.assets.bulkPut(assets);
};

export const loadAssets = async (): Promise<DigitalAsset[]> => {
    const assets = await db.assets.toArray();
    // Revive ObjectURLs from Blobs
    return assets.map(asset => {
        // If we have the raw blob, always regenerate a fresh ObjectURL.
        // The blob is the reliable local source of truth — remote URLs can
        // fail due to CORS / auth / storage-bucket mismatches.
        if (asset.imageBlob) {
            return {
                ...asset,
                imageUrl: URL.createObjectURL(asset.imageBlob)
            };
        }
        // #14: If imageUrl is a blob: URL but we have no backing blob (e.g. after
        // a page reload for server-processed assets whose blob was GC'd), the URL
        // is dead. Clear it so the UI shows a placeholder rather than a broken icon.
        if (!asset.imageBlob && asset.imageUrl?.startsWith('blob:')) {
            return { ...asset, imageUrl: '' };
        }
        return asset;
    }).sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());
};

/**
 * Lightweight pending-asset counter used by the QueueMonitor.
 *
 * PERF: `loadAssets()` is expensive — it materializes every Blob into a fresh
 * `URL.createObjectURL(...)` and sorts the full array. QueueMonitor only needs
 * the count of pending/processing assets split by whether they already have a
 * server jobId. On every tab switch that remounts QueueMonitor (Dashboard,
 * Assets, Batch, Database, Processing) the old code paid the full `loadAssets`
 * cost just to compute three integers. This helper uses the `status` index and
 * skips blob materialization entirely.
 */
export const countPendingLocalAssets = async (): Promise<{
    pending: number;
    needsUpload: number;
    onServer: number;
}> => {
    // The `status` column is indexed (see Dexie schema above) so this is
    // an indexed range scan rather than a full table scan.
    const pendingRows = await db.assets
        .where('status')
        .anyOf(['PENDING', 'PROCESSING'])
        .toArray();

    let needsUpload = 0;
    let onServer = 0;
    for (const asset of pendingRows) {
        if (asset.serverJobId) onServer++;
        else needsUpload++;
    }
    return {
        pending: pendingRows.length,
        needsUpload,
        onServer,
    };
};

export const deleteAsset = async (id: string) => {
    await db.assets.delete(id);
};

export const clearAllAssets = async () => {
    await db.assets.clear();
};

/**
 * Clear assets stuck in PROCESSING or PENDING status.
 * Optionally provide specific asset IDs to clear, or clear all stuck.
 * @param assetIds - Optional specific IDs to clear. If empty, clears all stuck.
 * @returns Number of assets cleared
 */
export const clearStuckAssets = async (assetIds?: string[]): Promise<number> => {
    const allAssets = await db.assets.toArray();
    const stuckAssets = allAssets.filter(a => {
        const isStuck = a.status === 'PROCESSING' || a.status === 'PENDING';
        if (assetIds && assetIds.length > 0) {
            return isStuck && assetIds.includes(a.id);
        }
        return isStuck;
    });
    
    for (const asset of stuckAssets) {
        await db.assets.delete(asset.id);
    }
    
    return stuckAssets.length;
};

/**
 * Reset stuck assets back to PENDING status so they can be reprocessed.
 * @param assetIds - Optional specific IDs to reset. If empty, resets all stuck.
 * @returns Number of assets reset
 */
export const resetStuckAssets = async (assetIds?: string[]): Promise<number> => {
    const allAssets = await db.assets.toArray();
    const stuckAssets = allAssets.filter(a => {
        const isStuck = a.status === 'PROCESSING';
        if (assetIds && assetIds.length > 0) {
            return isStuck && assetIds.includes(a.id);
        }
        return isStuck;
    });
    
    for (const asset of stuckAssets) {
        await db.assets.put({
            ...asset,
            status: 'PENDING' as any,
            progress: 0,
            errorMessage: undefined,
        });
    }
    
    return stuckAssets.length;
};

// ============================================
// Batch File Persistence (survives page refresh)
// ============================================

export const saveBatchFile = async (id: string, file: File): Promise<void> => {
    await db.batchFiles.put({
        id,
        blob: file,
        fileName: file.name,
        fileType: file.type,
        fileSize: file.size,
        createdAt: Date.now(),
    });
};

export const loadBatchFile = async (id: string): Promise<File | null> => {
    const entry = await db.batchFiles.get(id);
    if (!entry) return null;
    return new File([entry.blob], entry.fileName, { type: entry.fileType });
};

export const deleteBatchFile = async (id: string): Promise<void> => {
    await db.batchFiles.delete(id);
};

export const deleteBatchFiles = async (ids: string[]): Promise<void> => {
    await db.batchFiles.bulkDelete(ids);
};

export const clearAllBatchFiles = async (): Promise<void> => {
    await db.batchFiles.clear();
};

// ============================================
// AR Session Queue Persistence
// ============================================

export const saveArQueueItem = async (file: File): Promise<string> => {
    const id = crypto.randomUUID?.() || `ar-${Date.now()}-${Math.random().toString(36).slice(2)}`;
    await db.arQueue.put({
        id,
        blob: file,
        fileName: file.name,
        fileType: file.type,
        fileSize: file.size,
        createdAt: Date.now(),
    });
    return id;
};

export const loadArQueue = async (): Promise<File[]> => {
    const entries = await db.arQueue.orderBy('createdAt').toArray();
    return entries.map(e => new File([e.blob], e.fileName, { type: e.fileType }));
};

export const clearArQueue = async (): Promise<void> => {
    await db.arQueue.clear();
};

export const getArQueueCount = async (): Promise<number> => {
    return await db.arQueue.count();
};

// ============================================
// Seed Asset Metadata
// ============================================

/** Record that a set of assets was loaded from a given seed dataset. */
export const markAssetsAsSeed = async (
    assetIds: string[],
    seedId: string,
): Promise<void> => {
    const now = Date.now();
    const records: SeedAssetMeta[] = assetIds.map(assetId => ({
        assetId,
        seedId,
        isReadOnly: true,
        loadedAt: now,
    }));
    await db.seedAssetMeta.bulkPut(records);
};

/** Returns true if the given asset was loaded from a seed (read-only demo data). */
export const isSeedAsset = async (assetId: string): Promise<boolean> => {
    const meta = await db.seedAssetMeta.get(assetId);
    return meta?.isReadOnly === true;
};

/** Get all asset IDs that came from a specific seed dataset. */
export const getSeedAssetIds = async (seedId: string): Promise<string[]> => {
    const records = await db.seedAssetMeta.where('seedId').equals(seedId).toArray();
    return records.map(r => r.assetId);
};

/** Remove all seed asset metadata (e.g. when the user dismisses the onboarding tour). */
export const clearSeedAssetMeta = async (): Promise<void> => {
    await db.seedAssetMeta.clear();
};
