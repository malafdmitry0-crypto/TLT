#!/usr/bin/env node
/**
 * agent:scope — map a frontend path to owner, gates, and proof.
 *
 * Usage (repo root or frontend/):
 *   node scripts/agent-scope.mjs <repo-relative-or-frontend-path>
 *   npm run agent:scope -- src/pages/heatcalc/HeatCalcPage.tsx
 *   npm run agent:scope -- --json frontend/src/components/ui-kit/TltButton.tsx
 *
 * Exit: 0 on resolved owner; 1 on unknown / ambiguous / missing path.
 */
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { dirname, extname, join, normalize, relative, resolve, sep } from 'node:path';
import process from 'node:process';

const ROOT = resolve(new URL('..', import.meta.url).pathname);
const FRONTEND = join(ROOT, 'frontend');
const SRC = join(FRONTEND, 'src');

const asJson = process.argv.includes('--json');
const args = process.argv.slice(2).filter((a) => a !== '--json');
const input = args[0];

/** Viewport profiles from docs/frontend/viewport-policy.md (product contract). */
const BROWSER_PROFILES = ['1000×768', '1280×800', '1440×900'];
const PROOF_LEVELS = new Set(['scoped', 'owner']);

/**
 * Ordered path rules (first match wins). More specific prefixes first.
 * Each rule: { id, test(relFromSrc), owner, zone, publicEntrypoint, stateOwner,
 *   focusedTests, architectureGates, browserRequired, notes }
 */
