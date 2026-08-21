import type { TestCase } from '../test-generation/types';
import type { ExpectedResult } from './types';

export interface ReferenceOracle {
  evaluate(testCase: TestCase): ExpectedResult | Promise<ExpectedResult>;
}
