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
  const rawDoc = fs.readFileSync(documentationPath, 'utf8');
  const parsed = new MarkdownDocumentationParser().parse(rawDoc, { sourcePath: documentationPath });
  const requirements = await new LlmRequirementExtractor(new OpenAiCompatibleClient()).extract(parsed);
  fs.mkdirSync(path.dirname(outputPath), { recursive: true });
  fs.writeFileSync(
    outputPath,
    `${JSON.stringify(
      {
        generatedAt: new Date().toISOString(),
        documentationPath,
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

async function runTltAiCases() {
  const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
  const reportPath = path.join(root, 'reports', 'qa-agent-tlt-ai-cases-report.json');
  const htmlReportPath = path.join(root, 'reports', 'qa-agent-tlt-ai-cases-report.html');
  const documentationPath =
    process.env.QA_AGENT_DOCUMENTATION_PATH ??
    path.resolve(root, '..', 'docs', 'business-logic-contract.md');
  const pipeCases = intEnv('QA_AGENT_TLT_PIPE_CASES', 20);
  const tankCases = intEnv('QA_AGENT_TLT_TANK_CASES', 20);
  const limit = intEnv('QA_AGENT_TLT_CASE_LIMIT', pipeCases + tankCases);
  const useLlm =
    process.argv.includes('--llm-cases') ||
    (process.env.QA_AGENT_ENABLE_LLM === '1' && process.env.QA_AGENT_TLT_USE_LLM !== '0');

  const documentation = fs.existsSync(documentationPath)
    ? fs.readFileSync(documentationPath, 'utf8')
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

  if (codebaseScan) {
    results.push(codebaseScanToReportResult(codebaseScan));
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
      codebaseScan,
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
      codebaseFindings: codebaseScan?.findings,
      reviewFindings: securityReview?.findings,
    });
    fs.mkdirSync(path.dirname(fixHandoffPath), { recursive: true });
    fs.writeFileSync(fixHandoffPath, `${JSON.stringify(fixHandoff, null, 2)}\n`);
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
        }
      : undefined,
    localLoadEnabled: Boolean(loadResult),
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
        localLoadEnabled: Boolean(loadResult),
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
