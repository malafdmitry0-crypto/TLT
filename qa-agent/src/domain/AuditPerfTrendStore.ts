import fs from 'node:fs';
import path from 'node:path';

import type { ReportResult } from '../reporting/types';
import { readUtf8FileUnderRoot, resolveUnderAllowedRoot } from '../shared/paths';
import type { LocalLoadResult } from './SecurityPentestAgent';

export type PerformanceTrendRecord = {
  at: string;
  scenario: string;
  branch?: string;
  commit?: string;
  targetUrl: string;
  completedRequests: number;
  avgLatencyMs: number;
  maxLatencyMs: number;
  errorRate: number;
};

export type PerformanceTrendSummary = {
  historyPath: string;
  record: PerformanceTrendRecord;
  previous?: PerformanceTrendRecord;
  avgLatencyDeltaPct?: number;
};

export function readPerformanceTrends(historyPath: string, allowedRoot = path.dirname(historyPath)): PerformanceTrendRecord[] {
  const resolved = resolveUnderAllowedRoot(allowedRoot, historyPath, 'performance history path');
  if (!fs.existsSync(resolved)) return [];
  return readUtf8FileUnderRoot(allowedRoot, resolved, 'performance history path')
    .split('\n')
    .filter(Boolean)
    .flatMap((line): PerformanceTrendRecord[] => {
      try {
        const parsed = JSON.parse(line) as PerformanceTrendRecord;
        return typeof parsed.scenario === 'string' ? [parsed] : [];
      } catch {
        return [];
      }
    });
}

export function buildPerformanceTrendRecord(args: {
  scenario: string;
  loadResult: LocalLoadResult;
  at?: Date;
  branch?: string;
  commit?: string;
}): PerformanceTrendRecord {
  const completed = Math.max(args.loadResult.completedRequests, 1);
  return {
    at: (args.at ?? new Date()).toISOString(),
    scenario: args.scenario,
    branch: args.branch,
    commit: args.commit,
    targetUrl: args.loadResult.targetUrl,
    completedRequests: args.loadResult.completedRequests,
    avgLatencyMs: args.loadResult.avgLatencyMs,
    maxLatencyMs: args.loadResult.maxLatencyMs,
    errorRate: args.loadResult.errorResponses / completed,
  };
}

export function appendPerformanceTrend(
  historyPath: string,
  record: PerformanceTrendRecord,
  allowedRoot = path.dirname(historyPath),
): void {
  const resolved = resolveUnderAllowedRoot(allowedRoot, historyPath, 'performance history path');
  fs.mkdirSync(path.dirname(resolved), { recursive: true });
  fs.appendFileSync(resolved, `${JSON.stringify(record)}\n`);
}

export function summarizePerformanceTrend(args: {
  historyPath: string;
  record: PerformanceTrendRecord;
  history?: PerformanceTrendRecord[];
  allowedRoot?: string;
}): PerformanceTrendSummary {
  const history = args.history ?? readPerformanceTrends(args.historyPath, args.allowedRoot);
  const previous = [...history].reverse().find((item) => item.scenario === args.record.scenario);
  const avgLatencyDeltaPct =
    previous && previous.avgLatencyMs > 0
      ? ((args.record.avgLatencyMs - previous.avgLatencyMs) / previous.avgLatencyMs) * 100
      : undefined;
  return {
    historyPath: args.historyPath,
    record: args.record,
    previous,
    avgLatencyDeltaPct,
  };
}

export function performanceTrendToReportResult(summary: PerformanceTrendSummary): ReportResult {
  const regression = (summary.avgLatencyDeltaPct ?? 0) > 25;
  return {
    testCase: {
      id: 'audit-performance-trend',
      requirementId: 'audit_performance_trend_storage',
      input: { scenario: summary.record.scenario },
      kind: 'property',
      metadata: {},
    },
    expected: { value: 'No >25% latency regression vs previous trend record', warnings: [], metadata: {} },
    actual: { value: summary, status: regression ? 'error' : 'success', warnings: [], metadata: {} },
    deterministic: {
      verdict: regression ? 'needs_review' : 'pass',
      severity: regression ? 'medium' : 'low',
      reason:
        summary.avgLatencyDeltaPct === undefined
          ? 'No previous performance trend record for this scenario'
          : `Average latency delta: ${summary.avgLatencyDeltaPct.toFixed(1)}%`,
      differences: regression
        ? [
            {
              path: 'avgLatencyDeltaPct',
              expected: '<= 25',
              actual: summary.avgLatencyDeltaPct,
              reason: 'Average latency regressed against previous trend record.',
            },
          ]
        : [],
      numericDelta: summary.avgLatencyDeltaPct ?? 0,
      toleranceUsed: { absoluteTolerance: 25, relativeTolerance: 0 },
    },
    finalVerdict: regression ? 'needs_review' : 'pass',
  };
}
