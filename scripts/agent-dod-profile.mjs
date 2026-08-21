#!/usr/bin/env node
/**
 * Profile agent-dod wall time by phase (observational).
 *
 * Runs the same dual-safe concurrent DoD and prints a phase table + bottleneck.
 * Does not change gates. Writes optional audit JSON when --out= is set.
 *
 * Usage:
 *   node scripts/agent-dod-profile.mjs
 *   node scripts/agent-dod-profile.mjs --out=docs/audit/…/dod-profile.json
 */
import { spawn } from 'node:child_process';
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { performance } from 'node:perf_hooks';
import { execFileSync } from 'node:child_process';
import process from 'node:process';

const ROOT = resolve(new URL('..', import.meta.url).pathname);
const FRONTEND = join(ROOT, 'frontend');

const outArg = process.argv.find((a) => a.startsWith('--out='));
const outPath = outArg ? resolve(ROOT, outArg.slice('--out='.length)) : null;

function headShort() {
  try {
    return execFileSync('git', ['rev-parse', '--short', 'HEAD'], {
      cwd: ROOT,
      encoding: 'utf8',
    }).trim();
  } catch {
    return 'unknown';
  }
}

function runNpm(script, env = {}) {
  const t0 = performance.now();
  return new Promise((resolvePromise) => {
    const child = spawn('npm', ['run', script], {
      cwd: FRONTEND,
      env: { ...process.env, ...env },
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    let out = '';
    const onData = (chunk) => {
      const s = chunk.toString();
      out += s;
      process.stdout.write(s);
    };
    child.stdout.on('data', onData);
    child.stderr.on('data', onData);
    child.on('exit', (code) => {
      resolvePromise({
        script,
        code: code ?? 1,
        wallMs: performance.now() - t0,
        out,
      });
    });
  });
}

/** Parse `[agent-dod] phase X: … wall=12.34s` style lines if present. */
function extractPhaseLines(out) {
  const phases = [];
  for (const line of out.split('\n')) {
    const m = line.match(/phase\s+([\w:.-]+).*wall[=:]?\s*([0-9.]+)\s*s/i)
      || line.match(/\[agent-dod\].*?(test:[\w:-]+).*?([0-9.]+)\s*s/i);
    if (m) phases.push({ name: m[1], wallS: Number(m[2]) });
  }
  return phases;
}

async function main() {
  console.log('[dod-profile] start dual-safe concurrent DoD');
  const t0 = performance.now();
  const result = await runNpm('test:agent-dod:dual-safe');
  const totalS = (performance.now() - t0) / 1000;
  const phases = extractPhaseLines(result.out);

  // Heuristic bottlenecks from known script names in output
  const markers = [
    { name: 'test:agent-gates', re: /agent-gates|typecheck|test:s0-gates/i },
    { name: 'unit', re: /unit tests|project unit|Test Files.*unit/i },
    { name: 'integration', re: /integration|elec-integration/i },
    { name: 'build', re: /vite build|tsc -b|built in/i },
  ];
  const detected = markers.map((m) => ({
    name: m.name,
    mentioned: m.re.test(result.out),
  }));

  const report = {
    utc: new Date().toISOString(),
    head: headShort(),
    exit: result.code,
    totalWallS: Number(totalS.toFixed(2)),
    targetWallS: 120,
    vsTarget: Number((totalS / 120).toFixed(2)),
    phasesParsed: phases,
    markers: detected,
    recommendation:
      totalS > 120
        ? 'Integration is typically the long pole; prefer AGENT_DOD_INT_MAX_WORKERS=2, dirty-path focused tests for small slices, and avoid full DoD when agent-gates + focused proof suffice.'
        : 'Within aspirational 120s target.',
  };

  console.log('\n[dod-profile] summary');
  console.log(`  exit:       ${report.exit}`);
  console.log(`  total wall: ${report.totalWallS}s (target ≤${report.targetWallS}s, ${report.vsTarget}×)`);
  if (phases.length) {
    console.log('  phases:');
    for (const p of phases) console.log(`    - ${p.name}: ${p.wallS}s`);
  }
  console.log(`  note: ${report.recommendation}`);

  if (outPath) {
    mkdirSync(dirname(outPath), { recursive: true });
    writeFileSync(outPath, `${JSON.stringify(report, null, 2)}\n`);
    console.log(`  wrote ${outPath}`);
  }

  process.exit(result.code === 0 ? 0 : 1);
}

main();
