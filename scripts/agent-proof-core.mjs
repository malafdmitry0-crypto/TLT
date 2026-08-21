import { createHash, createHmac, timingSafeEqual } from 'node:crypto';
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { basename, dirname, join, normalize, relative, sep } from 'node:path';
import { spawnSync } from 'node:child_process';

const FRONTEND_PREFIX = `frontend${sep}`;
const GATE = { cwd: 'frontend', argv: ['npm', 'run', 'test:agent-gates'] };

export const CONSUMER_RULES = [
  {
    id: 'shared-api',
    test: (path) => /^frontend\/src\/api\/(?!electrical|projects|reports|specification)/.test(path),
    consumers: ['heat', 'electrical', 'specification', 'reports', 'projects'],
    representatives: [
      'frontend/src/pages/heatcalc/useHeatCalcPreferences.ts',
      'frontend/src/pages/electrical/useElecCalcColumnPersistence.ts',
      'frontend/src/pages/specification/useSpecificationPageModel.ts',
      'frontend/src/pages/ReportWizardPage.tsx',
      'frontend/src/pages/ProjectsPage.tsx',
    ],
    reason: 'shared API contract affects multiple feature consumers',
  },
  {
    id: 'auth-session',
    test: (path) =>
      /^frontend\/src\/(?:store\/auth|api\/auth|api\/client|pages\/Login|pages\/Home)/.test(path),
    consumers: ['auth', 'projects', 'heat', 'electrical', 'specification', 'reports'],
    representatives: [
      'frontend/src/pages/HomePage.tsx',
      'frontend/src/pages/ProjectsPage.tsx',
      'frontend/src/pages/heatcalc/useHeatCalcPreferences.ts',
      'frontend/src/pages/electrical/useElecCalcColumnPersistence.ts',
      'frontend/src/pages/specification/useSpecificationPageModel.ts',
      'frontend/src/pages/ReportWizardPage.tsx',
    ],
    reason: 'auth/session boundary is shared by all workspace features',
  },
  {
    id: 'routing',
    test: (path) =>
      /^frontend\/src\/(?:App\.tsx|main\.tsx|routes(?:\.tsx|\/))/.test(path),
    consumers: ['auth', 'projects', 'heat', 'electrical', 'specification', 'reports'],
    representatives: [
      'frontend/src/pages/HomePage.tsx',
      'frontend/src/pages/ProjectsPage.tsx',
      'frontend/src/pages/heatcalc/useHeatCalcPreferences.ts',
      'frontend/src/pages/electrical/useElecCalcColumnPersistence.ts',
      'frontend/src/pages/specification/useSpecificationPageModel.ts',
      'frontend/src/pages/ReportWizardPage.tsx',
    ],
    reason: 'routing change can alter reachability of every workspace owner',
  },
  {
    id: 'shared-state',
    test: (path) => /^frontend\/src\/store\/(?!auth)/.test(path),
    consumers: ['projects', 'heat', 'electrical', 'specification', 'reports'],
    representatives: [
      'frontend/src/pages/ProjectsPage.tsx',
      'frontend/src/pages/heatcalc/useHeatCalcPreferences.ts',
      'frontend/src/pages/electrical/useElecCalcColumnPersistence.ts',
      'frontend/src/pages/specification/useSpecificationPageModel.ts',
      'frontend/src/pages/ReportWizardPage.tsx',
    ],
    reason: 'shared state contract affects multiple feature owners',
  },
  {
    id: 'feedback-boundary',
    test: (path) => /^frontend\/src\/feedback\//.test(path),
    consumers: ['auth', 'projects', 'heat', 'electrical', 'specification', 'reports'],
    representatives: [
      'frontend/src/pages/HomePage.tsx',
      'frontend/src/pages/ProjectsPage.tsx',
      'frontend/src/pages/heatcalc/useHeatCalcPreferences.ts',
      'frontend/src/pages/electrical/useElecCalcColumnPersistence.ts',
      'frontend/src/pages/specification/useSpecificationPageModel.ts',
      'frontend/src/pages/ReportWizardPage.tsx',
    ],
    reason: 'feedback boundary is consumed across feature owners',
  },
  {
    id: 'test-harness',
    test: (path) =>
      path === 'frontend/src/__tests__/setup.ts'
      || /^frontend\/src\/__tests__\/.*(?:testEnv|test-utils|test-mocks|Harness)\.[^.]+$/i.test(path),
    consumers: ['unit', 'integration', 'elec-integration'],
    commands: [
      GATE,
      { cwd: 'frontend', argv: ['npm', 'run', 'test:integration'] },
    ],
    reason: 'shared test harness affects multiple Vitest projects',
  },
  {
    id: 'frontend-toolchain',
    test: (path) =>
      /^frontend\/(?:package(?:-lock)?\.json|vite\.config\.ts|eslint\.config\.js|tsconfig[^/]*|scripts\/)/.test(path)
      || /^scripts\/agent-(?:scope|proof).*\.mjs$/.test(path),
    consumers: ['typecheck', 'lint', 'unit', 'integration', 'build'],
    commands: [GATE],
    reason: 'frontend config/dependency/orchestrator is cross-cutting',
  },
  {
    id: 'ci-orchestration',
    test: (path) =>
      /^\.github\/workflows\//.test(path)
      || /^scripts\/(?:test|codex-functional-audit)\./.test(path),
    consumers: ['ci', 'unit', 'integration', 'build'],
    commands: [GATE],
    reason: 'CI/test orchestration controls multiple proof branches',
  },
];