const RULES = [
  {
    id: 'ui-kit',
    test: (p) => p.startsWith(`components/ui-kit${sep}`) || p.startsWith(`components/form-controls${sep}`),
    owner: 'ui',
    zone: 'ui-kit',
    publicEntrypoint: '@/components/ui-kit',
    stateOwner: 'none (presentation only)',
    focusedProof: [
      { cwd: 'frontend', argv: ['npm', 'run', 'test:ui-kit'] },
      { cwd: 'frontend', argv: ['npm', 'run', 'storybook:coverage:strict'] },
    ],
    focusedTests: [
      'npm run test:ui-kit',
      'npm run storybook:coverage:strict',
    ],
    architectureGates: ['uiKitOwnerGate', 'css:architecture'],
    browserRequired: true,
    browserProfiles: BROWSER_PROFILES,
    notes: 'MCP storybook preferred for props; no feature/domain imports.',
  },
  {
    id: 'feedback',
    test: (p) => p.startsWith(`feedback${sep}`),
    owner: 'shared',
    zone: 'app-feedback',
    publicEntrypoint: '@/feedback/appFeedback',
    stateOwner: 'AntdAppShell (root)',
    focusedProof: [
      { cwd: 'frontend', argv: ['npm', 'run', 'typecheck'] },
      { cwd: 'frontend', argv: ['npm', 'run', 'test:agent-gates'] },
    ],
    focusedTests: ['npm run typecheck', 'npm run test:agent-gates'],
    architectureGates: ['test:agent-gates'],
    browserRequired: true,
    browserProfiles: BROWSER_PROFILES,
    notes: 'Use appMessage/appModal — never static antd message in features.',
  },
  {
    id: 'heat-pages',
    test: (p) =>
      p === 'pages/HeatCalcPage.tsx'
      || p.startsWith(`pages/heatcalc${sep}`)
      || p.startsWith(`components/heatcalc${sep}`)
      || p.startsWith(`components/wizard${sep}`)
      || p.startsWith(`hooks/useHeat`)
      || p.startsWith(`hooks/heatCalc`)
      || p.startsWith('domain/heat')
      || p.includes(`${sep}heatCalc`)
      || p.startsWith(`utils/heatCalc`)
      || p.startsWith(`utils/objectWizard`),
    owner: 'heat',
    zone: 'heat-calc',
    publicEntrypoint: 'pages/heatcalc + workspace route /workspace/heat-calc',
    stateOwner: 'heatcalc page models / react-query + project store',
    focusedProof: [
      { cwd: 'frontend', argv: ['npx', 'vitest', 'run', '--project', 'unit', 'src/__tests__/unit/pages/heatcalc', 'src/__tests__/unit/pages/HeatCalcPage', 'src/__tests__/unit/utils/heatCalc', 'src/__tests__/unit/components/heatcalc', 'src/__tests__/unit/components/wizard'] },
      { cwd: 'frontend', argv: ['npm', 'run', 'test:agent-gates'] },
    ],
    focusedTests: [
      'npx vitest run --project unit src/__tests__/unit/pages/heatcalc src/__tests__/unit/pages/HeatCalcPage src/__tests__/unit/utils/heatCalc',
      'npm run test:agent-gates',
    ],
    architectureGates: ['featureBoundaries', 'test:agent-gates'],
    browserRequired: true,
    browserProfiles: BROWSER_PROFILES,
    notes: 'Characterization first for table/excel/form contracts.',
  },
  {
    id: 'electrical',
    test: (p) =>
      p === 'pages/ElecCalcPage.tsx'
      || p.startsWith(`pages/electrical${sep}`)
      || p.startsWith(`components/electrical${sep}`)
      || p.startsWith('domain/electrical')
      || p.startsWith(`utils/electrical`)
      || p.startsWith(`api/electrical`)
      || p.startsWith(`hooks/useElec`)
      || p.startsWith(`hooks/useElectrical`)
      || p.startsWith(`hooks/elec`),
    owner: 'electrical',
    zone: 'elec-calc',
    publicEntrypoint: 'pages/electrical + /workspace/elec-calc',
    stateOwner: 'elec page models / electrical variants API',
    focusedProof: [
      { cwd: 'frontend', argv: ['npx', 'vitest', 'run', '--project', 'unit', '--project', 'elec-integration', 'src/__tests__/unit/pages/electrical', 'src/__tests__/integration/pages/electrical'] },
      { cwd: 'frontend', argv: ['npm', 'run', 'test:agent-gates'] },
    ],
    focusedTests: [
      'npx vitest run --project unit --project elec-integration src/__tests__/unit/pages/electrical src/__tests__/integration/pages/electrical',
      'npm run test:agent-gates',
    ],
    architectureGates: ['featureBoundaries', 'test:agent-gates'],
    browserRequired: true,
    browserProfiles: BROWSER_PROFILES,
    notes: null,
  },
  {
    id: 'specification',
    test: (p) =>
      p.startsWith(`pages/specification${sep}`)
      || p === 'pages/SpecificationPage.tsx'
      || p.startsWith(`components/specification${sep}`)
      || p.startsWith(`api/specification`),
    owner: 'specification',
    zone: 'specification',
    publicEntrypoint: 'pages/specification + /workspace/specification',
    stateOwner: 'specification page model',
    focusedProof: [
      { cwd: 'frontend', argv: ['npx', 'vitest', 'run', '--project', 'unit', '--project', 'integration', 'src/__tests__/integration/pages/SpecificationPage', 'src/__tests__/unit/pages/specification'] },
      { cwd: 'frontend', argv: ['npm', 'run', 'test:agent-gates'] },
    ],
    focusedTests: [
      'npx vitest run --project unit --project integration src/__tests__/integration/pages/SpecificationPage src/__tests__/unit/pages/specification',
      'npm run test:agent-gates',
    ],
    architectureGates: ['featureBoundaries', 'test:agent-gates'],
    browserRequired: true,
    browserProfiles: BROWSER_PROFILES,
    notes: null,
  },
  {
    id: 'reports',
    test: (p) =>
      p.startsWith(`pages/Report`)
      || p === 'pages/report-page.css'
      || p === 'pages/report-wizard-page.css'
      || p === 'pages/reportWizardFormats.tsx'
      || p.startsWith(`components/reports${sep}`)
      || p.startsWith(`api/reports`),
    owner: 'reports',
    zone: 'reports',
    publicEntrypoint: 'ReportWizardPage / ReportPage',
    stateOwner: 'report export flow',
    focusedProof: [
      { cwd: 'frontend', argv: ['npx', 'vitest', 'run', '--project', 'unit', '--project', 'integration', 'src/__tests__/integration/pages/ReportPage', 'src/__tests__/integration/pages/ReportWizardPage.test.tsx', 'src/__tests__/unit/components/reports'] },
      { cwd: 'frontend', argv: ['npm', 'run', 'test:agent-gates'] },
    ],
    focusedTests: [
      'npx vitest run --project unit --project integration src/__tests__/integration/pages/ReportPage src/__tests__/integration/pages/ReportWizardPage.test.tsx src/__tests__/unit/components/reports',
      'npm run test:agent-gates',
    ],
    architectureGates: ['test:agent-gates'],
    browserRequired: true,
    browserProfiles: BROWSER_PROFILES,
    notes: null,
  },
  {
    id: 'admin',
    test: (p) =>
      p.startsWith(`pages/admin${sep}`)
      || p.startsWith(`components/admin${sep}`),
    owner: 'admin',
    zone: 'admin',
    publicEntrypoint: 'pages/admin/*',
    stateOwner: 'admin CRUD mutations',
    focusedProof: [
      { cwd: 'frontend', argv: ['npx', 'vitest', 'run', '--project', 'unit', '--project', 'integration', 'src/__tests__/unit/pages/admin', 'src/__tests__/integration/pages/admin'] },
      { cwd: 'frontend', argv: ['npm', 'run', 'test:agent-gates'] },
    ],
    focusedTests: [
      'npx vitest run --project unit --project integration src/__tests__/unit/pages/admin src/__tests__/integration/pages/admin',
      'npm run test:agent-gates',
    ],
    architectureGates: ['test:agent-gates'],
    browserRequired: false,
    browserProfiles: [],
    notes: 'Browser optional unless UI layout changed.',
  },
  {
    id: 'auth-shell',
    test: (p) =>
      p.startsWith(`pages/Login`)
      || p.startsWith(`pages/Home`)
      || p.startsWith(`store/auth`)
      || p.startsWith(`components/layout${sep}`)
      || p === 'App.tsx'
      || p === 'main.tsx'
      || p === 'routes.tsx'
      || p.startsWith(`routes${sep}`)
      || p.startsWith(`pages/help${sep}`)
      || p.startsWith(`pages/uikit${sep}`)
      || p === 'pages/UIKitPage.tsx'
      || p === 'pages/home-page.css'
      || p === 'pages/login-page.css'
      || p.startsWith('pages/ui-kit-')
      || p === 'pages/help/help-page.css',
    owner: 'auth',
    zone: 'shell',
    publicEntrypoint: 'App / routes / MainLayout',
    stateOwner: 'authStore + project selection',
    focusedProof: [
      { cwd: 'frontend', argv: ['npm', 'run', 'test:agent-gates'] },
    ],
    focusedTests: ['npm run test:agent-gates'],
    architectureGates: ['test:agent-gates'],
    browserRequired: true,
    browserProfiles: BROWSER_PROFILES,
    notes: 'Top-level page shells; feature work usually lives under pages/<domain>/.',
  },
  {
    id: 'projects',
    test: (p) =>
      p.startsWith(`pages/Projects`)
      || p.startsWith(`pages/projects${sep}`)
      || p === 'pages/WorkspacePage.tsx'
      || p === 'pages/workspace-page.css'
      || p === 'pages/projects-page.css'
      || p === 'pages/workflow-params.css'
      || p.startsWith(`api/projects`)
      || p === 'components/ExportObjectsButton.tsx'
      || p === 'components/ImportExcelButton.tsx'
      || p === 'components/ImportExcelButton.css'
      || p === 'components/WorkflowSteps.tsx',
    owner: 'projects',
    zone: 'projects',
    publicEntrypoint: 'ProjectsPage / WorkspacePage',
    stateOwner: 'project list mutations',
    focusedProof: [
      { cwd: 'frontend', argv: ['npx', 'vitest', 'run', '--project', 'integration', 'src/__tests__/integration/pages/ProjectsPage.test.tsx'] },
      { cwd: 'frontend', argv: ['npm', 'run', 'test:agent-gates'] },
    ],
    focusedTests: [
      'npx vitest run --project integration src/__tests__/integration/pages/ProjectsPage.test.tsx',
      'npm run test:agent-gates',
    ],
    architectureGates: ['test:agent-gates'],
    browserRequired: false,
    browserProfiles: [],
    notes: null,
  },
  {
    id: 'common-shared-components',
    test: (p) =>
      p.startsWith(`components/common${sep}`)
      || p.startsWith(`components/shared${sep}`),
    owner: 'shared',
    zone: 'shared-ui',
    publicEntrypoint: 'components/common|shared',
    stateOwner: 'none or parent feature',
    focusedProof: [
      { cwd: 'frontend', argv: ['npx', 'vitest', 'run', '--project', 'unit', 'src/__tests__/unit/components'] },
    ],
    focusedTests: [
      'npx vitest run --project unit src/__tests__/unit/components',
    ],
    architectureGates: ['test:agent-gates'],
    browserRequired: false,
    browserProfiles: [],
    notes: null,
  },
  {
    id: 'hooks',
    test: (p) =>
      p.startsWith(`hooks${sep}`)
      && !p.startsWith(`hooks/useHeat`)
      && !p.startsWith(`hooks/heatCalc`)
      && !p.startsWith(`hooks/useElec`)
      && !p.startsWith(`hooks/elec`)
      && !p.startsWith(`hooks/useElectrical`),
    owner: 'shared',
    zone: 'hooks',
    publicEntrypoint: 'hooks/*',
    stateOwner: 'hook consumer',
    focusedProof: [
      { cwd: 'frontend', argv: ['npx', 'vitest', 'run', '--project', 'unit', 'src/__tests__/unit/hooks'] },
    ],
    focusedTests: [
      'npx vitest run --project unit src/__tests__/unit/hooks',
    ],
    architectureGates: ['test:agent-gates'],
    browserRequired: false,
    browserProfiles: [],
    notes: 'Heat/electrical-named hooks may still match earlier domain rules.',
  },
  {
    id: 'config-constants-store',
    test: (p) =>
      p.startsWith(`config${sep}`)
      || p.startsWith(`constants${sep}`)
      || (p.startsWith(`store${sep}`) && !p.startsWith(`store/auth`)),
    owner: 'shared',
    zone: 'config-state',
    publicEntrypoint: 'config|constants|store',
    stateOwner: 'zustand store when under store/; else none',
    focusedProof: [
      { cwd: 'frontend', argv: ['npm', 'run', 'test:agent-gates'] },
    ],
    focusedTests: ['npm run test:agent-gates'],
    architectureGates: ['test:agent-gates'],
    browserRequired: false,
    browserProfiles: [],
    notes: null,
  },
  {
    id: 'styles',
    // Global/token CSS only. Feature co-located *.css stays with the feature owner.
    test: (p) =>
      p.startsWith(`styles${sep}`)
      || p === 'styles.css',
    owner: 'css',
    zone: 'css',
    publicEntrypoint: 'styles/tokens.css + feature owner CSS',
    stateOwner: 'none',
    focusedProof: [
      { cwd: 'frontend', argv: ['npm', 'run', 'css:architecture'] },
    ],
    focusedTests: ['npm run css:architecture'],
    architectureGates: ['cssArchitectureRatchet', 'cssImportantRatchet'],
    browserRequired: true,
    browserProfiles: BROWSER_PROFILES,
    notes: 'No feature CSS in styles.css; no !important / bare .ant-*.',
  },
  {
    id: 'api-shared',
    test: (p) =>
      p.startsWith(`api${sep}`)
      && !p.startsWith(`api/electrical`)
      && !p.startsWith(`api/projects`)
      && !p.startsWith(`api/reports`)
      && !p.startsWith(`api/specification`),
    // covers api/specifications.ts
    owner: 'shared',
    zone: 'api',
    publicEntrypoint: 'api/* (module nearest to path)',
    stateOwner: 'react-query keys in same module',
    focusedProof: [
      { cwd: 'frontend', argv: ['npx', 'vitest', 'run', '--project', 'unit', 'src/__tests__/unit/api'] },
      { cwd: 'frontend', argv: ['npm', 'run', 'test:agent-gates'] },
    ],
    focusedTests: [
      'npx vitest run --project unit src/__tests__/unit/api',
      'npm run test:agent-gates',
    ],
    architectureGates: ['test:agent-gates'],
    browserRequired: false,
    browserProfiles: [],
    notes: null,
  },
  {
    id: 'types-utils-domain',
    test: (p) => {
      if (p.startsWith(`theme${sep}`)) return true;
      if (p.startsWith(`types${sep}`)) return true;
      if (p.startsWith(`domain/heat`) || p.startsWith(`domain/electrical`)) return false;
      if (p.startsWith(`domain${sep}`)) return true;
      if (
        p.startsWith(`utils/heatCalc`)
        || p.startsWith(`utils/electrical`)
        || p.startsWith(`utils/objectWizard`)
        || p.includes(`${sep}heatCalc`)
      ) return false;
      if (p.startsWith(`utils${sep}`)) return true;
      return false;
    },
    owner: 'shared',
    zone: 'shared-lib',
    publicEntrypoint: 'types|utils|domain|theme (path-local module)',
    stateOwner: 'none (pure) or documented store',
    focusedProof: [
      { cwd: 'frontend', argv: ['npx', 'vitest', 'run', '--project', 'unit', 'src/__tests__/unit/utils', 'src/__tests__/unit/domain'] },
    ],
    focusedTests: [
      'npx vitest run --project unit src/__tests__/unit/utils src/__tests__/unit/domain',
    ],
    architectureGates: ['test:agent-gates'],
    browserRequired: false,
    browserProfiles: [],
    notes: 'Expand focused/owner proof if consumer runtime behaviour changes.',
  },
  {
    id: 'test-harness',
    test: (p) =>
      p === `__tests__${sep}setup.ts`
      || (
        p.startsWith(`__tests__${sep}`)
        && /(?:testEnv|test-utils|test-mocks|Harness)\.[^.]+$/.test(p)
      ),
    owner: 'qa',
    zone: 'shared-test-harness',
    publicEntrypoint: 'Vitest setup / shared test harness',
    stateOwner: 'test runtime',
    focusedProof: [
      { cwd: 'frontend', argv: ['npm', 'run', 'test:agent-gates'] },
    ],
    focusedTests: ['npm run test:agent-gates'],
    architectureGates: ['test:agent-gates'],
    browserRequired: false,
    browserProfiles: [],
    notes: 'Cross-file harness changes require expanded owner proof.',
  },
  {
    id: 'tests',
    test: (p) => p.startsWith(`__tests__${sep}`) || p.includes('.test.') || p.includes('.spec.'),
    owner: 'qa',
    zone: 'tests',
    publicEntrypoint: 'n/a',
    stateOwner: 'n/a',
    focusedProof: [
      { cwd: 'frontend', argv: ['npm', 'run', 'test:agent-gates'] },
    ],
    focusedTests: [
      'npx vitest run --project unit <edited-test-file>',
      'npm run test:agent-gates',
    ],
    architectureGates: ['test:agent-gates if harness shared'],
    browserRequired: false,
    browserProfiles: [],
    notes: null,
  },
  {
    id: 'storybook-config',
    test: (p) => p.includes('.storybook') || p.endsWith('.stories.tsx') || p.endsWith('.stories.ts'),
    owner: 'ui',
    zone: 'storybook',
    publicEntrypoint: 'npm run storybook',
    stateOwner: 'none',
    focusedProof: [
      { cwd: 'frontend', argv: ['npm', 'run', 'storybook:coverage:strict'] },
      { cwd: 'frontend', argv: ['npm', 'run', 'build-storybook'] },
    ],
    focusedTests: ['npm run storybook:coverage:strict', 'npm run build-storybook'],
    architectureGates: ['test:agent-gates'],
    browserRequired: false,
    browserProfiles: [],
    notes: 'Stories only under ui-kit glob unless main.ts expanded.',
  },
  {
    id: 'frontend-tooling',
    test: (p) =>
      p === 'package.json'
      || p === 'package-lock.json'
      || p === 'eslint.config.js'
      || p === 'vite.config.ts'
      || p.startsWith('tsconfig')
      || p.startsWith(`scripts${sep}`),
    owner: 'tooling',
    zone: 'frontend-tooling',
    publicEntrypoint: 'frontend package / Vite / Vitest / agent scripts',
    stateOwner: 'toolchain',
    focusedProof: [
      { cwd: 'frontend', argv: ['npm', 'run', 'test:agent-gates'] },
    ],
    focusedTests: ['npm run test:agent-gates'],
    architectureGates: ['test:agent-gates'],
    browserRequired: false,
    browserProfiles: [],
    notes: 'Config, dependencies and test orchestration require expanded owner proof.',
  },
];

