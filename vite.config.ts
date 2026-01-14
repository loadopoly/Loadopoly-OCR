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
    // Generate source maps for debugging production issues
    sourcemap: true,
    // Target modern browsers for smaller bundles
    target: 'es2020',
    // Use content hashes for cache busting
    rollupOptions: {
      output: {
        // Ensure consistent chunk naming with content hashes
        entryFileNames: 'assets/[name]-[hash].js',
        chunkFileNames: 'assets/[name]-[hash].js',
        assetFileNames: 'assets/[name]-[hash].[ext]',
        // Manual chunks for better caching and code splitting
        manualChunks: {
          'vendor-react': ['react', 'react-dom'],
          'vendor-ui': ['lucide-react'],
          'vendor-data': ['dexie', '@supabase/supabase-js'],
          // Separate heavy visualization libraries
          'vendor-d3': ['d3'],
          // Three.js and related 3D libraries (lazy loaded)
          'vendor-three': ['three'],
        },
      },
    },
    // Increase chunk size warning limit (we have manual chunks now)
    chunkSizeWarningLimit: 600,
    // Use esbuild for minification (faster than terser, included by default)
    minify: 'esbuild',
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