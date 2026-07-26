#!/usr/bin/env node
import { randomBytes } from 'node:crypto';
import {
  chmodSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  unlinkSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve, sep } from 'node:path';
import { spawnSync } from 'node:child_process';
import process from 'node:process';

import {
  buildProofPlan,
  collectGitChanges,
  computeContentSignature,
  CONSUMER_RULES,
  dedupeCommands,
  mergeChanges,
  parseNameStatusZ,
  signReceipt,
  validateCommand,
  validatePlan,
  validateReceipt,
  verifyReceiptIntegrity,
} from './agent-proof-core.mjs';

const ROOT = resolve(new URL('..', import.meta.url).pathname);
const RECEIPT_ROOT = join(ROOT, '.agent-proof');
const KEY_PATH = join(RECEIPT_ROOT, 'receipt.key');

const argv = process.argv.slice(2);
const json = argv.includes('--json');
const command = argv.includes('--self-test')
  ? 'self-test'
  : argv.find((arg) => !arg.startsWith('--')) ?? 'plan';
const valueAfter = (flag) => {
  const index = argv.indexOf(flag);
  return index === -1 ? null : argv[index + 1] ?? null;
};
const base = valueAfter('--base') ?? process.env.AGENT_PROOF_BASE ?? null;

function output(value) {
  if (json) console.log(JSON.stringify(value, null, 2));
  else if (typeof value === 'string') console.log(value);
  else console.log(JSON.stringify(value, null, 2));
}

function fail(message, details = []) {
  const report = { ok: false, error: message, details };
  if (json) console.log(JSON.stringify(report, null, 2));
  else {
    console.error(`agent:proof: ${message}`);
    for (const detail of details) console.error(`  - ${detail}`);
  }
  process.exit(1);
}

function currentPlan() {
  const changes = collectGitChanges(ROOT, { base });
  const plan = buildProofPlan(ROOT, changes);
  const issues = validatePlan(ROOT, plan);
  if (!plan.ok || issues.length > 0) fail('cannot build a valid minimum-proof plan', [
    ...(plan.errors ?? []),
    ...issues,
  ]);
  return plan;
}

function ensureKey() {
  mkdirSync(RECEIPT_ROOT, { recursive: true });
  if (!existsSync(KEY_PATH)) {
    writeFileSync(KEY_PATH, randomBytes(32), { mode: 0o600 });
  }
  chmodSync(KEY_PATH, 0o600);
  return readFileSync(KEY_PATH);
}

function receiptPath(plan) {
  const requested = valueAfter('--receipt');
  const path = requested
    ? resolve(ROOT, requested)
    : join(RECEIPT_ROOT, `receipt-${plan.content_signature}.json`);
  if (!path.startsWith(`${RECEIPT_ROOT}${sep}`)) {
    fail(`receipt must stay under ${RECEIPT_ROOT}`);
  }
  return path;
}

function runPlan(plan) {
  const selectedId = valueAfter('--command');
  const selected = selectedId
    ? plan.required.filter((step) => step.id === selectedId)
    : plan.required;
  if (selectedId && selected.length === 0) fail(`unknown required command id: ${selectedId}`);
  if (selected.length === 0) fail('plan has no required commands to run');

  const path = receiptPath(plan);
  const secret = ensureKey();
  let previousResults = [];
  if (existsSync(path)) {
    const previous = JSON.parse(readFileSync(path, 'utf8'));
    if (
      previous.content_signature === plan.content_signature
      && verifyReceiptIntegrity(previous, secret)
    ) {
      previousResults = previous.results ?? [];
    }
  }
  const selectedIds = new Set(selected.map((step) => step.id));
  const results = previousResults.filter((result) => !selectedIds.has(result.id));
  for (const step of selected) {
    const cwd = step.cwd === '.' ? ROOT : join(ROOT, step.cwd);
    console.log(`\n[agent:proof] RUN ${step.id}: (cd ${step.cwd} && ${step.argv.join(' ')})`);
    const started = new Date();
    const before = Date.now();
    const result = spawnSync(step.argv[0], step.argv.slice(1), {
      cwd,
      env: process.env,
      stdio: 'inherit',
    });
    results.push({
      id: step.id,
      cwd: step.cwd,
      argv: step.argv,
      started_at: started.toISOString(),
      wall_ms: Date.now() - before,
      exit_code: result.status,
      signal: result.signal,
    });
    if (result.status !== 0) break;
  }

  mkdirSync(resolve(path, '..'), { recursive: true });
  const receipt = {
    version: 1,
    runner: 'agent-proof-run/v1',
    created_at: new Date().toISOString(),
    content_signature: plan.content_signature,
    required_command_ids: plan.required.map((step) => step.id),
    results,
  };
  receipt.integrity = signReceipt(receipt, secret);
  writeFileSync(path, `${JSON.stringify(receipt, null, 2)}\n`, { mode: 0o600 });
  console.log(`[agent:proof] receipt: ${path}`);

  const issues = validateReceipt(plan, receipt, readFileSync(KEY_PATH));
  if (issues.length > 0) fail('minimum proof is incomplete', issues);
  output({ ok: true, receipt: path, content_signature: plan.content_signature, results });
}

