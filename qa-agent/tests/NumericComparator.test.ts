import { describe, expect, it } from 'vitest';

import { NumericComparator } from '../src/comparison/NumericComparator';

describe('NumericComparator', () => {
  const comparator = new NumericComparator();

  it('passes equal numbers', () => {
    expect(comparator.compare(10, 10).verdict).toBe('pass');
  });

  it('passes numbers within tolerance', () => {
    const result = comparator.compare(100, 100.05, {
      absoluteTolerance: 0.1,
      relativeTolerance: 0,
    });
    expect(result.verdict).toBe('pass');
  });

  it('fails numbers outside tolerance', () => {
    const result = comparator.compare(100, 101, {
      absoluteTolerance: 0.1,
      relativeTolerance: 0,
    });
    expect(result.verdict).toBe('fail');
    expect(result.differences[0].path).toBe('$');
  });

  it('compares arrays', () => {
    const result = comparator.compare([1, 2, 3], [1, 2.01, 3], {
      absoluteTolerance: 0.02,
    });
    expect(result.verdict).toBe('pass');
  });

  it('compares nested objects', () => {
    const result = comparator.compare(
      { heat: { q: 44.9, total: 4490 } },
      { heat: { q: 44.91, total: 4490 } },
      { absoluteTolerance: 0.02 },
    );
    expect(result.verdict).toBe('pass');
  });

  it('returns needs_review for NaN', () => {
    expect(comparator.compare(Number.NaN, Number.NaN).verdict).toBe('needs_review');
  });

  it('returns needs_review for Infinity', () => {
    expect(comparator.compare(Infinity, Infinity).verdict).toBe('needs_review');
  });

  it('returns needs_review for null and undefined', () => {
    expect(comparator.compare(null, 1).verdict).toBe('needs_review');
    expect(comparator.compare(1, undefined).verdict).toBe('needs_review');
  });
});
