import type { ReportResult } from '../reporting/types';
import { runAppTestCommand, type AppTestCommand, type AppTestRunResult } from './AppTestAgent';

export type FlakinessSummary = {
  command: string;
  repeats: number;
  passed: number;
  failed: number;
  timedOut: number;
  classification: 'stable_pass' | 'stable_fail' | 'flaky' | 'timeout_sensitive';
  runs: AppTestRunResult[];
};

export type AppTestCommandRunner = (command: AppTestCommand, repoRoot: string) => Promise<AppTestRunResult>;

function classify(runs: AppTestRunResult[]): FlakinessSummary['classification'] {
  const passed = runs.filter((run) => run.exitCode === 0 && !run.timedOut).length;
  const failed = runs.length - passed;
  const timedOut = runs.filter((run) => run.timedOut).length;
  if (timedOut > 0) return 'timeout_sensitive';
  if (passed === runs.length) return 'stable_pass';
  if (failed === runs.length) return 'stable_fail';
  return 'flaky';
}

export async function detectFlakiness(args: {
  command: AppTestCommand;
  repoRoot: string;
  repeats: number;
  runner?: AppTestCommandRunner;
}): Promise<FlakinessSummary> {
  const runner = args.runner ?? runAppTestCommand;
  const runs: AppTestRunResult[] = [];
  for (let index = 0; index < args.repeats; index += 1) {
    runs.push(await runner(args.command, args.repoRoot));
  }
  const passed = runs.filter((run) => run.exitCode === 0 && !run.timedOut).length;
  return {
    command: [args.command.command, ...args.command.args].join(' '),
    repeats: args.repeats,
    passed,
    failed: runs.length - passed,
    timedOut: runs.filter((run) => run.timedOut).length,
    classification: classify(runs),
    runs,
  };
}

export function flakinessToReportResult(summary: FlakinessSummary): ReportResult {
  const needsReview = summary.classification === 'flaky' || summary.classification === 'timeout_sensitive';
  return {
    testCase: {
      id: 'audit-flakiness-detector',
      requirementId: 'audit_tests_are_not_flaky',
      input: { command: summary.command, repeats: summary.repeats },
      kind: 'property',
      metadata: {},
    },
    expected: { value: 'Repeated test command is stable', warnings: [], metadata: {} },
    actual: { value: summary, status: needsReview ? 'error' : 'success', warnings: [], metadata: {} },
    deterministic: {
      verdict: needsReview ? 'needs_review' : 'pass',
      severity: needsReview ? 'medium' : 'low',
      reason: `Flakiness classification: ${summary.classification}`,
      differences: needsReview
        ? [
            {
              path: 'classification',
              expected: 'stable_pass or stable_fail',
              actual: summary.classification,
              reason: `${summary.passed} passed, ${summary.failed} failed, ${summary.timedOut} timed out`,
            },
          ]
        : [],
      numericDelta: summary.failed + summary.timedOut,
      toleranceUsed: { absoluteTolerance: 0, relativeTolerance: 0 },
    },
    finalVerdict: needsReview ? 'needs_review' : 'pass',
  };
}
