import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { describe, expect, it } from 'vitest';

import { NumericComparator } from '../src/comparison/NumericComparator';
import { MarkdownDocumentationParser } from '../src/documentation/MarkdownDocumentationParser';
import { MockLlmClient } from '../src/llm/MockLlmClient';
import { LlmSemanticJudge } from '../src/llm/LlmSemanticJudge';
import { ResultNormalizer } from '../src/normalization/ResultNormalizer';
import { FormulaOracle } from '../src/oracle/FormulaOracle';
import { QaPipeline } from '../src/pipeline/QaPipeline';
import { JsonReportGenerator } from '../src/reporting/JsonReportGenerator';
import { FormulaRegistry } from '../src/registry/FormulaRegistry';
import type { RequirementExtractor } from '../src/requirements/RequirementExtractor';
import type { Requirement } from '../src/requirements/types';
import { MockAppRunner } from '../src/runners/MockAppRunner';
import { EdgeCaseGenerator } from '../src/test-generation/EdgeCaseGenerator';

class StaticExtractor implements RequirementExtractor {
  constructor(private readonly requirement: Requirement) {}
  extract(): Requirement[] {
    return [this.requirement];
  }
}

function requirement(id = 'circle_area'): Requirement {
  return {
    id,
    sourceSection: id,
    description: `${id} requirement`,
    type: 'formula',
    inputs: id === 'linear_function' ? ['m', 'x', 'b'] : ['r'],
    expectedBehavior: { formulaId: id },
    tolerance: { absoluteTolerance: 1e-9, relativeTolerance: 1e-9 },
    tags: ['test'],
  };
}

function makeDoc() {
  const file = path.join(os.tmpdir(), `qa-agent-doc-${Date.now()}-${Math.random()}.md`);
  fs.writeFileSync(file, '# Test Requirement\n\nFormula requirement.');
  return file;
}

function registryWithFormula(id = 'circle_area', mockActual?: unknown) {
  const formulaRegistry = new FormulaRegistry();
  formulaRegistry.add({
    id,
    expression: id === 'linear_function' ? 'y = m * x + b' : 'area = pi * r ** 2',
    variables: id === 'linear_function' ? ['m', 'x', 'b'] : ['r'],
    output: id === 'linear_function' ? 'y' : 'area',
    tolerance: { absoluteTolerance: 1e-9, relativeTolerance: 1e-9 },
    constraints: id === 'linear_function' ? [] : ['r >= 0'],
    examples: [
      {
        id: `${id}-pipeline`,
        kind: 'fixed',
        input: id === 'linear_function' ? { m: 2, x: 5, b: 1 } : { r: 3 },
        metadata: mockActual === undefined ? {} : { mockActual },
      },
    ],
  });
  return formulaRegistry;
}

async function runPipeline(options: { id?: string; mockActual?: unknown; llm?: MockLlmClient }) {
  const id = options.id ?? 'circle_area';
  const formulaRegistry = registryWithFormula(id, options.mockActual);
  const llm = options.llm ?? new MockLlmClient();
  const pipeline = new QaPipeline({
    documentationParser: new MarkdownDocumentationParser(),
    requirementExtractor: new StaticExtractor(requirement(id)),
    testCaseGenerator: new EdgeCaseGenerator(formulaRegistry),
    oracle: new FormulaOracle(formulaRegistry),
    appRunner: new MockAppRunner('pass'),
    normalizer: new ResultNormalizer(),
    comparator: new NumericComparator(),
    semanticJudge: new LlmSemanticJudge(llm),
    reportGenerator: new JsonReportGenerator(),
  });
  return { report: await pipeline.run({ documentationPath: makeDoc() }), llm };
}

describe('QaPipeline', () => {
  it('runs happy path without semantic judge', async () => {
    const { report, llm } = await runPipeline({});
    expect(report.summary.passed).toBe(1);
    expect(llm.calls).toHaveLength(0);
  });

  it('reports numeric fail path without semantic judge override', async () => {
    const { report, llm } = await runPipeline({ mockActual: 999 });
    expect(report.summary.failed).toBe(1);
    expect(report.results[0].deterministic.verdict).toBe('fail');
    expect(llm.calls).toHaveLength(0);
  });

  it('uses semantic judge for needs_review path', async () => {
    const llm = new MockLlmClient({
      verdict: 'needs_review',
      confidence: 0.4,
      reason: 'missing numeric value',
      criticalDifferences: ['actual missing'],
    });
    const { report } = await runPipeline({ mockActual: 'not-a-number', llm });
    expect(report.summary.needsReview).toBe(1);
    expect(llm.calls).toHaveLength(1);
  });

  it('does not use LLM for deterministic numeric pass/fail', async () => {
    const llm = new MockLlmClient();
    await runPipeline({ id: 'linear_function', llm });
    await runPipeline({ id: 'linear_function', mockActual: 0, llm });
    expect(llm.calls).toHaveLength(0);
  });
});
