#!/usr/bin/env node
/**
 * AF100-03 — fail-closed CSS architecture gate.
 *
 * Why this exists: `vitest run <a> <b>` does NOT fail when one of the filters
 * matches nothing — it silently runs the rest and exits 0. A ratchet file that
 * was renamed or split therefore disappeared from the gate while the command
 * stayed green (measured: `Test Files 1 passed` after the CSS architecture
 * ratchet was split into .freeze / .metrics-fixtures / .responsive-order).
 *
 * This gate resolves targets itself and refuses to run when a declared group
 * lost files. Growth of a group is allowed (splitting a ratchet is fine),
 * shrink is not.
 */
import { readdirSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { dirname, join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import process from 'node:process';

const FRONTEND_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const ARCH_DIR = 'src/__tests__/unit/architecture';

/**
 * Declared ratchet groups. `min` is shrink-only: raise it when a group is
 * intentionally split into more files, never lower it to make the gate pass.
 */
export const GROUPS = [
  {
    id: 'css-architecture-ratchet',
    dir: ARCH_DIR,
    match: /^cssArchitectureRatchet\..+\.architecture\.test\.ts$/,
    min: 3,
  },
  {
    id: 'css-important-ratchet',
    dir: ARCH_DIR,
    match: /^cssImportantRatchet\.architecture\.test\.ts$/,
    min: 1,
  },
];

/** Resolve declared groups against the tree. Pure — the guard test calls it. */
export function resolveTargets(root = FRONTEND_ROOT, groups = GROUPS) {
  const targets = [];
  const missing = [];
  for (const group of groups) {
    let entries = [];
    try {
      entries = readdirSync(join(root, group.dir));
    } catch {
      missing.push({ id: group.id, found: 0, min: group.min, reason: `dir not found: ${group.dir}` });
      continue;
    }
    const found = entries.filter((name) => group.match.test(name)).sort();
    if (found.length < group.min) {
      missing.push({
        id: group.id,
        found: found.length,
        min: group.min,
        reason: `expected >= ${group.min} file(s) matching ${group.match}, found ${found.length}`,
      });
      continue;
    }
    targets.push(...found.map((name) => relative(root, join(root, group.dir, name))));
  }
  return { targets, missing };
}

if (process.argv[1] && resolve(process.argv[1]) === resolve(fileURLToPath(import.meta.url))) {
  const { targets, missing } = resolveTargets();
  if (missing.length > 0) {
    for (const item of missing) {
      console.error(`[css-architecture-gate] MISSING ${item.id}: ${item.reason}`);
    }
    console.error(
      '[css-architecture-gate] FAIL — a declared CSS ratchet group lost files. ' +
        'Fix the rename/split, or update GROUPS in scripts/css-architecture-gate.mjs ' +
        'as an explicit architecture decision.',
    );
    process.exit(1);
  }
  console.log(`[css-architecture-gate] targets (${targets.length}): ${targets.join(' ')}`);
  const result = spawnSync('npx', ['vitest', 'run', ...targets], {
    cwd: FRONTEND_ROOT,
    stdio: 'inherit',
    env: process.env,
  });
  process.exit(result.status ?? 1);
}
