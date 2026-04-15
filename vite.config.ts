import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// https://vitejs.dev/config/
export default defineConfig({
  // Set base path for GitHub Pages deployment (e.g. loadopoly.github.io/Loadopoly-OCR/)
  base: process.env.GITHUB_ACTIONS ? '/Loadopoly-OCR/' : '/',
  plugins: [react()],
  // Workers must use ES module format to support dynamic import() for code-splitting.
  // Default 'iife' format cannot split chunks (needed for deduplicationServiceV2 in bundleWorker).
  worker: {
    format: 'es',
  },
  resolve: {
    alias: {
      '@': resolve(__dirname, './src'),
      process: "process/browser",
      stream: "stream-browserify",
      zlib: "browserify-zlib",
      util: "util",
      buffer: "buffer",
    },
  },
  define: {
    // Defines global variables for library compatibility
    global: 'globalThis',
    // Ensures process.env exists for libraries accessing it directly
    'process.env': {},
    // Build timestamp for cache busting verification
    '__BUILD_TIME__': JSON.stringify(new Date().toISOString()),
  },
  server: {
    port: 3000,
    // Ensure proper MIME types in dev
    headers: {
      'X-Content-Type-Options': 'nosniff',
    },
  },
  build: {
    // Disable source maps in production for smaller bundle
    sourcemap: false,
    // Target modern browsers for smaller bundles
    target: 'es2020',
    // PERF FIX: Disable modulePreload entirely.
    // With polyfill: true (default), Vite injects a __vitePreload helper that
    // Rollup places in chunk-web3-services, forcing the entry chunk to
    // statically import it — cascading into ~600KB of vendor deps.
    // Also removes <link rel="modulepreload"> tags from HTML that cause the
    // browser to eagerly download ~956KB of JS before the entry can execute.
    modulePreload: false,
    // Use content hashes for cache busting
    rollupOptions: {
      output: {
        // Ensure consistent chunk naming with content hashes
        entryFileNames: 'assets/[name]-[hash].js',
        chunkFileNames: 'assets/[name]-[hash].js',
        assetFileNames: 'assets/[name]-[hash].[ext]',
        // Aggressive manual chunks for optimal code splitting
        manualChunks(id) {
          // PERF FIX: Vite's __vitePreload helper is always generated
          // (even with modulePreload: false) for CSS dep handling.
          // Without this rule, Rollup places it in chunk-web3-services
          // which forces the entry to statically import that chunk,
          // cascading into ~600KB of vendor deps via transitive imports.
          // Isolate it in a tiny ~1KB chunk to break the cascade.
          if (id.includes('vite/preload-helper')) {
            return 'vendor-preload';
          }
          // React core - smallest possible
          if (id.includes('node_modules/react/') || id.includes('node_modules/react-dom/')) {
            return 'vendor-react';
          }
          // Icons - commonly used but heavy
          if (id.includes('lucide-react')) {
            return 'vendor-icons';
          }
          // Supabase client - only needed when online
          if (id.includes('@supabase/')) {
            return 'vendor-supabase';
          }
          // IndexedDB / offline storage
          if (id.includes('dexie')) {
            return 'vendor-storage';
          }
          // D3 + Force graph visualization - keep together, lazy load
          if (id.includes('d3') || id.includes('d3-') || id.includes('react-force-graph')) {
            return 'vendor-visualization';
          }
          // 3D/Three.js - lazy load, rarely used
          if (id.includes('three') || id.includes('@react-three')) {
            return 'vendor-3d';
          }
          // ethers/web3 - lazy load, optional
          if (id.includes('ethers')) {
            return 'vendor-web3';
          }
          // Optional web3-heavy service modules - isolate from core app shell
          if (
            id.includes('/services/web3Service') ||
            id.includes('/services/oracleVerificationService') ||
            id.includes('/services/zkProofService') ||
            id.includes('/services/zoneShardingService') ||
            id.includes('/services/batchProcessingService') ||
            id.includes('/services/pluginSecurityService') ||
            id.includes('/services/analyticsService')
          ) {
            return 'chunk-web3-services';
          }
          // Google AI
          if (id.includes('@google/genai')) {
            return 'vendor-ai';
          }
          // Gemini service — must be isolated from chunk-cluster-sync
          // to prevent pulling vendor-ai (253KB) into the App startup chain.
          // geminiService is only needed on user-triggered camera/OCR actions.
          if (id.includes('/services/geminiService')) {
            return 'chunk-gemini';
          }
          // Split heavy components into their own chunks
          if (id.includes('/components/metaverse/')) {
            return 'chunk-metaverse';
          }
          // Queue monitor is frequently used; keep isolated for faster warm load
          if (id.includes('/components/QueueMonitor')) {
            return 'chunk-queue-monitor';
          }
          // Cluster sync is optional/curator-only and can be deferred heavily
          if (id.includes('/components/ClusterSync') || id.includes('/components/ClusterSynchronizer')) {
            return 'chunk-cluster-sync';
          }
          // Batch processing panel is optional and should remain isolated
          if (id.includes('/components/BatchProcessing')) {
            return 'chunk-batch-processing';
          }
        },
      },
    },
    // Set reasonable chunk size warning
    chunkSizeWarningLimit: 300,
    // Use esbuild for minification (faster than terser, included by default)
    minify: 'esbuild',
    // Enable CSS code splitting
    cssCodeSplit: true,
  },
  optimizeDeps: {
    esbuildOptions: {
      define: {
        global: 'globalThis'
      },
    },
    // Pre-bundle these dependencies for faster dev startup
    include: [
      'react',
      'react-dom',
      'lucide-react',
      'uuid',
      'dexie',
    ],
    // Exclude heavy libs from pre-bundling (let Vite handle dynamically)
    exclude: ['three'],
  },
});