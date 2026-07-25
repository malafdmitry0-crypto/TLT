#!/usr/bin/env node
/**
 * AF11-DOD-WALLTIME-01 — canonical frontend Definition of Done orchestrator.
 *
 * Sequence (invariant):
 *   1. test:agent-gates (typecheck + lint + architecture/CSS) — sequential
 *   2. test:unit + test:integration — concurrent after gates
 *   3. build — only if both test suites exit 0
 *
 * Failure propagation:
 *   If either concurrent child fails, the sibling is SIGTERM'd (then SIGKILL)
 *   and the orchestrator exits non-zero. No tests are skipped or removed.
 *
 * Usage:
 *   node scripts/agent-dod.mjs
 *   node scripts/agent-dod.mjs --self-test   # failure-propagation proof only
 */
import { spawn } from 'node:child_process';
import { performance } from 'node:perf_hooks';
import process from 'node:process';

const ROOT = new URL('..', import.meta.url).pathname;
const SELF_TEST = process.argv.includes('--self-test');

function nowMs() {
  return performance.now();
}

function formatSec(ms) {
  return `${(ms / 1000).toFixed(2)}s`;
}

function log(msg) {
  process.stdout.write(`[agent-dod] ${msg}\n`);
}

/**
 * Spawn `npm run <script>` with a process group so we can kill the whole tree.
 * stdout/stderr are prefixed for concurrent readability.
 */
function spawnNpmScript(script, { prefix, extraArgs = [] } = {}) {
  const npmArgs = ['run', script, ...extraArgs];
  const child = spawn('npm', npmArgs, {
    cwd: ROOT,
    env: process.env,
    stdio: ['ignore', 'pipe', 'pipe'],
    // New process group on POSIX so SIGTERM reaches vitest workers.
    detached: process.platform !== 'win32',
  });

  const label = prefix ?? script;
  const pipe = (stream, write) => {
    let buf = '';
    stream.setEncoding('utf8');
    stream.on('data', (chunk) => {
      buf += chunk;
      let idx;
      while ((idx = buf.indexOf('\n')) !== -1) {
        const line = buf.slice(0, idx);
        buf = buf.slice(idx + 1);
        write(`[${label}] ${line}\n`);
      }
    });
    stream.on('end', () => {
      if (buf.length > 0) write(`[${label}] ${buf}\n`);
    });
  };

  pipe(child.stdout, (s) => process.stdout.write(s));
  pipe(child.stderr, (s) => process.stderr.write(s));

  const done = new Promise((resolve) => {
    child.on('error', (error) => {
      resolve({ script, code: 1, signal: null, error });
    });
    child.on('exit', (code, signal) => {
      resolve({
        script,
        code: code === null ? (signal ? 1 : 0) : code,
        signal,
        error: null,
      });
    });
  });

  return { child, done, script };
}

function killProcessTree(child) {
  if (!child || child.killed || child.exitCode !== null) return;
  const pid = child.pid;
  if (!pid) return;

  try {
    if (process.platform === 'win32') {
      spawn('taskkill', ['/pid', String(pid), '/T', '/F'], { stdio: 'ignore' });
      return;
    }
    // Negative PID = process group (requires detached: true).
    process.kill(-pid, 'SIGTERM');
  } catch {
    try {
      child.kill('SIGTERM');
    } catch {
      /* already gone */
    }
  }

  const killer = setTimeout(() => {
    try {
      if (process.platform !== 'win32') {
        process.kill(-pid, 'SIGKILL');
      } else {
        child.kill('SIGKILL');
      }
    } catch {
      try {
        child.kill('SIGKILL');
      } catch {
        /* ignore */
      }
    }
  }, 3000);
  if (typeof killer.unref === 'function') killer.unref();
}

async function runSequential(script) {
  const t0 = nowMs();
  log(`start sequential: npm run ${script}`);
  const { done } = spawnNpmScript(script, { prefix: script });
  const result = await done;
  const elapsed = nowMs() - t0;
  log(`done sequential: ${script} exit=${result.code} wall=${formatSec(elapsed)}`);
  return { ...result, elapsedMs: elapsed };
}

/**
 * Worker budgets under concurrent unit||integration.
 * Canonical defaults are deliberately conservative: the integration command
 * contains both generic and electrical projects, so per-project auto sizing
 * can otherwise oversubscribe the host. Environment variables can override
 * the defaults for an explicitly measured machine. Full suites always run.
 */
const DEFAULT_CONCURRENT_MAX_WORKERS = '2';

function concurrentWorkerCount(kind) {
  if (kind === 'unit') {
    return process.env.AGENT_DOD_UNIT_MAX_WORKERS || DEFAULT_CONCURRENT_MAX_WORKERS;
  }
  return process.env.AGENT_DOD_INT_MAX_WORKERS || DEFAULT_CONCURRENT_MAX_WORKERS;
}

