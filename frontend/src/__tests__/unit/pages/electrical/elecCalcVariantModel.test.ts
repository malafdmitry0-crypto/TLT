import { describe, expect, it } from 'vitest';

import {
  calculationVariantLabel,
  normalizeCalculationVariantList,
} from '@/pages/electrical/elecCalcVariantModel';

describe('elecCalcVariantModel', () => {
  it('formats selected CO variants with the existing comma separator', () => {
    expect(calculationVariantLabel([])).toBe('');
    expect(calculationVariantLabel([1])).toBe('СО1');
    expect(calculationVariantLabel([1, 3, 4])).toBe('СО1, СО3, СО4');
  });

  it('normalizes checkbox values to stable unique calculation variants', () => {
    expect(normalizeCalculationVariantList([4, 2, 2, '1', 'bad', 9, null])).toEqual([1, 2, 4]);
    expect(normalizeCalculationVariantList([])).toEqual([]);
  });
});
