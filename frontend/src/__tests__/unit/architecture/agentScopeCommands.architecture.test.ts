// @vitest-environment node
/**
 * AF100-02 — every command `agent:scope` emits must be runnable as printed.
 *
 * Measured regression: for shared zones the focused-proof field held a human
 * sentence and the same sentence was interpolated into the command line, e.g.
 *   npx vitest run path-matched unit under src/__tests__/unit/components …
 * An agent that copy-pastes scope output must never receive prose, a script
 * that does not exist, or a path filter that matches nothing.
 *
 * See: docs/frontend/agent-friendly-10-plan.md §2.1
 */
import { describe, expect, it } from 'vitest';
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const FRONTEND_ROOT = path.resolve(HERE, '../../../..');
const REPO_ROOT = path.resolve(FRONTEND_ROOT, '..');
const SCOPE_CLI = path.join(REPO_ROOT, 'scripts/agent-scope.mjs');

/** Words that mean a sentence leaked into an argv position. */
const PROSE_MARKERS = /\b(path-matched|under|prefer|nearest|existing|or)\b/;

function productionFiles(dir: string, out: string[] = []): string[] {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (entry.name === '__tests__' || entry.name === 'node_modules') continue;
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) productionFiles(full, out);
    else if (/\.(ts|tsx|css)$/.test(entry.name)) out.push(path.relative(FRONTEND_ROOT, full));
  }
  return out;
}

/** Deterministic spread across zones without paying for all ~540 files. */
function sample(files: string[], size: number): string[] {
  const sorted = [...files].sort();
  const step = Math.max(1, Math.floor(sorted.length / size));
  return sorted.filter((_, index) => index % step === 0).slice(0, size);
}

function emittedCommands(relativePath: string): string[] {
  const stdout = execFileSync('node', [SCOPE_CLI, relativePath], {
    cwd: FRONTEND_ROOT,
    encoding: 'utf8',
  });
  const block = stdout.split('recommended_commands:')[1];
  if (!block) return [];
  const commands: string[] = [];
  for (const line of block.split('\n')) {
    if (line.trim() === '') continue;
    const match = line.match(/^\s+-\s+(.*)$/);
    if (!match) break;
    commands.push(match[1].trim());
  }
  return commands;
}

function npmScripts(packageJsonPath: string): string[] {
  const parsed = JSON.parse(fs.readFileSync(packageJsonPath, 'utf8')) as {
    scripts?: Record<string, string>;
  };
  return Object.keys(parsed.scripts ?? {});
}

/** A filter is valid when at least one real file starts with it. */
function filterMatchesSomething(token: string): boolean {
  const absolute = path.join(FRONTEND_ROOT, token);
  if (fs.existsSync(absolute)) return true;
  const dir = path.dirname(absolute);
  if (!fs.existsSync(dir)) return false;
  const prefix = path.basename(absolute);
  return fs.readdirSync(dir).some((name) => name.startsWith(prefix));
}

describe('AF100-02 — emitted focused commands are executable', () => {
  const declaredScripts = new Set([
    ...npmScripts(path.join(FRONTEND_ROOT, 'package.json')),
    ...npmScripts(path.join(REPO_ROOT, 'e2e/package.json')),
  ]);
  const paths = sample(productionFiles(path.join(FRONTEND_ROOT, 'src')), 15);

  it('samples files from across the tree', () => {
    expect(paths.length).toBe(15);
  });

  it('emits no prose in a command position', () => {
    const offenders: string[] = [];
    for (const file of paths) {
      for (const command of emittedCommands(file)) {
        if (command.startsWith('browser proof')) continue;
        if (PROSE_MARKERS.test(command)) offenders.push(`${file} :: ${command}`);
      }
    }
    expect(
      offenders,
      'A focused-proof note leaked into recommended_commands. FIX: keep prose in notes, ' +
        'argv in focused_proof.argv.',
    ).toEqual([]);
  });

  it('names only npm scripts that exist', () => {
    const offenders: string[] = [];
    for (const file of paths) {
      for (const command of emittedCommands(file)) {
        const script = command.match(/npm run ([a-z0-9:_-]+)/);
        if (script && !declaredScripts.has(script[1])) offenders.push(`${file} :: ${script[1]}`);
      }
    }
    expect(offenders, 'scope emitted an npm script that is not declared anywhere').toEqual([]);
  });

  it('names only path filters that match something on disk', () => {
    const offenders: string[] = [];
    for (const file of paths) {
      for (const command of emittedCommands(file)) {
        if (command.startsWith('browser proof')) continue;
        for (const token of command.split(/\s+/)) {
          if (!token.startsWith('src/')) continue;
          if (!filterMatchesSomething(token)) offenders.push(`${file} :: ${token}`);
        }
      }
    }
    expect(offenders, 'scope emitted a path filter that matches no file').toEqual([]);
  });

  it('rejects prose and unmatched filters (failure path)', () => {
    expect(PROSE_MARKERS.test('npx vitest run path-matched unit under src/__tests__')).toBe(true);
    expect(filterMatchesSomething('src/__tests__/unit/pages/HeatCalcPage')).toBe(true);
    expect(filterMatchesSomething('src/__tests__/unit/pages/NoSuchOwnerPage')).toBe(false);
  });
});
