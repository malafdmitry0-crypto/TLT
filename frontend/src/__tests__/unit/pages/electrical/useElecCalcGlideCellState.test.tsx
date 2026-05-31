import { renderHook } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import type { ElectricalCalcSummary } from '@/types/calculation';
import type { ProjectObject } from '@/types/project';
import { useElecCalcGlideCellState } from '@/pages/electrical/useElecCalcGlideCellState';

const object = {
  id: 'object-1',
  project_id: 'project-1',
  object_type: 'pipe',
  sort_order: 1,
  version: 1,
  params: { name: 'Труба 1' },
  results: null,
  is_valid: true,
  validation_errors: null,
  created_at: '2026-06-01T00:00:00Z',
  updated_at: '2026-06-01T00:00:00Z',
} satisfies ProjectObject;

function calc(overrides: Partial<ElectricalCalcSummary> = {}): ElectricalCalcSummary {
  return {
    id: 'calc-1',
    object_id: 'object-1',
    cable_type: 'self_regulating',
    cable_mark: 'ТЛТ-25',
    variant_number: 1,
    params: {},
    results: {
      selected_cable: 'ТЛТ-25',
      winding_pitch: 75,
      num_circuits: 2,
    },
    ...overrides,
  };
}

function setup(
  options: Partial<Parameters<typeof useElecCalcGlideCellState>[0]> = {},
) {
  const electricalColumnCopyValue = vi.fn((key: string, obj: ProjectObject, index: number) =>
    `copy:${key}:${obj.id}:${index}`,
  );
  const isElectricalLayoutCellEditable = vi.fn((_: ProjectObject, columnKey: string) =>
    columnKey === 'winding_pitch_mm' || columnKey === 'number_of_threads',
  );
  const getColumnAlign = vi.fn((columnKey: string) =>
    columnKey === 'winding_pitch_mm' || columnKey === 'number_of_threads' ? 'right' : undefined,
  );
  const getCellActions = vi.fn((_: ProjectObject, columnKey: string) =>
    columnKey === 'cable_mark'
      ? [{ key: 'choose', label: 'Выбор', disabled: false }]
      : undefined,
  );

  return {
    electricalColumnCopyValue,
    isElectricalLayoutCellEditable,
    getColumnAlign,
    getCellActions,
    ...renderHook(() => useElecCalcGlideCellState({
      calcByObjectId: { 'object-1': calc() },
      electricalColumnCopyValue,
      isElectricalLayoutCellEditable,
      getColumnAlign,
      getCellActions,
      ...options,
    })),
  };
}

describe('useElecCalcGlideCellState', () => {
  it('uses current layout values for editable layout cells', () => {
    const { result, electricalColumnCopyValue } = setup();

    expect(result.current(object, 'winding_pitch_mm', 3)).toEqual({
      displayValue: '75',
      editable: true,
      align: 'right',
      editor: 'number',
      step: 1,
      actions: undefined,
    });
    expect(electricalColumnCopyValue).not.toHaveBeenCalled();
  });

  it('falls back to the copy-value model when a layout column is not editable', () => {
    const isElectricalLayoutCellEditable = vi.fn(() => false);
    const { result } = setup({ isElectricalLayoutCellEditable });

    expect(result.current(object, 'number_of_threads', 1)).toEqual({
      displayValue: 'copy:number_of_threads:object-1:1',
      editable: false,
      align: 'right',
      editor: undefined,
      step: undefined,
      actions: undefined,
    });
  });

  it('keeps page-provided cell actions outside the hook', () => {
    const { result, getCellActions } = setup();

    expect(result.current(object, 'cable_mark', 0)).toMatchObject({
      displayValue: 'copy:cable_mark:object-1:0',
      editable: false,
      actions: [{ key: 'choose', label: 'Выбор', disabled: false }],
    });
    expect(getCellActions).toHaveBeenCalledWith(object, 'cable_mark');
  });
});
