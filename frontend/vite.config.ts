/// <reference types="vitest" />
import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';
import path from 'node:path';

const shared = {
  plugins: [react()],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
};

const coverage = {
  provider: 'v8' as const,
  reporter: ['text', 'html', 'json-summary'] as Array<'text' | 'html' | 'json-summary'>,
  exclude: ['node_modules/', 'src/__tests__/'],
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
};

export default defineConfig({
  ...shared,
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
    css: true,
    testTimeout: 60_000,
    hookTimeout: 60_000,
    coverage,
    // Split Electrical integration so vi.mock env is setup-scoped (AF9-TEST-SPLIT-01)
    projects: [
      {
        ...shared,
        test: {
          name: 'unit',
          globals: true,
          environment: 'jsdom',
          css: true,
          testTimeout: 60_000,
          hookTimeout: 60_000,
          sequence: { groupOrder: 0 },
          setupFiles: ['./src/__tests__/setup.ts'],
          include: ['src/__tests__/unit/**/*.{test,spec}.{ts,tsx}'],
        },
      },
      {
        ...shared,
        test: {
          name: 'integration',
          globals: true,
          environment: 'jsdom',
          css: true,
          testTimeout: 60_000,
          hookTimeout: 60_000,
          sequence: { groupOrder: 1 },
          setupFiles: ['./src/__tests__/setup.ts'],
          include: ['src/__tests__/integration/**/*.{test,spec}.{ts,tsx}'],
          exclude: [
            'src/__tests__/integration/pages/electrical/ElecCalcPage.*.test.tsx',
          ],
        },
      },
      {
        ...shared,
        test: {
          name: 'elec-integration',
          globals: true,
          environment: 'jsdom',
          css: true,
          testTimeout: 60_000,
          hookTimeout: 60_000,
          sequence: { groupOrder: 2 },
          // P2-ELEC-FEEDBACK-01 — worker budget for Electrical integration.
          // Per-file process isolation: setupFiles vi.hoisted mocks must not race
          // across workers (shared module state) or parallel files in one worker.
          // maxWorkers=4: AF12 wall target ≤120s full DoD under concurrent unit load.
          // Dual concurrent stress should set AGENT_DOD_UNIT_MAX_WORKERS=3 (or lower)
          // if HeatCalc flakiness returns; isolation stays per-file forks.
          pool: 'forks',
          isolate: true,
          fileParallelism: true,
          maxWorkers: 4,
          setupFiles: [
            './src/__tests__/setup.ts',
            './src/__tests__/integration/pages/electrical/elecCalcPageTestEnv.tsx',
          ],
          include: [
            'src/__tests__/integration/pages/electrical/ElecCalcPage.*.test.tsx',
          ],
        },
      },
    ],
  },
});
