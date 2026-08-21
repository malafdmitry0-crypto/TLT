#!/usr/bin/env node
/**
 * Frontend production bundle budget gate.
 *
 * Runs against an existing `dist/` (or builds with vite if --build).
 * Fails when any JS chunk exceeds max gzip or raw size budgets.
 *
 * Usage:
 *   node scripts/bundle-budget.mjs
 *   node scripts/bundle-budget.mjs --build
 *   node scripts/bundle-budget.mjs --max-raw-kb=800 --max-gzip-kb=250
 */
import { execSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { gzipSync } from 'node:zlib';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const FRONTEND_ROOT = path.resolve(HERE, '..');
const DIST = path.join(FRONTEND_ROOT, 'dist');

function argValue(name, fallback) {
  const prefix = `--${name}=`;
  const hit = process.argv.slice(2).find((a) => a.startsWith(prefix));
  return hit ? hit.slice(prefix.length) : fallback;
}

const MAX_RAW_KB = Number(argValue('max-raw-kb', '800'));
const MAX_GZIP_KB = Number(argValue('max-gzip-kb', '250'));
const DO_BUILD = process.argv.includes('--build');

function walkJs(dir) {
  if (!fs.existsSync(dir)) return [];
  const out = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) out.push(...walkJs(full));
    else if (entry.name.endsWith('.js')) out.push(full);
  }
  return out;
}

if (DO_BUILD) {
  execSync('npm run build:vite', { cwd: FRONTEND_ROOT, stdio: 'inherit' });
}

if (!fs.existsSync(DIST)) {
  console.error('[bundle-budget] dist/ missing. Run `npm run build:vite` or pass --build.');
  process.exit(2);
}

const chunks = walkJs(path.join(DIST, 'assets')).map((file) => {
  const buf = fs.readFileSync(file);
  const gzip = gzipSync(buf);
  return {
    name: path.relative(DIST, file),
    rawKb: buf.length / 1024,
    gzipKb: gzip.length / 1024,
  };
});

chunks.sort((a, b) => b.rawKb - a.rawKb);

console.log('[bundle-budget] top chunks (raw / gzip KB)');
for (const c of chunks.slice(0, 12)) {
  console.log(`  ${c.rawKb.toFixed(1).padStart(8)} / ${c.gzipKb.toFixed(1).padStart(7)}  ${c.name}`);
}

const violations = [];
for (const c of chunks) {
  if (c.rawKb > MAX_RAW_KB) {
    violations.push(
      `RAW ${c.rawKb.toFixed(1)} KB > ${MAX_RAW_KB} KB · ${c.name}`,
    );
  }
  if (c.gzipKb > MAX_GZIP_KB) {
    violations.push(
      `GZIP ${c.gzipKb.toFixed(1)} KB > ${MAX_GZIP_KB} KB · ${c.name}`,
    );
  }
}

if (violations.length) {
  console.error('[bundle-budget] FAIL');
  for (const v of violations) console.error(`  ${v}`);
  console.error(
    'FIX: split heavy vendor/feature chunks, lazy-route, or raise budget with audit evidence.',
  );
  process.exit(1);
}

console.log(
  `[bundle-budget] PASS · ${chunks.length} js chunks · caps raw≤${MAX_RAW_KB} KB gzip≤${MAX_GZIP_KB} KB`,
);
