import type { ReportResult } from '../reporting/types';
import type { AuditRecipeMatch } from './AuditRecipes';
import type { CodebaseScanFinding } from './SecurityCodebaseScannerSubagent';

export type RegressionTestProposal = {
  id: string;
  findingId?: string;
  domain: 'security' | 'performance' | 'metrics' | 'business' | 'ui';
  framework: 'pytest' | 'vitest' | 'playwright' | 'qa-agent';
  targetRoot: string;
  title: string;
  rationale: string;
};

function proposalForFinding(finding: CodebaseScanFinding): RegressionTestProposal {
  const isFrontend = finding.file.startsWith('frontend/');
  const isE2e = finding.file.startsWith('e2e/');
  return {
    id: `regression-${finding.id}`,
    findingId: finding.id,
    domain: 'security',
    framework: isE2e ? 'playwright' : isFrontend ? 'vitest' : 'pytest',
    targetRoot: isE2e ? 'e2e/tests' : isFrontend ? 'frontend/src/__tests__' : 'backend/app/tests',
    title: `Regression for ${finding.title}`,
    rationale: `${finding.file}:${finding.line} matched ${finding.ruleId}.`,
  };
}

export function planRegressionTests(args: {
  findings: CodebaseScanFinding[];
  recipeMatches?: AuditRecipeMatch[];
}): RegressionTestProposal[] {
  const proposals = args.findings.map(proposalForFinding);
  for (const match of args.recipeMatches ?? []) {
    proposals.push({
      id: `recipe-${match.recipe.id}-${match.findingId}`,
      findingId: match.findingId,
      domain: match.recipe.domain,
      framework:
        match.recipe.suggestedTest === 'playwright'
          ? 'playwright'
          : match.recipe.suggestedTest === 'frontend-vitest'
            ? 'vitest'
            : match.recipe.suggestedTest === 'qa-agent'
              ? 'qa-agent'
              : 'pytest',
      targetRoot:
        match.recipe.suggestedTest === 'playwright'
          ? 'e2e/tests'
          : match.recipe.suggestedTest === 'frontend-vitest'
            ? 'frontend/src/__tests__'
            : match.recipe.suggestedTest === 'qa-agent'
              ? 'qa-agent/tests'
              : 'backend/app/tests',
      title: match.recipe.title,
      rationale: match.recipe.expected,
    });
  }
  return proposals;
}

export function regressionPlanToReportResult(proposals: RegressionTestProposal[]): ReportResult {
  return {
    testCase: {
      id: 'audit-regression-test-plan',
      requirementId: 'audit_findings_have_regression_test_plan',
      input: { proposals: proposals.length },
      kind: 'property',
      metadata: {},
    },
    expected: { value: 'Actionable regression test proposals', warnings: [], metadata: {} },
    actual: { value: proposals, status: 'success', warnings: [], metadata: {} },
    deterministic: {
      verdict: 'pass',
      severity: 'low',
      reason: `${proposals.length} regression test proposal(s) generated`,
      differences: [],
      numericDelta: proposals.length,
      toleranceUsed: { absoluteTolerance: 0, relativeTolerance: 0 },
    },
    finalVerdict: 'pass',
  };
}
