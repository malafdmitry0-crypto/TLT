import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { describe, expect, it } from 'vitest';

import {
  auditLifecycleToReportResult,
  appendAuditHistoryEvent,
  readAuditHistory,
  summarizeAuditLifecycle,
} from '../src/domain/AuditLifecycle';
import {
  auditRecipesToReportResult,
  suggestAuditRecipes,
} from '../src/domain/AuditRecipes';
import {
  planRegressionTests,
  regressionPlanToReportResult,
} from '../src/domain/AuditRegressionPlanner';
import {
  appendPerformanceTrend,
  buildPerformanceTrendRecord,
  performanceTrendToReportResult,
  readPerformanceTrends,
  summarizePerformanceTrend,
} from '../src/domain/AuditPerfTrendStore';
import {
  parseScenarioPackSelection,
  scenarioPacksToReportResult,
} from '../src/domain/AuditScenarioPacks';
import {
  auditContractDrift,
  contractDriftToReportResult,
} from '../src/domain/ContractDriftAuditor';
import {
  parseUiWorkflowSelection,
  uiWorkflowsToReportResult,
} from '../src/domain/UiWorkflowAgent';
import {
  detectFlakiness,
  flakinessToReportResult,
} from '../src/domain/FlakinessDetector';
import {
  auditOwnershipToReportResult,
  planAuditOwnership,
} from '../src/domain/AuditOwnershipPlanner';
import {
  businessCorrectnessSummaryToReportResult,
  runBusinessCorrectnessAudit,
} from '../src/domain/BusinessCorrectnessAuditor';
import {
  appendAuditJournalEntries,
  auditJournalToReportResult,
  buildAuditJournalEntries,
  readAuditJournal,
} from '../src/domain/AuditJournal';
import {
  readUtf8FileUnderRoot,
  resolveUnderAllowedRoot,
  writeUtf8FileUnderRoot,
} from '../src/shared/paths';
import type { CodebaseScanFinding } from '../src/domain/SecurityCodebaseScannerSubagent';
import type { AppTestCommand, AppTestRunResult } from '../src/domain/AppTestAgent';

function finding(overrides: Partial<CodebaseScanFinding> = {}): CodebaseScanFinding {
  return {
    id: 'dangerous-html-render:frontend/src/App.tsx:10',
    ruleId: 'dangerous-html-render',
    severity: 'high',
    category: 'injection',
    title: 'Potential unsafe HTML rendering',
    file: 'frontend/src/App.tsx',
    line: 10,
    evidence: 'dangerouslySetInnerHTML',
    recommendation: 'Remove raw HTML rendering.',
    confidence: 'high',
    ...overrides,
  };
}

function tmpDir(prefix: string): string {
  return fs.mkdtempSync(path.join(os.tmpdir(), prefix));
}

