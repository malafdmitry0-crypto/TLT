import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { NumericComparator } from './comparison/NumericComparator';
import { MarkdownDocumentationParser } from './documentation/MarkdownDocumentationParser';
import { OpenAiCompatibleClient } from './llm/OpenAiCompatibleClient';
import { MockLlmClient } from './llm/MockLlmClient';
import { LlmSemanticJudge } from './llm/LlmSemanticJudge';
import { ResultNormalizer } from './normalization/ResultNormalizer';
import { FormulaOracle } from './oracle/FormulaOracle';
import { LlmRequirementExtractor } from './requirements/LlmRequirementExtractor';
import { HtmlReportGenerator } from './reporting/HtmlReportGenerator';
import { JsonReportGenerator } from './reporting/JsonReportGenerator';
import { FormulaRegistry } from './registry/FormulaRegistry';
import type { RequirementExtractor } from './requirements/RequirementExtractor';
import type { Requirement } from './requirements/types';
import { readUtf8FileUnderRoot, resolveUnderRepoRoot, writeUtf8FileUnderRoot } from './shared/paths';
import { MockAppRunner } from './runners/MockAppRunner';
import { EdgeCaseGenerator } from './test-generation/EdgeCaseGenerator';
import { QaPipeline } from './pipeline/QaPipeline';
import {
  BackendFormulaCheckHeatLossRunner,
  evaluateTltHeatLossCases,
  fixtureTltHeatLossCases,
  LlmTltHeatLossCaseGenerator,
  LocalTltHeatLossRunner,
  loginAdminForQaAgent,
  sanitizeTltHeatLossCases,
} from './domain/TltHeatLossDomainCases';
import {
  analyzeVisualQaScreenshots,
  captureVisualQaScreenshots,
  parseVisualQaUrls,
  parseVisualQaViewports,
  visualQaReportResult,
} from './domain/VisualQa';
import {
  appTestRunToReportResult,
  listExistingTestFiles,
  LlmAppTestProposalGenerator,
  parseAppTestSelection,
  runAppTestCommands,
  writeAppTestProposals,
} from './domain/AppTestAgent';
import {
  analyzeSecurityScanResults,
  buildLocalLoadConfig,
  isLocalSecurityTarget,
  localLoadResultToReportResult,
  parseSecurityScanSelection,
  runBoundedLocalLoadSmoke,
  runSecurityScanCommands,
  securityReviewToReportResult,
  securityScanCommandsForSelection,
  securityScanRunToReportResult,
} from './domain/SecurityPentestAgent';
import {
  codebaseScanToReportResult,
  SecurityCodebaseScannerSubagent,
} from './domain/SecurityCodebaseScannerSubagent';
import {
  auditFixBranchToReportResult,
  buildAuditFixHandoff,
  parseAuditDomain,
  prepareAuditFixBranch,
} from './domain/AuditFixBranchAgent';
import {
  applyAuditBaseline,
  auditBaselineToReportResult,
  loadAuditBaseline,
} from './domain/AuditBaseline';
import {
  auditConfirmingProbesToReportResult,
  runAuditConfirmingProbes,
} from './domain/AuditConfirmingProbes';
import {
  buildPerformanceBudgetConfig,
  evaluatePerformanceBudget,
  performanceBudgetToReportResult,
} from './domain/AuditPerformanceBudgets';
import {
  auditMetricsCoverage,
  metricsAuditToReportResult,
} from './domain/AuditMetricsAgent';
import {
  auditLifecycleToReportResult,
  summarizeAuditLifecycle,
} from './domain/AuditLifecycle';
import {
  auditRecipesToReportResult,
  suggestAuditRecipes,
} from './domain/AuditRecipes';
import {
  planRegressionTests,
  regressionPlanToReportResult,
} from './domain/AuditRegressionPlanner';
import {
  appendPerformanceTrend,
  buildPerformanceTrendRecord,
  performanceTrendToReportResult,
  summarizePerformanceTrend,
} from './domain/AuditPerfTrendStore';
import {
  parseScenarioPackSelection,
  scenarioPacksToReportResult,
} from './domain/AuditScenarioPacks';
import {
  auditContractDrift,
  contractDriftToReportResult,
} from './domain/ContractDriftAuditor';
import {
  parseUiWorkflowSelection,
  uiWorkflowsToReportResult,
} from './domain/UiWorkflowAgent';
import {
  detectFlakiness,
  flakinessToReportResult,
} from './domain/FlakinessDetector';
import {
  auditOwnershipToReportResult,
  planAuditOwnership,
} from './domain/AuditOwnershipPlanner';
import {
  businessCorrectnessSummaryToReportResult,
  runBusinessCorrectnessAudit,
} from './domain/BusinessCorrectnessAuditor';
import {
  appendAuditJournalEntries,
  auditJournalToReportResult,
  buildAuditJournalEntries,
  createAuditRunId,
} from './domain/AuditJournal';
import {
  createCodexCorePlan,
  renderCodexCoreBoardMarkdown,
  renderCodexCorePlanMarkdown,
  renderCodexCoreTicketsMarkdown,
  type CodexCoreMode,
} from './codex-core';