const DEFAULT_PROOF_LEVEL_BY_RULE_ID = new Map([
  ['ui-kit', 'owner'],
  ['feedback', 'owner'],
  ['heat-pages', 'owner'],
  ['electrical', 'owner'],
  ['specification', 'owner'],
  ['reports', 'owner'],
  ['admin', 'owner'],
  ['auth-shell', 'owner'],
  ['projects', 'owner'],
  ['common-shared-components', 'owner'],
  ['hooks', 'scoped'],
  ['config-constants-store', 'owner'],
  ['styles', 'owner'],
  ['api-shared', 'owner'],
  ['types-utils-domain', 'scoped'],
  ['test-harness', 'owner'],
  ['tests', 'scoped'],
  ['storybook-config', 'owner'],
  ['frontend-tooling', 'owner'],
]);

function defaultProofLevel(rule) {
  const level = DEFAULT_PROOF_LEVEL_BY_RULE_ID.get(rule.id);
  if (!PROOF_LEVELS.has(level)) {
    throw new Error(`agent:scope proof level missing for rule: ${rule.id}`);
  }
  return level;
}

function fail(message, code = 1) {
  if (asJson) {
    console.log(JSON.stringify({ ok: false, error: message }, null, 2));
  } else {
    console.error(`agent:scope: ${message}`);
  }
  process.exit(code);
}