function checkPlan(plan) {
  const path = receiptPath(plan);
  if (!existsSync(path)) fail(`receipt not found: ${path}`);
  if (!existsSync(KEY_PATH)) fail(`receipt key not found: ${KEY_PATH}`);
  const receipt = JSON.parse(readFileSync(path, 'utf8'));
  const issues = validateReceipt(plan, receipt, readFileSync(KEY_PATH));
  if (issues.length > 0) fail('minimum proof check failed', issues);
  output({
    ok: true,
    receipt: path,
    content_signature: plan.content_signature,
    required_count: plan.required.length,
  });
}

function fakeScope(path) {
  const owner = path.includes('heat') ? 'heat'
    : path.includes('electrical') ? 'electrical'
      : path.includes('__tests__') ? 'qa'
        : path.includes('api/') ? 'shared'
          : 'tooling';
  return {
    ok: !path.includes('unknown'),
    error: path.includes('unknown') ? 'unknown path' : null,
    path,
    owner,
    rule_id: path.includes('__tests__') ? 'tests' : `${owner}-rule`,
    default_proof_level: path.includes('__tests__') ? 'scoped' : 'owner',
    focused_proof: [{
      cwd: 'frontend',
      argv: owner === 'qa'
        ? ['npx', 'vitest', 'run', '--project', 'unit', `src/${path.split('/src/')[1]}`]
        : ['npm', 'run', 'test:agent-gates'],
    }],
    browser_required: ['heat', 'electrical'].includes(owner),
  };
}

