import { spawn } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';

import type { ComparisonResult } from '../comparison/types';
import type { LlmClient } from '../llm/LlmClient';
import { APP_TEST_PROPOSAL_SYSTEM_PROMPT } from '../llm/prompts';
import type { ReportResult } from '../reporting/types';
import type { TestCase } from '../test-generation/types';
import { isRecord } from '../shared/types';

export type AppTestCommand = {
  id: string;
  label: string;
  command: string;
  args: string[];
  cwd?: string;
  timeoutMs: number;
};

export type AppTestRunResult = {
  id: string;
  label: string;
  commandLine: string;
  cwd: string;
  exitCode: number | null;
  timedOut: boolean;
  durationMs: number;
  stdout: string;
  stderr: string;
};

export type AppTestProposal = {
  targetPath: string;
  rationale: string;
  framework: string;
  content: string;
  riskTags: string[];
};

export type AppTestWriteResult = {
  targetPath: string;
  writtenPath?: string;
  mode: 'proposal' | 'repo';
  status: 'written' | 'skipped';
  reason?: string;
};

const OUTPUT_LIMIT = 60_000;

export const DEFAULT_APP_TEST_COMMANDS: Record<string, AppTestCommand> = {
  backend: {
    id: 'backend',
    label: 'Backend pytest suite',
    command: 'make',
    args: ['test-backend'],
    timeoutMs: 20 * 60_000,
  },
  frontend: {
    id: 'frontend',
    label: 'Frontend vitest suite',
    command: 'make',
    args: ['test-frontend'],
    timeoutMs: 15 * 60_000,
  },
  e2e: {
    id: 'e2e',
    label: 'Playwright e2e suite',
    command: 'make',
    args: ['test-e2e'],
    timeoutMs: 20 * 60_000,
  },
  'qa-agent': {
    id: 'qa-agent',
    label: 'QA agent unit suite',
    command: 'npm',
    args: ['--prefix', 'qa-agent', 'run', 'qa-agent:test'],
    timeoutMs: 5 * 60_000,
  },
};

function truncate(value: string, limit = OUTPUT_LIMIT): string {
  if (value.length <= limit) return value;
  return `${value.slice(0, limit)}\n...[truncated ${value.length - limit} chars]`;
}

function commandLine(command: AppTestCommand): string {
  return [command.command, ...command.args].join(' ');
}

export function parseAppTestSelection(value: string | undefined): AppTestCommand[] {
  const raw = value ?? 'backend,frontend';
  const selected = raw
    .split(',')
    .map((item) => item.trim())
    .filter(Boolean);
  const commands = selected
    .map((id) => DEFAULT_APP_TEST_COMMANDS[id])
    .filter((command): command is AppTestCommand => Boolean(command));
  return commands.length > 0 ? commands : [DEFAULT_APP_TEST_COMMANDS.backend, DEFAULT_APP_TEST_COMMANDS.frontend];
}

export function listExistingTestFiles(repoRoot: string, limit = 400): string[] {
  const roots = ['backend/app/tests', 'frontend/src/__tests__', 'e2e/tests', 'qa-agent/tests'];
  const files: string[] = [];
  for (const root of roots) {
    const absolute = path.join(repoRoot, root);
    if (!fs.existsSync(absolute)) continue;
    const stack = [absolute];
    while (stack.length > 0 && files.length < limit) {
      const current = stack.pop()!;
      for (const entry of fs.readdirSync(current, { withFileTypes: true })) {
        const entryPath = path.join(current, entry.name);
        if (entry.isDirectory()) {
          stack.push(entryPath);
        } else if (/\.(py|ts|tsx)$/.test(entry.name)) {
          files.push(path.relative(repoRoot, entryPath));
        }
      }
    }
  }
  return files.sort();
}