export * from './comparison/NumericComparator';
export * from './documentation/MarkdownDocumentationParser';
export * from './llm/LlmSemanticJudge';
export * from './oracle/AlgorithmOracle';
export * from './oracle/FormulaOracle';
export * from './pipeline/QaPipeline';
export * from './registry/AlgorithmRegistry';
export * from './registry/FormulaRegistry';
export * from './reporting/HtmlReportGenerator';
export * from './reporting/JsonReportGenerator';
export * from './runners/BackendApiRunner';
export * from './runners/FrontendPlaywrightRunner';
export * from './runners/MockAppRunner';
export * from './runners/TltBackendEndpointMappings';
export * from './domain/TltHeatLossDomainCases';
export * from './domain/VisualQa';
export * from './domain/AppTestAgent';
export * from './domain/SecurityPentestAgent';
export * from './domain/SecurityCodebaseScannerSubagent';
export * from './domain/AuditFixBranchAgent';
export * from './domain/AuditBaseline';
export * from './domain/AuditConfirmingProbes';
export * from './domain/AuditPerformanceBudgets';
export * from './domain/AuditMetricsAgent';
export * from './domain/AuditLifecycle';
export * from './domain/AuditRecipes';
export * from './domain/AuditRegressionPlanner';
export * from './domain/AuditPerfTrendStore';
export * from './domain/AuditScenarioPacks';
export * from './domain/ContractDriftAuditor';
export * from './domain/UiWorkflowAgent';
export * from './domain/FlakinessDetector';
export * from './domain/AuditOwnershipPlanner';
export * from './domain/BusinessCorrectnessAuditor';
export * from './domain/AuditJournal';
export * from './codex-core';

class ExampleRequirementExtractor implements RequirementExtractor {
  extract(): Requirement[] {
    return [
      {
        id: 'compound_interest',
        sourceSection: 'compound-interest',
        description: 'Compound interest formula must match deterministic oracle.',
        type: 'formula',
        inputs: ['P', 'r', 'n', 't'],
        expectedBehavior: { formulaId: 'compound_interest' },
        tolerance: { absoluteTolerance: 1e-9, relativeTolerance: 1e-9 },
        tags: ['example', 'finance'],
      },
    ];
  }
}

async function runExample() {
  const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
  const registry = new FormulaRegistry();
  const registryPath = path.join(root, 'examples', 'requirements.example.yaml');

  const reportPath = path.join(root, 'reports', 'qa-agent-example-report.json');
  const htmlReportPath = path.join(root, 'reports', 'qa-agent-example-report.html');
  const pipeline = new QaPipeline({
    documentationParser: new MarkdownDocumentationParser(),
    requirementExtractor: new ExampleRequirementExtractor(),
    testCaseGenerator: new EdgeCaseGenerator(registry),
    oracle: new FormulaOracle(registry),
    appRunner: new MockAppRunner('pass'),
    normalizer: new ResultNormalizer(),
    comparator: new NumericComparator(),
    semanticJudge: new LlmSemanticJudge(new MockLlmClient()),
    reportGenerator: new JsonReportGenerator(reportPath),
    registryLoader: () => {
      registry.loadFromFile(registryPath);
    },
  });

  const report = await pipeline.run({
    documentationPath: path.join(root, 'examples', 'documentation.example.md'),
    registryPath,
    metadata: { mode: 'example' },
  });
  new HtmlReportGenerator(htmlReportPath).generate(report.results, {
    ...report.metadata,
    jsonReportPath: reportPath,
  });

  console.log(JSON.stringify({ reportPath, htmlReportPath, summary: report.summary }, null, 2));
}

async function runControlledLlmExtraction() {
  if (process.env.QA_AGENT_ENABLE_LLM !== '1') {
    throw new Error(
      'Real LLM extraction is disabled. Set QA_AGENT_ENABLE_LLM=1 and pass --llm-extract explicitly.',
    );
  }

  const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
  const documentationPath =
    process.env.QA_AGENT_DOCUMENTATION_PATH ??
    path.join(root, 'examples', 'documentation.example.md');
  const outputPath =
    process.env.QA_AGENT_REQUIREMENTS_OUTPUT ??
    path.join(root, 'reports', 'llm-requirements.json');
  const safeDocumentationPath = resolveUnderRepoRoot(root, documentationPath, 'LLM extraction documentation path');
  const safeOutputPath = resolveUnderRepoRoot(root, outputPath, 'LLM extraction output path');
  const rawDoc = readUtf8FileUnderRoot(root, safeDocumentationPath, 'LLM extraction documentation path');
  const parsed = new MarkdownDocumentationParser().parse(rawDoc, { sourcePath: safeDocumentationPath });
  const requirements = await new LlmRequirementExtractor(new OpenAiCompatibleClient()).extract(parsed);
  writeUtf8FileUnderRoot(
    root,
    safeOutputPath,
    `${JSON.stringify(
      {
        generatedAt: new Date().toISOString(),
        documentationPath: safeDocumentationPath,
        requirements,
      },
      null,
      2,
    )}\n`,
  );
  console.log(JSON.stringify({ outputPath, requirements: requirements.length }, null, 2));
}

