// @vitest-environment node
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const FRONTEND_ROOT = path.resolve(HERE, '../../../..');
const REPO_ROOT = path.resolve(FRONTEND_ROOT, '..');
const PROOF_CLI = path.join(REPO_ROOT, 'scripts/agent-proof.mjs');

describe('diff-wide minimum-proof contract', () => {
  it('covers local, owner, cross-owner, receipt and fail-closed paths', () => {
    const report = JSON.parse(execFileSync(
      process.execPath,
      [PROOF_CLI, '--self-test', '--json'],
      { cwd: REPO_ROOT, encoding: 'utf8' },
    )) as {
      ok: boolean;
      checks: number;
      examples: Record<string, {
        risk: string;
        full_dod: { required: boolean; policy: string };
      }>;
    };

    expect(report.ok).toBe(true);
    expect(report.checks).toBeGreaterThanOrEqual(21);
    expect(report.examples.local.risk).toBe('local');
    expect(report.examples.owner.risk).toBe('owner');
    expect(report.examples.cross_owner.risk).toBe('cross-owner');
    expect(report.examples.cross_owner.full_dod).toEqual({
      required: false,
      policy: 'explicit-user-only',
    });
  });

  it('publishes stable npm entrypoints and keeps receipts out of git', () => {
    const packageJson = JSON.parse(
      fs.readFileSync(path.join(FRONTEND_ROOT, 'package.json'), 'utf8'),
    ) as { scripts: Record<string, string> };
    expect(packageJson.scripts['agent:proof-plan']).toBe(
      'node ../scripts/agent-proof.mjs plan',
    );
    expect(packageJson.scripts['agent:proof-run']).toBe(
      'node ../scripts/agent-proof.mjs run',
    );
    expect(packageJson.scripts['agent:proof-check']).toBe(
      'node ../scripts/agent-proof.mjs check',
    );

    const gitignore = fs.readFileSync(path.join(REPO_ROOT, '.gitignore'), 'utf8');
    expect(gitignore.split(/\r?\n/)).toContain('.agent-proof/');
  });
});
