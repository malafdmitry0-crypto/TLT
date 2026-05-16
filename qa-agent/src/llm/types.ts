import type { Verdict } from '../shared/types';

export type LlmCompletionRequest = {
  system: string;
  user: string;
  temperature?: number;
};

export type LlmJudgeResult = {
  verdict: Verdict;
  confidence: number;
  reason: string;
  criticalDifferences: string[];
};