export function normalizeRepoPath(path) {
  return normalize(path).split(sep).join('/').replace(/^\.\//, '');
}

export function isFrontendRelevant(path) {
  const normalized = normalizeRepoPath(path);
  return normalized === '.gitignore'
    || normalized.startsWith('frontend/')
    || normalized.startsWith('docs/frontend/')
    || normalized === 'AGENTS.md'
    || normalized.startsWith('.github/workflows/')
    || /^scripts\/agent-/.test(normalized)
    || /^scripts\/(?:test|codex-functional-audit)\./.test(normalized);
}

export function parseNameStatusZ(buffer) {
  const tokens = String(buffer).split('\0').filter(Boolean);
  const changes = [];
  for (let index = 0; index < tokens.length;) {
    const status = tokens[index++];
    if (/^[RC]/.test(status)) {
      const oldPath = tokens[index++];
      const path = tokens[index++];
      changes.push({ status: status[0], score: status.slice(1) || null, oldPath, path });
    } else {
      changes.push({ status: status[0], path: tokens[index++] });
    }
  }
  return changes;
}

export function mergeChanges(groups) {
  const merged = new Map();
  for (const group of groups) {
    for (const raw of group) {
      const change = {
        ...raw,
        path: normalizeRepoPath(raw.path),
        ...(raw.oldPath ? { oldPath: normalizeRepoPath(raw.oldPath) } : {}),
      };
      if (!isFrontendRelevant(change.path) && !isFrontendRelevant(change.oldPath ?? '')) continue;
      const key = change.path;
      const previous = merged.get(key);
      if (!previous || previous.status === 'M') merged.set(key, change);
    }
  }
  return [...merged.values()].sort((left, right) => left.path.localeCompare(right.path));
}

function git(root, argv, allowFailure = false) {
  const result = spawnSync('git', argv, {
    cwd: root,
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  if (result.status !== 0 && !allowFailure) {
    throw new Error(`git ${argv.join(' ')} failed: ${result.stderr.trim()}`);
  }
  return result.status === 0 ? result.stdout : '';
}

export function collectGitChanges(root, { base = null } = {}) {
  const groups = [];
  if (base) {
    groups.push(parseNameStatusZ(git(root, ['diff', '--name-status', '-z', '--find-renames', `${base}...HEAD`])));
  }
  groups.push(parseNameStatusZ(git(root, ['diff', '--name-status', '-z', '--find-renames', '--cached'])));
  groups.push(parseNameStatusZ(git(root, ['diff', '--name-status', '-z', '--find-renames'])));
  const untracked = git(root, ['ls-files', '--others', '--exclude-standard', '-z'])
    .split('\0')
    .filter(Boolean)
    .map((path) => ({ status: 'A', path }));
  groups.push(untracked);
  return mergeChanges(groups);
}

function scopeCommand(root, path) {
  const result = spawnSync(
    process.execPath,
    [join(root, 'scripts/agent-scope.mjs'), '--json', '--allow-missing', path],
    {
      cwd: root,
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'pipe'],
    },
  );
  if (result.status !== 0) {
    let detail = result.stderr.trim() || result.stdout.trim();
    try {
      detail = JSON.parse(result.stdout).error ?? detail;
    } catch {
      // Keep CLI output as the diagnostic.
    }
    return { ok: false, path, error: detail || `agent:scope exit ${String(result.status)}` };
  }
  return JSON.parse(result.stdout);
}

function specialScope(path) {
  if (/^docs\/frontend\//.test(path) || path === 'frontend/AGENTS.md' || path === 'AGENTS.md') {
    return {
      ok: true,
      path,
      owner: 'docs',
      zone: 'agent-docs',
      rule_id: 'agent-docs',
      default_proof_level: 'scoped',
      focused_proof: [],
      browser_required: false,
    };
  }
  if (
    path === '.gitignore'
    || /^scripts\/agent-/.test(path)
    || /^\.github\/workflows\//.test(path)
  ) {
    return {
      ok: true,
      path,
      owner: 'tooling',
      zone: 'agent-tooling',
      rule_id: 'agent-tooling',
      default_proof_level: 'owner',
      focused_proof: [GATE],
      browser_required: false,
    };
  }
  return null;
}

export function resolveChangedScopes(root, changes, resolver = (path) => scopeCommand(root, path)) {
  return changes.flatMap((change) => {
    const path = change.status === 'D' && change.oldPath ? change.oldPath : change.path;
    const current = { change, scope: specialScope(path) ?? resolver(path) };
    if (change.status !== 'R' || !change.oldPath) return [current];
    const previousChange = { status: 'D', path: change.oldPath };
    return [
      {
        change: previousChange,
        scope: specialScope(change.oldPath) ?? resolver(change.oldPath),
      },
      current,
    ];
  });
}

function commandKey(command) {
  return `${command.cwd}\0${command.argv.join('\0')}`;
}

function withCommandId(command) {
  return {
    id: createHash('sha256').update(commandKey(command)).digest('hex').slice(0, 12),
    cwd: command.cwd,
    argv: [...command.argv],
  };
}

export function dedupeCommands(commands) {
  const seen = new Set();
  return commands
    .filter((command) => command && Array.isArray(command.argv) && command.argv.length > 0)
    .filter((command) => {
      const key = commandKey(command);
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    })
    .map(withCommandId);
}

function minimizeRequiredCommands(commands, risk) {
  const gateLine = 'npm run test:agent-gates';
  if (risk === 'local') {
    return commands.filter((command) => command.argv.join(' ') !== gateLine);
  }
  const hasGate = commands.some((command) => command.argv.join(' ') === gateLine);
  if (!hasGate) return commands;
  return commands.filter((command) => {
    if (!(command.argv[0] === 'npx' && command.argv[1] === 'vitest')) return true;
    const targets = command.argv.filter((value) => value.startsWith('src/'));
    if (targets.length === 0) return true;
    const coveredByGate = targets.every((target) =>
      target.startsWith('src/__tests__/unit/architecture/')
      || target === 'src/__tests__/unit/wizard/wizardIsolation.architecture.test.ts'
      || target === 'src/__tests__/unit/components/UIKitLibrary.test.tsx');
    return !coveredByGate;
  });
}

function browserCommandForOwners(owners) {
  const specs = [];
  if (owners.includes('heat')) specs.push('tests/heat-calculation.spec.ts');
  if (owners.includes('electrical')) specs.push('tests/elec-calculation.spec.ts');
  if (owners.includes('projects')) specs.push('tests/projects.spec.ts');
  if (owners.includes('auth')) specs.push('tests/auth.spec.ts');
  if (owners.includes('specification')) specs.push('tests/phase5-specification-proof.spec.ts');
  if (owners.includes('reports')) specs.push('tests/phase5-actionable-close.spec.ts');
  if (specs.length === 0) return [];
  return dedupeCommands([{ cwd: 'e2e', argv: ['npx', 'playwright', 'test', ...specs] }]);
}

export function buildProofPlan(root, changes, { resolver } = {}) {
  if (!Array.isArray(changes) || changes.length === 0) {
    return {
      ok: false,
      risk: null,
      errors: ['no frontend-relevant changes found'],
      changed_files: [],
    };
  }
  const resolved = resolveChangedScopes(root, changes, resolver);
  const errors = resolved
    .filter(({ scope }) => !scope?.ok)
    .map(({ change, scope }) => `${change.path}: ${scope?.error ?? 'unowned or ambiguous'}`);
  if (errors.length > 0) {
    return { ok: false, risk: null, errors, changed_files: changes };
  }

  const owners = [...new Set(resolved.map(({ scope }) => scope.owner))].sort();
  const matchedConsumerRules = CONSUMER_RULES.filter((rule) =>
    changes.some((change) =>
      rule.test(change.path) || (change.oldPath ? rule.test(change.oldPath) : false)));
  const consumers = [...new Set(matchedConsumerRules.flatMap((rule) => rule.consumers))].sort();
  const reasons = matchedConsumerRules.map((rule) => rule.reason);
  if (owners.length > 1) reasons.push(`multiple owners changed: ${owners.join(', ')}`);

  let risk = 'owner';
  const onlyTests = resolved.every(({ scope }) => scope.rule_id === 'tests');
  const onlyScoped = resolved.every(({ scope }) => scope.default_proof_level === 'scoped');
  if (resolved.length === 1 && (onlyTests || onlyScoped) && matchedConsumerRules.length === 0) {
    risk = 'local';
    reasons.push('single local change');
  } else if (owners.length > 1 || matchedConsumerRules.length > 0) {
    risk = 'cross-owner';
  } else {
    reasons.push(`single owner changed: ${owners[0]}`);
  }

  const required = resolved.flatMap(({ scope }) => scope.focused_proof ?? []);
  for (const rule of matchedConsumerRules) {
    required.push(...(rule.commands ?? []));
    for (const representative of rule.representatives ?? []) {
      const consumerScope = specialScope(representative)
        ?? (resolver ? resolver(representative) : scopeCommand(root, representative));
      if (!consumerScope?.ok) {
        errors.push(`${rule.id}: consumer proof mapping failed for ${representative}`);
      } else {
        required.push(...(consumerScope.focused_proof ?? []));
      }
    }
  }
  if (errors.length > 0) {
    return { ok: false, risk, errors, changed_files: changes };
  }

  let requiredCommands = minimizeRequiredCommands(dedupeCommands(required), risk);
  if (risk !== 'local' && !requiredCommands.some((command) =>
    command.argv.join(' ') === 'npm run test:agent-gates')) {
    requiredCommands.push(withCommandId(GATE));
  }
  requiredCommands = dedupeCommands(requiredCommands);
  const optional = (
    resolved.some(({ scope }) => scope.browser_required)
    || consumers.some((consumer) =>
      ['auth', 'projects', 'heat', 'electrical', 'specification', 'reports'].includes(consumer))
  )
    ? browserCommandForOwners([...new Set([...owners, ...consumers])])
    : [];

  const plan = {
    ok: true,
    risk,
    proof_level: risk,
    changed_files: changes,
    changed_owners: owners,
    affected_consumers: consumers,
    reasons: [...new Set(reasons)],
    required: dedupeCommands(requiredCommands),
    optional,
    full_dod: {
      required: false,
      policy: 'explicit-user-only',
    },
    source_rules: matchedConsumerRules.map((rule) => rule.id),
  };
  plan.content_signature = computeContentSignature(root, changes, plan.required);
  return plan;
}

const SIGNATURE_CONTEXT = [
  '.gitignore',
  'frontend/package.json',
  'frontend/package-lock.json',
  'frontend/vite.config.ts',
  'frontend/eslint.config.js',
  'frontend/src/__tests__/setup.ts',
  'scripts/agent-scope.mjs',
  'scripts/agent-proof-core.mjs',
  'scripts/agent-proof.mjs',
];

function hashFile(root, path) {
  const absolute = join(root, path);
  if (!existsSync(absolute)) return 'MISSING';
  return createHash('sha256').update(readFileSync(absolute)).digest('hex');
}

export function computeContentSignature(root, changes, commands) {
  const payload = {
    changes: changes.map((change) => ({
      status: change.status,
      path: change.path,
      oldPath: change.oldPath ?? null,
      content: change.status === 'D' ? 'DELETED' : hashFile(root, change.path),
    })),
    context: SIGNATURE_CONTEXT.map((path) => [path, hashFile(root, path)]),
    commands: commands.map((command) => ({
      cwd: command.cwd,
      argv: command.argv,
    })),
  };
  return createHash('sha256').update(JSON.stringify(payload)).digest('hex');
}

export function validateCommand(root, command) {
  const issues = [];
  if (!command || !['frontend', 'e2e', '.'].includes(command.cwd)) {
    return ['unsupported command cwd'];
  }
  if (!Array.isArray(command.argv) || command.argv.length < 2) {
    return ['command argv must contain at least two strings'];
  }
  if (command.argv.some((value) =>
    typeof value !== 'string' || value.trim() === '' || /[<>*]|\bpath-matched\b/.test(value))) {
    issues.push('command contains an empty value, placeholder, prose or glob');
  }
  if (command.argv[0] === 'npm' && command.argv[1] === 'run') {
    const packageRoot = command.cwd === '.' ? root : join(root, command.cwd);
    const packagePath = join(packageRoot, 'package.json');
    if (!existsSync(packagePath)) issues.push(`package.json missing for cwd=${command.cwd}`);
    else {
      const scripts = JSON.parse(readFileSync(packagePath, 'utf8')).scripts ?? {};
      if (!Object.hasOwn(scripts, command.argv[2])) {
        issues.push(`npm script does not exist: ${command.argv[2]}`);
      }
    }
  } else if (
    !(
      command.argv[0] === 'npx'
      && ['vitest', 'playwright'].includes(command.argv[1])
    )
  ) {
    issues.push(`unsupported executable: ${command.argv[0]} ${command.argv[1]}`);
  }
  if (
    command.argv[0] === 'npx'
    && ['vitest', 'playwright'].includes(command.argv[1])
  ) {
    const cwd = command.cwd === '.' ? root : join(root, command.cwd);
    const valueOptions = new Set(['--project', '--maxWorkers', '--pool', '--reporter']);
    for (let index = 3; index < command.argv.length; index += 1) {
      const value = command.argv[index];
      if (valueOptions.has(value)) {
        index += 1;
        continue;
      }
      if (value.startsWith('--')) continue;
      if (!value.startsWith('src/') && !value.startsWith('tests/')) continue;
      const absolute = join(cwd, value);
      const parent = dirname(absolute);
      const prefix = basename(absolute);
      const matches = existsSync(absolute)
        || (
          existsSync(parent)
          && readdirSync(parent).some((entry) => entry.startsWith(prefix))
        );
      if (!matches) issues.push(`test target does not exist: ${value}`);
    }
  }
  if (command.argv.includes('test:agent-dod') || command.argv.includes('test:agent-dod:dual-safe')) {
    issues.push('full DoD may not be required implicitly');
  }
  return issues;
}

export function validatePlan(root, plan) {
  if (!plan?.ok) return plan?.errors ?? ['plan is not valid'];
  const issues = [...plan.required, ...plan.optional].flatMap((command) =>
    validateCommand(root, command).map((issue) => `${command.id}: ${issue}`));
  if (plan.required.length === 0 && plan.changed_owners.some((owner) => owner !== 'docs')) {
    issues.push('non-doc change has no required proof');
  }
  if (plan.full_dod.required || plan.required.some((command) =>
    command.argv.join(' ').includes('test:agent-dod'))) {
    issues.push('implicit full DoD is forbidden');
  }
  return issues;
}

function receiptPayload(receipt) {
  const { integrity, ...payload } = receipt;
  return payload;
}

export function signReceipt(receipt, secret) {
  return createHmac('sha256', secret)
    .update(JSON.stringify(receiptPayload(receipt)))
    .digest('hex');
}

export function verifyReceiptIntegrity(receipt, secret) {
  if (!receipt?.integrity || typeof receipt.integrity !== 'string') return false;
  const expected = Buffer.from(signReceipt(receipt, secret), 'hex');
  const actual = Buffer.from(receipt.integrity, 'hex');
  return expected.length === actual.length && timingSafeEqual(expected, actual);
}

export function validateReceipt(plan, receipt, secret) {
  const issues = [];
  if (!verifyReceiptIntegrity(receipt, secret)) issues.push('receipt integrity signature is invalid');
  if (receipt?.runner !== 'agent-proof-run/v1' || receipt?.version !== 1) {
    issues.push('receipt runner/version is not trusted');
  }
  if (receipt?.content_signature !== plan.content_signature) {
    issues.push('receipt is stale: content signature differs');
  }
  const expectedIds = plan.required.map((command) => command.id).sort();
  const receiptIds = [...(receipt?.required_command_ids ?? [])].sort();
  if (JSON.stringify(expectedIds) !== JSON.stringify(receiptIds)) {
    issues.push('receipt required-command manifest differs from current plan');
  }
  const results = new Map((receipt?.results ?? []).map((result) => [result.id, result]));
  for (const command of plan.required) {
    const result = results.get(command.id);
    if (!result) issues.push(`required proof NOT RUN: ${command.id} ${command.argv.join(' ')}`);
    else if (result.exit_code !== 0) {
      issues.push(`required proof failed: ${command.id} exit=${String(result.exit_code)}`);
    } else if (
      result.cwd !== command.cwd
      || JSON.stringify(result.argv) !== JSON.stringify(command.argv)
    ) {
      issues.push(`receipt command mismatch: ${command.id}`);
    }
  }
  return issues;
}

export function relativeReceiptPath(root, path) {
  return normalizeRepoPath(relative(root, path));
}
