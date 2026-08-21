import { getByPath } from '../shared/types';
import type { TestCase } from '../test-generation/types';
import type { AppRunner } from './AppRunner';
import type { ActualResult } from './types';

function recordFromMetadata(value: unknown): Record<string, string> {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return {};
  return Object.entries(value).reduce<Record<string, string>>((headers, [key, raw]) => {
    if (typeof raw === 'string') headers[key] = raw;
    return headers;
  }, {});
}

function requestBody(testCase: TestCase): unknown {
  const formulaType = testCase.metadata.backendFormulaType;
  if (typeof formulaType === 'string' && formulaType.length > 0) {
    return { formula_type: formulaType, params: testCase.input };
  }
  return testCase.input;
}

export class BackendApiRunner implements AppRunner {
  constructor(private readonly baseUrl: string) {}

  async run(testCase: TestCase): Promise<ActualResult> {
    const endpoint = testCase.metadata.endpoint;
    if (typeof endpoint !== 'string' || !endpoint) {
      return {
        value: null,
        raw: null,
        status: 'error',
        metadata: { error: 'missing_endpoint', message: 'testCase.metadata.endpoint is required' },
      };
    }

    const url = new URL(endpoint, this.baseUrl).toString();
    const method = typeof testCase.metadata.method === 'string' ? testCase.metadata.method : 'POST';
    try {
      const response = await fetch(url, {
        method,
        headers: { 'content-type': 'application/json', ...recordFromMetadata(testCase.metadata.headers) },
        body: method.toUpperCase() === 'GET' ? undefined : JSON.stringify(requestBody(testCase)),
      });
      const contentType = response.headers.get('content-type') ?? '';
      const raw = contentType.includes('application/json') ? await response.json() : await response.text();
      return {
        value: getByPath(raw, String(testCase.metadata.resultPath ?? 'value')),
        unit: typeof testCase.metadata.unit === 'string' ? testCase.metadata.unit : undefined,
        raw,
        status: response.ok ? 'success' : 'error',
        metadata: { statusCode: response.status, endpoint, url, method },
      };
    } catch (error) {
      return {
        value: null,
        raw: null,
        status: 'error',
        metadata: {
          endpoint,
          url,
          error: error instanceof Error ? error.message : String(error),
        },
      };
    }
  }
}
