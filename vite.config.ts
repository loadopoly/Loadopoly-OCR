import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';
import path from 'path';

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '');
  return {
    plugins: [react()],
    resolve: {
      alias: {
        '@': path.resolve(__dirname, './src'),
        crypto: 'crypto-browserify',
        stream: 'stream-browserify',
        assert: 'assert',
        http: 'stream-http',
        https: 'https-browserify',
        os: 'os-browserify/browser',
        url: 'url',
        util: 'util',
        buffer: 'buffer',
        process: 'process/browser',
      },
    },
    define: {
      'process.env.API_KEY': JSON.stringify(env.API_KEY || env.GEMINI_API_KEY),
      'process.env.GEMINI_API_KEY': JSON.stringify(env.GEMINI_API_KEY),
      global: 'globalThis',
      'process.env': {},
    },
    build: {
      outDir: 'dist',
      rollupOptions: {
        external: ['ethers'],
        output: {
          globals: { ethers: 'ethers' },
        },
        onwarn(warning, warn) {
          // Suppress "Module level directive" warnings
          if (warning.code === 'MODULE_LEVEL_DIRECTIVE') {
            return;
          }
          // Suppress warnings about unresolved external imports for ethers
          // Cast to any to access source property which might not exist on the type definition
          if (warning.code === 'UNRESOLVED_IMPORT' && (warning as any).source?.includes('ethers')) {
            return;
          }
          if (warning.message.includes('ethers')) {
            return;
          }
          warn(warning);
        },
      },
      commonjsOptions: {
        transformMixedEsModules: true,
      },
    },
    optimizeDeps: {
      include: ['react', 'react-dom', 'd3', '@google/genai', '@supabase/supabase-js', 'uuid'],
      exclude: ['ethers'],
    },
    server: {
      port: 3000,
      host: '0.0.0.0',
    },
  };
});