function resolveInputPath(raw) {
  if (!raw) fail('usage: agent:scope <path> [--json]');
  let candidate = raw;
  if (!existsSync(candidate)) {
    const fromRoot = join(ROOT, raw);
    const fromFrontend = join(FRONTEND, raw);
    const fromSrc = join(SRC, raw);
    if (existsSync(fromRoot)) candidate = fromRoot;
    else if (existsSync(fromFrontend)) candidate = fromFrontend;
    else if (existsSync(fromSrc)) candidate = fromSrc;
    else fail(`path not found: ${raw}`);
  }
  const abs = resolve(candidate);
  if (!abs.startsWith(FRONTEND + sep) && abs !== FRONTEND) {
    // allow repo-root scripts references only if under frontend
    if (!abs.includes(`${sep}frontend${sep}`) && !abs.endsWith(`${sep}frontend`)) {
      fail(`not a frontend path: ${raw} (expected under frontend/)`);
    }
  }
  return abs;
}

function toSrcRelative(abs) {
  const norm = normalize(abs);
  if (norm.startsWith(SRC + sep)) {
    return relative(SRC, norm);
  }
  if (norm.includes(`${sep}.storybook${sep}`) || norm.endsWith(`${sep}.storybook`)) {
    return relative(FRONTEND, norm);
  }
  if (norm.startsWith(FRONTEND + sep)) {
    return relative(FRONTEND, norm);
  }
  return relative(ROOT, norm);
}

