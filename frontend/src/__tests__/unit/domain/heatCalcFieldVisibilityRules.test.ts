// @vitest-environment node
import { describe, expect, it } from 'vitest';
import {
  allowedInsulationTemperatureBasisValues,
  defaultInsulationTemperatureBasisForPlacement,
  isHeatCalcFieldVisible,
  isInsulationTemperatureBasisAllowedForPlacement,
} from '@/domain/heatCalcFieldVisibilityRules';
import { getHeatCalcFieldConfig, getHeatCalcTableColumnRegistry } from '@/domain/heatCalcFields';

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

  it('registers canonical tank underground fields without the legacy depth key', () => {
    const context = { objectType: 'tank' as const, values: { placement: 'underground' } };
    expect(isHeatCalcFieldVisible('tank_buried_height', context)).toBe(true);
    expect(getHeatCalcFieldConfig('tank_buried_height')?.table_keys?.tank).toBe('tank_buried_height');
    expect(getHeatCalcTableColumnRegistry('tank').some((column) => column.key === 'tank_buried_height')).toBe(true);
    expect(getHeatCalcFieldConfig('burial_depth')).toBeNull();
  });
});
