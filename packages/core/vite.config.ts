import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

import { localizePlugin, i18nAssetPlugin } from './vite-plugins/localize';
import { audioWorkletPlugin } from './vite-plugins/audio-worklet';

const __dirname = dirname(fileURLToPath(import.meta.url));

export default defineConfig({
  root: join(__dirname, 'src', 'frontend'),

  plugins: [
    localizePlugin({
      packageScope: 'core',
      srcRoot: join(__dirname, 'src'),
    }),
    audioWorkletPlugin({
      workletPath: join(__dirname, 'src', 'frontend', 'audio-worklet-processor.js'),
    }),
    react(),
    i18nAssetPlugin({
      packageName: '@desktalk/core',
      packageScope: 'core',
      packageRoot: __dirname,
    }),
  ],

  build: {
    outDir: join(__dirname, 'dist', 'frontend'),
    emptyOutDir: true,
    target: 'es2022',
    sourcemap: true,
  },

  server: {
    port: 5173,
    proxy: {
      '/@dtfs': {
        target: 'http://localhost:3000',
        changeOrigin: true,
      },
      '/api': {
        target: 'http://localhost:3000',
        changeOrigin: true,
      },
      '/ws': {
        target: 'ws://localhost:3000',
        ws: true,
      },
    },
  },

  resolve: {
    extensions: ['.mjs', '.js', '.mts', '.ts', '.jsx', '.tsx', '.json'],
  },

  css: {
    devSourcemap: true,
    modules: {
      localsConvention: 'camelCaseOnly',
    },
  },
});
