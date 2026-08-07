import { describe, expect, it } from 'vitest';

import {
  getCalcJobRefetchInterval,
  isCalcJobStale,
  QUEUED_JOB_STALE_AFTER_MS,
  RUNNING_JOB_STALE_AFTER_MS,
} from '@/utils/calcJobPolling';

describe('calc job stale polling policy', () => {
  const createdAt = '2026-08-07T00:00:00.000Z';
  const createdAtMs = Date.parse(createdAt);

  it('marks queued and running jobs stale at their bounded thresholds', () => {
    expect(isCalcJobStale('queued', createdAt, createdAtMs + QUEUED_JOB_STALE_AFTER_MS - 1)).toBe(false);
    expect(isCalcJobStale('queued', createdAt, createdAtMs + QUEUED_JOB_STALE_AFTER_MS)).toBe(true);
    expect(isCalcJobStale('running', createdAt, createdAtMs + RUNNING_JOB_STALE_AFTER_MS - 1)).toBe(false);
    expect(isCalcJobStale('running', createdAt, createdAtMs + RUNNING_JOB_STALE_AFTER_MS)).toBe(true);
  });

  it('backs stale active jobs off to the recovery interval without declaring them terminal', () => {
    expect(getCalcJobRefetchInterval('queued', false, true)).toBe(15_000);
    expect(getCalcJobRefetchInterval('running', false, true)).toBe(15_000);
    expect(getCalcJobRefetchInterval('succeeded', false, true)).toBe(false);
  });
});
