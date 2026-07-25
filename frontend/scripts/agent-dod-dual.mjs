#!/usr/bin/env node
/**
 * Dual-concurrent DoD stress with worker caps to avoid CPU thrash flakes.
 * Uses dual-safe env; both must exit 0.
 */
import { spawn } from 'node:child_process';
import { performance } from 'node:perf_hooks';
import process from 'node:process';

const ROOT = new URL('..', import.meta.url).pathname;
const env = {
  ...process.env,
  AGENT_DOD_UNIT_MAX_WORKERS: process.env.AGENT_DOD_UNIT_MAX_WORKERS || '2',
  AGENT_DOD_INT_MAX_WORKERS: process.env.AGENT_DOD_INT_MAX_WORKERS || '2',
  AGENT_DOD_ELEC_MAX_WORKERS: process.env.AGENT_DOD_ELEC_MAX_WORKERS || '2',
  AGENT_DOD_UNIT_STAGGER_MS: process.env.AGENT_DOD_UNIT_STAGGER_MS || '2000',
};

function run(label) {
  const t0 = performance.now();
  return new Promise((resolve) => {
    const child = spawn('node', ['scripts/agent-dod.mjs'], {
      cwd: ROOT,
      env,
      stdio: ['ignore', 'pipe', 'pipe'],
      detached: process.platform !== 'win32',
    });
    let out = '';
    child.stdout.on('data', (d) => {
      const s = d.toString();
      out += s;
      process.stdout.write(`[${label}] ${s}`);
    });
    child.stderr.on('data', (d) => {
      const s = d.toString();
      out += s;
      process.stderr.write(`[${label}] ${s}`);
    });
    child.on('exit', (code, signal) => {
      const wall = ((performance.now() - t0) / 1000).toFixed(2);
      resolve({ label, code: code ?? 1, signal, wall, out });
    });
  });
}

const t0 = performance.now();
const [a, b] = await Promise.all([run('dual-A'), run('dual-B')]);
const total = ((performance.now() - t0) / 1000).toFixed(2);
console.log(`[agent-dod-dual] A exit=${a.code} wall=${a.wall}s`);
console.log(`[agent-dod-dual] B exit=${b.code} wall=${b.wall}s`);
console.log(`[agent-dod-dual] total wall=${total}s`);
if (a.code !== 0 || b.code !== 0) process.exit(1);
