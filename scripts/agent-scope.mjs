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
      p.startsWith(`pages/heatcalc${sep}`)
      || p.startsWith(`components/heatcalc${sep}`)
      || p.startsWith(`components/wizard${sep}`)
      || p.startsWith(`hooks/useHeat`)
      || p.startsWith(`hooks/heatCalc`)
      || p.startsWith(`domain/heat`)
      || p.includes(`${sep}heatCalc`)
      || p.startsWith(`utils/heatCalc`),
    owner: 'heat',
    zone: 'heat-calc',
    publicEntrypoint: 'pages/heatcalc + workspace route /workspace/heat-calc',
    stateOwner: 'heatcalc page models / react-query + project store',
    focusedTests: [
      'npx vitest run --project unit --project integration src/__tests__ -t heat',
      'prefer path-matched unit under src/__tests__/unit/pages/heatcalc or components/heatcalc',
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
      p.startsWith(`pages/electrical${sep}`)
      || p.startsWith(`components/electrical${sep}`)
      || p.startsWith(`domain/electrical${sep}`)
      || p.startsWith(`utils/electrical`)
      || p.startsWith(`api/electrical`),
    owner: 'electrical',
    zone: 'elec-calc',
    publicEntrypoint: 'pages/electrical + /workspace/elec-calc',
    stateOwner: 'elec page models / electrical variants API',
    focusedTests: [
      'prefer src/__tests__/unit/pages/electrical/** and integration electrical specs',
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
      || p.startsWith(`components/specification${sep}`)
      || p.startsWith(`api/specification`)
      || p.includes('specification'),
    owner: 'specification',
    zone: 'specification',
    publicEntrypoint: 'pages/specification + /workspace/specification',
    stateOwner: 'specification page model',
    focusedTests: ['src/__tests__/**/specification*'],
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
      || p.startsWith(`components/reports${sep}`)
      || p.startsWith(`api/reports`)
      || p.includes('report'),
    owner: 'reports',
    zone: 'reports',
    publicEntrypoint: 'ReportWizardPage / ReportPage',
    stateOwner: 'report export flow',
    focusedTests: [
      'src/__tests__/integration/pages/ReportWizardPage.test.tsx',
      'src/__tests__/unit/components/reports/**',
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
    focusedTests: ['src/__tests__/**/admin*'],
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
      || p === 'pages/ElecCalcPage.tsx'
      || p === 'pages/HeatCalcPage.tsx'
      || p === 'pages/SpecificationPage.tsx',
    owner: 'auth',
    zone: 'shell',
    publicEntrypoint: 'App / routes / MainLayout',
    stateOwner: 'authStore + project selection',
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
      || p.startsWith(`api/projects`)
      || p === 'components/ExportObjectsButton.tsx'
      || p === 'components/ImportExcelButton.tsx'
      || p === 'components/WorkflowSteps.tsx',
    owner: 'projects',
    zone: 'projects',
    publicEntrypoint: 'ProjectsPage / WorkspacePage',
    stateOwner: 'project list mutations',
    focusedTests: ['src/__tests__/**/project*'],
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
    focusedTests: ['path-matched unit under src/__tests__/unit/components'],
    architectureGates: ['test:agent-gates'],
    fullDodRequired: false,
    browserRequired: false,
    browserProfiles: [],
    notes: null,
  },
  {
    id: 'hooks',
    test: (p) => p.startsWith(`hooks${sep}`),
    owner: 'shared',
    zone: 'hooks',
    publicEntrypoint: 'hooks/*',
    stateOwner: 'hook consumer',
    focusedTests: ['src/__tests__/unit/hooks/**'],
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
      || p.startsWith(`store${sep}`),
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
    test: (p) =>
      p.startsWith(`styles${sep}`)
      || p.endsWith('.css')
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
    test: (p) => p.startsWith(`api${sep}`),
    owner: 'shared',
    zone: 'api',
    publicEntrypoint: 'api/* (module nearest to path)',
    stateOwner: 'react-query keys in same module',
    focusedTests: ['src/__tests__/unit/api/**', 'integration that hits endpoints'],
    architectureGates: ['test:agent-gates'],
    fullDodRequired: true,
    browserRequired: false,
    browserProfiles: [],
    notes: null,
  },
  {
    id: 'types-utils-domain',
    test: (p) =>
      p.startsWith(`types${sep}`)
      || p.startsWith(`utils${sep}`)
      || p.startsWith(`domain${sep}`)
      || p.startsWith(`theme${sep}`),
    owner: 'shared',
    zone: 'shared-lib',
    publicEntrypoint: 'types|utils|domain|theme (path-local module)',
    stateOwner: 'none (pure) or documented store',
    focusedTests: ['path-matched unit tests under src/__tests__/unit'],
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
    focusedTests: ['run the edited test file itself'],
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

function listUnownedSample() {
  // Optional coverage check: production TS under src with no rule.
  const unowned = [];
  function walk(dir) {
    for (const name of readdirSync(dir)) {
      if (['__tests__', 'node_modules'].includes(name)) continue;
      const p = join(dir, name);
      const st = statSync(p);
      if (st.isDirectory()) walk(p);
      else if (['.ts', '.tsx', '.css'].includes(extname(name))) {
        const rel = relative(SRC, p);
        if (matchRules(rel).length === 0) unowned.push(rel);
      }
    }
  }
  if (existsSync(SRC)) walk(SRC);
  return unowned;
}

function selfTest() {
  const cases = [
    ['frontend/src/components/ui-kit/UiPrimitives.tsx', 'ui'],
    ['frontend/src/components/form-controls/TltSelect.tsx', 'ui'],
    ['frontend/src/pages/heatcalc/useHeatCalcPreferences.ts', 'heat'],
    ['frontend/src/pages/electrical/useElecCalcColumnPersistence.ts', 'electrical'],
    ['frontend/src/pages/specification/useSpecificationPageModel.ts', 'specification'],
    ['frontend/src/pages/ReportWizardPage.tsx', 'reports'],
    ['frontend/src/api/calculations.ts', 'shared'],
    ['frontend/src/styles/tokens.css', 'css'],
    ['frontend/src/__tests__/unit/architecture/featureBoundaries.architecture.test.ts', 'qa'],
    ['frontend/src/feedback/appFeedback.tsx', 'shared'],
  ];
  let failed = 0;
  for (const [path, owner] of cases) {
    const abs = resolveInputPath(path);
    const rel = toSrcRelative(abs);
    const hits = matchRules(rel);
    const got = hits[0]?.owner;
    if (got !== owner) {
      console.error(`FAIL ${path}: expected owner=${owner} got=${got} rules=${hits.map((h) => h.id).join(',')}`);
      failed += 1;
    } else {
      console.log(`ok ${path} → ${owner}`);
    }
  }
  // unknown relative: no rule match (missing file handled by CLI exit 1 separately)
  const unknownHits = matchRules('does-not-exist-xyz.ts');
  if (unknownHits.length !== 0) {
    console.error('FAIL unknown relative should have no rules');
    failed += 1;
  } else {
    console.log('ok unknown relative → no rules');
  }
  process.exit(failed === 0 ? 0 : 1);
}

function main() {
  if (args[0] === '--self-test') {
    selfTest();
    return;
  }
  if (args[0] === '--coverage') {
    const unowned = listUnownedSample();
    const report = {
      ok: unowned.length === 0,
      unownedCount: unowned.length,
      unownedSample: unowned.slice(0, 40),
    };
    if (asJson) console.log(JSON.stringify(report, null, 2));
    else {
      console.log(`unowned production files: ${unowned.length}`);
      for (const u of unowned.slice(0, 40)) console.log(`  - ${u}`);
      if (unowned.length > 40) console.log(`  … +${unowned.length - 40} more`);
    }
    process.exit(unowned.length === 0 ? 0 : 1);
  }

  const abs = resolveInputPath(input);
  const rel = toSrcRelative(abs);
  const hits = matchRules(rel);

  if (hits.length === 0) {
    fail(`unknown path (no owner rule): ${rel}\nAdd a path rule in scripts/agent-scope.mjs or pass a frontend src path.`);
  }
  if (hits.length > 1) {
    // Prefer first-defined more specific; but surface ambiguity if two different owners
    const owners = [...new Set(hits.map((h) => h.owner))];
    if (owners.length > 1) {
      fail(
        `ambiguous path: ${rel}\nmatches: ${hits.map((h) => `${h.id}(${h.owner})`).join(', ')}\nFix rule order/specificity in scripts/agent-scope.mjs`,
      );
    }
  }

  const rule = hits[0];
  /** One-line copy-paste proof sequence for agents. */
  const recommendedCommands = [];
  recommendedCommands.push('cd frontend && npm run test:agent-gates');
  if (Array.isArray(rule.focusedTests) && rule.focusedTests.length > 0) {
    const first = rule.focusedTests[0];
    if (first.startsWith('npm ') || first.startsWith('npx ')) {
      recommendedCommands.push(first.startsWith('cd ') ? first : `cd frontend && ${first}`);
    } else {
      recommendedCommands.push(
        `cd frontend && npx vitest run ${first.replace(/\*\*/g, '').slice(0, 80)} --project unit --project integration`,
      );
    }
  }
  if (rule.fullDodRequired) {
    recommendedCommands.push('cd frontend && npm run test:agent-dod:dual-safe');
  }
  if (rule.browserRequired) {
    recommendedCommands.push(
      `browser proof: ${BROWSER_PROFILES.join(', ')} (see docs/frontend/viewport-policy.md)`,
    );
  }

  const result = {
    ok: true,
    path: rel,
    absolute: abs,
    owner: rule.owner,
    zone: rule.zone,
    public_entrypoint: rule.publicEntrypoint,
    state_owner: rule.stateOwner,
    focused_tests: rule.focusedTests,
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
