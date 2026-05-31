import { act, renderHook } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import { useElecCalcCableMarkModalState } from '@/pages/electrical/useElecCalcCableMarkModalState';
import { AUTO_CABLE_MARK_VALUE } from '@/pages/electrical/elecCalcCableOptionModel';
import type { CableTypeKey } from '@/pages/electrical/elecCalcMainTableModel';
import type { ElectricalCalcSummary } from '@/types/calculation';
import type { ProjectObject } from '@/types/project';

const object: ProjectObject = {
  id: 'object-1',
  project_id: 'project-1',
  object_type: 'pipe',
  sort_order: 0,
  version: 1,
  params: {},
  results: null,
  is_valid: true,
  validation_errors: null,
  created_at: '',
  updated_at: '',
};

const calc: ElectricalCalcSummary = {
  id: 'calc-1',
  project_id: 'project-1',
  object_id: object.id,
  cable_type: 'self_regulating',
  cable_mark: 'ТЛТ-25',
  cable_mark_source: 'manual',
  variant_number: 1,
  params: {},
  results: { selected_cable: 'ТЛТ-25' },
  created_at: '',
  updated_at: '',
};

describe('useElecCalcCableMarkModalState', () => {
  it('opens, derives options and selected cable, then closes', () => {
    const onOpenObject = vi.fn();
    const findCableRowForMark = vi.fn(() => ({
      model: 'ТЛТ-25',
      cable_type: 'self_regulating',
      source: 'builtin',
    }));
    const { result } = renderHook(() => useElecCalcCableMarkModalState({
      objects: [object],
      calcByObjectId: { [object.id]: calc },
      variant: 2,
      getSavedCableTypeForObject: () => 'self_regulating',
      normalizeAvailableCableType: (type) => type,
      cableMarkOptionsFor: () => [
        {
          value: AUTO_CABLE_MARK_VALUE,
          label: 'Авто',
          searchLabel: 'Авто',
          mark: null,
          optionSource: 'builtin',
        },
        {
          value: 'builtin::TLT-25',
          label: 'ТЛТ-25',
          searchLabel: 'ТЛТ-25',
          mark: 'ТЛТ-25',
          optionSource: 'builtin',
          cableSource: 'builtin',
        },
      ],
      cableMarkValueForCalc: () => 'builtin::TLT-25',
      findCableRowForMark,
      onOpenObject,
    }));

    act(() => {
      result.current.open(object);
    });

    expect(onOpenObject).toHaveBeenCalledWith(object);
    expect(result.current.object).toEqual(object);
    expect(result.current.cableType).toBe('self_regulating');
    expect(result.current.value).toBe('builtin::TLT-25');
    expect(result.current.targetVariants).toEqual([2]);
    expect(result.current.selectedCable?.model).toBe('ТЛТ-25');
    expect(findCableRowForMark).toHaveBeenCalledWith(
      'self_regulating',
      'ТЛТ-25',
      calc,
      'builtin',
    );

    act(() => {
      result.current.close();
    });

    expect(result.current.object).toBeNull();
    expect(result.current.cableType).toBeNull();
    expect(result.current.value).toBeNull();
    expect(result.current.targetVariants).toEqual([]);
  });

  it('normalizes cable type changes and target variants', () => {
    const onCableTypeChange = vi.fn();
    const normalizeAvailableCableType = vi.fn((type: CableTypeKey) =>
      type === 'single_core' ? 'self_regulating' : type);
    const { result } = renderHook(() => useElecCalcCableMarkModalState({
      objects: [object],
      calcByObjectId: {},
      variant: 3,
      getSavedCableTypeForObject: () => 'self_regulating',
      normalizeAvailableCableType,
      cableMarkOptionsFor: () => [],
      cableMarkValueForCalc: () => AUTO_CABLE_MARK_VALUE,
      findCableRowForMark: () => null,
      onCableTypeChange,
    }));

    act(() => {
      result.current.open(object);
      result.current.changeCableType('single_core');
      result.current.setTargetVariantsFromValues([1, 4, 'bad']);
    });

    expect(result.current.cableType).toBe('self_regulating');
    expect(result.current.value).toBe(AUTO_CABLE_MARK_VALUE);
    expect(result.current.targetVariants).toEqual([1, 4]);
    expect(result.current.targetVariantsForSubmit).toEqual([1, 4]);
    expect(onCableTypeChange).toHaveBeenCalledTimes(1);

    act(() => {
      result.current.setTargetVariants([]);
    });

    expect(result.current.targetVariantsForSubmit).toEqual([3]);
  });
});
