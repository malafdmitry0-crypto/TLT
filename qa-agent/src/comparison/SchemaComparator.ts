import { isRecord } from '../shared/types';
import type { DeterministicComparator } from './DeterministicComparator';
import type { ComparisonResult } from './types';

export class SchemaComparator implements DeterministicComparator {
  compare(expected: unknown, actual: unknown): ComparisonResult {
    if (!isRecord(expected) || !isRecord(actual)) {
      return {
        verdict: 'needs_review',
        severity: 'medium',
        reason: 'SchemaComparator expects objects',
        differences: [],
      };
    }

    const missing = Object.keys(expected).filter((key) => !(key in actual));
    return {
      verdict: missing.length === 0 ? 'pass' : 'fail',
      severity: missing.length === 0 ? 'low' : 'medium',
      reason: missing.length === 0 ? 'Actual object contains expected keys' : 'Actual object misses keys',
      differences: missing.map((key) => ({
        path: key,
        expected: 'present',
        actual: 'missing',
        reason: 'missing key',
      })),
    };
  }
}
