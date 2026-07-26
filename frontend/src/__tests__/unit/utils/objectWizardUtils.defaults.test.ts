// @vitest-environment node
import { describe, it, expect } from 'vitest';
import {
  applyObjectFormDefaults,
} from '@/utils/objectWizardUtils';

describe('applyObjectFormDefaults', () => {
  it('restores empty string defaults without clobbering provided values', () => {
    const pipe = applyObjectFormDefaults('pipe', {
      // Runtime empty values must fall back to defaults (form may clear selects).
      placement: '' as unknown as 'outdoor',
      pipe_material: 'stainless_steel',
      supply_voltage: 380,
    });

    expect(pipe.placement).toBe('outdoor');
    expect(pipe.pipe_material).toBe('stainless_steel');
    expect(pipe.pipe_lambda_mode).toBe('reference');
    expect(pipe.supply_voltage).toBe(380);
    expect(pipe.insulation_layer_count).toBe('1');
    expect(pipe.insulation_temperature_basis).toBe('outdoor_winter');

    const tank = applyObjectFormDefaults('tank', {
      shape: '' as unknown as 'cylindrical',
      insulation_cover_material: 'aluminum',
    });

    expect(tank.shape).toBe('cylindrical');
    expect(tank.insulation_cover_material).toBe('aluminum');
    expect(tank.placement).toBe('outdoor');
    expect(tank.pipe_material).toBeUndefined();
  });
});
