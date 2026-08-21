import type { TestCase } from '../test-generation/types';
import type { AppRunner } from './AppRunner';
import type { ActualResult } from './types';

export class MockAppRunner implements AppRunner {
  constructor(private readonly mode: 'pass' | 'fail' | 'needs_review' = 'pass') {}

  run(testCase: TestCase): ActualResult {
    if (testCase.metadata.mockActual !== undefined) {
      return {
        value: testCase.metadata.mockActual,
        raw: { source: 'metadata.mockActual' },
        status: 'success',
        metadata: { runner: 'MockAppRunner' },
      };
    }

    if (this.mode === 'needs_review') {
      return {
        value: null,
        raw: { source: 'MockAppRunner' },
        status: 'success',
        metadata: { runner: 'MockAppRunner', simulated: 'needs_review' },
      };
    }

    const expected = testCase.expected;
    const value = this.mode === 'fail' && typeof expected === 'number' ? expected + 999 : expected;
    return {
      value,
      raw: { source: 'MockAppRunner' },
      status: 'success',
      metadata: { runner: 'MockAppRunner', simulated: this.mode },
    };
  }
}
