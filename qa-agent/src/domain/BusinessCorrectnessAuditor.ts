import type { ReportResult } from '../reporting/types';
import {
  evaluateTltHeatLossCases,
  fixtureTltHeatLossCases,
  LocalTltHeatLossRunner,
  sanitizeTltHeatLossCases,
} from './TltHeatLossDomainCases';

export type BusinessCorrectnessSummary = {
  runner: string;
  cases: number;
  passed: number;
  failed: number;
  needsReview: number;
};

export async function runBusinessCorrectnessAudit(limit = 12): Promise<{
  summary: BusinessCorrectnessSummary;
  results: ReportResult[];
}> {
  const runner = new LocalTltHeatLossRunner();
  const cases = sanitizeTltHeatLossCases(fixtureTltHeatLossCases(limit), {
    source: 'fixture',
    limit,
  }).accepted;
  const results = await evaluateTltHeatLossCases(cases, runner);
  return {
    summary: {
      runner: runner.name,
      cases: cases.length,
      passed: results.filter((result) => result.finalVerdict === 'pass').length,
      failed: results.filter((result) => result.finalVerdict === 'fail').length,
      needsReview: results.filter((result) => result.finalVerdict === 'needs_review').length,
    },
    results,
  };
}

export function businessCorrectnessSummaryToReportResult(summary: BusinessCorrectnessSummary): ReportResult {
  const ok = summary.failed === 0 && summary.needsReview === 0;
  return {
    testCase: {
      id: 'audit-business-correctness-summary',
      requirementId: 'audit_business_formula_invariants',
      input: { cases: summary.cases, runner: summary.runner },
      kind: 'property',
      metadata: {},
    },
    expected: { value: 'Business correctness invariant cases pass', warnings: [], metadata: {} },
    actual: { value: summary, status: ok ? 'success' : 'error', warnings: [], metadata: {} },
    deterministic: {
      verdict: ok ? 'pass' : 'needs_review',
      severity: ok ? 'low' : 'high',
      reason: ok
        ? `${summary.passed}/${summary.cases} business invariant cases passed`
        : `${summary.failed} failed and ${summary.needsReview} need review`,
      differences: ok
        ? []
        : [
            {
              path: 'businessCorrectness',
              expected: '0 failures',
              actual: { failed: summary.failed, needsReview: summary.needsReview },
              reason: 'Business correctness audit found non-passing invariant cases.',
            },
          ],
      numericDelta: summary.failed + summary.needsReview,
      toleranceUsed: { absoluteTolerance: 0, relativeTolerance: 0 },
    },
    finalVerdict: ok ? 'pass' : 'needs_review',
  };
}
