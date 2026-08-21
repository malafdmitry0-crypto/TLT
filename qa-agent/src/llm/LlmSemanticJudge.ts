import type { LlmClient } from './LlmClient';
import { SEMANTIC_JUDGE_SYSTEM_PROMPT } from './prompts';
import type { LlmJudgeResult } from './types';

function parseJudgeResult(value: unknown): LlmJudgeResult | undefined {
  if (typeof value !== 'object' || value === null) return undefined;
  const item = value as Partial<LlmJudgeResult>;
  if (!['pass', 'fail', 'needs_review'].includes(String(item.verdict))) return undefined;
  return {
    verdict: item.verdict as LlmJudgeResult['verdict'],
    confidence: typeof item.confidence === 'number' ? item.confidence : 0,
    reason: typeof item.reason === 'string' ? item.reason : 'No reason returned',
    criticalDifferences: Array.isArray(item.criticalDifferences)
      ? item.criticalDifferences.map(String)
      : [],
  };
}

export class LlmSemanticJudge {
  constructor(private readonly llmClient: LlmClient) {}

  async judge(expectedText: string, actualText: string, context: Record<string, unknown>): Promise<LlmJudgeResult> {
    if (!expectedText || !actualText) {
      return {
        verdict: 'needs_review',
        confidence: 0,
        reason: 'Expected or actual text is incomplete',
        criticalDifferences: [],
      };
    }

    try {
      const response = await this.llmClient.completeJson({
        system: SEMANTIC_JUDGE_SYSTEM_PROMPT,
        user: JSON.stringify({ expectedText, actualText, context }),
        temperature: 0,
      });
      return (
        parseJudgeResult(response) ?? {
          verdict: 'needs_review',
          confidence: 0,
          reason: 'LLM returned invalid judge JSON',
          criticalDifferences: ['invalid_json_shape'],
        }
      );
    } catch (error) {
      return {
        verdict: 'needs_review',
        confidence: 0,
        reason: error instanceof Error ? error.message : String(error),
        criticalDifferences: ['llm_error'],
      };
    }
  }
}
