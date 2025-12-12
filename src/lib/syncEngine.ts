import { db } from './indexeddb';

const SYNC_ENABLED_KEY = 'geograph-auto-sync';
const SCANNER_URL_KEY = 'geograph-scanner-url';

export async function enableAutoSync() {
  // @ts-ignore
  if (!('showDirectoryPicker' in window)) {
    alert('Your browser does not support the File System Access API (Try Chrome/Edge on Desktop).');
    return false;
  }

  try {
    // @ts-ignore - File System Access API
    const handle = await window.showDirectoryPicker({
      mode: 'read',
      startIn: 'downloads',
    });

    localStorage.setItem(SYNC_ENABLED_KEY, 'true');
    // Store handle in IndexedDB (persists across sessions)
    await db.handles.put({ id: 1, handle });

    // Start scanning immediately
    startBackgroundSync(handle);
    return true;
  } catch (err: any) {
    if (err.name !== 'AbortError') console.error(err);
    return false;
  }
}

export async function disableAutoSync() {
  localStorage.setItem(SYNC_ENABLED_KEY, 'false');
}

export async function isSyncEnabled() {
  return localStorage.getItem(SYNC_ENABLED_KEY) === 'true';
}

async function startBackgroundSync(handle: any) {
  const processEntry = async (entry: any) => {
    if (entry.kind === 'file') {
      const file = await entry.getFile();
      // Simple filter for images
      if (file.type.startsWith('image/') || file.name.match(/\.(jpe?g|png|heic|tiff?|webp)$/i)) {
        // Trigger ingestion via global event caught by App.tsx
        window.dispatchEvent(new CustomEvent('geograph-new-file', { detail: file }));
      }
    } else if (entry.kind === 'directory') {
      // Recursive scan
      for await (const subEntry of entry.values()) {
        await processEntry(subEntry);
      }
    }
  };

  // Perform a scan
  try {
      for await (const entry of handle.values()) {
        await processEntry(entry);
      }
      console.log('Folder scan complete.');
  } catch (e) {
      console.error("Error reading directory:", e);
  }
}

export async function setScannerUrl(url: string) {
  localStorage.setItem(SCANNER_URL_KEY, url);
  pollScanner(url);
}

function pollScanner(url: string) {
  // Simple polling mechanism for network scanners
  if (!url) return;
  
  setInterval(async () => {
    try {
      const res = await fetch(`${url}/list`);
      if (!res.ok) return;
      const files = await res.json();
      for (const fileMetadata of files) {
        const blob = await fetch(`${url}/file/${fileMetadata.name}`).then(r => r.blob());
        const f = new File([blob], fileMetadata.name, { type: blob.type });
        window.dispatchEvent(new CustomEvent('geograph-new-file', { detail: f }));
      }
    } catch (e) { 
        // Silent fail for polling 
    }
  }, 10000); // Poll every 10s
}

export const initSync = async () => {
    const enabled = await isSyncEnabled();
    const storedUrl = localStorage.getItem(SCANNER_URL_KEY);

    if (storedUrl) {
        pollScanner(storedUrl);
    }

    if (enabled) {
        try {
            const record = await db.handles.get(1);
            if (record && record.handle) {
                 // Check/Request permissions on reload
                 // @ts-ignore
                 const opts = { mode: 'read' };
                 // @ts-ignore
                 if ((await record.handle.queryPermission(opts)) === 'granted') {
                     startBackgroundSync(record.handle);
                 } else {
                     // If permission is lost on reload, we might need to ask again or disable
                     console.log("Sync permission needed.");
                 }
            }
        } catch (e) {
            console.error("Failed to init local sync", e);
        }
    }
};