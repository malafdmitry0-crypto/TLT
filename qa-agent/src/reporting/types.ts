import type { ComparisonResult } from '../comparison/types';
import type { LlmJudgeResult } from '../llm/types';
import type { NormalizedResult } from '../normalization/types';
import type { ExpectedResult } from '../oracle/types';
import type { Metadata, Verdict } from '../shared/types';
import type { TestCase } from '../test-generation/types';

export type ReportResult = {
  testCase: TestCase;
  expected: ExpectedResult;
  actual: NormalizedResult;
  deterministic: ComparisonResult;
  llmJudge?: LlmJudgeResult;
  finalVerdict: Verdict;
};

export type Report = {
  summary: {
    total: number;
    passed: number;
    failed: number;
    needsReview: number;
  };
  results: ReportResult[];
  groupedFailures: Record<string, ReportResult[]>;
  metadata: Metadata;
};

export interface ReportGenerator {
  generate(results: ReportResult[], metadata?: Metadata): Report;
}