function intEnv(name: string, fallback: number): number {
  const value = Number(process.env[name]);
  return Number.isFinite(value) && value > 0 ? Math.floor(value) : fallback;
}

function parseCodexCoreMode(value: string | undefined): CodexCoreMode | undefined {
  if (
    value === 'audit_only' ||
    value === 'fix_focused' ||
    value === 'ui_proof' ||
    value === 'release_gate'
  ) {
    return value;
  }
  return undefined;
}

function parseArgValue(names: string[]): string | undefined {
  for (const arg of process.argv) {
    for (const name of names) {
      const prefix = `${name}=`;
      if (arg.startsWith(prefix)) return arg.slice(prefix.length);
    }
  }
  return undefined;
}

async function runCodexCorePlan() {
  const qaRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
  const repoRoot = path.resolve(qaRoot, '..');
  const scope =
    parseArgValue(['--scope', '--codex-core-scope']) ??
    process.env.QA_AGENT_CODEX_CORE_SCOPE ??
    'functional accuracy operating system';
  const mode = parseCodexCoreMode(parseArgValue(['--mode', '--codex-core-mode']) ?? process.env.QA_AGENT_CODEX_CORE_MODE);
  const outputDir =
    process.env.QA_AGENT_CODEX_CORE_OUTPUT_DIR ?? path.join(qaRoot, 'reports', 'codex-core');
  const planPath = path.join(outputDir, 'plan.md');
  const ticketsPath = path.join(outputDir, 'tickets.md');
  const boardPath = path.join(outputDir, 'board.md');
  const jsonPath = path.join(outputDir, 'plan.json');
  const plan = createCodexCorePlan({
    scope,
    mode,
    repoRoot,
  });

  writeUtf8FileUnderRoot(repoRoot, planPath, renderCodexCorePlanMarkdown(plan), 'Codex core local plan path');
  writeUtf8FileUnderRoot(repoRoot, ticketsPath, renderCodexCoreTicketsMarkdown(plan), 'Codex core local tickets path');
  writeUtf8FileUnderRoot(repoRoot, boardPath, renderCodexCoreBoardMarkdown(plan), 'Codex core local board path');
  if (process.env.QA_AGENT_CODEX_CORE_WRITE_JSON === '1') {
    writeUtf8FileUnderRoot(repoRoot, jsonPath, `${JSON.stringify(plan, null, 2)}\n`, 'Codex core optional JSON report path');
  }

  console.log(
    JSON.stringify(
      {
        scope: plan.scope,
        mode: plan.mode,
        planPath,
        ticketsPath,
        boardPath,
        jsonPath: process.env.QA_AGENT_CODEX_CORE_WRITE_JSON === '1' ? jsonPath : undefined,
        docs: plan.docs.length,
        commands: plan.verificationCommands.map((command) => command.id),
        tickets: plan.ticketDrafts.map((ticket) => ticket.id),
        findings: plan.findings.length,
      },
      null,
      2,
    ),
  );
}

