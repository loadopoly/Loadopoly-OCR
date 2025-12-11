import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import path from 'path'
import { fileURLToPath } from 'url'

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './'),
    },
  },
  build: {
    outDir: 'dist',
    rollupOptions: {
      input: 'index.html',
      output: {
        entryFileNames: 'assets/[name].[hash].js',
        chunkFileNames: 'assets/[name].[hash].js',
        assetFileNames: 'assets/[name].[hash].[ext]'
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
    include: ['react', 'react-dom', 'd3', '@google/genai', '@supabase/supabase-js', 'uuid', 'ethers']
  }
})