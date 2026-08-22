import { describe, expect, it } from 'vitest';

import { buildAssignAutoCalcBatchPayload } from '@/pages/electrical/elecCalcAssignAutoCalcModel';

describe('buildAssignAutoCalcBatchPayload', () => {
  it('returns null for empty selection', () => {
    expect(buildAssignAutoCalcBatchPayload({
      systemType: 'self_regulating',
      objectIds: [],
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

  it('builds Samreg batch with self_regulating_tt cable type (E0 / FE-13)', () => {
    const payload = buildAssignAutoCalcBatchPayload({
      systemType: 'self_regulating',
      objectIds: ['x'],
    });
    expect(payload).toEqual({
      scope: 'selected',
      objectIds: ['x'],
      skipManual: true,
      cableType: 'self_regulating_tt',
      objectOverrides: [{ object_id: 'x', cable_type: 'self_regulating_tt' }],
      nextSystemView: 'self_regulating',
    });
  });
});
