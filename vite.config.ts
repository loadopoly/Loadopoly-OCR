import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';
import path from 'path';

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, '.', '');
  return {
    plugins: [react()],
    resolve: {
      alias: {
        '@': path.resolve('./src'),
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
        input: 'index.html',
        onwarn(warning, warn) {
          warn(warning);
        },
      },
      commonjsOptions: {
        transformMixedEsModules: true,
      },
    },
    optimizeDeps: {
      include: ['react', 'react-dom', 'd3', '@google/genai', '@supabase/supabase-js', 'uuid'],
    },
    server: {
      port: 3000,
      host: '0.0.0.0',
    },
  };
});