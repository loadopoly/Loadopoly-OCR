import { defineConfig, loadEnv } from 'vite'
import react from '@vitejs/plugin-react'
import path from 'path'
import { fileURLToPath } from 'url'

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '');
  return {
    plugins: [react()],
    resolve: {
      alias: {
        '@': path.resolve(__dirname, './'),
        'crypto': 'crypto-browserify',
        'stream': 'stream-browserify',
        'assert': 'assert',
        'http': 'stream-http',
        'https': 'https-browserify',
        'os': 'os-browserify/browser',
        'url': 'url',
        'util': 'util',
        'buffer': 'buffer',
        'process': 'process/browser',
      },
    },
    define: {
      'process.env.API_KEY': JSON.stringify(env.API_KEY),
      'process.env': {},
      global: 'globalThis',
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
    optimizeDeps: {
      include: ['react', 'react-dom', 'd3', '@google/genai', '@supabase/supabase-js', 'uuid'],
      exclude: ['ethers']
    }
  }
})