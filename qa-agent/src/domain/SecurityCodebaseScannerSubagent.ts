import fs from 'node:fs';
import path from 'node:path';

import type { ReportResult } from '../reporting/types';
import type { Severity, Verdict } from '../shared/types';

export type CodebaseScanFinding = {
  id: string;
  ruleId: string;
  severity: Severity;
  category: 'auth' | 'injection' | 'secret' | 'transport' | 'filesystem' | 'dependency' | 'unknown';
  title: string;
  file: string;
  line: number;
  evidence: string;
  recommendation: string;
  confidence: 'low' | 'medium' | 'high';
};

export type CodebaseScanSummary = {
  scannedFiles: number;
  skippedFiles: number;
  findings: CodebaseScanFinding[];
};

export type CodebaseScannerConfig = {
  repoRoot: string;
  roots?: string[];
  maxFiles?: number;
  maxFileBytes?: number;
};

type ScannerRule = {
  id: string;
  severity: Severity;
  category: CodebaseScanFinding['category'];
  title: string;
  extensions: string[];
  pattern: RegExp;
  ignoreLinePattern?: RegExp;
  recommendation: string;
  confidence: CodebaseScanFinding['confidence'];
};

const DEFAULT_ROOTS = [
  'backend/app',
  'frontend/src',
  'qa-agent/src',
  'e2e/tests',
];

const EXCLUDED_DIRS = new Set([
  '.git',
  '.next',
  '.ruff_cache',
  '.venv',
  '__pycache__',
  'coverage',
  'dist',
  'htmlcov',
  'node_modules',
  'playwright-report',
  'reports',
  'test-results',
]);

const DEFAULT_MAX_FILES = 1_200;
const DEFAULT_MAX_FILE_BYTES = 300_000;
const MAX_FINDINGS = 100;
const MAX_FINDINGS_PER_RULE = 10;