function matchRules(relFromSrc) {
  const hits = RULES.filter((rule) => rule.test(relFromSrc));
  return hits;
}

/** Resolve hits to a single owner rule or classify failure. */
function resolveOwnerHits(hits) {
  if (hits.length === 0) return { status: 'unowned', rule: null, owners: [] };
  const owners = [...new Set(hits.map((h) => h.owner))];
  if (owners.length > 1) {
    return { status: 'ambiguous', rule: null, owners, hits };
  }
  // Same owner, multiple rules: prefer first (most specific by RULES order).
  return { status: 'ok', rule: hits[0], owners, hits };
}

/**
 * Full production coverage under frontend/src (excl. tests).
 * Fail classes: unowned (0 rules) and multi-owner (different owners).
 */
function listCoverageInventory() {
  const unowned = [];
  const multiOwner = [];
  function walk(dir) {
    for (const name of readdirSync(dir)) {
      if (['__tests__', 'node_modules'].includes(name)) continue;
      const p = join(dir, name);
      const st = statSync(p);
      if (st.isDirectory()) walk(p);
      else if (['.ts', '.tsx', '.css'].includes(extname(name))) {
        if (name.includes('.test.') || name.includes('.spec.') || name.endsWith('.stories.tsx')) {
          continue;
        }
        const rel = relative(SRC, p);
        const hits = matchRules(rel);
        const resolved = resolveOwnerHits(hits);
        if (resolved.status === 'unowned') unowned.push(rel);
        if (resolved.status === 'ambiguous') {
          multiOwner.push({
            path: rel,
            owners: resolved.owners,
            rules: hits.map((h) => `${h.id}(${h.owner})`),
          });
        }
      }
    }
  }
  if (existsSync(SRC)) walk(SRC);
  return { unowned, multiOwner };
}

function testProjectForPath(relFromSrc) {
  if (relFromSrc.startsWith(`__tests__${sep}integration${sep}pages${sep}electrical${sep}`)) {
    return 'elec-integration';
  }
  if (relFromSrc.startsWith(`__tests__${sep}integration${sep}`)) return 'integration';
  return 'unit';
}

function focusedProofForPath(rule, relFromSrc) {
  if (rule.id !== 'tests') return rule.focusedProof ?? [];
  const testTarget = join('src', relFromSrc);
  return [
    {
      cwd: 'frontend',
      argv: ['npx', 'vitest', 'run', '--project', testProjectForPath(relFromSrc), testTarget],
    },
    { cwd: 'frontend', argv: ['npm', 'run', 'test:agent-gates'] },
  ];
}