function concurrentWorkerArgs(kind) {
  return ['--', `--maxWorkers=${concurrentWorkerCount(kind)}`];
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Run unit + integration concurrently. First non-zero exit kills the sibling.
 * Integration starts first (optional stagger) so long elec suite is less starved
 * when unit saturates all cores — full suites still run, no skip.
 */
async function runUnitAndIntegrationConcurrent() {
  const t0 = nowMs();
  const staggerMs = Number(process.env.AGENT_DOD_UNIT_STAGGER_MS ?? '12000');
  const unitWorkers = concurrentWorkerCount('unit');
  const integrationWorkers = concurrentWorkerCount('integration');
  log(
    `start concurrent: test:integration first, test:unit after ${staggerMs}ms (unit maxWorkers=${unitWorkers}, int maxWorkers=${integrationWorkers})`,
  );

  const integration = spawnNpmScript('test:integration', {
    prefix: 'integration',
    extraArgs: concurrentWorkerArgs('integration'),
  });

  if (staggerMs > 0) {
    await sleep(staggerMs);
  }

  const unit = spawnNpmScript('test:unit', {
    prefix: 'unit',
    extraArgs: concurrentWorkerArgs('unit'),
  });

  const children = [unit, integration];
  let settled = false;

  const onFirstFailure = async (failed) => {
    if (settled) return;
    settled = true;
    log(
      `FAIL ${failed.script} exit=${failed.code}${failed.signal ? ` signal=${failed.signal}` : ''} — terminating sibling`,
    );
    for (const entry of children) {
      if (entry.script !== failed.script) {
        killProcessTree(entry.child);
      }
    }
  };

  // Watch each child; kill sibling on first failure without waiting for both.
  const watched = children.map(async (entry) => {
    const result = await entry.done;
    if (result.code !== 0) {
      await onFirstFailure(result);
    }
    return { ...result, elapsedMs: nowMs() - t0 };
  });

  const results = await Promise.all(watched);
  const elapsed = nowMs() - t0;
  const failed = results.filter((r) => r.code !== 0);
  const ok = failed.length === 0;

  for (const r of results) {
    log(
      `concurrent child ${r.script}: exit=${r.code} observed_wall=${formatSec(r.elapsedMs)}`,
    );
  }
  log(
    `done concurrent suites: ${ok ? 'PASS' : 'FAIL'} wall=${formatSec(elapsed)} (max of children)`,
  );

  return {
    ok,
    elapsedMs: elapsed,
    results,
    exitCode: ok ? 0 : failed[0]?.code || 1,
  };
}

async function selfTest() {
  log('self-test: failure propagation (failing child must kill long-running sibling)');
  const t0 = nowMs();

  // Long-running no-op vs immediate failure via node -e.
  const long = spawn(
    process.execPath,
    ['-e', 'setInterval(() => {}, 1000); setTimeout(() => process.exit(0), 60000)'],
    {
      stdio: ['ignore', 'pipe', 'pipe'],
      detached: process.platform !== 'win32',
    },
  );
  const fail = spawn(process.execPath, ['-e', 'process.exit(17)'], {
    stdio: ['ignore', 'pipe', 'pipe'],
    detached: process.platform !== 'win32',
  });

  const longDone = new Promise((resolve) => {
    long.on('exit', (code, signal) => resolve({ name: 'long', code, signal }));
    long.on('error', () => resolve({ name: 'long', code: 1, signal: null }));
  });
  const failDone = new Promise((resolve) => {
    fail.on('exit', (code, signal) => resolve({ name: 'fail', code, signal }));
    fail.on('error', () => resolve({ name: 'fail', code: 1, signal: null }));
  });

  const first = await Promise.race([
    failDone.then((r) => ({ ...r, winner: true })),
    longDone.then((r) => ({ ...r, winner: true })),
  ]);

  if (first.name !== 'fail' || first.code !== 17) {
    log(`self-test FAIL: expected fail child first with 17, got ${JSON.stringify(first)}`);
    killProcessTree(long);
    killProcessTree(fail);
    process.exit(1);
  }

  killProcessTree(long);
  const longResult = await longDone;
  const elapsed = nowMs() - t0;

  const killedFast =
    elapsed < 15_000 &&
    longResult.code !== 0; /* SIGTERM/SIGKILL → non-zero or null+signal */

  if (!killedFast && longResult.signal == null && longResult.code === 0) {
    log(
      `self-test FAIL: long child exited 0 after ${formatSec(elapsed)} — sibling was not killed`,
    );
    process.exit(1);
  }

  log(
    `self-test PASS: fail exit=17, long terminated code=${longResult.code} signal=${longResult.signal} wall=${formatSec(elapsed)}`,
  );
  process.exit(0);
}

async function main() {
  if (SELF_TEST) {
    await selfTest();
    return;
  }

  const totalT0 = nowMs();
  const phases = [];

  // 1. Gates (must stay before acceptance suites)
  const gates = await runSequential('test:agent-gates');
  phases.push({ name: 'test:agent-gates', ...gates });
  if (gates.code !== 0) {
    log(`STOP after gates exit=${gates.code} total=${formatSec(nowMs() - totalT0)}`);
    process.exit(gates.code);
  }

  // 2. Unit + integration concurrent
  const suites = await runUnitAndIntegrationConcurrent();
  phases.push({
    name: 'test:unit+integration',
    code: suites.exitCode,
    elapsedMs: suites.elapsedMs,
  });
  if (!suites.ok) {
    log(
      `STOP after concurrent suites exit=${suites.exitCode} total=${formatSec(nowMs() - totalT0)}`,
    );
    process.exit(suites.exitCode);
  }

  // 3. Build only after green tests
  const build = await runSequential('build');
  phases.push({ name: 'build', ...build });
  if (build.code !== 0) {
    log(`STOP after build exit=${build.code} total=${formatSec(nowMs() - totalT0)}`);
    process.exit(build.code);
  }

  const totalMs = nowMs() - totalT0;
  log('--- phase summary ---');
  for (const p of phases) {
    log(`  ${p.name}: exit=${p.code} wall=${formatSec(p.elapsedMs)}`);
  }
  log(`PASS total wall=${formatSec(totalMs)}`);
  process.exit(0);
}

main().catch((err) => {
  console.error('[agent-dod] unhandled', err);
  process.exit(1);
});
