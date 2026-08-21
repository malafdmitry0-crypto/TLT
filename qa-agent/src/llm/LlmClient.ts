import type { LlmCompletionRequest } from './types';

export interface LlmClient {
  completeJson(request: LlmCompletionRequest): Promise<unknown>;
}
