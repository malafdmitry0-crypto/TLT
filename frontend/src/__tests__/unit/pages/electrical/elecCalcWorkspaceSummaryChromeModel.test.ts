import { describe, expect, it } from 'vitest';
import {
  ELEC_CALC_CABLE_TYPE_CONTROL_LABEL,
  resolveActiveJobStatus,
  resolveTotalObjectsCount,
} from '@/pages/electrical/elecCalcWorkspaceSummaryChromeModel';

describe('resolveActiveJobStatus', () => {
  it('prefers job.status when present', () => {
    expect(resolveActiveJobStatus({ status: 'running' }, 'job-1')).toBe('running');
  });

  it('falls back to queued when only job id is known', () => {
    expect(resolveActiveJobStatus(null, 'job-1')).toBe('queued');
    expect(resolveActiveJobStatus(undefined, 'job-1')).toBe('queued');
  });

  it('returns null when neither status nor id is known', () => {
    expect(resolveActiveJobStatus(null, null)).toBeNull();
    expect(resolveActiveJobStatus({ status: null }, null)).toBeNull();
  });
});

describe('resolveTotalObjectsCount', () => {
  it('prefers page summary total', () => {
    expect(resolveTotalObjectsCount(42, 3)).toBe(42);
  });

  it('falls back to loaded objects length', () => {
    expect(resolveTotalObjectsCount(null, 7)).toBe(7);
    expect(resolveTotalObjectsCount(undefined, 0)).toBe(0);
  });
});

describe('ELEC_CALC_CABLE_TYPE_CONTROL_LABEL', () => {
  it('keeps the toolbar label stable', () => {
    expect(ELEC_CALC_CABLE_TYPE_CONTROL_LABEL).toBe('Тип для пересчёта:');
  });
});