export function runAppTestCommand(command: AppTestCommand, repoRoot: string): Promise<AppTestRunResult> {
  return new Promise((resolve) => {
    const started = Date.now();
    const cwd = command.cwd ? path.resolve(repoRoot, command.cwd) : repoRoot;
    let stdout = '';
    let stderr = '';
    let timedOut = false;
    const child = spawn(command.command, command.args, {
      cwd,
      env: process.env,
      shell: false,
    });
    const timer = setTimeout(() => {
      timedOut = true;
      child.kill('SIGTERM');
    }, command.timeoutMs);

    child.stdout?.on('data', (chunk: Buffer) => {
      stdout = truncate(stdout + chunk.toString());
    });
    child.stderr?.on('data', (chunk: Buffer) => {
      stderr = truncate(stderr + chunk.toString());
    });
    child.on('error', (error) => {
      clearTimeout(timer);
      resolve({
        id: command.id,
        label: command.label,
        commandLine: commandLine(command),
        cwd,
        exitCode: null,
        timedOut,
        durationMs: Date.now() - started,
        stdout,
        stderr: truncate(`${stderr}\n${error instanceof Error ? error.message : String(error)}`),
      });
    });
    child.on('close', (exitCode) => {
      clearTimeout(timer);
      resolve({
        id: command.id,
        label: command.label,
        commandLine: commandLine(command),
        cwd,
        exitCode,
        timedOut,
        durationMs: Date.now() - started,
        stdout,
        stderr,
      });
    });
  });
}

export async function runAppTestCommands(
  commands: AppTestCommand[],
  repoRoot: string,
): Promise<AppTestRunResult[]> {
  const results: AppTestRunResult[] = [];
  for (const command of commands) {
    results.push(await runAppTestCommand(command, repoRoot));
  }
  return results;
}

function comparisonForRun(run: AppTestRunResult): ComparisonResult {
  const passed = run.exitCode === 0 && !run.timedOut;
  return {
    verdict: passed ? 'pass' : 'fail',
    severity: passed ? 'low' : 'high',
    reason: passed
      ? `${run.label} passed`
      : run.timedOut
        ? `${run.label} timed out`
        : `${run.label} failed with exit code ${run.exitCode ?? 'unknown'}`,
    differences: passed
      ? []
      : [
          {
            path: '$.exitCode',
            expected: 0,
            actual: run.exitCode,
            reason: truncate(run.stderr || run.stdout || 'test command failed', 4000),
          },
        ],
    numericDelta: 0,
    toleranceUsed: { absoluteTolerance: 0, relativeTolerance: 0 },
  };
}

export function appTestRunToReportResult(run: AppTestRunResult): ReportResult {
  const deterministic = comparisonForRun(run);
  const testCase: TestCase = {
    id: `app-tests-${run.id}`,
    requirementId: 'application_test_suite',
    input: {
      command: run.commandLine,
      cwd: run.cwd,
    },
    kind: 'fixed',
    metadata: {
      label: run.label,
      durationMs: run.durationMs,
      timedOut: run.timedOut,
    },
  };
  return {
    testCase,
    expected: { value: { exitCode: 0 }, warnings: [], metadata: {} },
    actual: {
      value: {
        exitCode: run.exitCode,
        timedOut: run.timedOut,
        durationMs: run.durationMs,
      },
      status: run.exitCode === 0 && !run.timedOut ? 'success' : 'error',
      warnings: [],
      metadata: {
        stdout: run.stdout,
        stderr: run.stderr,
        commandLine: run.commandLine,
      },
    },
    deterministic,
    finalVerdict: deterministic.verdict,
  };
}

function parseProposal(value: unknown): AppTestProposal | undefined {
  if (!isRecord(value)) return undefined;
  if (typeof value.targetPath !== 'string' || typeof value.content !== 'string') return undefined;
  return {
    targetPath: value.targetPath,
    rationale: typeof value.rationale === 'string' ? value.rationale : 'No rationale returned',
    framework: typeof value.framework === 'string' ? value.framework : 'unknown',
    content: value.content,
    riskTags: Array.isArray(value.riskTags) ? value.riskTags.map(String) : [],
  };
}

export function parseAppTestProposals(value: unknown): AppTestProposal[] {
  const items = Array.isArray(value) ? value : isRecord(value) && Array.isArray(value.proposals) ? value.proposals : [];
  return items.map(parseProposal).filter((proposal): proposal is AppTestProposal => Boolean(proposal));
}