const SCANNER_RULES: ScannerRule[] = [
  {
    id: 'frontend-token-local-storage',
    severity: 'high',
    category: 'auth',
    title: 'Auth/session data stored in localStorage',
    extensions: ['.ts', '.tsx', '.js', '.jsx'],
    pattern: /\blocalStorage\.(?:getItem|setItem)\s*\([^)]*(?:token|jwt|auth|session)/i,
    recommendation:
      'Prefer HttpOnly cookies with CSRF protection for session tokens, or document why this local-only storage is acceptable.',
    confidence: 'medium',
  },
  {
    id: 'dangerous-html-render',
    severity: 'high',
    category: 'injection',
    title: 'Potential unsafe HTML rendering',
    extensions: ['.ts', '.tsx', '.js', '.jsx'],
    pattern: /dangerouslySetInnerHTML/i,
    ignoreLinePattern: /^\s*pattern:\s*\/.*dangerouslySetInnerHTML/,
    recommendation:
      'Avoid raw HTML rendering or sanitize with a reviewed allow-list sanitizer and add regression tests for XSS payloads.',
    confidence: 'high',
  },
  {
    id: 'dynamic-code-execution',
    severity: 'high',
    category: 'injection',
    title: 'Dynamic code execution primitive',
    extensions: ['.ts', '.tsx', '.js', '.jsx', '.py'],
    pattern: /(?:\beval\s*\(|\bnew\s+Function\s*\(|\bchild_process\.exec(?:File|Sync)?\s*\(|(?<![\w.])exec(?:File|Sync)?\s*\()/,
    ignoreLinePattern: /^\s*pattern:\s*\//,
    recommendation:
      'Remove dynamic code execution. If unavoidable, isolate input, restrict capabilities, and add explicit security tests.',
    confidence: 'medium',
  },
  {
    id: 'python-subprocess-shell',
    severity: 'high',
    category: 'injection',
    title: 'Subprocess execution with shell=True',
    extensions: ['.py'],
    pattern: /\bsubprocess\.[a-zA-Z_]+\([^)]*shell\s*=\s*True/s,
    recommendation:
      'Use shell=False with argument arrays. Validate all user-controlled arguments before invoking system commands.',
    confidence: 'high',
  },
  {
    id: 'python-yaml-load',
    severity: 'high',
    category: 'injection',
    title: 'Unsafe YAML loading',
    extensions: ['.py'],
    pattern: /\byaml\.load\s*\((?![^)]*SafeLoader)/,
    recommendation: 'Use yaml.safe_load or yaml.load(..., Loader=yaml.SafeLoader).',
    confidence: 'high',
  },
  {
    id: 'python-requests-no-verify',
    severity: 'medium',
    category: 'transport',
    title: 'TLS verification disabled',
    extensions: ['.py'],
    pattern: /\bverify\s*=\s*False\b/,
    recommendation: 'Keep TLS verification enabled. If this is a test-only path, isolate it in tests and document it.',
    confidence: 'high',
  },
  {
    id: 'hardcoded-default-secret',
    severity: 'high',
    category: 'secret',
    title: 'Hardcoded default secret or password',
    extensions: ['.py', '.ts', '.tsx', '.js', '.jsx', '.yml', '.yaml', '.env', '.example'],
    pattern: /\b(?:SECRET_KEY|JWT_SECRET|PASSWORD|ADMIN_PASSWORD|API_KEY)\b[^'\n"]{0,80}['"](?:change-me|admin|password|secret|changeme)[^'"]*['"]/i,
    recommendation:
      'Fail fast outside local/dev when defaults are used and keep real secrets out of the repository.',
    confidence: 'medium',
  },
  {
    id: 'wide-open-cors',
    severity: 'medium',
    category: 'transport',
    title: 'Potential wide-open CORS',
    extensions: ['.py', '.ts', '.tsx', '.js', '.jsx'],
    pattern: /\ballow_origins\s*=\s*\[[^\]]*['"]\*['"]/s,
    recommendation: 'Restrict CORS origins per environment and add tests for untrusted origins.',
    confidence: 'medium',
  },
  {
    id: 'path-traversal-risk',
    severity: 'medium',
    category: 'filesystem',
    title: 'Path construction may need traversal guard',
    extensions: ['.py', '.ts', '.tsx', '.js', '.jsx'],
    pattern: /\b(?:open|readFileSync|writeFileSync|send_file)\s*\([^)]*(?:filename|path|file_path|targetPath)/i,
    recommendation:
      'Ensure paths are normalized under an allowed root and add tests for ../ traversal attempts.',
    confidence: 'low',
  },
];

function shouldScanFile(filePath: string): boolean {
  const ext = path.extname(filePath);
  return SCANNER_RULES.some((rule) => rule.extensions.includes(ext));
}

function walkFiles(root: string, maxFiles: number): string[] {
  const files: string[] = [];
  const stack = [root];
  while (stack.length > 0 && files.length < maxFiles) {
    const current = stack.pop()!;
    if (!fs.existsSync(current)) continue;
    for (const entry of fs.readdirSync(current, { withFileTypes: true })) {
      const entryPath = path.join(current, entry.name);
      if (entry.isDirectory()) {
        if (!EXCLUDED_DIRS.has(entry.name)) stack.push(entryPath);
      } else if (entry.isFile() && shouldScanFile(entryPath)) {
        files.push(entryPath);
        if (files.length >= maxFiles) break;
      }
    }
  }
  return files.sort();
}

function lineNumberForOffset(source: string, offset: number): number {
  return source.slice(0, offset).split('\n').length;
}

function lineAt(source: string, lineNumber: number): string {
  return source.split('\n')[lineNumber - 1]?.trim().slice(0, 240) ?? '';
}

function firstRelevantRuleMatch(
  rule: ScannerRule,
  relativeFile: string,
  source: string,
): { line: number; evidence: string } | undefined {
  const flags = rule.pattern.flags.includes('g') ? rule.pattern.flags : `${rule.pattern.flags}g`;
  const pattern = new RegExp(rule.pattern.source, flags);
  for (const match of source.matchAll(pattern)) {
    if (match.index === undefined) continue;
    const line = lineNumberForOffset(source, match.index);
    const evidence = lineAt(source, line);
    if (rule.ignoreLinePattern?.test(evidence)) continue;
    if (
      relativeFile === 'qa-agent/src/domain/SecurityCodebaseScannerSubagent.ts' &&
      /^\s*(?:pattern|ignoreLinePattern):\s*\//.test(evidence)
    ) {
      continue;
    }
    return { line, evidence };
  }
  return undefined;
}

function stableFindingId(ruleId: string, file: string, line: number): string {
  return `${ruleId}:${file}:${line}`;
}

function redactEvidence(ruleId: string, evidence: string): string {
  if (ruleId !== 'hardcoded-default-secret') return evidence;
  return evidence.replace(/(['"])([^'"]{3,})(['"])/g, '$1[redacted]$3');
}

export class SecurityCodebaseScannerSubagent {
  async scan(config: CodebaseScannerConfig): Promise<CodebaseScanSummary> {
    const roots = config.roots ?? DEFAULT_ROOTS;
    const maxFiles = config.maxFiles ?? DEFAULT_MAX_FILES;
    const maxFileBytes = config.maxFileBytes ?? DEFAULT_MAX_FILE_BYTES;
    const absoluteRoots = roots.map((root) => path.resolve(config.repoRoot, root));
    const files = absoluteRoots.flatMap((root) => walkFiles(root, maxFiles)).slice(0, maxFiles);
    const findings: CodebaseScanFinding[] = [];
    const findingsByRule = new Map<string, number>();
    let scannedFiles = 0;
    let skippedFiles = 0;

    for (const absoluteFile of files) {
      const stat = fs.statSync(absoluteFile);
      if (stat.size > maxFileBytes) {
        skippedFiles += 1;
        continue;
      }
      const relativeFile = path.relative(config.repoRoot, absoluteFile);
      const source = fs.readFileSync(absoluteFile, 'utf8');
      scannedFiles += 1;
      for (const rule of SCANNER_RULES) {
        if (findings.length >= MAX_FINDINGS) break;
        if ((findingsByRule.get(rule.id) ?? 0) >= MAX_FINDINGS_PER_RULE) continue;
        if (!rule.extensions.includes(path.extname(absoluteFile))) continue;
        const match = firstRelevantRuleMatch(rule, relativeFile, source);
        if (!match) continue;
        findingsByRule.set(rule.id, (findingsByRule.get(rule.id) ?? 0) + 1);
        findings.push({
          id: stableFindingId(rule.id, relativeFile, match.line),
          ruleId: rule.id,
          severity: rule.severity,
          category: rule.category,
          title: rule.title,
          file: relativeFile,
          line: match.line,
          evidence: redactEvidence(rule.id, match.evidence),
          recommendation: rule.recommendation,
          confidence: rule.confidence,
        });
      }
      if (findings.length >= MAX_FINDINGS) break;
    }

    return {
      scannedFiles,
      skippedFiles,
      findings: findings.sort((a, b) => a.file.localeCompare(b.file) || a.line - b.line || a.ruleId.localeCompare(b.ruleId)),
    };
  }
}

function verdictForSummary(summary: CodebaseScanSummary): Verdict {
  if (summary.findings.some((finding) => finding.severity === 'high')) return 'needs_review';
  if (summary.findings.length > 0) return 'needs_review';
  return 'pass';
}

function severityForSummary(summary: CodebaseScanSummary): Severity {
  if (summary.findings.some((finding) => finding.severity === 'high')) return 'high';
  if (summary.findings.some((finding) => finding.severity === 'medium')) return 'medium';
  return 'low';
}

export function codebaseScanToReportResult(summary: CodebaseScanSummary): ReportResult {
  const verdict = verdictForSummary(summary);
  return {
    testCase: {
      id: 'security-codebase-scanner-subagent',
      requirementId: 'local_codebase_security_scan',
      input: {
        scannedFiles: summary.scannedFiles,
        skippedFiles: summary.skippedFiles,
      },
      kind: 'property',
      metadata: {
        scanner: 'SecurityCodebaseScannerSubagent',
        findingCount: summary.findings.length,
      },
    },
    expected: {
      value: 'No high-confidence security smells in local codebase scan',
      warnings: [],
      metadata: {},
    },
    actual: {
      value: {
        scannedFiles: summary.scannedFiles,
        skippedFiles: summary.skippedFiles,
        findings: summary.findings,
      },
      status: verdict === 'pass' ? 'success' : 'error',
      warnings: [],
      metadata: {},
    },
    deterministic: {
      verdict,
      severity: severityForSummary(summary),
      reason:
        summary.findings.length === 0
          ? 'Codebase scanner subagent found no configured security patterns'
          : `Codebase scanner subagent found ${summary.findings.length} preliminary issue(s) for main-agent triage`,
      differences: summary.findings.map((finding) => ({
        path: `${finding.file}:${finding.line}`,
        expected: 'No matching security smell',
        actual: finding.title,
        reason: `${finding.severity}/${finding.confidence}: ${finding.evidence}`,
      })),
      numericDelta: summary.findings.length,
      toleranceUsed: { absoluteTolerance: 0, relativeTolerance: 0 },
    },
    finalVerdict: verdict,
  };
}
