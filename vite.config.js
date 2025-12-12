import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import path from 'path'
import { fileURLToPath } from 'url'

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Custom plugin to force externalization of specific modules
const externalizePlugin = () => ({
  name: 'force-external',
  enforce: 'pre',
  resolveId(id) {
    if (id === 'ethers') {
      return { id: 'ethers', external: true }
    }
    return null;
  }
})

export default defineConfig({
  plugins: [externalizePlugin(), react()],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './'),
    },
  },
  build: {
    outDir: 'dist',
    rollupOptions: {
      input: 'index.html',
      external: ['ethers'],
      output: {
        entryFileNames: 'assets/[name].[hash].js',
        chunkFileNames: 'assets/[name].[hash].js',
        assetFileNames: 'assets/[name].[hash].[ext]',
        globals: {
          ethers: 'ethers'
        }
      }
    },
    assetsInlineLimit: 0,
    cssCodeSplit: false
  },
  base: '/',
  define: {
    global: 'globalThis'
  },
  optimizeDeps: {
    include: ['react', 'react-dom', 'd3', '@google/genai', '@supabase/supabase-js', 'uuid'],
    exclude: ['ethers']
  }
})