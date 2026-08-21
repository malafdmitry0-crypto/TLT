import { isRecord } from '../shared/types';
import type { DeterministicComparator } from './DeterministicComparator';
import type { ComparatorOptions, ComparisonResult, Difference } from './types';

type CompareState = {
  differences: Difference[];
  needsReview: Difference[];
  maxDelta: number;
};

function extractValue(value: unknown): unknown {
  return isRecord(value) && 'value' in value ? value.value : value;
}

function tolerance(options: ComparatorOptions = {}): Required<ComparatorOptions> {
  return {
    absoluteTolerance: options.absoluteTolerance ?? 0,
    relativeTolerance: options.relativeTolerance ?? 0,
  };
}

function compareNumber(
  expected: number,
  actual: number,
  path: string,
  options: Required<ComparatorOptions>,
  state: CompareState,
): void {
  if (!Number.isFinite(expected) || !Number.isFinite(actual)) {
    state.needsReview.push({
      path,
      expected,
      actual,
      reason: 'NaN or Infinity cannot be safely compared',
    });
    return;
  }

  const delta = Math.abs(actual - expected);
  state.maxDelta = Math.max(state.maxDelta, delta);
  const allowed = Math.max(options.absoluteTolerance, options.relativeTolerance * Math.abs(expected));
  if (delta > allowed) {
    state.differences.push({
      path,
      expected,
      actual,
      reason: `numeric delta ${delta} exceeds tolerance ${allowed}`,
    });
  }
}

function compareRecursive(
  expected: unknown,
  actual: unknown,
  path: string,
  options: Required<ComparatorOptions>,
  state: CompareState,
): void {
  if (expected === null || expected === undefined || actual === null || actual === undefined) {
    state.needsReview.push({ path, expected, actual, reason: 'null/undefined value' });
    return;
  }

  if (typeof expected === 'number' && typeof actual === 'number') {
    compareNumber(expected, actual, path, options, state);
    return;
  }

  if (Array.isArray(expected) && Array.isArray(actual)) {
    if (expected.length !== actual.length) {
      state.differences.push({
        path,
        expected: expected.length,
        actual: actual.length,
        reason: 'array length mismatch',
      });
      return;
    }
    expected.forEach((item, index) => compareRecursive(item, actual[index], `${path}[${index}]`, options, state));
    return;
  }

  if (isRecord(expected) && isRecord(actual)) {
    for (const key of Object.keys(expected)) {
      compareRecursive(expected[key], actual[key], path ? `${path}.${key}` : key, options, state);
    }
    return;
  }

  if (typeof expected !== typeof actual) {
    state.needsReview.push({ path, expected, actual, reason: 'incompatible types' });
    return;
  }

  if (expected !== actual) {
    state.differences.push({ path, expected, actual, reason: 'non-numeric value mismatch' });
  }
}

export class NumericComparator implements DeterministicComparator {
  compare(expectedInput: unknown, actualInput: unknown, options: ComparatorOptions = {}): ComparisonResult {
    const expected = extractValue(expectedInput);
    const actual = extractValue(actualInput);
    const used = tolerance(options);
    const state: CompareState = { differences: [], needsReview: [], maxDelta: 0 };

    compareRecursive(expected, actual, '$', used, state);

    if (state.needsReview.length > 0) {
      return {
        verdict: 'needs_review',
        severity: 'medium',
        reason: state.needsReview[0].reason,
        differences: state.needsReview,
        numericDelta: state.maxDelta,
        toleranceUsed: used,
      };
    }

    if (state.differences.length > 0) {
      return {
        verdict: 'fail',
        severity: 'high',
        reason: `${state.differences.length} deterministic difference(s) found`,
        differences: state.differences,
        numericDelta: state.maxDelta,
        toleranceUsed: used,
      };
    }

    return {
      verdict: 'pass',
      severity: 'low',
      reason: 'Values match within tolerance',
      differences: [],
      numericDelta: state.maxDelta,
      toleranceUsed: used,
    };
  }
}
