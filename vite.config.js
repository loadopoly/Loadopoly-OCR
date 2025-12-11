import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  build: {
    outDir: 'dist',
    rollupOptions: {
      input: 'index.html',
      output: {
        entryFileNames: 'assets/[name].[hash].js',  // Bundle all JS
        chunkFileNames: 'assets/[name].[hash].js',
        assetFileNames: 'assets/[name].[hash].[ext]'
      }
    },
    assetsInlineLimit: 0,  // Don't inline—serve as files
    cssCodeSplit: false    // Bundle CSS together
  },
  base: '/',  // Ensures paths work on Vercel
  define: {
    global: 'globalThis'
  },
  optimizeDeps: {
    include: ['react', 'react-dom', 'd3', '@google/genai', '@supabase/supabase-js', 'uuid']  // Pre-bundle CDNs
  }
})