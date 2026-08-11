import { renderHook } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import type { ElectricalCalcSummary } from '@/types/calculation';
import type { ProjectObject } from '@/types/project';
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

function objectRow(
  id: string,
  overrides: Partial<Pick<ProjectObject, 'is_valid' | 'validation_errors'>> = {},
): Pick<ProjectObject, 'id' | 'is_valid' | 'validation_errors'> {
  return { id, is_valid: true, validation_errors: null, ...overrides };
}

describe('resolveElectricalRowClassName', () => {
  it('marks failed active rows with both invalid and active classes', () => {
    expect(resolveElectricalRowClassName({
      objectId: 'object-1',
      activeRowId: 'object-1',
      calc: calc({ message: 'CalculationError: Нет теплопотерь' }),
    })).toBe('row-invalid electrical-row-active');
  });

  it('does not mark unsupported calculations as invalid rows', () => {
    expect(resolveElectricalRowClassName({
      objectId: 'object-1',
      activeRowId: null,
      calc: calc({
        message: 'Не поддерживается',
        category: 'unsupported',
        error_code: 'unsupported_layout',
      }),
    })).toBe('');
  });

  it('marks stale calculations with row-stale (not row-invalid) when assigned', () => {
    const assigned = {
      object_id: 'object-1',
      system_type: 'self_regulating' as const,
      assignment_state: 'ready' as const,
      version: 1,
    };
    expect(resolveElectricalRowClassName({
      objectId: 'object-1',
      activeRowId: null,
      calc: calc({
        message: 'Устарело',
        category: 'stale',
      }),
      assignment: assigned,
    })).toBe('row-stale');
    expect(resolveElectricalRowClassName({
      objectId: 'object-1',
      activeRowId: 'object-1',
      calc: calc({
        message: 'Устарело',
        category: 'stale',
        stale: true,
      }),
      assignment: assigned,
    })).toBe('row-stale electrical-row-active');
  });

  it('marks assignment_state stale even when calc looks successful', () => {
    expect(resolveElectricalRowClassName({
      objectId: 'object-1',
      activeRowId: null,
      calc: calc({ selected_cable: 'ТТН-30' }),
      assignment: {
        object_id: 'object-1',
        system_type: 'self_regulating',
        assignment_state: 'stale',
        version: 2,
      },
    })).toBe('row-stale');
  });
});

describe('useElecCalcRowClassName', () => {
  it('marks a backend-invalid heat object even when no electrical calculation exists', () => {
    const { result } = renderHook(() => useElecCalcRowClassName({
      activeRowId: null,
      calcByObjectId: {},
    }));
    const invalidObject = objectRow('object-1', {
      is_valid: false,
      validation_errors: {
        message: 'Заполните обязательные поля объекта',
        missing_fields: ['outer_diameter'],
      },
    });

    expect(result.current(invalidObject)).toBe('row-invalid');
  });

  it('keeps backend-invalid selection red but leaves unsupported objects neutral', () => {
    const { result } = renderHook(() => useElecCalcRowClassName({
      activeRowId: 'invalid-object',
      calcByObjectId: {},
    }));
    const invalidObject = objectRow('invalid-object', {
      is_valid: false,
      validation_errors: { category: 'validation', message: 'Ошибка исходных данных' },
    });
    const unsupportedObject = objectRow('unsupported-object', {
      is_valid: false,
      validation_errors: { category: 'unsupported', message: 'Не применимо' },
    });

    expect(result.current(invalidObject)).toBe('row-invalid electrical-row-active');
    expect(result.current(unsupportedObject)).toBe('');
  });

  it('returns a stable row class callback wired to active row and calc map', () => {
    const calcByObjectId = {
      'object-1': calc({ message: 'Ошибка' }),
      'object-2': calc({ selected_cable: 'ТЛТ-10' }),
    };
    const { result } = renderHook(() => useElecCalcRowClassName({
      activeRowId: 'object-2',
      calcByObjectId,
    }));

    expect(result.current(objectRow('object-1'))).toBe('row-invalid');
    expect(result.current(objectRow('object-2'))).toBe('electrical-row-active');
  });
});
