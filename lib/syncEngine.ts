import { db } from './indexeddb';

const SYNC_ENABLED_KEY = 'geograph-auto-sync';
const SCANNER_URL_KEY = 'geograph-scanner-url';

export async function enableAutoSync() {
  if (!('showDirectoryPicker' in window)) {
    alert('Your browser doesn’t support folder sync (try Chrome Android/Desktop)');
    return false;
  }

  try {
    const handle = await (window as any).showDirectoryPicker({
      mode: 'read',
      startIn: 'downloads',
    });

    localStorage.setItem(SYNC_ENABLED_KEY, 'true');
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
}

export async function isSyncEnabled() {
  return localStorage.getItem(SYNC_ENABLED_KEY) === 'true';
}

async function startBackgroundSync(handle: any) {
  const processEntry = async (entry: any) => {
    if (entry.kind === 'file') {
      const file = await entry.getFile();
      if (file.type.startsWith('image/') || file.name.match(/\.(jpe?g|png|heic|tiff?)$/i)) {
        window.dispatchEvent(new CustomEvent('geograph-new-file', { detail: file }));
      }
    } else if (entry.kind === 'directory') {
      for await (const subEntry of entry.values()) {
        await processEntry(subEntry);
      }
    }
  };

  try {
      for await (const entry of handle.values()) {
        await processEntry(entry);
      }
  } catch (e) {
      console.error("Error reading directory:", e);
  }
}

export async function setScannerUrl(url: string) {
  localStorage.setItem(SCANNER_URL_KEY, url);
  pollScanner(url);
}

function pollScanner(url: string) {
  setInterval(async () => {
    try {
      const res = await fetch(`${url}/list`);
      const files = await res.json();
      for (const file of files) {
        const blob = await fetch(`${url}/file/${file.name}`).then(r => r.blob());
        const f = new File([blob], file.name, { type: blob.type });
        window.dispatchEvent(new CustomEvent('geograph-new-file', { detail: f }));
      }
    } catch (e) { }
  }, 10000);
}

export const initSync = async () => {
    const enabled = await isSyncEnabled();
    if (enabled) {
        try {
            const record = await db.handles.get(1);
            if (record && record.handle) {
                 const opts = { mode: 'read' };
                 if ((await record.handle.queryPermission(opts)) === 'granted') {
                     startBackgroundSync(record.handle);
                 } 
            }
        } catch (e) {
            console.error("Failed to init sync", e);
        }
    }
};