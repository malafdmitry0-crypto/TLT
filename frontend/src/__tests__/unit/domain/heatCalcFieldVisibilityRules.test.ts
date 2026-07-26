// @vitest-environment node
import { describe, expect, it } from 'vitest';
import {
  allowedInsulationTemperatureBasisValues,
  defaultInsulationTemperatureBasisForPlacement,
  isHeatCalcFieldVisible,
  isInsulationTemperatureBasisAllowedForPlacement,
} from '@/domain/heatCalcFieldVisibilityRules';

describe('heatCalcFieldVisibilityRules', () => {
  it('maps insulation temperature basis options by placement', () => {
    expect(allowedInsulationTemperatureBasisValues('indoor')).toEqual([
      'indoor',
      'attic',
      'basement',
    ]);
    expect(defaultInsulationTemperatureBasisForPlacement('underground')).toBe('channel');
    expect(isInsulationTemperatureBasisAllowedForPlacement('channel', 'outdoor')).toBe(false);
    expect(isInsulationTemperatureBasisAllowedForPlacement('outdoor_winter', 'outdoor')).toBe(true);
  });

  it('hides underground-only fields when placement is outdoor', () => {
    const context = {
      objectType: 'pipe' as const,
      values: { placement: 'outdoor' },
    };
    expect(isHeatCalcFieldVisible('burial_depth', context)).toBe(false);
    expect(isHeatCalcFieldVisible('ground_type', context)).toBe(false);
  });
});
