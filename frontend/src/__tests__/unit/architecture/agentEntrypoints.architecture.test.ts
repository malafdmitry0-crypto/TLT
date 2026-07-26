/**
 * AF100-04 / AF100-05 — agent entrypoint contracts.
 *
 * Guards two measured regressions:
 *  - `.claude/settings.json` referenced `scripts/sync-docs.py`, which does not
 *    exist. A missing script makes `if ! script` always true, so a "Docs drift"
 *    warning fired after every Write/Edit and pointed at a nonexistent tool.
 *  - `frontend/playwright.config.ts` pointed at `../e2e/tests` while `e2e/`
 *    kept its own `@playwright/test`. Loading two runner copies crashed
 *    discovery from `frontend/` ("Requiring @playwright/test second time").
 *
 * See: docs/frontend/agent-friendly-10-plan.md §2.1
 */
import { describe, expect, it } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
// architecture/ → unit → __tests__ → src → frontend → repo root
const REPO_ROOT = path.resolve(HERE, '../../../../..');

/** Repo-relative script paths referenced by any hook command. */
function hookScriptReferences(command: string): string[] {
  const matches = command.matchAll(/(?:^|[\s'"`(])((?:\.\/|\/)?[\w./-]+\.(?:sh|py|mjs|cjs|js))/g);
  return [...matches].map((match) => match[1]);
}

function settingsFiles(): string[] {
  const dir = path.join(REPO_ROOT, '.claude');
  if (!fs.existsSync(dir)) return [];
  return fs
    .readdirSync(dir)
    .filter((name) => /^settings(\.[\w-]+)?\.json$/.test(name))
    .map((name) => path.join(dir, name));
}

type HookEntry = { hooks?: { type?: string; command?: string }[] };

function hookCommands(file: string): string[] {
  const parsed = JSON.parse(fs.readFileSync(file, 'utf8')) as {
    hooks?: Record<string, HookEntry[]>;
  };
  const commands: string[] = [];
  for (const entries of Object.values(parsed.hooks ?? {})) {
    for (const entry of entries) {
      for (const hook of entry.hooks ?? []) {
        if (hook.type === 'command' && typeof hook.command === 'string') commands.push(hook.command);
      }
    }
  }
  return commands;
}

describe('AF100-04 — Claude hooks reference real scripts', () => {
  it('every script path in a hook command exists on disk', () => {
    const missing: string[] = [];
    for (const file of settingsFiles()) {
      for (const command of hookCommands(file)) {
        for (const reference of hookScriptReferences(command)) {
          const absolute = path.isAbsolute(reference)
            ? reference
            : path.join(REPO_ROOT, reference.replace(/^\.\//, ''));
          if (!fs.existsSync(absolute)) {
            missing.push(`${path.basename(file)}: ${reference}`);
          }
        }
      }
    }
    expect(
      missing,
      'A hook points at a script that does not exist. A missing script makes ' +
        '`if ! script` always true, so the hook fires its warning on every tool call. ' +
        'FIX: restore the script or delete the hook.',
    ).toEqual([]);
  });

  it('detects a hook pointing at a missing script (failure path)', () => {
    const broken = 'cd /repo && if ! scripts/sync-docs.py --check; then echo drift; fi';
    const references = hookScriptReferences(broken);
    expect(references).toContain('scripts/sync-docs.py');
    expect(fs.existsSync(path.join(REPO_ROOT, 'scripts/sync-docs.py'))).toBe(false);
  });
});

describe('AF100-04 — root agent entrypoint', () => {
  it('repo root has AGENTS.md that routes to the frontend contract and e2e', () => {
    const rootAgents = path.join(REPO_ROOT, 'AGENTS.md');
    expect(fs.existsSync(rootAgents), 'repo root must have an agent entrypoint').toBe(true);
    const text = fs.readFileSync(rootAgents, 'utf8');
    expect(text).toContain('frontend/AGENTS.md');
    expect(text).toMatch(/e2e/);
  });
});

describe('AF100-05 — one Playwright entrypoint', () => {
  const configName = /^playwright\.config\.(ts|js|mjs|cjs)$/;

  it('only e2e/ owns a Playwright config', () => {
    const owners = ['.', 'frontend', 'e2e', 'qa-agent', 'backend']
      .filter((dir) => fs.existsSync(path.join(REPO_ROOT, dir)))
      .filter((dir) =>
        fs.readdirSync(path.join(REPO_ROOT, dir)).some((name) => configName.test(name)),
      );
    expect(
      owners,
      'Two Playwright configs with separate node_modules crash discovery ' +
        '("Requiring @playwright/test second time"). FIX: keep the config in e2e/ only.',
    ).toEqual(['e2e']);
  });

  it('frontend/AGENTS.md documents e2e/ as the run directory', () => {
    const text = fs.readFileSync(path.join(REPO_ROOT, 'frontend/AGENTS.md'), 'utf8');
    expect(text).toMatch(/cd \.\.\/e2e/);
  });
});