async function runTltAiCases() {
  const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
  const repoRoot = path.resolve(root, '..');
  const reportPath = path.join(root, 'reports', 'qa-agent-tlt-ai-cases-report.json');
  const htmlReportPath = path.join(root, 'reports', 'qa-agent-tlt-ai-cases-report.html');
  const documentationPath =
    process.env.QA_AGENT_DOCUMENTATION_PATH ??
    path.resolve(root, 'examples', 'tlt-formulas.registry.yaml');
  const pipeCases = intEnv('QA_AGENT_TLT_PIPE_CASES', 20);
  const tankCases = intEnv('QA_AGENT_TLT_TANK_CASES', 20);
  const limit = intEnv('QA_AGENT_TLT_CASE_LIMIT', pipeCases + tankCases);
  const useLlm =
    process.argv.includes('--llm-cases') ||
    (process.env.QA_AGENT_ENABLE_LLM === '1' && process.env.QA_AGENT_TLT_USE_LLM !== '0');

  const safeDocumentationPath = resolveUnderRepoRoot(repoRoot, documentationPath, 'TLT AI cases documentation path');
  const documentation = fs.existsSync(safeDocumentationPath)
    ? readUtf8FileUnderRoot(repoRoot, safeDocumentationPath, 'TLT AI cases documentation path')
    : undefined;
  const rawCases = useLlm
    ? await new LlmTltHeatLossCaseGenerator(new OpenAiCompatibleClient()).generate({
        pipeCases,
        tankCases,
        documentation,
      })
    : fixtureTltHeatLossCases(limit);
  const sanitized = sanitizeTltHeatLossCases(rawCases, {
    source: useLlm ? 'llm' : 'fixture',
    limit,
  });

  const runnerMode = process.env.QA_AGENT_TLT_RUNNER ?? 'local';
  const backendBaseUrl = process.env.QA_AGENT_BACKEND_BASE_URL ?? 'http://127.0.0.1:8000';
  const authToken =
    process.env.QA_AGENT_AUTH_TOKEN ??
    (runnerMode === 'backend'
      ? await loginAdminForQaAgent({
          baseUrl: backendBaseUrl,
          email: process.env.QA_AGENT_ADMIN_EMAIL,
          password: process.env.QA_AGENT_ADMIN_PASSWORD,
        })
      : undefined);
  const runner =
    runnerMode === 'backend'
      ? new BackendFormulaCheckHeatLossRunner({ baseUrl: backendBaseUrl, authToken })
      : new LocalTltHeatLossRunner();

  const results = await evaluateTltHeatLossCases(sanitized.accepted, runner);
  const report = new JsonReportGenerator(reportPath).generate(results, {
    mode: 'tlt-ai-cases',
    caseSource: useLlm ? 'llm' : 'fixture',
    runner: runner.name,
    documentationPath,
    generatedCases: sanitized.accepted.length,
    rejectedCases: sanitized.rejected.length,
    rejectedCaseDetails: sanitized.rejected,
    llmEnabled: useLlm,
    backendBaseUrl: runnerMode === 'backend' ? backendBaseUrl : undefined,
    note:
      'LLM may generate scenarios, but numeric correctness is checked by deterministic runner and invariants.',
  });
  new HtmlReportGenerator(htmlReportPath).generate(results, {
    ...report.metadata,
    jsonReportPath: reportPath,
  });

  console.log(
    JSON.stringify(
      {
        reportPath,
        htmlReportPath,
        summary: report.summary,
        caseSource: useLlm ? 'llm' : 'fixture',
        runner: runner.name,
        generatedCases: sanitized.accepted.length,
        rejectedCases: sanitized.rejected.length,
      },
      null,
      2,
    ),
  );
}

async function runVisualQa() {
  if (process.env.QA_AGENT_ENABLE_LLM !== '1') {
    throw new Error('Visual QA requires QA_AGENT_ENABLE_LLM=1 because screenshots must be reviewed by an LLM.');
  }

  const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
  const screenshotDir =
    process.env.QA_AGENT_VISUAL_SCREENSHOT_DIR ?? path.join(root, 'reports', 'screenshots');
  const reportPath = path.join(root, 'reports', 'qa-agent-visual-report.json');
  const htmlReportPath = path.join(root, 'reports', 'qa-agent-visual-report.html');
  const baseUrl = process.env.QA_AGENT_VISUAL_BASE_URL ?? 'http://127.0.0.1:3003';
  const urls = parseVisualQaUrls(process.env.QA_AGENT_VISUAL_URLS);
  const viewports = parseVisualQaViewports(process.env.QA_AGENT_VISUAL_VIEWPORTS);
  const waitMs = intEnv('QA_AGENT_VISUAL_WAIT_MS', 500);
  const fullPage = process.env.QA_AGENT_VISUAL_FULL_PAGE === '1';

  const screenshots = await captureVisualQaScreenshots({
    baseUrl,
    urls,
    viewports,
    outputDir: screenshotDir,
    waitMs,
    fullPage,
  });
  const analysis = await analyzeVisualQaScreenshots(new OpenAiCompatibleClient(), screenshots);
  const result = visualQaReportResult({ analysis, screenshots });
  const report = new JsonReportGenerator(reportPath).generate([result], {
    mode: 'visual-ai-screenshot-review',
    baseUrl,
    urls,
    viewports,
    screenshotDir,
    screenshotCount: screenshots.length,
    llmEnabled: true,
    note: 'Screenshots are captured by Playwright; visual findings are produced by LLM vision review.',
  });
  new HtmlReportGenerator(htmlReportPath).generate([result], {
    ...report.metadata,
    jsonReportPath: reportPath,
  });

  console.log(
    JSON.stringify(
      {
        reportPath,
        htmlReportPath,
        screenshotDir,
        summary: report.summary,
        verdict: analysis.verdict,
        findings: analysis.findings.length,
      },
      null,
      2,
    ),
  );
}

