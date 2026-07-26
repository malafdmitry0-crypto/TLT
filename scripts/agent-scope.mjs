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

/**
 * Ordered path rules (first match wins). More specific prefixes first.
 * Each rule: { id, test(relFromSrc), owner, zone, publicEntrypoint, stateOwner,
 *   focusedTests, architectureGates, fullDodRequired, browserRequired, notes }
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
    fullDodRequired: false,
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
    fullDodRequired: true,
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
    fullDodRequired: true,
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
    fullDodRequired: true,
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
    fullDodRequired: true,
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
      { cwd: 'frontend', argv: ['npx', 'vitest', 'run', '--project', 'unit', '--project', 'integration', 'src/__tests__/integration/pages/ReportWizardPage.test.tsx', 'src/__tests__/unit/components/reports', 'src/__tests__/unit/pages/ReportPage'] },
      { cwd: 'frontend', argv: ['npm', 'run', 'test:agent-gates'] },
    ],
    focusedTests: [
      'npx vitest run --project unit --project integration src/__tests__/integration/pages/ReportWizardPage.test.tsx src/__tests__/unit/components/reports',
      'npm run test:agent-gates',
    ],
    architectureGates: ['test:agent-gates'],
    fullDodRequired: true,
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
      { cwd: 'frontend', argv: ['npx', 'vitest', 'run', '--project', 'unit', 'src/__tests__/unit/pages/admin', 'src/__tests__/unit/components/admin'] },
      { cwd: 'frontend', argv: ['npm', 'run', 'test:agent-gates'] },
    ],
    focusedTests: [
      'npx vitest run --project unit src/__tests__/unit/pages/admin src/__tests__/unit/components/admin',
      'npm run test:agent-gates',
    ],
    architectureGates: ['test:agent-gates'],
    fullDodRequired: true,
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
    fullDodRequired: true,
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
      { cwd: 'frontend', argv: ['npx', 'vitest', 'run', '--project', 'unit', 'src/__tests__/unit/pages/ProjectsPage', 'src/__tests__/unit/pages/projects'] },
      { cwd: 'frontend', argv: ['npm', 'run', 'test:agent-gates'] },
    ],
    focusedTests: [
      'npx vitest run --project unit src/__tests__/unit/pages/ProjectsPage src/__tests__/unit/pages/projects',
      'npm run test:agent-gates',
    ],
    architectureGates: ['test:agent-gates'],
    fullDodRequired: true,
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
    fullDodRequired: false,
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
    fullDodRequired: false,
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
    focusedTests: ['npm run test:agent-gates'],
    architectureGates: ['test:agent-gates'],
    fullDodRequired: false,
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
    focusedTests: ['npm run css:architecture'],
    architectureGates: ['cssArchitectureRatchet', 'cssImportantRatchet'],
    fullDodRequired: false,
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
    fullDodRequired: true,
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
      { cwd: 'frontend', argv: ['npx', 'vitest', 'run', '--project', 'unit', 'src/__tests__/unit/utils', 'src/__tests__/unit/domain', 'src/__tests__/unit/types'] },
    ],
    focusedTests: [
      'npx vitest run --project unit src/__tests__/unit/utils src/__tests__/unit/domain',
    ],
    architectureGates: ['test:agent-gates'],
    fullDodRequired: false,
    browserRequired: false,
    browserProfiles: [],
    notes: 'full_dod if consumers runtime behaviour changes.',
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
    fullDodRequired: false,
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
    focusedTests: ['npm run storybook:coverage:strict', 'npm run build-storybook'],
    architectureGates: ['test:agent-gates'],
    fullDodRequired: false,
    browserRequired: false,
    browserProfiles: [],
    notes: 'Stories only under ui-kit glob unless main.ts expanded.',
  },
];

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

/** Build copy-paste command lines from focusedProof / focusedTests without mangling globs. */
function buildRecommendedCommands(rule) {
  const cmds = [];
  cmds.push('cd frontend && npm run test:agent-gates');
  if (Array.isArray(rule.focusedProof) && rule.focusedProof.length > 0) {
    for (const step of rule.focusedProof) {
      if (!step || !Array.isArray(step.argv) || step.argv.length === 0) continue;
      // Skip duplicate agent-gates if already first
      const line = step.argv.join(' ');
      if (line === 'npm run test:agent-gates' && cmds[0].endsWith('test:agent-gates')) continue;
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
  if (rule.fullDodRequired) {
    cmds.push('cd frontend && npm run test:agent-dod:dual-safe');
  }
  if (rule.browserRequired) {
    cmds.push(
      `browser proof: ${BROWSER_PROFILES.join(', ')} (see docs/frontend/viewport-policy.md)`,
    );
  }
  return cmds;
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
  const cmds = buildRecommendedCommands(specRule);
  if (cmds.some((c) => c.includes('src/__tests__//') || c.includes('**'))) {
    console.error('FAIL specification recommended_commands still contain broken globs:', cmds);
    failed += 1;
  } else {
    console.log('ok specification recommended_commands clean');
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
  const recommendedCommands = buildRecommendedCommands(rule);

  const result = {
    ok: true,
    path: rel,
    absolute: abs,
    owner: rule.owner,
    zone: rule.zone,
    public_entrypoint: rule.publicEntrypoint,
    state_owner: rule.stateOwner,
    focused_tests: rule.focusedTests,
    focused_proof: rule.focusedProof ?? null,
    architecture_gates: rule.architectureGates,
    full_dod_required: rule.fullDodRequired,
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
    console.log(`full_dod_required:    ${result.full_dod_required}`);
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
