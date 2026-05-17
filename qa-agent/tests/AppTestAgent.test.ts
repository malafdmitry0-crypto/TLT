import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { describe, expect, it } from 'vitest';

import { MockLlmClient } from '../src/llm/MockLlmClient';
import {
  appTestRunToReportResult,
  LlmAppTestProposalGenerator,
  parseAppTestProposals,
  parseAppTestSelection,
  writeAppTestProposals,
  type AppTestRunResult,
} from '../src/domain/AppTestAgent';

function failedRun(): AppTestRunResult {
  return {
    id: 'backend',
    label: 'Backend pytest suite',
    commandLine: 'make test-backend',
    cwd: '/repo',
    exitCode: 1,
    timedOut: false,
    durationMs: 123,
    stdout: '1 failed',
    stderr: 'AssertionError: expected 403',
  };
}

describe('AppTestAgent', () => {
  it('parses selected app test commands', () => {
    expect(parseAppTestSelection('backend,frontend').map((item) => item.id)).toEqual([
      'backend',
      'frontend',
    ]);
    expect(parseAppTestSelection('unknown').map((item) => item.id)).toEqual(['backend', 'frontend']);
  });

  it('converts failed test command to report result', () => {
    const result = appTestRunToReportResult(failedRun());

    expect(result.finalVerdict).toBe('fail');
    expect(result.actual.status).toBe('error');
    expect(result.deterministic.differences[0].reason).toContain('AssertionError');
  });

  it('parses LLM test proposals and ignores malformed items', () => {
    const proposals = parseAppTestProposals({
      proposals: [
        {
          targetPath: 'backend/app/tests/unit/test_new_regression.py',
          rationale: 'Cover access regression',
          framework: 'pytest',
          content: 'def test_x(): pass',
          riskTags: ['security'],
        },
        { targetPath: 'bad' },
      ],
    });

    expect(proposals).toHaveLength(1);
    expect(proposals[0].framework).toBe('pytest');
  });

  it('asks LLM for focused test proposals using command output and test map', async () => {
    const llm = new MockLlmClient({
      proposals: [
        {
          targetPath: 'frontend/src/__tests__/unit/generated.test.ts',
          rationale: 'Cover UI regression',
          framework: 'vitest',
          content: 'import { it } from "vitest";\nit("x", () => {});',
          riskTags: ['ui'],
        },
      ],
    });

    const proposals = await new LlmAppTestProposalGenerator(llm).generate({
      runs: [failedRun()],
      existingTestFiles: ['backend/app/tests/unit/test_existing.py'],
    });

    expect(proposals).toHaveLength(1);
    expect(llm.calls[0].user).toContain('make test-backend');
  });

  it('writes generated tests as proposal files by default', () => {
    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'qa-agent-proposals-'));
    const results = writeAppTestProposals(
      [
        {
          targetPath: 'backend/app/tests/unit/test_generated.py',
          rationale: 'Regression',
          framework: 'pytest',
          content: 'def test_generated():\n    assert True\n',
          riskTags: ['regression'],
        },
      ],
      {
        repoRoot: tmp,
        outputDir: path.join(tmp, 'reports'),
      },
    );

    expect(results[0]).toMatchObject({ mode: 'proposal', status: 'written' });
    expect(fs.existsSync(results[0].writtenPath!)).toBe(true);
    expect(fs.existsSync(path.join(tmp, 'backend/app/tests/unit/test_generated.py'))).toBe(false);
  });

  it('blocks direct writes outside allowed test roots', () => {
    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'qa-agent-blocked-'));
    const results = writeAppTestProposals(
      [
        {
          targetPath: 'backend/app/services/hack.py',
          rationale: 'Not allowed',
          framework: 'pytest',
          content: 'print("bad")',
          riskTags: [],
        },
      ],
      {
        repoRoot: tmp,
        outputDir: path.join(tmp, 'reports'),
        allowRepoWrites: true,
      },
    );

    expect(results[0]).toMatchObject({ status: 'skipped' });
  });
});