/** Build copy-paste command lines from focusedProof / focusedTests without mangling globs. */
function buildRecommendedCommands(rule, relFromSrc = '') {
  const cmds = [];
  const focusedProof = focusedProofForPath(rule, relFromSrc);
  if (Array.isArray(focusedProof) && focusedProof.length > 0) {
    for (const step of focusedProof) {
      if (!step || !Array.isArray(step.argv) || step.argv.length === 0) continue;
      const line = step.argv.join(' ');
      // Gates are appended once after focused proof.
      if (line === 'npm run test:agent-gates') continue;
      const cwd = step.cwd === 'frontend' || !step.cwd ? 'frontend' : step.cwd;
      cmds.push(`cd ${cwd} && ${line}`);
    }
  } else if (Array.isArray(rule.focusedTests) && rule.focusedTests.length > 0) {
    for (const first of rule.focusedTests) {
      if (typeof first !== 'string') continue;
      if (first.startsWith('npm ') || first.startsWith('npx ')) {
        cmds.push(first.startsWith('cd ') ? first : `cd frontend && ${first}`);
      } else if (first.startsWith('src/')) {
        // Concrete path only — never strip **; refuse globs
        if (first.includes('*')) {
          cmds.push(
            `# FIX scope rule focusedTests: replace glob with exact path(s): ${first}`,
          );
        } else {
          cmds.push(`cd frontend && npx vitest run --project unit --project integration ${first}`);
        }
      }
    }
  }
  cmds.push('cd frontend && npm run test:agent-gates');
  if (rule.browserRequired) {
    cmds.push(
      `browser proof: ${BROWSER_PROFILES.join(', ')} (see docs/frontend/viewport-policy.md)`,
    );
  }
  return cmds;
}

function proofCwd(cwd) {
  if (!cwd || cwd === 'frontend') return FRONTEND;
  if (cwd === 'e2e') return join(ROOT, 'e2e');
  return null;
}

function pathOrPrefixExists(base, target) {
  const absolute = join(base, target);
  if (existsSync(absolute)) return true;
  const parent = dirname(absolute);
  const prefix = absolute.slice(parent.length + 1);
  if (!existsSync(parent) || !statSync(parent).isDirectory()) return false;
  return readdirSync(parent).some((name) => name.startsWith(prefix));
}

/** Validate focused proof as argv, npm scripts and concrete Vitest paths. */
function validateFocusedProof(rule) {
  const issues = [];
  if (!Array.isArray(rule.focusedProof) || rule.focusedProof.length === 0) {
    return [`${rule.id}: focusedProof is missing`];
  }
  for (const [index, step] of rule.focusedProof.entries()) {
    const label = `${rule.id}.focusedProof[${index}]`;
    const cwd = proofCwd(step?.cwd);
    if (!cwd) {
      issues.push(`${label}: unsupported cwd=${String(step?.cwd)}`);
      continue;
    }
    const argv = step?.argv;
    if (!Array.isArray(argv) || argv.length < 3 || argv.some((arg) => typeof arg !== 'string' || arg.trim() === '')) {
      issues.push(`${label}: argv must contain non-empty strings`);
      continue;
    }
    if (argv.some((arg) => /[<>*]|\b(path-matched|prefer)\b/i.test(arg))) {
      issues.push(`${label}: argv contains prose, placeholder or glob: ${argv.join(' ')}`);
      continue;
    }
    if (argv[0] === 'npm' && argv[1] === 'run') {
      const packagePath = join(cwd, 'package.json');
      if (!existsSync(packagePath)) {
        issues.push(`${label}: package.json missing in ${step.cwd}`);
        continue;
      }
      const scripts = JSON.parse(readFileSync(packagePath, 'utf8')).scripts ?? {};
      if (!Object.hasOwn(scripts, argv[2])) {
        issues.push(`${label}: npm script does not exist: ${argv[2]}`);
      }
      continue;
    }
    if (argv[0] === 'npx' && argv[1] === 'vitest' && argv[2] === 'run') {
      const valueOptions = new Set(['--project', '--maxWorkers', '--pool']);
      for (let i = 3; i < argv.length; i += 1) {
        const arg = argv[i];
        if (valueOptions.has(arg)) {
          i += 1;
          continue;
        }
        if (arg.startsWith('--')) continue;
        if (!pathOrPrefixExists(cwd, arg)) {
          issues.push(`${label}: Vitest target does not exist: ${arg}`);
        }
      }
      continue;
    }
    issues.push(`${label}: unsupported command: ${argv.join(' ')}`);
  }
  return issues;
}

function validateProofCatalog() {
  const issues = RULES.flatMap(validateFocusedProof);
  for (const rule of RULES) {
    if (!DEFAULT_PROOF_LEVEL_BY_RULE_ID.has(rule.id)) {
      issues.push(`${rule.id}: default proof level is missing`);
    }
  }
  return issues;
}

