import type { TestCase } from '../test-generation/types';
import type { ActualResult } from './types';

export interface AppRunner {
  run(testCase: TestCase): ActualResult | Promise<ActualResult>;
}
