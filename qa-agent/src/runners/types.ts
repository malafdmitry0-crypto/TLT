import type { Metadata } from '../shared/types';

export type ActualResultStatus = 'success' | 'error' | 'skipped';

export type ActualResult = {
  value: unknown;
  unit?: string;
  raw: unknown;
  status: ActualResultStatus;
  metadata: Metadata;
};
