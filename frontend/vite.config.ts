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
 * The one thing pre-bundling cannot serve is `vi.importActual('<bare package>')`:
 * resolution dies with `Cannot find module .../dist/main.js&v=<hash>` — the
 * version query is appended as `&v=` and becomes part of the filename. Neither
 * `optimizer.exclude`, nor `server.deps.inline`, nor the factory's own
 * `importOriginal` parameter rescues it (all three measured). Plain `vi.mock`
 * factories are unaffected — the 10 unit files mocking
 * `@glideapps/glide-data-grid` run fine pre-bundled.
 *
 * So the project split follows one rule: **a test that reads a real vendor
 * module cannot live in an optimized project.**
 *
 * | Project | Optimized | Why |
 * |---|---|---|
 * | `unit` | yes | 289 files, no bare `importActual` |
 * | `integration` | yes | 21 files |
 * | `integration-unoptimized` | no | 2 files read the real `react-router-dom` |
 * | `elec-integration` | no | its shared setupFile reads the real `react` |
 *
 * `elec-integration` is blocked at the harness, not per file: one
 * `vi.importActual('react')` in `elecCalcPageTestEnv.componentMocks.tsx` fails
 * all 18 of its files. Its wall is dominated by test execution (101.9 s) rather
 * than import (23.3 s), so unblocking it is a separate slice.
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

/**
 * Integration tests that read a real vendor module via `vi.importActual`.
 * They run in their own unoptimized project; everything else is pre-bundled.
 * Adding a bare `importActual` to an integration test means adding it here.
 */
const INTEGRATION_UNOPTIMIZED = [
  'src/__tests__/integration/pages/HomePage.test.tsx',
  'src/__tests__/integration/pages/LoginPage.test.tsx',
];

const ELECTRICAL_INTEGRATION = 'src/__tests__/integration/pages/electrical/ElecCalcPage.*.test.tsx';

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
  // AF100-09c — keep the optimizer's pre-bundle inside node_modules. Left to its
  // default it materialises `frontend/.vite/deps/`, which is gitignored but still
  // gets picked up by `eslint .` — vendor bundles then fail `no-undef` and turn
  // the lint gate red for code nobody wrote.
  cacheDir: 'node_modules/.vite',
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
          deps: depsOptimizer,
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
          exclude: [ELECTRICAL_INTEGRATION, ...INTEGRATION_UNOPTIMIZED],
        },
      },
      {
        ...shared,
        test: {
          // AF100-09c — the only reason this project exists is that its files
          // call `vi.importActual('react-router-dom')`, which cannot resolve
          // against a pre-bundle. Same settings as `integration`, minus the
          // optimizer. Isolation is unchanged.
          name: 'integration-unoptimized',
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
          include: INTEGRATION_UNOPTIMIZED,
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
          include: [ELECTRICAL_INTEGRATION],
        },
      },
    ],
  },
});
