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

/**
 * AF100-09b — antd is pre-bundled once instead of being re-imported per test file.
 *
 * Measured on `825e4f6`: `antd` cost ~1.3 s of import per file regardless of how
 * much of it a test used, which was the single largest remaining harness tax
 * (import 89.7 s across 287 unit files). Pre-bundling keeps full per-file
 * isolation — unlike `isolate: false`, which is 86 % faster but lets module and
 * mock state leak between files.
 *
 * `@ant-design/icons` is deliberately NOT optimized: pre-bundling it makes named
 * icon exports resolve to `undefined` (`ReloadOutlined` → undefined), which
 * surfaces as `Element type is invalid` at render time.
 *
 * Scope is the `unit` project only, and that is a hard constraint, not a default:
 * `vi.importActual('<pre-bundled package>')` cannot resolve — it dies with
 * `Cannot find module .../dist/main.js&v=<hash>`. The two `integration` files
 * that call `vi.importActual('react-router-dom')` therefore keep the plain
 * pipeline. Neither `optimizer.exclude` nor `server.deps.inline` rescues them
 * (both measured). Plain `vi.mock` factories are unaffected — the 10 unit files
 * mocking `@glideapps/glide-data-grid` run fine pre-bundled.
 *
 * `unit` is also where the tax lives: 287 of 328 test files.
 *
 * Guard: `antdOptimizerContract.architecture.test.ts`.
 */
const depsOptimizer = {
  optimizer: {
    client: {
      enabled: true,
      include: ['antd'],
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

function resolveMaxWorkers(envKey: string, fallback: number): number {
  const raw = process.env[envKey];
  if (raw && Number.isFinite(Number(raw)) && Number(raw) > 0) {
    return Number(raw);
  }
  return fallback;
}

const defaultUnitWorkers = resolveMaxWorkers(
  'AGENT_DOD_UNIT_MAX_WORKERS',
  2,
);
const defaultIntegrationWorkers = resolveMaxWorkers(
  'AGENT_DOD_INT_MAX_WORKERS',
  2,
);
const defaultElectricalWorkers = resolveMaxWorkers('AGENT_DOD_ELEC_MAX_WORKERS', 2);

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
          deps: depsOptimizer,
          globals: true,
          environment: 'jsdom',
          css: true,
          testTimeout: 60_000,
          hookTimeout: 60_000,
          sequence: { groupOrder: 0 },
          // Cap workers so single DoD stays fast and dual concurrent DoD does not thrash.
          // Override: AGENT_DOD_UNIT_MAX_WORKERS (dual-safe uses 2).
          pool: 'forks',
          isolate: true,
          fileParallelism: true,
          maxWorkers: defaultUnitWorkers,
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
          pool: 'forks',
          isolate: true,
          fileParallelism: true,
          maxWorkers: defaultIntegrationWorkers,
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
          // Canonical/dual-safe default is 2 workers per project to avoid
          // oversubscribing the host; override AGENT_DOD_ELEC_MAX_WORKERS only
          // after measuring the complete DoD. Isolation stays per-file forks.
          pool: 'forks',
          isolate: true,
          fileParallelism: true,
          maxWorkers: defaultElectricalWorkers,
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