async function runApplicationTestsAgent() {
  const qaRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
  const repoRoot = path.resolve(qaRoot, '..');
  const reportPath = path.join(qaRoot, 'reports', 'qa-agent-app-tests-report.json');
  const htmlReportPath = path.join(qaRoot, 'reports', 'qa-agent-app-tests-report.html');
  const proposalDir = path.join(qaRoot, 'reports', 'generated-tests');
  const commands = parseAppTestSelection(process.env.QA_AGENT_APP_TESTS);
  const runs = await runAppTestCommands(commands, repoRoot);
  const results = runs.map(appTestRunToReportResult);
  const shouldGenerate =
    process.env.QA_AGENT_GENERATE_TESTS === '1' &&
    (process.env.QA_AGENT_GENERATE_TESTS_ALWAYS === '1' ||
      results.some((result) => result.finalVerdict !== 'pass'));
  let proposals: Awaited<ReturnType<LlmAppTestProposalGenerator['generate']>> = [];
  let proposalWrites: ReturnType<typeof writeAppTestProposals> = [];

  if (shouldGenerate) {
    if (process.env.QA_AGENT_ENABLE_LLM !== '1') {
      throw new Error('QA_AGENT_GENERATE_TESTS=1 requires QA_AGENT_ENABLE_LLM=1.');
    }
    proposals = await new LlmAppTestProposalGenerator(new OpenAiCompatibleClient()).generate({
      runs,
      existingTestFiles: listExistingTestFiles(repoRoot),
      extraContext: process.env.QA_AGENT_TEST_CONTEXT,
    });
    proposalWrites = writeAppTestProposals(proposals, {
      repoRoot,
      outputDir: proposalDir,
      allowRepoWrites: process.env.QA_AGENT_ALLOW_TEST_WRITES === '1',
      overwrite: process.env.QA_AGENT_OVERWRITE_TESTS === '1',
    });
  }

  const report = new JsonReportGenerator(reportPath).generate(results, {
    mode: 'application-test-agent',
    commands: commands.map((command) => ({
      id: command.id,
      commandLine: [command.command, ...command.args].join(' '),
      timeoutMs: command.timeoutMs,
    })),
    generateTestsRequested: process.env.QA_AGENT_GENERATE_TESTS === '1',
    generatedTestsAttempted: shouldGenerate,
    generatedTestsCount: proposals.length,
    generatedTestWrites: proposalWrites,
    proposalDir,
    allowRepoWrites: process.env.QA_AGENT_ALLOW_TEST_WRITES === '1',
    note:
      'Application tests are executed as external commands. Generated tests are proposal files unless QA_AGENT_ALLOW_TEST_WRITES=1.',
  });
  new HtmlReportGenerator(htmlReportPath).generate(results, {
    ...report.metadata,
    jsonReportPath: reportPath,
  });

  console.log(
    JSON.stringify(
      {
        reportPath,
        htmlReportPath,
        summary: report.summary,
        commands: commands.map((command) => command.id),
        generatedTestsCount: proposals.length,
        proposalDir,
      },
      null,
      2,
    ),
  );
}