describe('audit extensions', () => {
  it('guards agent file access under explicit roots', () => {
    const root = tmpDir('qa-paths-');
    const written = writeUtf8FileUnderRoot(root, 'nested/report.txt', 'ok');

    expect(readUtf8FileUnderRoot(root, written)).toBe('ok');
    expect(resolveUnderAllowedRoot(root, 'nested/report.txt')).toBe(written);
    expect(() => resolveUnderAllowedRoot(root, '../outside.txt')).toThrow(/allowed root/);
  });

  it('tracks finding lifecycle history and detects regressions', () => {
    const root = tmpDir('qa-lifecycle-');
    const historyPath = path.join(root, 'history.jsonl');
    appendAuditHistoryEvent(historyPath, {
      at: '2026-05-18T00:00:00Z',
      findingId: 'finding-fixed',
      status: 'fixed',
    });

    const summary = summarizeAuditLifecycle({
      historyPath,
      findings: [finding({ id: 'finding-fixed' }), finding({ id: 'finding-new' })],
    });

    expect(readAuditHistory(historyPath)).toHaveLength(1);
    expect(summary.regressedFindings).toEqual(['finding-fixed']);
    expect(summary.newFindings).toEqual(['finding-new']);
    expect(auditLifecycleToReportResult(summary).finalVerdict).toBe('needs_review');
  });

  it('suggests recipes and regression test plans for findings', () => {
    const findings = [finding()];
    const recipes = suggestAuditRecipes(findings);
    const proposals = planRegressionTests({ findings, recipeMatches: recipes });

    expect(recipes[0].recipe.id).toBe('xss-html-rendering');
    expect(auditRecipesToReportResult(recipes).finalVerdict).toBe('pass');
    expect(proposals.some((proposal) => proposal.framework === 'vitest')).toBe(true);
    expect(regressionPlanToReportResult(proposals).finalVerdict).toBe('pass');
  });

  it('stores performance trends and flags regressions', () => {
    const root = tmpDir('qa-perf-trend-');
    const historyPath = path.join(root, 'perf.jsonl');
    const previous = buildPerformanceTrendRecord({
      scenario: 'query',
      at: new Date('2026-05-18T00:00:00Z'),
      loadResult: {
        targetUrl: 'http://127.0.0.1:3003',
        durationMs: 100,
        concurrency: 1,
        attemptedRequests: 10,
        completedRequests: 10,
        okResponses: 10,
        errorResponses: 0,
        statusCounts: { '200': 10 },
        avgLatencyMs: 100,
        maxLatencyMs: 120,
      },
    });
    appendPerformanceTrend(historyPath, previous);
    const current = { ...previous, at: '2026-05-18T01:00:00Z', avgLatencyMs: 140 };
    const summary = summarizePerformanceTrend({ historyPath, record: current });

    expect(readPerformanceTrends(historyPath)).toHaveLength(1);
    expect(summary.avgLatencyDeltaPct).toBeCloseTo(40);
    expect(performanceTrendToReportResult(summary).finalVerdict).toBe('needs_review');
  });

  it('defines scenario packs and UI workflow plans', () => {
    const packs = parseScenarioPackSelection('large-project-3000,guest-isolation');
    const workflows = parseUiWorkflowSelection('electrical-manual-cable');

    expect(packs.map((pack) => pack.id)).toEqual(['large-project-3000', 'guest-isolation']);
    expect(workflows[0].id).toBe('electrical-manual-cable');
    expect(scenarioPacksToReportResult(packs).finalVerdict).toBe('pass');
    expect(uiWorkflowsToReportResult(workflows).finalVerdict).toBe('pass');
  });

  it('detects contract drift between field config and typed contracts', () => {
    const root = tmpDir('qa-contract-');
    fs.mkdirSync(path.join(root, 'frontend/src/config'), { recursive: true });
    fs.mkdirSync(path.join(root, 'frontend/src/types'), { recursive: true });
    fs.mkdirSync(path.join(root, 'backend/app/schemas'), { recursive: true });
    fs.mkdirSync(path.join(root, 'backend/app/services'), { recursive: true });
    fs.writeFileSync(
      path.join(root, 'frontend/src/config/heatcalc-fields.default.json'),
      JSON.stringify({
        fields: {
          heat_loss_per_meter: { source: 'results' },
          orphan_important_temperature: { source: 'params' },
        },
      }),
    );
    fs.writeFileSync(path.join(root, 'frontend/src/config/electrical-fields.default.json'), '{}');
    fs.writeFileSync(path.join(root, 'frontend/src/types/calculation.ts'), 'export type X = { heat_loss_per_meter: number }');
    fs.writeFileSync(path.join(root, 'backend/app/schemas/calculation.py'), 'heat_loss_per_meter: float');
    fs.writeFileSync(path.join(root, 'backend/app/services/excel_import_service.py'), '');
    fs.writeFileSync(path.join(root, 'backend/app/services/project_io_service.py'), '');

    const summary = auditContractDrift(root);

    expect(summary.findings.some((item) => item.id.includes('orphan_important_temperature'))).toBe(true);
    expect(contractDriftToReportResult(summary).finalVerdict).toBe('needs_review');
  });

  it('classifies flaky test command runs with injected runner', async () => {
    const command: AppTestCommand = {
      id: 'qa-agent',
      label: 'QA agent',
      command: 'npm',
      args: ['test'],
      timeoutMs: 1000,
    };
    let call = 0;
    const summary = await detectFlakiness({
      command,
      repoRoot: '/repo',
      repeats: 3,
      runner: async (): Promise<AppTestRunResult> => ({
        id: 'qa-agent',
        label: 'QA agent',
        commandLine: 'npm test',
        cwd: '/repo',
        exitCode: call++ === 1 ? 1 : 0,
        timedOut: false,
        durationMs: 10,
        stdout: '',
        stderr: '',
      }),
    });

    expect(summary.classification).toBe('flaky');
    expect(flakinessToReportResult(summary).finalVerdict).toBe('needs_review');
  });

  it('plans ownership and runs lightweight business correctness summary', async () => {
    const ownership = planAuditOwnership([finding()]);
    const business = await runBusinessCorrectnessAudit(2);

    expect(ownership[0]).toMatchObject({ owner: 'frontend', fixSize: 'M' });
    expect(auditOwnershipToReportResult(ownership).finalVerdict).toBe('pass');
    expect(business.summary.cases).toBeGreaterThan(0);
    expect(businessCorrectnessSummaryToReportResult(business.summary).finalVerdict).toBe('pass');
  });

  it('writes append-only audit journal entries for regression follow-up', () => {
    const root = tmpDir('qa-audit-journal-');
    const journalPath = path.join(root, 'audit-journal.jsonl');
    const findings = [finding()];
    const recipes = suggestAuditRecipes(findings);
    const proposals = planRegressionTests({ findings, recipeMatches: recipes });
    const ownership = planAuditOwnership(findings);
    const entries = buildAuditJournalEntries({
      runId: 'audit-test-run',
      at: '2026-05-18T00:00:00Z',
      findings,
      recipeMatches: recipes,
      regressionProposals: proposals,
      ownershipItems: ownership,
      summary: { activeFindings: findings.length },
    });

    const summary = appendAuditJournalEntries(journalPath, entries);
    const loaded = readAuditJournal(journalPath);

    expect(summary.writtenEntries).toBe(entries.length);
    expect(loaded.map((entry) => entry.eventType)).toContain('regression_test_proposal');
    expect(loaded.map((entry) => entry.eventType)).toContain('summary');
    expect(auditJournalToReportResult(summary).finalVerdict).toBe('pass');
  });
});
