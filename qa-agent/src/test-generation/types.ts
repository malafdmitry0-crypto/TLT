import type { Metadata } from '../shared/types';

export type TestCaseKind = 'fixed' | 'edge' | 'property' | 'metamorphic';

export type TestCase = {
  id: string;
  requirementId: string;
  input: Record<string, unknown>;
  expected?: unknown;
  kind: TestCaseKind;
  metadata: Metadata;
};
