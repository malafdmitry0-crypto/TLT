import type { ComparisonResult } from '../comparison/types';
import type { ReportResult } from '../reporting/types';
import type { Severity, Verdict } from '../shared/types';
import type { LocalLoadResult } from './SecurityPentestAgent';

export type PerformanceBudgetConfig = {
  maxAvgLatencyMs: number;
  maxMaxLatencyMs: number;
  maxErrorRate: number;
  minCompletedRequests: number;
};

export type PerformanceBudgetEvaluation = {
  budget: PerformanceBudgetConfig;
  loadResult: LocalLoadResult;
  violations: Array<{
    metric: string;
    expected: number;
    actual: number;
  }>;
};

export function buildPerformanceBudgetConfig(env: NodeJS.ProcessEnv = process.env): PerformanceBudgetConfig {
  const numberEnv = (name: string, fallback: number) => {
    const value = Number(env[name]);
    return Number.isFinite(value) && value >= 0 ? value : fallback;
  };
  return {
    maxAvgLatencyMs: numberEnv('QA_AGENT_PERF_MAX_AVG_LATENCY_MS', 500),
    maxMaxLatencyMs: numberEnv('QA_AGENT_PERF_MAX_MAX_LATENCY_MS', 2_000),
    maxErrorRate: numberEnv('QA_AGENT_PERF_MAX_ERROR_RATE', 0.05),
    minCompletedRequests: numberEnv('QA_AGENT_PERF_MIN_COMPLETED_REQUESTS', 5),
  };
}

export function evaluatePerformanceBudget(
  loadResult: LocalLoadResult,
  budget: PerformanceBudgetConfig,
): PerformanceBudgetEvaluation {
  const completed = Math.max(loadResult.completedRequests, 1);
  const errorRate = loadResult.errorResponses / completed;
  const violations: PerformanceBudgetEvaluation['violations'] = [];
  if (loadResult.avgLatencyMs > budget.maxAvgLatencyMs) {
    violations.push({
      metric: 'avgLatencyMs',
      expected: budget.maxAvgLatencyMs,
      actual: loadResult.avgLatencyMs,
    });
  }
  if (loadResult.maxLatencyMs > budget.maxMaxLatencyMs) {
    violations.push({
      metric: 'maxLatencyMs',
      expected: budget.maxMaxLatencyMs,
      actual: loadResult.maxLatencyMs,
    });
  }
  if (errorRate > budget.maxErrorRate) {
    violations.push({
      metric: 'errorRate',
      expected: budget.maxErrorRate,
      actual: errorRate,
    });
  }
  if (loadResult.completedRequests < budget.minCompletedRequests) {
    violations.push({
      metric: 'completedRequests',
      expected: budget.minCompletedRequests,
      actual: loadResult.completedRequests,
    });
  }
  return {
    budget,
    loadResult,
    violations,
  };
}

function verdictForEvaluation(evaluation: PerformanceBudgetEvaluation): Verdict {
  return evaluation.violations.length > 0 ? 'needs_review' : 'pass';
}

function severityForEvaluation(evaluation: PerformanceBudgetEvaluation): Severity {
  return evaluation.violations.some((violation) => violation.metric === 'errorRate') ? 'medium' : 'low';
}

export function performanceBudgetToReportResult(evaluation: PerformanceBudgetEvaluation): ReportResult {
  const verdict = verdictForEvaluation(evaluation);
  const deterministic: ComparisonResult = {
    verdict,
    severity: severityForEvaluation(evaluation),
    reason:
      verdict === 'pass'
        ? 'Performance budgets passed for bounded local load result'
        : `${evaluation.violations.length} performance budget violation(s) need review`,
    differences: evaluation.violations.map((violation) => ({
      path: violation.metric,
      expected: violation.expected,
      actual: violation.actual,
      reason: `${violation.metric} exceeded configured performance budget`,
    })),
    numericDelta: evaluation.violations.length,
    toleranceUsed: { absoluteTolerance: 0, relativeTolerance: 0 },
  };
  return {
    testCase: {
      id: 'audit-performance-budgets',
      requirementId: 'audit_performance_budgets',
      input: {
        targetUrl: evaluation.loadResult.targetUrl,
        budget: evaluation.budget,
      },
      kind: 'property',
      metadata: {},
    },
    expected: {
      value: evaluation.budget,
      warnings: [],
      metadata: {},
    },
    actual: {
      value: evaluation.loadResult,
      status: verdict === 'pass' ? 'success' : 'error',
      warnings: [],
      metadata: {
        violations: evaluation.violations,
      },
    },
    deterministic,
    finalVerdict: verdict,
  };
}
