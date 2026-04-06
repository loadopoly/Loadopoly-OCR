// PERF FIX: Buffer and process polyfills are only required by ethers.js (Web3),
// which is already lazy-loaded. Deferring these to web3Service.ts saves ~5-10KB
// from the critical parse path and eliminates synchronous module evaluation.
//
// The global assignment in index.html (<script>window.global = window</script>)
// handles the `global` polyfill. Buffer/process are injected on-demand via
// ensureWeb3Polyfills() before the first ethers import.

export function ensureWeb3Polyfills() {
  if (typeof window !== 'undefined') {
    if (typeof (window as any).Buffer === 'undefined') {
      // Dynamic import keeps buffer out of the main bundle
      return import('buffer').then(({ Buffer }) => {
        (window as any).Buffer = Buffer;
        // Process polyfill is tiny — inline it
        if (typeof (window as any).process === 'undefined') {
          (window as any).process = { env: {} };
        }
      });
    }
  }
  return Promise.resolve();
}