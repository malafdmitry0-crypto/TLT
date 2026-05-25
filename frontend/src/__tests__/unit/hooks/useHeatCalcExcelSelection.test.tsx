import { act, renderHook } from '@testing-library/react';
import { useState, type PointerEvent as ReactPointerEvent } from 'react';
import { describe, expect, it, vi } from 'vitest';

import {
  type HeatCalcExcelCellRef,
  useHeatCalcExcelSelection,
} from '@/hooks/useHeatCalcExcelSelection';
import type { ProjectObject } from '@/types/project';
import type { ExcelSelectionRange } from '@/utils/heatCalcExcelMode';

function makePipe(id: string): ProjectObject {
  return {
    id,
    project_id: 'project-1',
    object_type: 'pipe',
    sort_order: Number(id.replace(/\D/g, '') || 0),
    version: 1,
    params: {
      name: `Pipe ${id}`,
      placement: 'outdoor',
      outer_diameter: 0.108,
      wall_thickness: 0.004,
      pipe_material: 'carbon_steel',
      pipe_length: 25,
      insulation_thickness: 0.05,
      insulation_material: 'mineral_wool',
      process_temperature: 60,
      ambient_temperature: -20,
      max_ambient_temperature: 35,
      max_process_temperature: 110,
      environment: 'normal',
      zone_classification: 'safe',
      temperature_group: 'T3',
      min_switch_temperature: -20,
      supply_voltage: 220,
      safety_factor: 1.2,
      steam_tracing: 'no',
    },
    results: null,
    is_valid: true,
    validation_errors: null,
    created_at: '2024-01-01T00:00:00Z',
    updated_at: '2024-01-01T00:00:00Z',
  };
}

function renderSelectionHook(onFormFocus = vi.fn<(record: ProjectObject) => void>()) {
  const rows = [makePipe('row-1'), makePipe('row-2')];
  const editableColumnKeys = ['name', 'pipe_length', 'supply_voltage'];
  const rendered = renderHook(() => {
    const [selectedCell, setSelectedCell] = useState<HeatCalcExcelCellRef>(null);
    const [selectionRange, setSelectionRange] = useState<ExcelSelectionRange | null>(null);
    const [activeInlineCell, setActiveInlineCell] = useState<HeatCalcExcelCellRef>(null);
    const [focusedRowId, setFocusedRowId] = useState<string | null>(null);

    const selection = useHeatCalcExcelSelection({
      excelModeEnabled: true,
      rows,
      editableColumnKeys,
      selectedCell,
      setSelectedCell,
      selectionRange,
      setSelectionRange,
      setActiveInlineCell,
      focusedRowId,
      onSelectRecord: (record) => {
        setFocusedRowId(record.id);
        onFormFocus(record);
      },
    });

    return {
      activeInlineCell,
      focusedRowId,
      selectedCell,
      selection,
    };
  });

  return { ...rendered, onFormFocus, rows };
}

describe('useHeatCalcExcelSelection', () => {
  it('keeps cell selection separate from row/form focus inside the same row', () => {
    const { result, onFormFocus, rows } = renderSelectionHook();

    act(() => {
      result.current.selection.selectCellByPosition(0, 0);
    });

    expect(result.current.focusedRowId).toBe('row-1');
    expect(result.current.selectedCell).toEqual({ objectId: 'row-1', columnKey: 'name' });
    expect(onFormFocus).toHaveBeenCalledTimes(1);
    expect(onFormFocus).toHaveBeenLastCalledWith(rows[0]);

    act(() => {
      result.current.selection.selectCellByPosition(0, 2);
    });

    expect(result.current.focusedRowId).toBe('row-1');
    expect(result.current.selectedCell).toEqual({ objectId: 'row-1', columnKey: 'supply_voltage' });
    expect(onFormFocus).toHaveBeenCalledTimes(1);

    act(() => {
      result.current.selection.selectCellByPosition(1, 2);
    });

    expect(result.current.focusedRowId).toBe('row-2');
    expect(result.current.selectedCell).toEqual({ objectId: 'row-2', columnKey: 'supply_voltage' });
    expect(onFormFocus).toHaveBeenCalledTimes(2);
    expect(onFormFocus).toHaveBeenLastCalledWith(rows[1]);
  });

  it('row-header selection still focuses the target row for the form', () => {
    const { result, onFormFocus, rows } = renderSelectionHook();

    act(() => {
      result.current.selection.beginRowSelection(1, { shiftKey: false } as ReactPointerEvent<HTMLElement>);
    });

    expect(result.current.focusedRowId).toBe('row-2');
    expect(result.current.selectedCell).toEqual({ objectId: 'row-2', columnKey: 'name' });
    expect(onFormFocus).toHaveBeenCalledTimes(1);
    expect(onFormFocus).toHaveBeenLastCalledWith(rows[1]);
  });
});
