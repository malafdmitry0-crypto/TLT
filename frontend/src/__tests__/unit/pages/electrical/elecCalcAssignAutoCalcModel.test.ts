import { describe, expect, it } from 'vitest';

import { buildAssignAutoCalcBatchPayload } from '@/pages/electrical/elecCalcAssignAutoCalcModel';

describe('buildAssignAutoCalcBatchPayload', () => {
  it('returns null for empty selection', () => {
    expect(buildAssignAutoCalcBatchPayload({
      systemType: 'self_regulating',
      objectIds: [],
    })).toBeNull();
  });

  it('returns null for unsupported system', () => {
    expect(buildAssignAutoCalcBatchPayload({
      systemType: 'skin',
      objectIds: ['a'],
    })).toBeNull();
  });

  it('builds resistive batch with single_core', () => {
    expect(buildAssignAutoCalcBatchPayload({
      systemType: 'resistive',
      objectIds: ['a', 'b'],
    })).toEqual({
      scope: 'selected',
      objectIds: ['a', 'b'],
      skipManual: true,
      cableType: 'single_core',
      objectOverrides: [
        { object_id: 'a', cable_type: 'single_core' },
        { object_id: 'b', cable_type: 'single_core' },
      ],
      nextSystemView: 'resistive',
    });
  });

  it('builds self_regulating batch', () => {
    const payload = buildAssignAutoCalcBatchPayload({
      systemType: 'self_regulating',
      objectIds: ['x'],
    });
    expect(payload?.cableType).toBe('self_regulating');
    expect(payload?.nextSystemView).toBe('self_regulating');
  });
});
