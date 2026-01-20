import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [react()],
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
    // Use content hashes for cache busting
    rollupOptions: {
      output: {
        // Ensure consistent chunk naming with content hashes
        entryFileNames: 'assets/[name]-[hash].js',
        chunkFileNames: 'assets/[name]-[hash].js',
        assetFileNames: 'assets/[name]-[hash].[ext]',
        // Aggressive manual chunks for optimal code splitting
        manualChunks(id) {
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
          // D3 visualization - lazy load
          if (id.includes('d3') || id.includes('d3-')) {
            return 'vendor-d3';
          }
          // 3D/Three.js - lazy load, rarely used
          if (id.includes('three') || id.includes('@react-three')) {
            return 'vendor-3d';
          }
          // ethers/web3 - lazy load, optional
          if (id.includes('ethers')) {
            return 'vendor-web3';
          }
          // Google AI
          if (id.includes('@google/genai')) {
            return 'vendor-ai';
          }
          // Force graph - visualization
          if (id.includes('react-force-graph')) {
            return 'vendor-graph';
          }
          // Split heavy components into their own chunks
          if (id.includes('/components/metaverse/')) {
            return 'chunk-metaverse';
          }
          if (id.includes('/components/ClusterSync')) {
            return 'chunk-cluster';
          }
          if (id.includes('/components/BatchProcessing') || id.includes('/components/QueueMonitor')) {
            return 'chunk-batch';
          }
          if (id.includes('/services/')) {
            return 'chunk-services';
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