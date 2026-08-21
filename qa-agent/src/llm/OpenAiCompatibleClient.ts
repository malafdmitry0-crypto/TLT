import type { LlmClient } from './LlmClient';
import type { LlmCompletionRequest } from './types';

export class OpenAiCompatibleClient implements LlmClient {
  constructor(
    private readonly config = {
      apiKey: process.env.LLM_API_KEY,
      baseUrl: process.env.LLM_BASE_URL ?? 'https://api.openai.com/v1',
      model: process.env.LLM_MODEL ?? 'gpt-4.1-mini',
    },
  ) {}

  async completeJson(request: LlmCompletionRequest): Promise<unknown> {
    if (!this.config.apiKey) {
      throw new Error('LLM_API_KEY is required for OpenAiCompatibleClient');
    }

    const userContent =
      request.images && request.images.length > 0
        ? [
            { type: 'text', text: request.user },
            ...request.images.map((image) => ({
              type: 'image_url',
              image_url: {
                url: image.dataUrl,
                detail: 'high',
              },
            })),
          ]
        : request.user;

    const response = await fetch(`${this.config.baseUrl}/chat/completions`, {
      method: 'POST',
      headers: {
        authorization: `Bearer ${this.config.apiKey}`,
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        model: this.config.model,
        temperature: request.temperature ?? 0,
        response_format: { type: 'json_object' },
        messages: [
          { role: 'system', content: request.system },
          { role: 'user', content: userContent },
        ],
      }),
    });

    if (!response.ok) {
      throw new Error(`LLM request failed with HTTP ${response.status}: ${await response.text()}`);
    }

    const payload = (await response.json()) as {
      choices?: Array<{ message?: { content?: string } }>;
    };
    const content = payload.choices?.[0]?.message?.content;
    if (!content) throw new Error('LLM response did not include message content');
    return JSON.parse(content);
  }
}
