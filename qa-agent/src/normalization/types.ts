import type { Metadata } from '../shared/types';

export type NormalizedResult = {
  value: unknown;
  unit?: string;
  status: 'success' | 'error' | 'skipped';
  warnings: string[];
  metadata: Metadata;
};
