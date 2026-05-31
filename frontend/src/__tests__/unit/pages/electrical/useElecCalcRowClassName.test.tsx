import { renderHook } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import type { ElectricalCalcSummary } from '@/types/calculation';
import {
  resolveElectricalRowClassName,
  useElecCalcRowClassName,
} from '@/pages/electrical/useElecCalcRowClassName';

function calc(results: Record<string, unknown>): ElectricalCalcSummary {
  return {
    id: 'calc-1',
    object_id: 'object-1',
    cable_type: 'self_regulating',
    cable_mark: null,
    variant_number: 1,
    results,
  };
}

describe('resolveElectricalRowClassName', () => {
  it('marks failed active rows with both invalid and active classes', () => {
    expect(resolveElectricalRowClassName({
      objectId: 'object-1',
      activeRowId: 'object-1',
      calc: calc({ message: 'CalculationError: Нет теплопотерь' }),
    })).toBe('row-invalid electrical-row-active');
  });

  it('does not mark unsupported or stale calculations as invalid rows', () => {
    expect(resolveElectricalRowClassName({
      objectId: 'object-1',
      activeRowId: null,
      calc: calc({
        message: 'Не поддерживается',
        category: 'unsupported',
        error_code: 'unsupported_layout',
      }),
    })).toBe('');
    expect(resolveElectricalRowClassName({
      objectId: 'object-1',
      activeRowId: null,
      calc: calc({
        message: 'Устарело',
        category: 'stale',
      }),
    })).toBe('');
  });
});

describe('useElecCalcRowClassName', () => {
  it('returns a stable row class callback wired to active row and calc map', () => {
    const calcByObjectId = {
      'object-1': calc({ message: 'Ошибка' }),
      'object-2': calc({ selected_cable: 'ТЛТ-10' }),
    };
    const { result } = renderHook(() => useElecCalcRowClassName({
      activeRowId: 'object-2',
      calcByObjectId,
    }));

    expect(result.current({ id: 'object-1' })).toBe('row-invalid');
    expect(result.current({ id: 'object-2' })).toBe('electrical-row-active');
  });
});
