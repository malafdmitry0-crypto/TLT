/**
 * AF100-14 — repo root stays a working entrypoint, not an artifact dump.
 *
 * Measured before the sweep: 70 tracked run artifacts in the repo root
 * (62 screenshots plus console/network dumps) and a tracked `tmp/` of 259
 * files, while the root had no AGENTS.md at all. An agent starting at the root
 * saw the artifacts first and the contract never.
 *
 * Keepers belong in a dated `docs/audit/YYYY-MM-DD-*` folder with an owner.
 *
 * See: docs/frontend/agent-friendly-10-plan.md §2.1
 */
import { describe, expect, it } from 'vitest';
import { execFileSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(HERE, '../../../../..');

/** Root-level files a checkout is expected to carry. Directories are not listed. */
const ALLOWED_ROOT_FILES = new Set([
  '.dockerignore',
  '.env.example',
  '.env.production.example',
  '.gitignore',
  '.mcp.json',
  '.node-version',
  '.nvmrc',
  'AGENTS.md',
  'Caddyfile',
  'Makefile',
  'docker-compose.dev.yml',
  'docker-compose.e2e.yml',
  'docker-compose.observability.yml',
  'docker-compose.prod.yml',
  'docker-compose.yml',
]);

/** Artifact shapes that must never be tracked at the root again. */
const ARTIFACT_PATTERN = /\.(png|jpe?g|gif|webp|txt|log|har)$/i;

function trackedRootFiles(): string[] {
  const output = execFileSync('git', ['ls-files'], { cwd: REPO_ROOT, encoding: 'utf8' });
  return output
    .split('\n')
    .filter((line) => line.trim() !== '' && !line.includes('/'))
    .map((line) => line.replace(/^"|"$/g, ''));
}

describe('AF100-14 — repo root hygiene', () => {
  it('tracks no run artifacts at the repo root', () => {
    const artifacts = trackedRootFiles().filter((name) => ARTIFACT_PATTERN.test(name));
    expect(
      artifacts,
      'Screenshots, console dumps and logs must not be tracked in the repo root. ' +
        'FIX: move keepers into docs/audit/YYYY-MM-DD-*/ or let .gitignore drop them.',
    ).toEqual([]);
  });

  it('tracks only known configuration files at the repo root', () => {
    const unexpected = trackedRootFiles().filter((name) => !ALLOWED_ROOT_FILES.has(name));
    expect(
      unexpected,
      'A new root-level file appeared. If it is a real repo-level contract, add it to ' +
        'ALLOWED_ROOT_FILES with intent; if it is a run artifact, it does not belong here.',
    ).toEqual([]);
  });

  it('keeps the root entrypoint tracked', () => {
    expect(trackedRootFiles()).toContain('AGENTS.md');
  });

  it('detects an artifact name as an artifact (failure path)', () => {
    expect(ARTIFACT_PATTERN.test('heat-ui-after-1280x900.png')).toBe(true);
    expect(ARTIFACT_PATTERN.test('phase2-vite-login-console.txt')).toBe(true);
    expect(ARTIFACT_PATTERN.test('docker-compose.yml')).toBe(false);
  });
});