async function runSecurityPentestAgent() {
  const qaRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
  const repoRoot = path.resolve(qaRoot, '..');
  const reportPath = path.join(qaRoot, 'reports', 'qa-agent-security-report.json');
  const htmlReportPath = path.join(qaRoot, 'reports', 'qa-agent-security-report.html');
  const fixHandoffPath = path.join(qaRoot, 'reports', 'qa-agent-audit-fix-handoff.json');
  const baselinePath = process.env.QA_AGENT_AUDIT_BASELINE_PATH ?? path.join(qaRoot, 'audit-baseline.json');
  const lifecycleHistoryPath =
    process.env.QA_AGENT_AUDIT_HISTORY_PATH ?? path.join(qaRoot, 'reports', 'audit-history.jsonl');
  const perfHistoryPath =
    process.env.QA_AGENT_PERF_HISTORY_PATH ?? path.join(qaRoot, 'reports', 'perf-history.jsonl');
  const auditJournalPath =
    process.env.QA_AGENT_AUDIT_JOURNAL_PATH ?? path.join(qaRoot, 'reports', 'audit-journal.jsonl');
  const auditRunId = process.env.QA_AGENT_AUDIT_RUN_ID ?? createAuditRunId();
  const targetUrl = process.env.QA_AGENT_SECURITY_TARGET ?? 'http://127.0.0.1:3003';
  const selected = parseSecurityScanSelection(process.env.QA_AGENT_SECURITY_SCANS);

  if (selected.some((id) => id === 'local-load' || id === 'zap-baseline') && !isLocalSecurityTarget(targetUrl)) {
    throw new Error(`Security dynamic checks accept only local targets, got: ${targetUrl}`);
  }

  const commands = securityScanCommandsForSelection({ selected, targetUrl });
  const runs = await runSecurityScanCommands(commands, repoRoot);
  const results = runs.map(securityScanRunToReportResult);
  const codebaseScan = selected.includes('codebase-subagent')
    ? await new SecurityCodebaseScannerSubagent().scan({
        repoRoot,
        maxFiles: intEnv('QA_AGENT_SECURITY_CODEBASE_MAX_FILES', 1_200),
        maxFileBytes: intEnv('QA_AGENT_SECURITY_CODEBASE_MAX_FILE_BYTES', 300_000),
      })
    : undefined;
  const baselineApplication = codebaseScan
    ? applyAuditBaseline(codebaseScan.findings, loadAuditBaseline(baselinePath, repoRoot))
    : undefined;
  const activeCodebaseScan =
    codebaseScan && baselineApplication
      ? {
          ...codebaseScan,
          findings: baselineApplication.activeFindings,
        }
      : codebaseScan;

  if (activeCodebaseScan) {
    results.push(codebaseScanToReportResult(activeCodebaseScan));
  }
  if (baselineApplication) {
    results.push(auditBaselineToReportResult(baselineApplication));
  }

  const recipeMatches = activeCodebaseScan ? suggestAuditRecipes(activeCodebaseScan.findings) : [];
  let regressionProposals: ReturnType<typeof planRegressionTests> = [];
  let ownershipItems: ReturnType<typeof planAuditOwnership> = [];
  if (process.env.QA_AGENT_AUDIT_LIFECYCLE === '1' && activeCodebaseScan) {
    results.push(
      auditLifecycleToReportResult(
        summarizeAuditLifecycle({
          findings: activeCodebaseScan.findings,
          historyPath: lifecycleHistoryPath,
          allowedRoot: repoRoot,
        }),
      ),
    );
  }
  if (process.env.QA_AGENT_AUDIT_RECIPES === '1') {
    results.push(auditRecipesToReportResult(recipeMatches));
  }
  if (process.env.QA_AGENT_REGRESSION_PLAN === '1' && activeCodebaseScan) {
    regressionProposals = planRegressionTests({
      findings: activeCodebaseScan.findings,
      recipeMatches,
    });
    results.push(regressionPlanToReportResult(regressionProposals));
  }
  if (process.env.QA_AGENT_OWNERSHIP_PLAN === '1' && activeCodebaseScan) {
    ownershipItems = planAuditOwnership(activeCodebaseScan.findings);
    results.push(auditOwnershipToReportResult(ownershipItems));
  }

  let loadResult: Awaited<ReturnType<typeof runBoundedLocalLoadSmoke>> | undefined;
  if (selected.includes('local-load') || process.env.QA_AGENT_SECURITY_LOAD === '1') {
    const loadConfig = buildLocalLoadConfig({
      targetUrl,
      durationMs: intEnv('QA_AGENT_SECURITY_LOAD_DURATION_MS', 10_000),
      concurrency: intEnv('QA_AGENT_SECURITY_LOAD_CONCURRENCY', 2),
      maxRequests: intEnv('QA_AGENT_SECURITY_LOAD_MAX_REQUESTS', 100),
    });
    loadResult = await runBoundedLocalLoadSmoke(loadConfig);
    results.push(localLoadResultToReportResult(loadResult));
  }

  const performanceBudgetsEnabled = process.env.QA_AGENT_PERFORMANCE_BUDGETS === '1';
  if (performanceBudgetsEnabled) {
    if (!loadResult) {
      const loadConfig = buildLocalLoadConfig({
        targetUrl,
        durationMs: intEnv('QA_AGENT_PERF_LOAD_DURATION_MS', 5_000),
        concurrency: intEnv('QA_AGENT_PERF_LOAD_CONCURRENCY', 1),
        maxRequests: intEnv('QA_AGENT_PERF_LOAD_MAX_REQUESTS', 20),
      });
      loadResult = await runBoundedLocalLoadSmoke(loadConfig);
      results.push(localLoadResultToReportResult(loadResult));
    }
    const performanceEvaluation = evaluatePerformanceBudget(loadResult, buildPerformanceBudgetConfig());
    results.push(performanceBudgetToReportResult(performanceEvaluation));
    if (process.env.QA_AGENT_PERF_TRENDS === '1') {
      const record = buildPerformanceTrendRecord({
        scenario: process.env.QA_AGENT_PERF_SCENARIO ?? 'bounded-local-load',
        loadResult,
      });
      const trend = summarizePerformanceTrend({ historyPath: perfHistoryPath, record, allowedRoot: repoRoot });
      appendPerformanceTrend(perfHistoryPath, record, repoRoot);
      results.push(performanceTrendToReportResult(trend));
    }
  }

  let confirmingProbesEnabled = false;
  if (process.env.QA_AGENT_AUDIT_PROBES === '1') {
    confirmingProbesEnabled = true;
    const probeSummary = await runAuditConfirmingProbes({
      targetUrl,
      codebaseScan: activeCodebaseScan,
      includeHttpProbe: process.env.QA_AGENT_AUDIT_PROBE_HTTP === '1',
    });
    results.push(auditConfirmingProbesToReportResult(probeSummary));
  }

  let metricsAuditEnabled = false;
  if (process.env.QA_AGENT_METRICS_AUDIT === '1') {
    metricsAuditEnabled = true;
    results.push(metricsAuditToReportResult(auditMetricsCoverage({ repoRoot })));
  }

  let scenarioPacksEnabled = false;
  if (process.env.QA_AGENT_SCENARIO_PACKS === '1') {
    scenarioPacksEnabled = true;
    results.push(scenarioPacksToReportResult(parseScenarioPackSelection(process.env.QA_AGENT_SCENARIO_PACKS_SELECT)));
  }

  let contractDriftEnabled = false;
  if (process.env.QA_AGENT_CONTRACT_DRIFT === '1') {
    contractDriftEnabled = true;
    results.push(contractDriftToReportResult(auditContractDrift(repoRoot)));
  }

  let uiWorkflowPlanEnabled = false;
  if (process.env.QA_AGENT_UI_WORKFLOWS === '1') {
    uiWorkflowPlanEnabled = true;
    results.push(uiWorkflowsToReportResult(parseUiWorkflowSelection(process.env.QA_AGENT_UI_WORKFLOWS_SELECT)));
  }

  let flakinessEnabled = false;
  if (process.env.QA_AGENT_FLAKINESS === '1') {
    flakinessEnabled = true;
    const command = parseAppTestSelection(process.env.QA_AGENT_FLAKINESS_TESTS ?? 'qa-agent')[0];
    const repeats = intEnv('QA_AGENT_FLAKINESS_REPEATS', 3);
    results.push(flakinessToReportResult(await detectFlakiness({ command, repoRoot, repeats })));
  }

  let businessAuditEnabled = false;
  if (process.env.QA_AGENT_BUSINESS_AUDIT === '1') {
    businessAuditEnabled = true;
    const businessAudit = await runBusinessCorrectnessAudit(intEnv('QA_AGENT_BUSINESS_AUDIT_CASES', 12));
    results.push(businessCorrectnessSummaryToReportResult(businessAudit.summary));
    if (process.env.QA_AGENT_BUSINESS_AUDIT_DETAILS === '1') {
      results.push(...businessAudit.results);
    }
  }

  let auditJournalEnabled = process.env.QA_AGENT_AUDIT_JOURNAL !== '0';
  if (auditJournalEnabled) {
    const entries = buildAuditJournalEntries({
      runId: auditRunId,
      findings: activeCodebaseScan?.findings,
      recipeMatches,
      regressionProposals,
      ownershipItems,
      summary: {
        selectedScans: selected,
        activeFindings: activeCodebaseScan?.findings.length ?? 0,
        recipeMatches: recipeMatches.length,
        regressionProposals: regressionProposals.length,
        ownershipItems: ownershipItems.length,
        performanceBudgetsEnabled,
        confirmingProbesEnabled,
        metricsAuditEnabled,
        scenarioPacksEnabled,
        contractDriftEnabled,
        uiWorkflowPlanEnabled,
        flakinessEnabled,
        businessAuditEnabled,
      },
    });
    results.push(auditJournalToReportResult(appendAuditJournalEntries(auditJournalPath, entries, repoRoot)));
  }

  let llmReviewEnabled = false;
  let securityReview: Awaited<ReturnType<typeof analyzeSecurityScanResults>> | undefined;
  if (process.env.QA_AGENT_SECURITY_REVIEW === '1') {
    if (process.env.QA_AGENT_ENABLE_LLM !== '1') {
      throw new Error('QA_AGENT_SECURITY_REVIEW=1 requires QA_AGENT_ENABLE_LLM=1.');
    }
    llmReviewEnabled = true;
    securityReview = await analyzeSecurityScanResults(new OpenAiCompatibleClient(), {
      runs,
      loadResult,
      codebaseScan: activeCodebaseScan,
      extraContext: process.env.QA_AGENT_SECURITY_CONTEXT,
    });
    results.push(securityReviewToReportResult(securityReview));
  }

  let fixHandoff: ReturnType<typeof buildAuditFixHandoff> | undefined;
  const auditFixRequested = process.env.QA_AGENT_AUDIT_FIX === '1' || process.env.QA_AGENT_SECURITY_FIX === '1';
  if (auditFixRequested) {
    const auditDomain = parseAuditDomain(process.env.QA_AGENT_AUDIT_FIX_DOMAIN ?? 'security');
    const branch = await prepareAuditFixBranch({
      repoRoot,
      domain: auditDomain,
      branchName: process.env.QA_AGENT_AUDIT_FIX_BRANCH ?? process.env.QA_AGENT_SECURITY_FIX_BRANCH,
      allowDirtyWorktree:
        process.env.QA_AGENT_AUDIT_FIX_ALLOW_DIRTY === '1' ||
        process.env.QA_AGENT_SECURITY_FIX_ALLOW_DIRTY === '1',
    });
    fixHandoff = buildAuditFixHandoff({
      branch,
      codebaseFindings: activeCodebaseScan?.findings,
      reviewFindings: securityReview?.findings,
    });
    writeUtf8FileUnderRoot(
      repoRoot,
      fixHandoffPath,
      `${JSON.stringify(fixHandoff, null, 2)}\n`,
      'audit fix handoff path',
    );
    results.push(auditFixBranchToReportResult(fixHandoff));
  }

  const report = new JsonReportGenerator(reportPath).generate(results, {
    mode: 'local-defensive-security-agent',
    selectedScans: selected,
    targetUrl,
    localTargetOnly: true,
    commands: commands.map((command) => ({
      id: command.id,
      label: command.label,
      category: command.category,
      commandLine: [command.command, ...command.args].join(' '),
      timeoutMs: command.timeoutMs,
    })),
    codebaseScanEnabled: Boolean(codebaseScan),
    codebaseScanSummary: codebaseScan
      ? {
          scannedFiles: codebaseScan.scannedFiles,
          skippedFiles: codebaseScan.skippedFiles,
          findings: codebaseScan.findings.length,
          activeFindings: activeCodebaseScan?.findings.length ?? 0,
          suppressedFindings: baselineApplication?.suppressedFindings.length ?? 0,
        }
      : undefined,
    baselinePath,
    auditRunId,
    auditJournalEnabled,
    auditJournalPath: auditJournalEnabled ? auditJournalPath : undefined,
    lifecycleHistoryPath,
    baselineSuppressedFindings: baselineApplication?.suppressedFindings.length,
    baselineExpiredEntries: baselineApplication?.expiredEntries.length,
    localLoadEnabled: Boolean(loadResult),
    performanceBudgetsEnabled,
    perfHistoryPath: process.env.QA_AGENT_PERF_TRENDS === '1' ? perfHistoryPath : undefined,
    confirmingProbesEnabled,
    metricsAuditEnabled,
    scenarioPacksEnabled,
    contractDriftEnabled,
    uiWorkflowPlanEnabled,
    flakinessEnabled,
    businessAuditEnabled,
    llmReviewEnabled,
    fixModeEnabled: Boolean(fixHandoff),
    fixHandoffPath: fixHandoff ? fixHandoffPath : undefined,
    fixBranch: fixHandoff?.branch,
    note:
      'This agent is defensive and local-only. Load checks are bounded smoke tests for resilience/rate-limit behavior, not denial-of-service traffic generation. Audit fix mode prepares an isolated branch/handoff and does not auto-commit.',
  });
  new HtmlReportGenerator(htmlReportPath).generate(results, {
    ...report.metadata,
    jsonReportPath: reportPath,
  });

  console.log(
    JSON.stringify(
      {
        reportPath,
        htmlReportPath,
        summary: report.summary,
        selectedScans: selected,
        targetUrl,
        codebaseScanEnabled: Boolean(codebaseScan),
        auditRunId,
        auditJournalEnabled,
        baselineSuppressedFindings: baselineApplication?.suppressedFindings.length,
        localLoadEnabled: Boolean(loadResult),
        performanceBudgetsEnabled,
        confirmingProbesEnabled,
        metricsAuditEnabled,
        scenarioPacksEnabled,
        contractDriftEnabled,
        uiWorkflowPlanEnabled,
        flakinessEnabled,
        businessAuditEnabled,
        llmReviewEnabled,
        fixModeEnabled: Boolean(fixHandoff),
        fixBranch: fixHandoff?.branch,
      },
      null,
      2,
    ),
  );
}

if (process.argv.includes('--llm-extract')) {
  runControlledLlmExtraction().catch((error) => {
    console.error(error);
    process.exitCode = 1;
  });
} else if (process.argv.includes('--codex-core')) {
  runCodexCorePlan().catch((error) => {
    console.error(error);
    process.exitCode = 1;
  });
} else if (process.argv.includes('--tlt-ai-cases')) {
  runTltAiCases().catch((error) => {
    console.error(error);
    process.exitCode = 1;
  });
} else if (process.argv.includes('--visual-qa')) {
  runVisualQa().catch((error) => {
    console.error(error);
    process.exitCode = 1;
  });
} else if (process.argv.includes('--app-tests')) {
  runApplicationTestsAgent().catch((error) => {
    console.error(error);
    process.exitCode = 1;
  });
} else if (process.argv.includes('--security')) {
  runSecurityPentestAgent().catch((error) => {
    console.error(error);
    process.exitCode = 1;
  });
} else if (process.argv.includes('--example') || process.argv[1]?.endsWith('index.ts')) {
  runExample().catch((error) => {
    console.error(error);
    process.exitCode = 1;
  });
}
