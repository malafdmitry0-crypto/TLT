import { describe, expect, it } from 'vitest';

import {
  electricalCalcCategory,
  electricalCalcError,
  isElectricalCalcSuccess,
  isElectricalCalcUnsupported,
} from '@/utils/calcStatus';
import type { ElectricalCalcSummary } from '@/types/calculation';

function calc(results: Record<string, unknown>): ElectricalCalcSummary {
  return {
    id: 'c1',
    object_id: 'o1',
    cable_type: 'self_regulating',
    cable_mark: null,
    variant_number: 1,
    results,
  };
}

describe('calcStatus', () => {
  it('distinguishes unsupported electrical results from formula errors', () => {
    const unsupported = calc({
      error: 'CalculationError: raw',
      error_code: 'unsupported_layout',
      category: 'unsupported',
      message: 'Не применимо',
    });

    expect(isElectricalCalcSuccess(unsupported)).toBe(false);
    expect(isElectricalCalcUnsupported(unsupported)).toBe(true);
    expect(electricalCalcCategory(unsupported)).toBe('unsupported');
    expect(electricalCalcError(unsupported)).toBe('Не применимо');
  });
});
