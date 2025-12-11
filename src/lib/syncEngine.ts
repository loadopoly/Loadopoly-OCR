import { db } from './indexeddb';

const SYNC_FOLDER_KEY = 'geograph-sync-folder';
const SYNC_ENABLED_KEY = 'geograph-auto-sync';
const SCANNER_URL_KEY = 'geograph-scanner-url';

export async function enableAutoSync() {
  if (!('showDirectoryPicker' in window)) {
    alert('Your browser doesn’t support folder sync (try Chrome Android/Desktop)');
    return false;
  }

  try {
    // @ts-ignore - File System Access API
    const handle = await window.showDirectoryPicker({
      mode: 'read',
      startIn: 'downloads',
    });

    localStorage.setItem(SYNC_FOLDER_KEY, 'active');
    localStorage.setItem(SYNC_ENABLED_KEY, 'true');
    // Store handle in IndexedDB (persists across sessions)
    await db.handles.put({ id: 1, handle });

    startBackgroundSync(handle);
    return true;
  } catch (err: any) {
    if (err.name !== 'AbortError') console.error(err);
    return false;
  }
}

export async function disableAutoSync() {
  localStorage.setItem(SYNC_ENABLED_KEY, 'false');
  await db.files.clear();
}

export async function isSyncEnabled() {
  return localStorage.getItem(SYNC_ENABLED_KEY) === 'true';
}

// Restore sync on app load if enabled
export async function initSync() {
  const enabled = await isSyncEnabled();
  if (enabled) {
    const record = await db.handles.get(1);
    if (record && record.handle) {
      // Verify permission
      const perm = await record.handle.queryPermission({ mode: 'read' });
      if (perm === 'granted') {
        startBackgroundSync(record.handle);
      } else {
        // We might need to ask again, but we can't trigger prompt automatically on load usually
        console.log("Sync permission needed");
      }
    }
  }

  const scannerUrl = localStorage.getItem(SCANNER_URL_KEY);
  if (scannerUrl) {
    pollScanner(scannerUrl);
  }
}

async function startBackgroundSync(handle: any) { // FileSystemDirectoryHandle
  const processEntry = async (entry: any) => { // FileSystemHandle
    if (entry.kind === 'file') {
      const fileHandle = entry;
      const file = await fileHandle.getFile();
      
      if (file.type.startsWith('image/') || file.name.match(/\.(jpe?g|png|heic|tiff?|pdf)$/i)) {
        // Check deduplication via DB
        const existing = await db.files.get(file.name);
        if (!existing || existing.lastModified !== file.lastModified) {
           // Trigger ingestion
           window.dispatchEvent(new CustomEvent('geograph-new-file', { detail: file }));
           // Mark processed
           await db.files.put({ name: file.name, lastModified: file.lastModified });
        }
      }
    } else if (entry.kind === 'directory') {
      // Recursive scan
      for await (const subEntry of entry.values()) {
        await processEntry(subEntry);
      }
    }
  };

  // Watch for changes (Non-standard API, supported in some Chrome versions)
  // @ts-ignore
  if (handle.watch) {
      // @ts-ignore
      handle.watch((event: any) => {
        if (event.type === 'changed' || event.type === 'created') {
          processEntry(event.handle || event.entry);
        }
      });
  }

  // Initial scan
  try {
      for await (const entry of handle.values()) {
        await processEntry(entry);
      }
  } catch (e) {
      console.error("Sync scan error", e);
  }
}

// Scanner direct connect
export async function setScannerUrl(url: string) {
  localStorage.setItem(SCANNER_URL_KEY, url);
  pollScanner(url);
}

let pollInterval: any;

function pollScanner(url: string) {
  if (pollInterval) clearInterval(pollInterval);
  
  pollInterval = setInterval(async () => {
    try {
      const res = await fetch(`${url}/list`);
      if (!res.ok) return;
      const files = await res.json();
      for (const fileMeta of files) {
        // Simple dedupe by name check in DB
        const existing = await db.files.get(fileMeta.name);
        if (!existing) {
            const blob = await fetch(`${url}/file/${fileMeta.name}`).then(r => r.blob());
            const f = new File([blob], fileMeta.name, { type: blob.type });
            window.dispatchEvent(new CustomEvent('geograph-new-file', { detail: f }));
            await db.files.put({ name: fileMeta.name, lastModified: Date.now() });
        }
      }
    } catch (e) { /* scanner offline */ }
  }, 10000); // every 10s
}