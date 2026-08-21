import type { ReportResult } from '../reporting/types';
import type { CodebaseScanFinding } from './SecurityCodebaseScannerSubagent';

export type AuditRecipe = {
  id: string;
  domain: 'security' | 'performance' | 'metrics' | 'business' | 'ui';
  title: string;
  matchesRuleIds: string[];
  steps: string[];
  expected: string;
  suggestedTest: 'backend-pytest' | 'frontend-vitest' | 'playwright' | 'qa-agent' | 'manual-review';
};

export type AuditRecipeMatch = {
  findingId: string;
  recipe: AuditRecipe;
};

export const DEFAULT_AUDIT_RECIPES: AuditRecipe[] = [
  {
    id: 'csv-formula-injection',
    domain: 'security',
    title: 'CSV/XLSX formula injection regression',
    matchesRuleIds: ['path-traversal-risk'],
    steps: ['Create object with a formula-like name', 'Export CSV/XLSX', 'Assert exported cell is escaped'],
    expected: 'Excel opens exported value as text, not as a formula.',
    suggestedTest: 'backend-pytest',
  },
  {
    id: 'xss-html-rendering',
    domain: 'security',
    title: 'Unsafe HTML rendering regression',
    matchesRuleIds: ['dangerous-html-render'],
    steps: ['Render payload-like text in the affected component', 'Assert no HTML execution and escaped output'],
    expected: 'Payload is rendered as text or sanitized through an allow-list.',
    suggestedTest: 'frontend-vitest',
  },
  {
    id: 'session-storage-risk',
    domain: 'security',
    title: 'Session storage risk review',
    matchesRuleIds: ['frontend-token-local-storage'],
    steps: ['Check token storage path', 'Verify refresh/logout behavior', 'Document migration plan to HttpOnly cookies'],
    expected: 'Session handling has an accepted risk entry or a migration test plan.',
    suggestedTest: 'manual-review',
  },
  {
    id: 'unsafe-process-execution',
    domain: 'security',
    title: 'Dynamic execution regression',
    matchesRuleIds: ['dynamic-code-execution', 'python-subprocess-shell'],
    steps: ['Identify user-controlled inputs', 'Add test with shell metacharacters', 'Assert no shell interpretation'],
    expected: 'Execution path uses argument arrays or rejects unsafe input.',
    suggestedTest: 'backend-pytest',
  },
  {
    id: 'missing-metrics-coverage',
    domain: 'metrics',
    title: 'Metrics coverage regression',
    matchesRuleIds: [],
    steps: ['Add operation metric', 'Exercise operation in a test', 'Assert metric signal is emitted'],
    expected: 'Import, calculation, report, and worker operations expose metric signals.',
    suggestedTest: 'backend-pytest',
  },
];

export function suggestAuditRecipes(findings: CodebaseScanFinding[]): AuditRecipeMatch[] {
  const matches: AuditRecipeMatch[] = [];
  for (const finding of findings) {
    for (const recipe of DEFAULT_AUDIT_RECIPES) {
      if (recipe.matchesRuleIds.includes(finding.ruleId)) {
        matches.push({ findingId: finding.id, recipe });
      }
    }
  }
  return matches;
}

export function auditRecipesToReportResult(matches: AuditRecipeMatch[]): ReportResult {
  return {
    testCase: {
      id: 'audit-confirmation-recipes',
      requirementId: 'audit_findings_have_confirmation_recipes',
      input: { matches: matches.length },
      kind: 'property',
      metadata: {},
    },
    expected: {
      value: 'Findings have safe confirmation recipes when known',
      warnings: [],
      metadata: {},
    },
    actual: {
      value: matches,
      status: 'success',
      warnings: [],
      metadata: {},
    },
    deterministic: {
      verdict: 'pass',
      severity: 'low',
      reason: `${matches.length} recipe suggestion(s) generated`,
      differences: [],
      numericDelta: matches.length,
      toleranceUsed: { absoluteTolerance: 0, relativeTolerance: 0 },
    },
    finalVerdict: 'pass',
  };
}
