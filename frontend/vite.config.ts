/// <reference types="vitest" />
import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';
import path from 'node:path';

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
  server: {
    port: 3000,
    host: true,
  },
  build: {
    rollupOptions: {
      output: {
        manualChunks(id) {
          if (id.includes('node_modules/react')) return 'react-vendor';
          if (
            id.includes('node_modules/@tanstack/react-query') ||
            id.includes('node_modules/axios') ||
            id.includes('node_modules/zustand')
          ) {
            return 'query-vendor';
          }
          return undefined;
        },
      },
    },
  },
  test: {
    globals: true,
    environment: 'jsdom',
    setupFiles: './src/__tests__/setup.ts',
    css: true,
    testTimeout: 60_000,
    hookTimeout: 60_000,
    coverage: {
      provider: 'v8',
      reporter: ['text', 'html', 'json-summary'],
      exclude: ['node_modules/', 'src/__tests__/'],
      // G5: floor from unit suite on clean HEAD (2026-07-23):
      // All files ~74.5/66.6/74/76.8 — set slightly below; do not claim arbitrary 80%.
      // src/domain threshold-check reports ~88/83/97/90 — keep a buffer under that.
      thresholds: {
        statements: 70,
        branches: 62,
        functions: 70,
        lines: 72,
        'src/domain/**': {
          statements: 85,
          branches: 75,
          functions: 90,
          lines: 85,
        },
      },
    },
  },
});
