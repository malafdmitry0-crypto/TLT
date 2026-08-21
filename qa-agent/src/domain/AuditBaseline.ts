import fs from 'node:fs';
import path from 'node:path';

import type { ComparisonResult } from '../comparison/types';
import type { ReportResult } from '../reporting/types';
import { readUtf8FileUnderRoot, resolveUnderAllowedRoot } from '../shared/paths';
import type { CodebaseScanFinding } from './SecurityCodebaseScannerSubagent';

export type AuditBaselineStatus = 'accepted_risk' | 'false_positive' | 'todo' | 'fixed';

export type AuditBaselineEntry = {
  id: string;
  status: AuditBaselineStatus;
  reason: string;
  expiresAt?: string;
};

export type AuditBaseline = {
  version: 1;
  entries: AuditBaselineEntry[];
};

export type AuditBaselineApplication = {
  activeFindings: CodebaseScanFinding[];
  suppressedFindings: Array<{
    finding: CodebaseScanFinding;
    baseline: AuditBaselineEntry;
  }>;
  expiredEntries: AuditBaselineEntry[];
};

export function emptyAuditBaseline(): AuditBaseline {
  return { version: 1, entries: [] };
}

export function loadAuditBaseline(filePath: string, allowedRoot = path.dirname(filePath)): AuditBaseline {
  const resolved = resolveUnderAllowedRoot(allowedRoot, filePath, 'audit baseline path');
  if (!fs.existsSync(resolved)) return emptyAuditBaseline();
  const parsed = JSON.parse(readUtf8FileUnderRoot(allowedRoot, resolved, 'audit baseline path')) as unknown;
  if (
    typeof parsed !== 'object' ||
    parsed === null ||
    !Array.isArray((parsed as { entries?: unknown }).entries)
  ) {
    return emptyAuditBaseline();
  }
  const entries = (parsed as { entries: unknown[] }).entries.flatMap((entry): AuditBaselineEntry[] => {
    if (typeof entry !== 'object' || entry === null) return [];
    const source = entry as Record<string, unknown>;
    if (typeof source.id !== 'string' || typeof source.reason !== 'string') return [];
    const status = source.status;
    if (
      status !== 'accepted_risk' &&
      status !== 'false_positive' &&
      status !== 'todo' &&
      status !== 'fixed'
    ) {
      return [];
    }
    return [
      {
        id: source.id,
        status,
        reason: source.reason,
        expiresAt: typeof source.expiresAt === 'string' ? source.expiresAt : undefined,
      },
    ];
  });
  return { version: 1, entries };
}

function isExpired(entry: AuditBaselineEntry, now: Date): boolean {
  if (!entry.expiresAt) return false;
  const expires = Date.parse(entry.expiresAt);
  return Number.isFinite(expires) && expires < now.getTime();
}

function suppressesFinding(entry: AuditBaselineEntry): boolean {
  return entry.status === 'accepted_risk' || entry.status === 'false_positive' || entry.status === 'todo';
}

export function applyAuditBaseline(
  findings: CodebaseScanFinding[],
  baseline: AuditBaseline,
  now = new Date(),
): AuditBaselineApplication {
  const entriesById = new Map(baseline.entries.map((entry) => [entry.id, entry]));
  const expiredEntries = baseline.entries.filter((entry) => isExpired(entry, now));
  const activeFindings: CodebaseScanFinding[] = [];
  const suppressedFindings: AuditBaselineApplication['suppressedFindings'] = [];

  for (const finding of findings) {
    const entry = entriesById.get(finding.id);
    if (entry && !isExpired(entry, now) && suppressesFinding(entry)) {
      suppressedFindings.push({ finding, baseline: entry });
    } else {
      activeFindings.push(finding);
    }
  }

  return {
    activeFindings,
    suppressedFindings,
    expiredEntries,
  };
}

export function auditBaselineToReportResult(application: AuditBaselineApplication): ReportResult {
  const verdict = application.expiredEntries.length > 0 ? 'needs_review' : 'pass';
  const deterministic: ComparisonResult = {
    verdict,
    severity: application.expiredEntries.length > 0 ? 'medium' : 'low',
    reason:
      application.expiredEntries.length > 0
        ? `${application.expiredEntries.length} audit baseline entrie(s) expired`
        : `${application.suppressedFindings.length} finding(s) suppressed by active audit baseline`,
    differences: application.expiredEntries.map((entry) => ({
      path: entry.id,
      expected: 'active baseline entry',
      actual: entry.expiresAt,
      reason: entry.reason,
    })),
    numericDelta: application.expiredEntries.length,
    toleranceUsed: { absoluteTolerance: 0, relativeTolerance: 0 },
  };
  return {
    testCase: {
      id: 'audit-baseline',
      requirementId: 'audit_findings_baseline',
      input: {
        suppressedFindings: application.suppressedFindings.length,
        expiredEntries: application.expiredEntries.length,
      },
      kind: 'property',
      metadata: {},
    },
    expected: {
      value: 'Known findings are explicitly baselined and not expired',
      warnings: [],
      metadata: {},
    },
    actual: {
      value: application,
      status: verdict === 'pass' ? 'success' : 'error',
      warnings: [],
      metadata: {},
    },
    deterministic,
    finalVerdict: verdict,
  };
}
