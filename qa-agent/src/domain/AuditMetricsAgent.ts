import fs from 'node:fs';
import path from 'node:path';

import type { ComparisonResult } from '../comparison/types';
import type { ReportResult } from '../reporting/types';
import type { Severity, Verdict } from '../shared/types';

export type MetricsAuditOperation = 'import' | 'heat_loss' | 'electrical' | 'report' | 'worker';

export type MetricsAuditSummary = {
  scannedFiles: number;
  metricFiles: string[];
  presentOperations: MetricsAuditOperation[];
  missingOperations: MetricsAuditOperation[];
};

const EXPECTED_OPERATIONS: MetricsAuditOperation[] = ['import', 'heat_loss', 'electrical', 'report', 'worker'];

const OPERATION_PATTERNS: Record<MetricsAuditOperation, RegExp[]> = {
  import: [/import/i, /excel/i, /csv/i],
  heat_loss: [/heat[_-]?loss/i, /thermal/i],
  electrical: [/electrical/i, /cable/i],
  report: [/report/i, /export/i],
  worker: [/worker/i, /queue/i, /task/i],
};

function walk(root: string): string[] {
  if (!fs.existsSync(root)) return [];
  const files: string[] = [];
  const stack = [root];
  while (stack.length > 0) {
    const current = stack.pop()!;
    for (const entry of fs.readdirSync(current, { withFileTypes: true })) {
      if (entry.name === '__pycache__' || entry.name === 'node_modules' || entry.name === '.git') continue;
      const entryPath = path.join(current, entry.name);
      if (entry.isDirectory()) {
        stack.push(entryPath);
      } else if (entry.isFile() && /\.(py|ts|tsx)$/.test(entry.name)) {
        files.push(entryPath);
      }
    }
  }
  return files.sort();
}

export function auditMetricsCoverage(config: { repoRoot: string; roots?: string[] }): MetricsAuditSummary {
  const roots = config.roots ?? ['backend/app', 'frontend/src'];
  const files = roots.flatMap((root) => walk(path.join(config.repoRoot, root)));
  const metricFiles: string[] = [];
  const presentOperations = new Set<MetricsAuditOperation>();

  for (const file of files) {
    const relative = path.relative(config.repoRoot, file);
    const source = fs.readFileSync(file, 'utf8');
    const looksLikeMetrics =
      /metrics?|prometheus|Counter|Gauge|Histogram|observe|increment|duration|latency/i.test(relative) ||
      /prometheus|Counter|Gauge|Histogram|observe|increment|duration|latency/i.test(source);
    if (!looksLikeMetrics) continue;
    metricFiles.push(relative);
    for (const operation of EXPECTED_OPERATIONS) {
      if (OPERATION_PATTERNS[operation].some((pattern) => pattern.test(source) || pattern.test(relative))) {
        presentOperations.add(operation);
      }
    }
  }

  const present = [...presentOperations].sort();
  return {
    scannedFiles: files.length,
    metricFiles: metricFiles.sort(),
    presentOperations: present,
    missingOperations: EXPECTED_OPERATIONS.filter((operation) => !presentOperations.has(operation)),
  };
}

function verdictForMetrics(summary: MetricsAuditSummary): Verdict {
  return summary.missingOperations.length > 0 ? 'needs_review' : 'pass';
}

function severityForMetrics(summary: MetricsAuditSummary): Severity {
  return summary.metricFiles.length === 0 ? 'medium' : summary.missingOperations.length > 0 ? 'medium' : 'low';
}

export function metricsAuditToReportResult(summary: MetricsAuditSummary): ReportResult {
  const verdict = verdictForMetrics(summary);
  const deterministic: ComparisonResult = {
    verdict,
    severity: severityForMetrics(summary),
    reason:
      verdict === 'pass'
        ? 'Metrics audit found instrumentation coverage for expected operation groups'
        : `Metrics audit is missing coverage for: ${summary.missingOperations.join(', ')}`,
    differences: summary.missingOperations.map((operation) => ({
      path: `metrics.${operation}`,
      expected: 'instrumented',
      actual: 'missing_or_not_detected',
      reason: `No metric signal detected for ${operation}`,
    })),
    numericDelta: summary.missingOperations.length,
    toleranceUsed: { absoluteTolerance: 0, relativeTolerance: 0 },
  };
  return {
    testCase: {
      id: 'audit-metrics-coverage',
      requirementId: 'audit_metrics_coverage',
      input: {
        expectedOperations: EXPECTED_OPERATIONS,
      },
      kind: 'property',
      metadata: {},
    },
    expected: {
      value: 'Import, heat-loss, electrical, report, and worker operations have metric signals',
      warnings: [],
      metadata: {},
    },
    actual: {
      value: summary,
      status: verdict === 'pass' ? 'success' : 'error',
      warnings: [],
      metadata: {},
    },
    deterministic,
    finalVerdict: verdict,
  };
}
