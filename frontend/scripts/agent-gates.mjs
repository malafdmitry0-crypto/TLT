#!/usr/bin/env node
/**
 * AF12 wall-time: run agent-gates phases with safe concurrency.
 *
 * Parallel wave A (independent): typecheck || lint
 * Parallel wave B (vitest, independent of A once A done? — also parallel with A
 *   if CPU allows; we run ALL four in one wave and take max wall.
 *
 * Invariants: same checks as `test:agent-gates` sequential chain; any non-zero fails.
 */
import { spawn } from 'node:child_process';
import { performance } from 'node:perf_hooks';
import process from 'node:process';

const ROOT = new URL('..', import.meta.url).pathname;

const PHASES = [
  { name: 'typecheck', args: ['run', 'typecheck'] },
  { name: 'lint', args: ['run', 'lint'] },
  { name: 'test:s0-gates', args: ['run', 'test:s0-gates'] },
  { name: 'css:architecture', args: ['run', 'css:architecture'] },
];

function log(msg) {
  process.stdout.write(`[agent-gates] ${msg}\n`);
}

function runPhase(phase) {
  const t0 = performance.now();
  return new Promise((resolve) => {
    const child = spawn('npm', phase.args, {
      cwd: ROOT,
      env: process.env,
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    let out = '';
    const onData = (chunk) => {
      const s = chunk.toString();
      out += s;
      // prefix lightly for debugging without drowning dual DoD logs
      for (const line of s.split('\n')) {
        if (line) process.stdout.write(`[${phase.name}] ${line}\n`);
      }
    };
    child.stdout.on('data', onData);
    child.stderr.on('data', onData);
    child.on('error', (error) => {
      resolve({
        name: phase.name,
        code: 1,
        wallMs: performance.now() - t0,
        error,
        out,
      });
    });
    child.on('exit', (code, signal) => {
      resolve({
        name: phase.name,
        code: code === null ? (signal ? 1 : 0) : code,
        wallMs: performance.now() - t0,
        error: null,
        out,
      });
    });
  });
}

async function main() {
  const t0 = performance.now();
  log(`start parallel gates: ${PHASES.map((p) => p.name).join(' || ')}`);
  const results = await Promise.all(PHASES.map(runPhase));
  const totalMs = performance.now() - t0;

  for (const r of results) {
    log(
      `phase ${r.name}: exit=${r.code} wall=${(r.wallMs / 1000).toFixed(2)}s`,
    );
  }

  const failed = results.filter((r) => r.code !== 0);
  if (failed.length) {
    log(
      `FAIL gates: ${failed.map((f) => f.name).join(', ')} total_wall=${(totalMs / 1000).toFixed(2)}s`,
    );
    process.exit(failed[0].code || 1);
  }

  log(`PASS gates total_wall=${(totalMs / 1000).toFixed(2)}s (max of parallel phases)`);
  process.exit(0);
}

main();