function runProofSmoke() {
  const issues = validateProofCatalog();
  if (issues.length > 0) return { ok: false, results: [], issues };
  const seen = new Set();
  const steps = RULES.flatMap((rule) =>
    rule.focusedProof.map((step) => ({ ruleId: rule.id, ...step })));
  const unique = steps.filter((step) => {
    const key = JSON.stringify([step.cwd, step.argv]);
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
  const results = [];
  for (const step of unique) {
    const cwd = proofCwd(step.cwd);
    const started = Date.now();
    const result = spawnSync(step.argv[0], step.argv.slice(1), {
      cwd,
      env: process.env,
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'pipe'],
      timeout: 180_000,
    });
    const entry = {
      ruleId: step.ruleId,
      cwd: step.cwd,
      argv: step.argv,
      exitCode: result.status,
      signal: result.signal,
      wallMs: Date.now() - started,
    };
    results.push(entry);
    if (result.status !== 0) {
      issues.push(
        `${step.ruleId}: command failed exit=${String(result.status)} signal=${String(result.signal)}: ${step.argv.join(' ')}\n${result.stderr || result.stdout}`,
      );
      break;
    }
  }
  return { ok: issues.length === 0, results, issues };
}

function selfTest() {
  const cases = [
    ['frontend/src/components/ui-kit/UiPrimitives.tsx', 'ui'],
    ['frontend/src/components/form-controls/TltSelect.tsx', 'ui'],
    ['frontend/src/pages/heatcalc/useHeatCalcPreferences.ts', 'heat'],
    ['frontend/src/hooks/useHeatCalcNormalGlideController.ts', 'heat'],
    ['frontend/src/utils/heatCalcPageUtils.ts', 'heat'],
    ['frontend/src/pages/electrical/useElecCalcColumnPersistence.ts', 'electrical'],
    ['frontend/src/pages/specification/useSpecificationPageModel.ts', 'specification'],
    ['frontend/src/pages/ReportWizardPage.tsx', 'reports'],
    ['frontend/src/api/calculations.ts', 'shared'],
    ['frontend/src/styles/tokens.css', 'css'],
    ['frontend/src/__tests__/unit/architecture/featureBoundaries.architecture.test.ts', 'qa'],
    ['frontend/src/feedback/appFeedback.ts', 'shared'],
    ['frontend/eslint.config.js', 'tooling'],
    ['frontend/vite.config.ts', 'tooling'],
  ];
  let failed = 0;
  for (const [path, owner] of cases) {
    const abs = resolveInputPath(path);
    if (!existsSync(abs)) {
      console.error(`FAIL ${path}: path not found`);
      failed += 1;
      continue;
    }
    const rel = toSrcRelative(abs);
    const hits = matchRules(rel);
    const resolved = resolveOwnerHits(hits);
    if (resolved.status !== 'ok' || resolved.rule?.owner !== owner) {
      console.error(
        `FAIL ${path}: expected unique owner=${owner} got status=${resolved.status} owners=${resolved.owners.join(',')} rules=${hits.map((h) => h.id).join(',')}`,
      );
      failed += 1;
    } else {
      console.log(`ok ${path} → ${owner} (unique)`);
    }
  }
  const unknownHits = matchRules('does-not-exist-xyz.ts');
  if (unknownHits.length !== 0) {
    console.error('FAIL unknown relative should have no rules');
    failed += 1;
  } else {
    console.log('ok unknown relative → no rules');
  }
  // Spec focused proof must not contain stripped-glob garbage
  const specAbs = resolveInputPath('frontend/src/pages/specification/useSpecificationPageModel.ts');
  const specRel = toSrcRelative(specAbs);
  const specRule = resolveOwnerHits(matchRules(specRel)).rule;
  const cmds = buildRecommendedCommands(specRule, specRel);
  if (cmds.some((c) => c.includes('src/__tests__//') || c.includes('**'))) {
    console.error('FAIL specification recommended_commands still contain broken globs:', cmds);
    failed += 1;
  } else {
    console.log('ok specification recommended_commands clean');
  }
  const proofIssues = validateProofCatalog();
  if (proofIssues.length > 0) {
    console.error('FAIL focused proof catalog:', proofIssues);
    failed += 1;
  } else {
    console.log(`ok focused proof catalog: ${RULES.length}/${RULES.length} rules`);
  }
  const heatRule = resolveOwnerHits(matchRules('pages/heatcalc/useHeatCalcPreferences.ts')).rule;
  const toolingRule = resolveOwnerHits(matchRules('vite.config.ts')).rule;
  if (defaultProofLevel(heatRule) !== 'owner' || defaultProofLevel(toolingRule) !== 'owner') {
    console.error('FAIL default proof levels: expected heat=owner tooling=owner');
    failed += 1;
  } else {
    console.log('ok default proof levels: heat=owner tooling=owner');
  }
  const toolingCommands = buildRecommendedCommands(toolingRule, 'vite.config.ts');
  if (toolingCommands.some((command) => command.includes('test:agent-dod'))) {
    console.error('FAIL full DoD must never be recommended without an explicit user request:', toolingCommands);
    failed += 1;
  } else {
    console.log('ok full DoD is never recommended implicitly');
  }
  const exactTestPath = `__tests__${sep}unit${sep}utils${sep}formatters.test.ts`;
  const testsRule = resolveOwnerHits(matchRules(exactTestPath)).rule;
  const testCommands = buildRecommendedCommands(testsRule, exactTestPath);
  if (!testCommands.some((command) => command.includes(join('src', exactTestPath)) && !command.includes('<'))) {
    console.error('FAIL edited test path did not produce exact focused command:', testCommands);
    failed += 1;
  } else {
    console.log('ok edited test path produces exact focused command');
  }
  const intentionalFailure = validateFocusedProof({
    id: 'intentional-bad-proof',
    focusedProof: [
      { cwd: 'frontend', argv: ['npm', 'run', 'does-not-exist'] },
      { cwd: 'frontend', argv: ['npx', 'vitest', 'run', 'path-matched <test>'] },
    ],
  });
  if (intentionalFailure.length !== 2) {
    console.error('FAIL proof validator did not reject intentional bad commands:', intentionalFailure);
    failed += 1;
  } else {
    console.log('ok focused proof validator fails closed');
  }
  process.exit(failed === 0 ? 0 : 1);
}

function main() {
  if (args[0] === '--self-test') {
    selfTest();
    return;
  }
  if (args[0] === '--coverage') {
    const { unowned, multiOwner } = listCoverageInventory();
    const ok = unowned.length === 0 && multiOwner.length === 0;
    const report = {
      ok,
      unownedCount: unowned.length,
      multiOwnerCount: multiOwner.length,
      unownedSample: unowned.slice(0, 40),
      multiOwnerSample: multiOwner.slice(0, 40),
    };
    if (asJson) console.log(JSON.stringify(report, null, 2));
    else {
      console.log(`unowned production files: ${unowned.length}`);
      for (const u of unowned.slice(0, 40)) console.log(`  - ${u}`);
      if (unowned.length > 40) console.log(`  … +${unowned.length - 40} more`);
      console.log(`multi-owner production files: ${multiOwner.length}`);
      for (const m of multiOwner.slice(0, 40)) {
        console.log(`  - ${m.path} → [${m.owners.join(', ')}] rules=${m.rules.join('|')}`);
      }
      if (multiOwner.length > 40) console.log(`  … +${multiOwner.length - 40} more`);
      console.log(ok ? 'coverage: PASS (unique owner for every production file)' : 'coverage: FAIL');
    }
    process.exit(ok ? 0 : 1);
  }
  if (args[0] === '--proof-check') {
    const issues = validateProofCatalog();
    const report = {
      ok: issues.length === 0,
      ruleCount: RULES.length,
      issueCount: issues.length,
      issues,
    };
    if (asJson) console.log(JSON.stringify(report, null, 2));
    else {
      console.log(`focused proof rules: ${RULES.length}`);
      console.log(`focused proof issues: ${issues.length}`);
      for (const issue of issues) console.log(`  - ${issue}`);
      console.log(report.ok ? 'proof-check: PASS' : 'proof-check: FAIL');
    }
    process.exit(report.ok ? 0 : 1);
  }
  if (args[0] === '--proof-smoke') {
    const report = runProofSmoke();
    if (asJson) console.log(JSON.stringify(report, null, 2));
    else {
      for (const result of report.results) {
        console.log(
          `${result.exitCode === 0 ? 'PASS' : 'FAIL'} ${result.ruleId}: ${result.argv.join(' ')} (${(result.wallMs / 1000).toFixed(2)}s)`,
        );
      }
      for (const issue of report.issues) console.error(issue);
      console.log(report.ok ? 'proof-smoke: PASS' : 'proof-smoke: FAIL');
    }
    process.exit(report.ok ? 0 : 1);
  }

  const abs = resolveInputPath(input);
  const rel = toSrcRelative(abs);
  const hits = matchRules(rel);
  const resolved = resolveOwnerHits(hits);

  if (resolved.status === 'unowned') {
    fail(`unknown path (no owner rule): ${rel}\nAdd a path rule in scripts/agent-scope.mjs or pass a frontend src path.`);
  }
  if (resolved.status === 'ambiguous') {
    fail(
      `ambiguous path: ${rel}\nmatches: ${hits.map((h) => `${h.id}(${h.owner})`).join(', ')}\nFix rule order/specificity in scripts/agent-scope.mjs`,
    );
  }

  const rule = resolved.rule;
  const proofLevel = defaultProofLevel(rule);
  const resolvedFocusedProof = focusedProofForPath(rule, rel);
  const recommendedCommands = buildRecommendedCommands(rule, rel);

  const result = {
    ok: true,
    path: rel,
    absolute: abs,
    owner: rule.owner,
    zone: rule.zone,
    public_entrypoint: rule.publicEntrypoint,
    state_owner: rule.stateOwner,
    focused_tests: resolvedFocusedProof.map((step) => step.argv.join(' ')),
    focused_proof: resolvedFocusedProof,
    architecture_gates: rule.architectureGates,
    proof_contract_priority: 'explicit user contract; otherwise agent-selected risk-based proof',
    default_proof_level: proofLevel,
    full_dod_required: false,
    full_dod_reason: 'local full DoD runs only on explicit user request',
    browser_profiles: rule.browserRequired ? rule.browserProfiles : [],
    browser_required: rule.browserRequired,
    recommended_commands: recommendedCommands,
    source_rules: [
      'frontend/AGENTS.md',
      'docs/frontend/agent-development-standard.md',
      'docs/frontend/pr-budget.md',
      'docs/frontend/viewport-policy.md',
      'docs/frontend/state-ownership-map.md',
      'docs/frontend/ant-ui-kit-strategy.md',
    ],
    notes: rule.notes,
    rule_id: rule.id,
  };

  if (asJson) {
    console.log(JSON.stringify(result, null, 2));
  } else {
    console.log(`path:                 ${result.path}`);
    console.log(`owner:                ${result.owner}`);
    console.log(`zone:                 ${result.zone}`);
    console.log(`public_entrypoint:    ${result.public_entrypoint}`);
    console.log(`state_owner:          ${result.state_owner}`);
    console.log(`focused_tests:        ${result.focused_tests.join(' | ')}`);
    console.log(`architecture_gates:   ${result.architecture_gates.join(', ')}`);
    console.log(`proof_contract:       ${result.proof_contract_priority}`);
    console.log(`default_proof_level:  ${result.default_proof_level}`);
    console.log(`full_dod_required:    ${result.full_dod_required}`);
    console.log(`full_dod_reason:      ${result.full_dod_reason ?? '(none)'}`);
    console.log(`browser_required:     ${result.browser_required}`);
    console.log(`browser_profiles:     ${result.browser_profiles.join(', ') || '(none)'}`);
    console.log(`recommended_commands:`);
    for (const cmd of result.recommended_commands) {
      console.log(`  - ${cmd}`);
    }
    console.log(`source_rules:         ${result.source_rules.join(', ')}`);
    if (result.notes) console.log(`notes:                ${result.notes}`);
  }
}

main();
