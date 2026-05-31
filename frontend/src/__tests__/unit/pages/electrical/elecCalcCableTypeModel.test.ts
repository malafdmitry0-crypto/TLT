import { describe, expect, it } from 'vitest';

import {
  DEFAULT_CABLE_TYPE,
  FULL_FEATURE_CABLE_TYPES,
  isResistiveCableType,
  MVP_CABLE_TYPES,
} from '@/pages/electrical/elecCalcCableTypeModel';

describe('elecCalcCableTypeModel', () => {
  it('keeps default and available cable type lists stable', () => {
    expect(DEFAULT_CABLE_TYPE).toBe('self_regulating');
    expect(MVP_CABLE_TYPES).toEqual(['self_regulating']);
    expect(FULL_FEATURE_CABLE_TYPES).toEqual([
      'self_regulating',
      'self_regulating_tt',
      'single_core',
      'three_core',
    ]);
  });

  it('marks only resistive cable types as resistive', () => {
    expect(isResistiveCableType('single_core')).toBe(true);
    expect(isResistiveCableType('three_core')).toBe(true);
    expect(isResistiveCableType('self_regulating')).toBe(false);
    expect(isResistiveCableType('self_regulating_tt')).toBe(false);
    expect(isResistiveCableType('mineral')).toBe(false);
    expect(isResistiveCableType('skin')).toBe(false);
  });
});
