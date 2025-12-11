// src/lib/syncEngine.ts — placeholder to fix build

export const enableAutoSync = async () => {
  console.log('Auto-sync not fully implemented yet');
  alert('Auto-sync is currently a placeholder feature in this build.');
  return false;
};

export const disableAutoSync = async () => {
  console.log('Auto-sync disabled');
};

export const isSyncEnabled = async () => false;

export const setScannerUrl = (url: string) => {
  console.log('Scanner URL set:', url);
};

// Required by App.tsx
export const initSync = async () => {
  console.log('Sync engine initialized (placeholder)');
};