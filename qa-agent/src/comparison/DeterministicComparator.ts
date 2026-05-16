import type { ComparisonResult, ComparatorOptions } from './types';

export interface DeterministicComparator {
  compare(expected: unknown, actual: unknown, options?: ComparatorOptions): ComparisonResult;
}
