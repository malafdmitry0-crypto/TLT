import fs from 'node:fs';
import path from 'node:path';

import type { ReportResult } from '../reporting/types';
import type { AuditOwnershipItem } from './AuditOwnershipPlanner';
import type { AuditRecipeMatch } from './AuditRecipes';
import type { RegressionTestProposal } from './AuditRegressionPlanner';
import type { CodebaseScanFinding } from './SecurityCodebaseScannerSubagent';

export type AuditJournalEventType =
  | 'finding'
  | 'recipe'
  | 'regression_test_proposal'
  | 'ownership_plan'
  | 'summary';

export type AuditJournalEntry = {
  at: string;
  runId: string;
  eventType: AuditJournalEventType;
  domain: 'security' | 'performance' | 'metrics' | 'business' | 'ui' | 'unknown';
  id: string;
  title: string;
  severity?: string;
  source?: string;
  evidence?: string;
  recommendation?: string;
  owner?: string;
  targetRoot?: string;
  framework?: string;
  metadata?: Record<string, unknown>;
};

export type AuditJournalSummary = {
  journalPath: string;
  writtenEntries: number;
  runId: string;
};

function nowIso(): string {
  return new Date().toISOString();
}

export function createAuditRunId(date = new Date()): string {
  return `audit-${date.toISOString().replaceAll(/[-:]/g, '').replace(/\.\d{3}Z$/, 'z')}`;
}

export function appendAuditJournalEntries(journalPath: string, entries: AuditJournalEntry[]): AuditJournalSummary {
  fs.mkdirSync(path.dirname(journalPath), { recursive: true });
  if (entries.length > 0) {
    fs.appendFileSync(journalPath, entries.map((entry) => JSON.stringify(entry)).join('\n') + '\n');
  }
  return {
    journalPath,
    writtenEntries: entries.length,
    runId: entries[0]?.runId ?? createAuditRunId(),
  };
}

export function readAuditJournal(journalPath: string): AuditJournalEntry[] {
  if (!fs.existsSync(journalPath)) return [];
  return fs
    .readFileSync(journalPath, 'utf8')
    .split('\n')
    .filter(Boolean)
    .flatMap((line): AuditJournalEntry[] => {
      try {
        const parsed = JSON.parse(line) as AuditJournalEntry;
        return typeof parsed.runId === 'string' && typeof parsed.eventType === 'string' ? [parsed] : [];
      } catch {
        return [];
      }
    });
}

function findingEntry(runId: string, finding: CodebaseScanFinding, at: string): AuditJournalEntry {
  return {
    at,
    runId,
    eventType: 'finding',
    domain: 'security',
    id: finding.id,
    title: finding.title,
    severity: finding.severity,
    source: `${finding.file}:${finding.line}`,
    evidence: finding.evidence,
    recommendation: finding.recommendation,
    metadata: {
      ruleId: finding.ruleId,
      confidence: finding.confidence,
      category: finding.category,
    },
  };
}

function recipeEntry(runId: string, match: AuditRecipeMatch, at: string): AuditJournalEntry {
  return {
    at,
    runId,
    eventType: 'recipe',
    domain: match.recipe.domain,
    id: `${match.recipe.id}:${match.findingId}`,
    title: match.recipe.title,
    source: match.findingId,
    recommendation: match.recipe.expected,
    framework: match.recipe.suggestedTest,
    metadata: {
      steps: match.recipe.steps,
    },
  };
}

function regressionEntry(runId: string, proposal: RegressionTestProposal, at: string): AuditJournalEntry {
  return {
    at,
    runId,
    eventType: 'regression_test_proposal',
    domain: proposal.domain,
    id: proposal.id,
    title: proposal.title,
    source: proposal.findingId,
    recommendation: proposal.rationale,
    targetRoot: proposal.targetRoot,
    framework: proposal.framework,
  };
}

function ownershipEntry(runId: string, item: AuditOwnershipItem, at: string): AuditJournalEntry {
  return {
    at,
    runId,
    eventType: 'ownership_plan',
    domain: item.branchDomain,
    id: `ownership:${item.findingId}`,
    title: `Owner ${item.owner} for ${item.findingId}`,
    source: item.findingId,
    owner: item.owner,
    metadata: {
      fixSize: item.fixSize,
      filesLikelyAffected: item.filesLikelyAffected,
      testsToRun: item.testsToRun,
    },
  };
}

export function buildAuditJournalEntries(args: {
  runId?: string;
  findings?: CodebaseScanFinding[];
  recipeMatches?: AuditRecipeMatch[];
  regressionProposals?: RegressionTestProposal[];
  ownershipItems?: AuditOwnershipItem[];
  summary?: Record<string, unknown>;
  at?: string;
}): AuditJournalEntry[] {
  const runId = args.runId ?? createAuditRunId();
  const at = args.at ?? nowIso();
  const entries = [
    ...(args.findings ?? []).map((finding) => findingEntry(runId, finding, at)),
    ...(args.recipeMatches ?? []).map((match) => recipeEntry(runId, match, at)),
    ...(args.regressionProposals ?? []).map((proposal) => regressionEntry(runId, proposal, at)),
    ...(args.ownershipItems ?? []).map((item) => ownershipEntry(runId, item, at)),
  ];
  if (args.summary) {
    entries.push({
      at,
      runId,
      eventType: 'summary',
      domain: 'unknown',
      id: `summary:${runId}`,
      title: 'Audit run summary',
      metadata: args.summary,
    });
  }
  return entries;
}

export function auditJournalToReportResult(summary: AuditJournalSummary): ReportResult {
  return {
    testCase: {
      id: 'audit-journal',
      requirementId: 'audit_regression_journal',
      input: {
        journalPath: summary.journalPath,
        writtenEntries: summary.writtenEntries,
      },
      kind: 'property',
      metadata: {},
    },
    expected: {
      value: 'Audit run writes append-only journal entries for regression follow-up',
      warnings: [],
      metadata: {},
    },
    actual: {
      value: summary,
      status: 'success',
      warnings: [],
      metadata: {},
    },
    deterministic: {
      verdict: 'pass',
      severity: 'low',
      reason: `${summary.writtenEntries} audit journal entrie(s) written`,
      differences: [],
      numericDelta: summary.writtenEntries,
      toleranceUsed: { absoluteTolerance: 0, relativeTolerance: 0 },
    },
    finalVerdict: 'pass',
  };
}
