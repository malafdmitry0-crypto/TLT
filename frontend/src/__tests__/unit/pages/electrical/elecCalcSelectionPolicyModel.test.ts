import { describe, expect, it } from 'vitest';

import {
  SELECTION_POLICY_LABEL,
  SELECTION_POLICY_OPTIONS,
  selectionPolicyText,
} from '@/domain/electrical/elecCalcSelectionPolicyModel';

describe('elecCalcSelectionPolicyModel', () => {
  it('keeps selection policy labels stable', () => {
    expect(SELECTION_POLICY_LABEL).toEqual({
      technical_minimum: 'Технический',
      lowest_cost: 'Дешевле',
      fastest_delivery: 'Быстрее',
      in_stock: 'В наличии',
      preferred_supplier: 'Приоритет',
      balanced: 'Баланс',
    });
  });

  it('builds select options from the stable label map', () => {
    expect(SELECTION_POLICY_OPTIONS).toEqual([
      { value: 'technical_minimum', label: 'Технический' },
      { value: 'lowest_cost', label: 'Дешевле' },
      { value: 'fastest_delivery', label: 'Быстрее' },
      { value: 'in_stock', label: 'В наличии' },
      { value: 'preferred_supplier', label: 'Приоритет' },
      { value: 'balanced', label: 'Баланс' },
    ]);
  });

  it('formats known, manual and unknown policy values', () => {
    expect(selectionPolicyText('technical_minimum')).toBe('Технический');
    expect(selectionPolicyText('manual_selection')).toBe('Ручной');
    expect(selectionPolicyText('custom_policy')).toBe('custom_policy');
    expect(selectionPolicyText(undefined)).toBe('—');
  });
});
