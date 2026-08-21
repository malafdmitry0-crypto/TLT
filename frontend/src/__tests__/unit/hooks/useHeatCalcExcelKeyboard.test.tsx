import { act, renderHook } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import { useHeatCalcExcelKeyboard } from '@/hooks/useHeatCalcExcelKeyboard';
import type { ProjectObject } from '@/types/project';

function makePipe(id: string): ProjectObject {
  return {
    id,
    project_id: 'project-1',
    object_type: 'pipe',
    sort_order: 0,
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

describe('useHeatCalcExcelKeyboard', () => {
  it('starts inline edit on F2 for the selected Excel cell', () => {
    const record = makePipe('row-1');
    const startInlineCellEdit = vi.fn();
    renderHook(() => useHeatCalcExcelKeyboard({
      excelModeEnabled: true,
      selectedPosition: { rowIndex: 0, columnIndex: 1 },
      rows: [record],
      editableColumnKeys: ['name', 'pipe_length'],
      contextMenuOpen: false,
      closeContextMenu: vi.fn(),
      collapseSelectionToActiveCell: vi.fn(),
      moveSelection: vi.fn(),
      selectAllCells: vi.fn(),
      copySelection: vi.fn(async () => true),
      applyPaste: vi.fn(),
      startInlineCellEdit,
    }));

    act(() => {
      document.dispatchEvent(new KeyboardEvent('keydown', { key: 'F2', bubbles: true }));
    });

    expect(startInlineCellEdit).toHaveBeenCalledTimes(1);
    expect(startInlineCellEdit).toHaveBeenCalledWith(record, 'pipe_length');
  });
});
