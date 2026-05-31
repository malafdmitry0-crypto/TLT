import { describe, expect, it } from 'vitest';

import {
  DEFAULT_CABLE_TYPE,
  FULL_FEATURE_CABLE_TYPES,
  buildCableTypeObjectOverrides,
  isResistiveCableType,
  MVP_CABLE_TYPES,
  normalizeCableTypeForAvailableTypes,
  resolveUniformCableType,
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

  it('normalizes unavailable cable types to the MVP default', () => {
    const available = new Set(MVP_CABLE_TYPES);

    expect(normalizeCableTypeForAvailableTypes('self_regulating', available)).toBe('self_regulating');
    expect(normalizeCableTypeForAvailableTypes('single_core', available)).toBe(DEFAULT_CABLE_TYPE);
    expect(normalizeCableTypeForAvailableTypes(null, available)).toBe(DEFAULT_CABLE_TYPE);
  });

  it('resolves a selected type only when selected rows are uniform', () => {
    expect(resolveUniformCableType([])).toBeNull();
    expect(resolveUniformCableType(['single_core', 'single_core'])).toBe('single_core');
    expect(resolveUniformCableType(['single_core', 'three_core'])).toBeNull();
  });

  it('builds object overrides only for rows with a draft cable type', () => {
    const available = new Set(MVP_CABLE_TYPES);

    expect(buildCableTypeObjectOverrides(
      ['obj-1', 'obj-2', 'obj-3'],
      {
        'obj-1': 'self_regulating',
        'obj-2': 'single_core',
      },
      available,
    )).toEqual([
      { object_id: 'obj-1', cable_type: 'self_regulating' },
      { object_id: 'obj-2', cable_type: 'self_regulating' },
    ]);
  });
});
