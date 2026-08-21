import type { Severity, Tolerance, Verdict } from '../shared/types';

export type Difference = {
  path: string;
  expected: unknown;
  actual: unknown;
  reason: string;
};

export type ComparisonResult = {
  verdict: Verdict;
  severity: Severity;
  reason: string;
  differences: Difference[];
  numericDelta?: number;
  toleranceUsed?: Required<Tolerance>;
};

export type ComparatorOptions = Tolerance;
