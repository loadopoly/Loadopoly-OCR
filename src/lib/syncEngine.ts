// src/lib/syncEngine.ts — stub for build

// Required by SettingsPanel
export const enableAutoSync = async () => {
  console.log('Sync enabled (Stub)');
  return true; 
};

export const disableAutoSync = async () => {
  console.log('Sync disabled (Stub)');
};

export const isSyncEnabled = async () => {
  return false;
};

export const setScannerUrl = (url: string) => {
  console.log('Scanner URL set:', url);
};

// Required by App.tsx
export const initSync = async () => {
  console.log('Sync initialized (Stub)');
};