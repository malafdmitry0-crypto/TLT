import path from 'node:path';

import type { DeterministicComparator } from '../comparison/DeterministicComparator';
import type { DocumentationParser } from '../documentation/DocumentationParser';
import type { LlmSemanticJudge } from '../llm/LlmSemanticJudge';
import { ResultNormalizer } from '../normalization/ResultNormalizer';
import type { ReferenceOracle } from '../oracle/ReferenceOracle';
import type { RequirementExtractor } from '../requirements/RequirementExtractor';
import type { Requirement } from '../requirements/types';
import type { AppRunner } from '../runners/AppRunner';
import type { Metadata, Verdict } from '../shared/types';
import { readUtf8FileUnderRoot } from '../shared/paths';
import type { TestCaseGenerator } from '../test-generation/TestCaseGenerator';
import type { TestCase } from '../test-generation/types';
import type { ReportGenerator, Report, ReportResult } from '../reporting/types';

export type QaPipelineConfig = {
  documentationPath: string;
  registryPath?: string;
  metadata?: Metadata;
};

export class QaPipeline {
  constructor(
    private readonly deps: {
      documentationParser: DocumentationParser;
      requirementExtractor: RequirementExtractor;
      testCaseGenerator: TestCaseGenerator;
      oracle: ReferenceOracle;
      appRunner: AppRunner;
      normalizer: ResultNormalizer;
      comparator: DeterministicComparator;
      semanticJudge: LlmSemanticJudge;
      reportGenerator: ReportGenerator;
      registryLoader?: (config: QaPipelineConfig) => void | Promise<void>;
    },
  ) {}

  async run(config: QaPipelineConfig): Promise<Report> {
    const rawDoc = readUtf8FileUnderRoot(
      path.dirname(config.documentationPath),
      config.documentationPath,
      'pipeline documentation path',
    );
    const parsed = this.deps.documentationParser.parse(rawDoc, {
      sourcePath: config.documentationPath,
    });
    const requirements = await Promise.resolve(this.deps.requirementExtractor.extract(parsed));
    await Promise.resolve(this.deps.registryLoader?.(config));
    const testCases = requirements.flatMap((requirement) =>
      this.withRequirementDefaults(requirement, this.deps.testCaseGenerator.generate(requirement)),
    );

    const results: ReportResult[] = [];

    for (const testCase of testCases) {
      const expected = await Promise.resolve(this.deps.oracle.evaluate(testCase));
      const executableCase: TestCase = { ...testCase, expected: expected.value };
      const actual = this.deps.normalizer.normalize(await Promise.resolve(this.deps.appRunner.run(executableCase)));
      const deterministic = this.deps.comparator.compare(expected, actual, {
        ...(testCase.metadata.tolerance as Record<string, number> | undefined),
        ...(expected.metadata.tolerance as Record<string, number> | undefined),
      });

      const needsSemanticJudge =
        deterministic.verdict === 'needs_review' ||
        ['text', 'ui'].includes(String(testCase.metadata.requirementType));
      const llmJudge = needsSemanticJudge
        ? await this.deps.semanticJudge.judge(String(expected.value ?? ''), String(actual.value ?? ''), {
            testCaseId: testCase.id,
            requirementId: testCase.requirementId,
          })
        : undefined;

      results.push({
        testCase,
        expected,
        actual,
        deterministic,
        llmJudge,
        finalVerdict: this.finalVerdict(deterministic.verdict, llmJudge?.verdict),
      });
    }

    return this.deps.reportGenerator.generate(results, {
      documentationPath: config.documentationPath,
      registryPath: config.registryPath,
      requirements: requirements.length,
      testCases: testCases.length,
      ...config.metadata,
    });
  }

  private withRequirementDefaults(requirement: Requirement, cases: TestCase[]): TestCase[] {
    return cases.map((testCase) => ({
      ...testCase,
      metadata: {
        requirementType: requirement.type,
        tolerance: requirement.tolerance,
        ...testCase.metadata,
      },
    }));
  }

  private finalVerdict(deterministicVerdict: Verdict, llmVerdict?: Verdict): Verdict {
    if (deterministicVerdict === 'pass') return llmVerdict ?? 'pass';
    if (deterministicVerdict === 'fail') return 'fail';
    return llmVerdict ?? 'needs_review';
  }
}
