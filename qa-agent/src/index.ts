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

if (process.argv.includes('--llm-extract')) {
  runControlledLlmExtraction().catch((error) => {
    console.error(error);
    process.exitCode = 1;
  });
} else if (process.argv.includes('--example') || process.argv[1]?.endsWith('index.ts')) {
  runExample().catch((error) => {
    console.error(error);
    process.exitCode = 1;
  });
}
