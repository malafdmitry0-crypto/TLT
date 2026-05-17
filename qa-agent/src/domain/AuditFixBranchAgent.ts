import { execFile } from 'node:child_process';
import { promisify } from 'node:util';

import type { ReportResult } from '../reporting/types';
import type { CodebaseScanFinding } from './SecurityCodebaseScannerSubagent';
import type { SecurityReviewFinding } from './SecurityPentestAgent';

const execFileAsync = promisify(execFile);

export type AuditDomain = 'security' | 'performance' | 'metrics';
export type AuditFixBranchStatus = 'created' | 'already_on_branch' | 'switched_existing' | 'blocked';

export type AuditFixBranchResult = {
  status: AuditFixBranchStatus;
  branchName: string;
  domain: AuditDomain;
  previousBranch?: string;
  dirtyWorktree: boolean;
  changedFiles: string[];
  reason?: string;
};

export type AuditFixTask = {
  id: string;
  domain: AuditDomain;
  severity: string;
  title: string;
  source: string;
  evidence: string;
  recommendation: string;
};

export type AuditFixHandoff = {
  branch: AuditFixBranchResult;
  tasks: AuditFixTask[];
  rules: {
    isolatedBranchRequired: true;
    autoCommit: false;
    destructiveChangesAllowed: false;
    scannerSubagentReadOnly: true;
  };
};

export type GitExecutor = (args: string[], cwd: string) => Promise<{ stdout: string; stderr: string }>;

export const AUDIT_FIX_BRANCH_PREFIX = 'qa/audit';

export function defaultGitExecutor(args: string[], cwd: string): Promise<{ stdout: string; stderr: string }> {
  return execFileAsync('git', args, { cwd }).then((result) => ({
    stdout: result.stdout,
    stderr: result.stderr,
  }));
}

export function parseAuditDomain(value: string | undefined): AuditDomain {
  return value === 'performance' || value === 'metrics' || value === 'security' ? value : 'security';
}

export function createAuditFixBranchName(domain: AuditDomain, date = new Date()): string {
  const stamp = date
    .toISOString()
    .replaceAll(/[-:]/g, '')
    .replace(/\.\d{3}Z$/, 'z');
  return `${AUDIT_FIX_BRANCH_PREFIX}/${domain}-fixes-${stamp}`;
}

export function isSafeAuditFixBranchName(branchName: string): boolean {
  return /^qa\/audit\/(?:security|performance|metrics)-fixes-[a-zA-Z0-9._-]+$/.test(branchName);
}

function parsePorcelainFiles(status: string): string[] {
  return status
    .split('\n')
    .filter((line) => line.trim().length > 0)
    .map((line) => line.slice(3).trim())
    .filter(Boolean);
}

async function branchExists(executor: GitExecutor, repoRoot: string, branchName: string): Promise<boolean> {
  try {
    await executor(['rev-parse', '--verify', branchName], repoRoot);
    return true;
  } catch {
    return false;
  }
}