function selfTest() {
  const failures = [];
  const check = (condition, message) => {
    if (!condition) failures.push(message);
  };

  const parsed = parseNameStatusZ('M\0frontend/src/heat.ts\0R100\0frontend/src/old.ts\0frontend/src/new.ts\0D\0frontend/src/gone.ts\0');
  check(parsed.length === 3 && parsed[1].oldPath?.endsWith('old.ts') && parsed[2].status === 'D', 'parse modify/rename/delete');
  const merged = mergeChanges([
    parsed,
    [{ status: 'A', path: 'frontend/src/new-untracked.ts' }],
    [{ status: 'A', path: 'tmp/ignored.txt' }],
  ]);
  check(merged.length === 4 && merged.some((item) => item.path.endsWith('new-untracked.ts')), 'merge staged/unstaged/untracked');

  const gitFixture = mkdtempSync(join(tmpdir(), 'tlt-agent-proof-'));
  try {
    const gitRun = (args) => {
      const result = spawnSync('git', args, {
        cwd: gitFixture,
        encoding: 'utf8',
        stdio: ['ignore', 'pipe', 'pipe'],
      });
      if (result.status !== 0) throw new Error(result.stderr);
    };
    mkdirSync(join(gitFixture, 'frontend/src'), { recursive: true });
    for (const name of ['unstaged.ts', 'staged.ts', 'deleted.ts', 'renamed.ts']) {
      writeFileSync(join(gitFixture, 'frontend/src', name), 'export const value = 1;\n');
    }
    gitRun(['init', '-q']);
    gitRun(['config', 'user.email', 'agent-proof@example.invalid']);
    gitRun(['config', 'user.name', 'Agent Proof Self Test']);
    gitRun(['add', 'frontend']);
    gitRun(['commit', '-qm', 'fixture']);
    writeFileSync(join(gitFixture, 'frontend/src/unstaged.ts'), 'export const value = 2;\n');
    writeFileSync(join(gitFixture, 'frontend/src/staged.ts'), 'export const value = 2;\n');
    gitRun(['add', 'frontend/src/staged.ts']);
    gitRun(['mv', 'frontend/src/renamed.ts', 'frontend/src/renamed-new.ts']);
    unlinkSync(join(gitFixture, 'frontend/src/deleted.ts'));
    writeFileSync(join(gitFixture, 'frontend/src/untracked.ts'), 'export const value = 1;\n');
    const liveChanges = collectGitChanges(gitFixture);
    const statuses = new Map(liveChanges.map((change) => [change.path, change.status]));
    check(statuses.get('frontend/src/unstaged.ts') === 'M', 'collects unstaged');
    check(statuses.get('frontend/src/staged.ts') === 'M', 'collects staged');
    check(statuses.get('frontend/src/deleted.ts') === 'D', 'collects delete');
    check(statuses.get('frontend/src/renamed-new.ts') === 'R', 'collects rename');
    check(statuses.get('frontend/src/untracked.ts') === 'A', 'collects untracked');
  } finally {
    rmSync(gitFixture, { recursive: true, force: true });
  }

  const planFor = (changes) => buildProofPlan(ROOT, changes, { resolver: fakeScope });
  const local = planFor([{ status: 'M', path: 'frontend/src/__tests__/unit/local.test.ts' }]);
  check(local.ok && local.risk === 'local', 'changed unit test is local');
  check(local.required[0]?.argv.at(-1) === 'src/__tests__/unit/local.test.ts', 'edited test keeps exact path');
  const owner = planFor([{ status: 'M', path: 'frontend/src/pages/heat/HeatPage.tsx' }]);
  check(owner.ok && owner.risk === 'owner', 'single production owner');
  const cross = planFor([
    { status: 'M', path: 'frontend/src/pages/heat/HeatPage.tsx' },
    { status: 'M', path: 'frontend/src/pages/electrical/ElecPage.tsx' },
  ]);
  check(cross.ok && cross.risk === 'cross-owner', 'two owners are cross-owner');
  const renamedAcrossOwners = planFor([{
    status: 'R',
    oldPath: 'frontend/src/pages/heat/OldPage.tsx',
    path: 'frontend/src/pages/electrical/NewPage.tsx',
  }]);
  check(
    renamedAcrossOwners.ok && renamedAcrossOwners.risk === 'cross-owner',
    'rename keeps old and new owners in blast radius',
  );
  const shared = planFor([{ status: 'M', path: 'frontend/src/api/calculations.ts' }]);
  check(shared.ok && shared.risk === 'cross-owner' && shared.affected_consumers.length >= 3, 'shared API consumers');
  const missingConsumer = buildProofPlan(
    ROOT,
    [{ status: 'M', path: 'frontend/src/api/calculations.ts' }],
    {
      resolver: (path) =>
        path.includes('ReportWizard')
          ? { ok: false, error: 'missing consumer mapping' }
          : fakeScope(path),
    },
  );
  check(!missingConsumer.ok, 'cross-owner consumer without proof mapping fails closed');
  const harness = planFor([{ status: 'M', path: 'frontend/src/__tests__/setup.ts' }]);
  check(harness.ok && harness.source_rules.includes('test-harness'), 'shared test harness mapping');
  const tooling = planFor([{ status: 'M', path: 'frontend/vite.config.ts' }]);
  check(tooling.ok && tooling.source_rules.includes('frontend-toolchain'), 'vite config mapping');
  const packagePlan = planFor([{ status: 'M', path: 'frontend/package-lock.json' }]);
  check(packagePlan.ok && packagePlan.source_rules.includes('frontend-toolchain'), 'package/lock mapping');
  check(new Set(cross.required.map((step) => step.id)).size === cross.required.length, 'commands deduplicated');
  const unknown = planFor([{ status: 'M', path: 'frontend/src/unknown.ts' }]);
  check(!unknown.ok, 'unknown path fails closed');
  const ambiguous = buildProofPlan(ROOT, [{ status: 'M', path: 'frontend/src/ambiguous.ts' }], {
    resolver: () => ({ ok: false, error: 'ambiguous owner' }),
  });
  check(!ambiguous.ok, 'ambiguous owner fails closed');
  check(validateCommand(ROOT, { cwd: 'frontend', argv: ['npm', 'run', 'does-not-exist'] }).length === 1, 'invalid npm script rejected');
  check(
    validateCommand(ROOT, {
      cwd: 'frontend',
      argv: ['npx', 'vitest', 'run', 'src/__tests__/unit/does-not-exist'],
    }).some((item) => item.includes('does not exist')),
    'unmatched test filter rejected',
  );
  check(!cross.required.some((step) => step.argv.join(' ').includes('test:agent-dod')), 'implicit full DoD absent');

  const signatureA = computeContentSignature(ROOT, local.changed_files, local.required);
  const signatureB = computeContentSignature(ROOT, local.changed_files, [...local.required, {
    id: 'extra',
    cwd: 'frontend',
    argv: ['npm', 'run', 'typecheck'],
  }]);
  check(signatureA !== signatureB, 'content signature binds commands');

  const secret = Buffer.from('self-test-secret');
  const baseReceipt = {
    version: 1,
    runner: 'agent-proof-run/v1',
    content_signature: local.content_signature,
    required_command_ids: local.required.map((step) => step.id),
    results: local.required.map((step) => ({
      id: step.id,
      cwd: step.cwd,
      argv: step.argv,
      exit_code: 0,
    })),
  };
  baseReceipt.integrity = signReceipt(baseReceipt, secret);
  check(validateReceipt(local, baseReceipt, secret).length === 0, 'valid receipt accepted');
  check(validateReceipt({ ...local, content_signature: 'stale' }, baseReceipt, secret).some((item) => item.includes('stale')), 'stale receipt rejected');
  const failedReceipt = structuredClone(baseReceipt);
  failedReceipt.results[0].exit_code = 1;
  failedReceipt.integrity = signReceipt(failedReceipt, secret);
  check(validateReceipt(local, failedReceipt, secret).some((item) => item.includes('failed')), 'failed command rejected');
  const missingReceipt = structuredClone(baseReceipt);
  missingReceipt.results = [];
  missingReceipt.integrity = signReceipt(missingReceipt, secret);
  check(validateReceipt(local, missingReceipt, secret).some((item) => item.includes('NOT RUN')), 'missing proof rejected');
  const forged = structuredClone(baseReceipt);
  forged.results[0].exit_code = 1;
  check(validateReceipt(local, forged, secret).some((item) => item.includes('integrity')), 'manually edited PASS rejected');
  check(CONSUMER_RULES.length >= 8, 'central consumer registry present');

  const viteSource = readFileSync(join(ROOT, 'frontend/vite.config.ts'), 'utf8');
  const isolateDeclarations = viteSource
    .split('\n')
    .map((line) => line.trim())
    .filter((line) => line.startsWith('isolate:'));
  check(
    isolateDeclarations.length > 0
      && isolateDeclarations.every((line) => /^isolate:\s*true,?$/.test(line)),
    'isolate remains enabled',
  );

  if (failures.length > 0) fail('self-test failed', failures);
  output({
    ok: true,
    checks: 29,
    examples: {
      local,
      owner,
      cross_owner: cross,
    },
  });
}

if (argv.includes('--help')) {
  output(`agent-proof

Usage:
  node scripts/agent-proof.mjs plan --changed [--json] [--base <git-ref>]
  node scripts/agent-proof.mjs run --changed [--command <id>] [--receipt <path>]
  node scripts/agent-proof.mjs check --changed [--receipt <path>]
  node scripts/agent-proof.mjs --self-test [--json]

Policy: full DoD is never added implicitly; it remains explicit-user-only.`);
} else if (command === 'plan') output(currentPlan());
else if (command === 'run') runPlan(currentPlan());
else if (command === 'check') checkPlan(currentPlan());
else if (command === 'self-test' || argv.includes('--self-test')) selfTest();
else fail(`unknown command: ${command}`);
