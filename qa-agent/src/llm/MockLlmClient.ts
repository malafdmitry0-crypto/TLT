import type { LlmClient } from './LlmClient';
import type { LlmCompletionRequest } from './types';

export class MockLlmClient implements LlmClient {
  readonly calls: LlmCompletionRequest[] = [];

  constructor(private readonly response: unknown = { verdict: 'pass', confidence: 1, reason: 'mock', criticalDifferences: [] }) {}

  async completeJson(request: LlmCompletionRequest): Promise<unknown> {
    this.calls.push(request);
    if (this.response instanceof Error) throw this.response;
    return this.response;
  }
}
