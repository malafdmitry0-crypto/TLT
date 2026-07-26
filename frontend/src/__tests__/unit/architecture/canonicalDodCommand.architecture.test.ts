/**
 * AF100-07 — exactly one name for the full DoD.
 *
 * Measured regression: `frontend/AGENTS.md` and the standard named
 * `test:agent-dod:dual-safe` while `.github/workflows/ci.yml` ran
 * `test:agent-dod`. Local "green" and CI "green" meant different orchestrator
 * profiles, so a flake could live in one and not the other.
 *
 * Canonical since 2026-07-26 (quiet-host n=3: 145.08 / 145.99 / 145.68 s):
 * `npm run test:agent-dod:dual-safe`.
 *
 * See: docs/frontend/agent-friendly-10-plan.md §2.1
 */
import { describe, expect, it } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const FRONTEND_ROOT = path.resolve(HERE, '../../../..');
const REPO_ROOT = path.resolve(FRONTEND_ROOT, '..');

const CANONICAL = 'test:agent-dod:dual-safe';

function read(relative: string): string {
  return fs.readFileSync(path.join(REPO_ROOT, relative), 'utf8');
}

/** Full-DoD script names a document tells the agent to run. */
function fullDodMentions(text: string): string[] {
  return [...text.matchAll(/npm run (test:agent-dod(?::[a-z-]+)?)/g)].map((match) => match[1]);
}

describe('AF100-07 — canonical full DoD command', () => {
  it('CI runs the canonical command', () => {
    const ci = read('.github/workflows/ci.yml');
    expect(fullDodMentions(ci)).toContain(CANONICAL);
    expect(
      fullDodMentions(ci).filter((name) => name !== CANONICAL),
      'CI must not run a different full-DoD profile than the one agents run locally.',
    ).toEqual([]);
  });

  it('AGENTS.md and the standard name the canonical command as acceptance', () => {
    for (const doc of ['frontend/AGENTS.md', 'docs/frontend/agent-development-standard.md']) {
      expect(fullDodMentions(read(doc)), `${doc} must name ${CANONICAL}`).toContain(CANONICAL);
    }
  });

  it('the canonical script exists and drives the shared orchestrator', () => {
    const pkg = JSON.parse(fs.readFileSync(path.join(FRONTEND_ROOT, 'package.json'), 'utf8')) as {
      scripts: Record<string, string>;
    };
    expect(pkg.scripts[CANONICAL]).toBeDefined();
    expect(pkg.scripts[CANONICAL]).toContain('scripts/agent-dod.mjs');
  });

  it('detects a CI/doc split (failure path)', () => {
    const driftedCi = 'run: npm run test:agent-dod\n';
    expect(fullDodMentions(driftedCi).filter((name) => name !== CANONICAL)).toEqual([
      'test:agent-dod',
    ]);
  });
});
