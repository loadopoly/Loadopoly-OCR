import Dexie, { Table } from 'dexie';

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

  constructor() {
    super('GeoGraphSync');
  }
}

export const db = new GeoGraphDB();

// Define schema outside constructor to avoid TypeScript context issues
db.version(1).stores({
  handles: 'id',
  files: 'name,lastModified'
});