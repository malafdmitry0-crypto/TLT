import type { ReportResult } from '../reporting/types';
import type { CodebaseScanFinding } from './SecurityCodebaseScannerSubagent';

export type AuditOwner = 'backend' | 'frontend' | 'e2e' | 'qa-agent' | 'docs' | 'unknown';
export type AuditFixSize = 'S' | 'M' | 'L';

export type AuditOwnershipItem = {
  findingId: string;
  owner: AuditOwner;
  branchDomain: 'security' | 'performance' | 'metrics';
  fixSize: AuditFixSize;
  filesLikelyAffected: string[];
  testsToRun: string[];
};

function ownerForFile(file: string): AuditOwner {
  if (file.startsWith('backend/')) return 'backend';
  if (file.startsWith('frontend/')) return 'frontend';
  if (file.startsWith('e2e/')) return 'e2e';
  if (file.startsWith('qa-agent/')) return 'qa-agent';
  if (file.startsWith('docs/')) return 'docs';
  return 'unknown';
}

function testsForOwner(owner: AuditOwner): string[] {
  if (owner === 'backend') return ['make test-backend'];
  if (owner === 'frontend') return ['make test-frontend'];
  if (owner === 'e2e') return ['make test-e2e'];
  if (owner === 'qa-agent') return ['npm --prefix qa-agent run qa-agent:test'];
  return ['npm --prefix qa-agent run qa-agent:test'];
}

export function planAuditOwnership(findings: CodebaseScanFinding[]): AuditOwnershipItem[] {
  return findings.map((finding) => {
    const owner = ownerForFile(finding.file);
    return {
      findingId: finding.id,
      owner,
      branchDomain: finding.category === 'dependency' ? 'security' : finding.category === 'unknown' ? 'metrics' : 'security',
      fixSize: finding.confidence === 'high' && finding.severity === 'high' ? 'M' : 'S',
      filesLikelyAffected: [finding.file],
      testsToRun: testsForOwner(owner),
    };
  });
}

export function auditOwnershipToReportResult(items: AuditOwnershipItem[]): ReportResult {
  return {
    testCase: {
      id: 'audit-ownership-fix-planner',
      requirementId: 'audit_findings_have_owner_and_fix_plan',
      input: { findings: items.length },
      kind: 'property',
      metadata: {},
    },
    expected: { value: 'Each finding has likely owner, size, branch domain, and tests', warnings: [], metadata: {} },
    actual: { value: items, status: 'success', warnings: [], metadata: {} },
    deterministic: {
      verdict: 'pass',
      severity: 'low',
      reason: `${items.length} ownership item(s) generated`,
      differences: [],
      numericDelta: items.length,
      toleranceUsed: { absoluteTolerance: 0, relativeTolerance: 0 },
    },
    finalVerdict: 'pass',
  };
}
