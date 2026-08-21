import type { ComparisonResult } from '../comparison/types';
import type { ReportResult } from '../reporting/types';
import type { Severity, Verdict } from '../shared/types';
import type { CodebaseScanSummary } from './SecurityCodebaseScannerSubagent';
import { isLocalSecurityTarget } from './SecurityPentestAgent';

export type AuditProbeResult = {
  id: string;
  domain: 'security' | 'performance' | 'metrics';
  verdict: Verdict;
  severity: Severity;
  title: string;
  evidence: string;
  recommendation: string;
  metadata: Record<string, unknown>;
};

export type AuditConfirmingProbeSummary = {
  targetUrl: string;
  probes: AuditProbeResult[];
};

function verdictFromFindings(count: number): Verdict {
  return count > 0 ? 'needs_review' : 'pass';
}

function severityFromFindings(count: number): Severity {
  return count > 0 ? 'medium' : 'low';
}

async function securityHeadersProbe(targetUrl: string): Promise<AuditProbeResult> {
  const started = Date.now();
  try {
    const response = await fetch(targetUrl, {
      method: 'GET',
      redirect: 'manual',
      signal: AbortSignal.timeout(5_000),
    });
    const missing = ['content-security-policy', 'x-content-type-options', 'x-frame-options'].filter(
      (name) => !response.headers.has(name),
    );
    return {
      id: 'probe-security-headers',
      domain: 'security',
      verdict: missing.length > 0 ? 'needs_review' : 'pass',
      severity: missing.length > 0 ? 'medium' : 'low',
      title: 'HTTP security headers probe',
      evidence:
        missing.length > 0
          ? `Missing response headers: ${missing.join(', ')}`
          : 'Common browser security headers are present',
      recommendation:
        missing.length > 0
          ? 'Review frontend/Caddy headers and add explicit tests for security headers on the shell route.'
          : 'Keep headers covered by deployment tests.',
      metadata: {
        status: response.status,
        durationMs: Date.now() - started,
        missing,
      },
    };
  } catch (error) {
    return {
      id: 'probe-security-headers',
      domain: 'security',
      verdict: 'needs_review',
      severity: 'medium',
      title: 'HTTP security headers probe',
      evidence: `Could not reach local target: ${error instanceof Error ? error.message : String(error)}`,
      recommendation: 'Run the probe against a running local frontend/backend target.',
      metadata: {
        durationMs: Date.now() - started,
      },
    };
  }
}

function staticFindingConfirmationProbe(codebaseScan?: CodebaseScanSummary): AuditProbeResult {
  const findings = codebaseScan?.findings ?? [];
  const highConfidence = findings.filter((finding) => finding.confidence === 'high');
  return {
    id: 'probe-static-finding-confirmation',
    domain: 'security',
    verdict: verdictFromFindings(findings.length),
    severity: severityFromFindings(findings.length),
    title: 'Static finding confirmation probe',
    evidence:
      findings.length === 0
        ? 'No active codebase findings to confirm.'
        : `${findings.length} active codebase finding(s), ${highConfidence.length} high-confidence pattern match(es).`,
    recommendation:
      findings.length === 0
        ? 'No action required.'
        : 'Use targeted regression tests or code review to confirm each heuristic finding before fixing.',
    metadata: {
      findings: findings.length,
      highConfidence: highConfidence.length,
      ruleIds: [...new Set(findings.map((finding) => finding.ruleId))].sort(),
    },
  };
}

export async function runAuditConfirmingProbes(config: {
  targetUrl: string;
  codebaseScan?: CodebaseScanSummary;
  includeHttpProbe?: boolean;
}): Promise<AuditConfirmingProbeSummary> {
  const probes: AuditProbeResult[] = [staticFindingConfirmationProbe(config.codebaseScan)];
  if (config.includeHttpProbe) {
    if (!isLocalSecurityTarget(config.targetUrl)) {
      probes.push({
        id: 'probe-security-headers',
        domain: 'security',
        verdict: 'needs_review',
        severity: 'medium',
        title: 'HTTP security headers probe',
        evidence: `Skipped non-local target: ${config.targetUrl}`,
        recommendation: 'Confirming probes accept local targets only.',
        metadata: {},
      });
    } else {
      probes.push(await securityHeadersProbe(config.targetUrl));
    }
  }
  return {
    targetUrl: config.targetUrl,
    probes,
  };
}

function combinedVerdict(probes: AuditProbeResult[]): Verdict {
  if (probes.some((probe) => probe.verdict === 'fail')) return 'fail';
  if (probes.some((probe) => probe.verdict === 'needs_review')) return 'needs_review';
  return 'pass';
}

function combinedSeverity(probes: AuditProbeResult[]): Severity {
  if (probes.some((probe) => probe.severity === 'high')) return 'high';
  if (probes.some((probe) => probe.severity === 'medium')) return 'medium';
  return 'low';
}

export function auditConfirmingProbesToReportResult(summary: AuditConfirmingProbeSummary): ReportResult {
  const verdict = combinedVerdict(summary.probes);
  const deterministic: ComparisonResult = {
    verdict,
    severity: combinedSeverity(summary.probes),
    reason:
      verdict === 'pass'
        ? 'Confirming probes passed'
        : `${summary.probes.filter((probe) => probe.verdict !== 'pass').length} confirming probe(s) need review`,
    differences: summary.probes
      .filter((probe) => probe.verdict !== 'pass')
      .map((probe) => ({
        path: probe.id,
        expected: 'Probe passes',
        actual: probe.verdict,
        reason: probe.evidence,
      })),
    numericDelta: summary.probes.filter((probe) => probe.verdict !== 'pass').length,
    toleranceUsed: { absoluteTolerance: 0, relativeTolerance: 0 },
  };
  return {
    testCase: {
      id: 'audit-confirming-probes',
      requirementId: 'audit_findings_confirmed_by_safe_probes',
      input: {
        targetUrl: summary.targetUrl,
        probes: summary.probes.map((probe) => probe.id),
      },
      kind: 'property',
      metadata: {},
    },
    expected: {
      value: 'Safe confirming probes pass or clearly mark findings for triage',
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
