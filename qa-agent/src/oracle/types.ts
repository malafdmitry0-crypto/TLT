import type { Metadata } from '../shared/types';

export type ExpectedResult = {
  value: unknown;
  unit?: string;
  warnings: string[];
  metadata: Metadata;
};