export function appTestRunsForLlm(runs: AppTestRunResult[]): Record<string, unknown>[] {
  return runs.map((run) => ({
    id: run.id,
    label: run.label,
    commandLine: run.commandLine,
    exitCode: run.exitCode,
    timedOut: run.timedOut,
    durationMs: run.durationMs,
    stdoutTail: truncate(run.stdout.slice(-12_000), 12_000),
    stderrTail: truncate(run.stderr.slice(-12_000), 12_000),
  }));
}

export class LlmAppTestProposalGenerator {
  constructor(private readonly llmClient: LlmClient) {}

  async generate(config: {
    runs: AppTestRunResult[];
    existingTestFiles: string[];
    extraContext?: string;
  }): Promise<AppTestProposal[]> {
    const response = await this.llmClient.completeJson({
      system: APP_TEST_PROPOSAL_SYSTEM_PROMPT,
      temperature: 0.1,
      user: JSON.stringify({
        task: 'Analyze failed or insufficient application test coverage and propose focused regression tests.',
        runs: appTestRunsForLlm(config.runs),
        existingTestFiles: config.existingTestFiles.slice(0, 400),
        extraContext: config.extraContext,
        writeRules: {
          allowedRoots: ['backend/app/tests', 'frontend/src/__tests__', 'e2e/tests', 'qa-agent/tests'],
          createNewFilesOnly: true,
        },
      }),
    });
    return parseAppTestProposals(response);
  }
}

function isAllowedTestPath(targetPath: string): boolean {
  const normalized = targetPath.replaceAll('\\', '/').replace(/^\/+/, '');
  if (normalized.includes('..')) return false;
  return (
    normalized.startsWith('backend/app/tests/') ||
    normalized.startsWith('frontend/src/__tests__/') ||
    normalized.startsWith('e2e/tests/') ||
    normalized.startsWith('qa-agent/tests/')
  );
}

function proposalPath(outputDir: string, targetPath: string): string {
  return path.join(outputDir, `${targetPath.replaceAll(/[\\/]/g, '__')}.proposal`);
}

export function writeAppTestProposals(
  proposals: AppTestProposal[],
  config: {
    repoRoot: string;
    outputDir: string;
    allowRepoWrites?: boolean;
    overwrite?: boolean;
  },
): AppTestWriteResult[] {
  fs.mkdirSync(config.outputDir, { recursive: true });
  const results: AppTestWriteResult[] = [];
  for (const proposal of proposals) {
    if (!isAllowedTestPath(proposal.targetPath)) {
      results.push({
        targetPath: proposal.targetPath,
        mode: config.allowRepoWrites ? 'repo' : 'proposal',
        status: 'skipped',
        reason: 'target path is outside allowed test roots',
      });
      continue;
    }

    if (!config.allowRepoWrites) {
      const outputPath = proposalPath(config.outputDir, proposal.targetPath);
      fs.writeFileSync(
        outputPath,
        [
          `# Target: ${proposal.targetPath}`,
          `# Framework: ${proposal.framework}`,
          `# Rationale: ${proposal.rationale}`,
          `# Risk tags: ${proposal.riskTags.join(', ')}`,
          '',
          proposal.content,
          '',
        ].join('\n'),
      );
      results.push({
        targetPath: proposal.targetPath,
        writtenPath: outputPath,
        mode: 'proposal',
        status: 'written',
      });
      continue;
    }

    const repoPath = path.join(config.repoRoot, proposal.targetPath);
    if (fs.existsSync(repoPath) && !config.overwrite) {
      results.push({
        targetPath: proposal.targetPath,
        writtenPath: repoPath,
        mode: 'repo',
        status: 'skipped',
        reason: 'target file already exists; overwrite disabled',
      });
      continue;
    }
    fs.mkdirSync(path.dirname(repoPath), { recursive: true });
    fs.writeFileSync(repoPath, proposal.content.endsWith('\n') ? proposal.content : `${proposal.content}\n`);
    results.push({
      targetPath: proposal.targetPath,
      writtenPath: repoPath,
      mode: 'repo',
      status: 'written',
    });
  }
  return results;
}
