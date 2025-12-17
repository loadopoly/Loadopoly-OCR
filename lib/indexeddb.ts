import Dexie, { Table } from 'dexie';
import { DigitalAsset } from '../types';

export interface SyncHandle {
  id: number;
  handle: any; 
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
    
    (this as any).version(2).stores({
      handles: 'id',
      files: 'name,lastModified',
      assets: 'id, timestamp, status'
    });
  }
}

export const db = new GeoGraphDB();

export const saveAsset = async (asset: DigitalAsset) => {
    if (asset.imageUrl.startsWith('blob:') && !asset.imageBlob) {
        console.warn("Saving asset without imageBlob - persistence may fail for image.");
    }
    await db.assets.put(asset);
};

export const loadAssets = async (): Promise<DigitalAsset[]> => {
    const assets = await db.assets.toArray();
    return assets.map(asset => {
        if (asset.imageBlob && (!asset.imageUrl || !asset.imageUrl.startsWith('blob:'))) {
            return {
                ...asset,
                imageUrl: URL.createObjectURL(asset.imageBlob)
            };
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