export async function prepareAuditFixBranch(config: {
  repoRoot: string;
  domain?: AuditDomain;
  branchName?: string;
  allowDirtyWorktree?: boolean;
  executor?: GitExecutor;
}): Promise<AuditFixBranchResult> {
  const executor = config.executor ?? defaultGitExecutor;
  const domain = config.domain ?? 'security';
  const branchName = config.branchName ?? createAuditFixBranchName(domain);

  if (!isSafeAuditFixBranchName(branchName)) {
    return {
      status: 'blocked',
      branchName,
      domain,
      dirtyWorktree: false,
      changedFiles: [],
      reason: `Unsafe audit fix branch name: ${branchName}`,
    };
  }

  const currentBranch = (await executor(['branch', '--show-current'], config.repoRoot)).stdout.trim();
  const statusOutput = (await executor(['status', '--porcelain'], config.repoRoot)).stdout;
  const changedFiles = parsePorcelainFiles(statusOutput);
  const dirtyWorktree = changedFiles.length > 0;

  if (dirtyWorktree && !config.allowDirtyWorktree && currentBranch !== branchName) {
    return {
      status: 'blocked',
      branchName,
      domain,
      previousBranch: currentBranch,
      dirtyWorktree,
      changedFiles,
      reason:
        'Audit fix mode requires a clean worktree before switching branches. Commit, stash, or set QA_AGENT_AUDIT_FIX_ALLOW_DIRTY=1 intentionally.',
    };
  }

  if (currentBranch === branchName) {
    return {
      status: 'already_on_branch',
      branchName,
      domain,
      previousBranch: currentBranch,
      dirtyWorktree,
      changedFiles,
    };
  }

  if (await branchExists(executor, config.repoRoot, branchName)) {
    await executor(['switch', branchName], config.repoRoot);
    return {
      status: 'switched_existing',
      branchName,
      domain,
      previousBranch: currentBranch,
      dirtyWorktree,
      changedFiles,
    };
  }

  await executor(['switch', '-c', branchName], config.repoRoot);
  return {
    status: 'created',
    branchName,
    domain,
    previousBranch: currentBranch,
    dirtyWorktree,
    changedFiles,
  };
}

export function buildAuditFixHandoff(args: {
  branch: AuditFixBranchResult;
  codebaseFindings?: CodebaseScanFinding[];
  reviewFindings?: SecurityReviewFinding[];
}): AuditFixHandoff {
  const codebaseTasks: AuditFixTask[] = (args.codebaseFindings ?? []).map((finding) => ({
    id: finding.id,
    domain: args.branch.domain,
    severity: finding.severity,
    title: finding.title,
    source: `${finding.file}:${finding.line} (${finding.ruleId})`,
    evidence: finding.evidence,
    recommendation: finding.recommendation,
  }));
  const reviewTasks: AuditFixTask[] = (args.reviewFindings ?? []).map((finding, index) => ({
    id: `llm-review-${index + 1}`,
    domain: args.branch.domain,
    severity: finding.severity,
    title: finding.title,
    source: finding.source,
    evidence: finding.evidence,
    recommendation: finding.recommendation,
  }));

  return {
    branch: args.branch,
    tasks: [...codebaseTasks, ...reviewTasks],
    rules: {
      isolatedBranchRequired: true,
      autoCommit: false,
      destructiveChangesAllowed: false,
      scannerSubagentReadOnly: true,
    },
  };
}

export function auditFixBranchToReportResult(handoff: AuditFixHandoff): ReportResult {
  const blocked = handoff.branch.status === 'blocked';
  return {
    testCase: {
      id: 'audit-fix-branch-gate',
      requirementId: 'audit_fixes_isolated_branch',
      input: {
        domain: handoff.branch.domain,
        branchName: handoff.branch.branchName,
        taskCount: handoff.tasks.length,
      },
      kind: 'fixed',
      metadata: {
        branchStatus: handoff.branch.status,
      },
    },
    expected: {
      value: 'Audit fixes must be prepared only on an isolated qa/audit/*-fixes-* branch',
      warnings: [],
      metadata: {},
    },
    actual: {
      value: handoff,
      status: blocked ? 'error' : 'success',
      warnings: [],
      metadata: {},
    },
    deterministic: {
      verdict: blocked ? 'fail' : 'pass',
      severity: blocked ? 'high' : 'low',
      reason: blocked
        ? handoff.branch.reason ?? 'Audit fix branch gate blocked'
        : `Audit fix branch gate ready: ${handoff.branch.branchName}`,
      differences: blocked
        ? [
            {
              path: '$.branch',
              expected: 'isolated clean audit fix branch',
              actual: handoff.branch,
              reason: handoff.branch.reason ?? 'branch gate blocked',
            },
          ]
        : [],
      numericDelta: 0,
      toleranceUsed: { absoluteTolerance: 0, relativeTolerance: 0 },
    },
    finalVerdict: blocked ? 'fail' : 'pass',
  };
}
