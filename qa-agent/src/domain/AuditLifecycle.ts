import fs from 'node:fs';
import path from 'node:path';

import type { ReportResult } from '../reporting/types';
import type { Verdict } from '../shared/types';
import type { CodebaseScanFinding } from './SecurityCodebaseScannerSubagent';

export type AuditLifecycleStatus =
  | 'new'
  | 'confirmed'
  | 'accepted_risk'
  | 'false_positive'
  | 'fix_planned'
  | 'fixed'
  | 'regressed';

export type AuditHistoryEvent = {
  at: string;
  findingId: string;
  status: AuditLifecycleStatus;
  branch?: string;
  confidence?: string;
  owner?: string;
  note?: string;
};

export type AuditLifecycleSummary = {
  historyPath: string;
  currentFindings: number;
  previousEvents: number;
  newFindings: string[];
  regressedFindings: string[];
};

export function readAuditHistory(historyPath: string): AuditHistoryEvent[] {
  if (!fs.existsSync(historyPath)) return [];
  return fs
    .readFileSync(historyPath, 'utf8')
    .split('\n')
    .filter(Boolean)
    .flatMap((line): AuditHistoryEvent[] => {
      try {
        const parsed = JSON.parse(line) as AuditHistoryEvent;
        return typeof parsed.findingId === 'string' && typeof parsed.status === 'string' ? [parsed] : [];
      } catch {
        return [];
      }
    });
}

export function appendAuditHistoryEvent(historyPath: string, event: AuditHistoryEvent): void {
  fs.mkdirSync(path.dirname(historyPath), { recursive: true });
  fs.appendFileSync(historyPath, `${JSON.stringify(event)}\n`);
}

export function summarizeAuditLifecycle(args: {
  findings: CodebaseScanFinding[];
  historyPath: string;
  history?: AuditHistoryEvent[];
}): AuditLifecycleSummary {
  const history = args.history ?? readAuditHistory(args.historyPath);
  const latestStatus = new Map<string, AuditLifecycleStatus>();
  for (const event of history) latestStatus.set(event.findingId, event.status);
  const newFindings: string[] = [];
  const regressedFindings: string[] = [];
  for (const finding of args.findings) {
    const status = latestStatus.get(finding.id);
    if (!status) newFindings.push(finding.id);
    if (status === 'fixed') regressedFindings.push(finding.id);
  }
  return {
    historyPath: args.historyPath,
    currentFindings: args.findings.length,
    previousEvents: history.length,
    newFindings,
    regressedFindings,
  };
}

export function auditLifecycleToReportResult(summary: AuditLifecycleSummary): ReportResult {
  const verdict: Verdict = summary.regressedFindings.length > 0 ? 'needs_review' : 'pass';
  return {
    testCase: {
      id: 'audit-finding-lifecycle',
      requirementId: 'audit_findings_have_lifecycle_memory',
      input: summary,
      kind: 'property',
      metadata: {},
    },
    expected: {
      value: 'Findings have lifecycle memory and no fixed finding regressed',
      warnings: [],
      metadata: {},
    },
    actual: {
      value: summary,
      status: verdict === 'pass' ? 'success' : 'error',
      warnings: [],
      metadata: {},
    },
    deterministic: {
      verdict,
      severity: verdict === 'pass' ? 'low' : 'medium',
      reason:
        verdict === 'pass'
          ? `${summary.newFindings.length} new finding(s), no fixed finding regressed`
          : `${summary.regressedFindings.length} fixed finding(s) regressed`,
      differences: summary.regressedFindings.map((id) => ({
        path: id,
        expected: 'fixed finding stays absent',
        actual: 'finding present again',
        reason: 'Finding was previously marked fixed and appeared again.',
      })),
      numericDelta: summary.regressedFindings.length,
      toleranceUsed: { absoluteTolerance: 0, relativeTolerance: 0 },
    },
    finalVerdict: verdict,
  };
}
