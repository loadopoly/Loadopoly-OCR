import Dexie, { Table } from 'dexie';
import { DigitalAsset } from '../types';

export interface SyncHandle {
  id: number;
  handle: any; // FileSystemDirectoryHandle
}

export interface SyncFile {
  name: string;
  lastModified: number;
}

class GeoGraphDB extends Dexie {
  handles!: Table<SyncHandle, number>;
  files!: Table<SyncFile, string>;
  assets!: Table<DigitalAsset, string>;

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

export const loadAssets = async (): Promise<DigitalAsset[]> => {
    const assets = await db.assets.toArray();
    // Revive ObjectURLs from Blobs
    return assets.map(asset => {
        // If we have the raw blob, always prefer regenerating a fresh ObjectURL
        // unless we have a remote http/https URL which might be the permanent cloud link.
        if (asset.imageBlob) {
            const isRemote = asset.imageUrl && asset.imageUrl.startsWith('http') && !asset.imageUrl.startsWith('http://localhost') && !asset.imageUrl.includes('blob:');
            
            if (!isRemote) {
                return {
                    ...asset,
                    imageUrl: URL.createObjectURL(asset.imageBlob)
                };
            }
        }
        return asset;
    }).sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());
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