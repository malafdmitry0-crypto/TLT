import type { GridSelection } from '@glideapps/glide-data-grid';
import { describe, expect, it, vi } from 'vitest';

import type { ProjectObject } from '@/types/project';

vi.mock('@glideapps/glide-data-grid', () => ({
  CompactSelection: {
    empty: () => ({
      add: (selection: number | [number, number]) => ({
        toArray: () => {
          if (typeof selection === 'number') return [selection];
          return Array.from({ length: selection[1] - selection[0] }, (_, index) => selection[0] + index);
        },
      }),
      toArray: () => [],
    }),
  },
}));

import {
  buildHeatCalcGlideGridSelection,
  extractHeatCalcGridText,
  heatCalcGlideSelectionToExcelRange,
} from '@/utils/heatCalcGlideGrid';

function selectionRows(rows: number[]) {
  return {
    toArray: () => rows,
  };
}

describe('HeatCalcGlideGrid helpers', () => {
  const rows = [
    { id: 'row-1' },
    { id: 'row-2' },
    { id: 'row-3' },
  ] as ProjectObject[];
  const columnKeys = ['name', 'diameter', 'temperature'];

  it('extracts display text without mounting AntD cell elements', () => {
    expect(extractHeatCalcGridText(<span title="Название" />)).toBe('Название');
    expect(extractHeatCalcGridText(<span><b>Труба</b> Ø108</span>)).toBe('Труба Ø108');
  });

  it('builds Glide selection from normalized rowId + columnKey range', () => {
    const selection = buildHeatCalcGlideGridSelection({
      rows,
      columnKeys,
      selectedPosition: { rowIndex: 2, columnIndex: 1 },
      selectionRange: {
        anchor: { rowId: 'row-1', columnKey: 'name' },
        focus: { rowId: 'row-3', columnKey: 'diameter' },
      },
    });

    expect(selection.current).toEqual({
      cell: [1, 2],
      range: {
        x: 0,
        y: 0,
        width: 2,
        height: 3,
      },
      rangeStack: [],
    });
  });

  it('renders full-row Excel ranges as Glide row marker selection', () => {
    const selection = buildHeatCalcGlideGridSelection({
      rows,
      columnKeys,
      selectedPosition: { rowIndex: 1, columnIndex: 0 },
      selectionRange: {
        anchor: { rowId: 'row-2', columnKey: 'name' },
        focus: { rowId: 'row-3', columnKey: 'temperature' },
      },
    });

    expect(selection.rows.toArray()).toEqual([1, 2]);
    expect(selection.current).toEqual({
      cell: [0, 1],
      range: {
        x: 0,
        y: 1,
        width: 1,
        height: 1,
      },
      rangeStack: [],
    });
  });

  it('maps Glide range selection back to rowId + columnKey', () => {
    const selection = {
      columns: selectionRows([]),
      rows: selectionRows([]),
      current: {
        cell: [2, 1],
        range: {
          x: 1,
          y: 0,
          width: 2,
          height: 2,
        },
        rangeStack: [],
      },
    } as unknown as GridSelection;

    expect(heatCalcGlideSelectionToExcelRange({ rows, columnKeys, selection })).toEqual({
      anchor: { rowId: 'row-1', columnKey: 'diameter' },
      focus: { rowId: 'row-2', columnKey: 'temperature' },
      active: { rowId: 'row-2', columnKey: 'temperature' },
    });
  });

  it('maps Glide row marker selection to the full editable row range', () => {
    const selection = {
      columns: selectionRows([]),
      rows: selectionRows([1, 2]),
    } as unknown as GridSelection;

    expect(heatCalcGlideSelectionToExcelRange({ rows, columnKeys, selection })).toEqual({
      anchor: { rowId: 'row-2', columnKey: 'name' },
      focus: { rowId: 'row-3', columnKey: 'temperature' },
      active: { rowId: 'row-2', columnKey: 'name' },
    });
  });

  it('expands row-marker drag ranges to the full editable row width', () => {
    const selection = {
      columns: selectionRows([]),
      rows: selectionRows([]),
      current: {
        cell: [0, 1],
        range: {
          x: 0,
          y: 1,
          width: 1,
          height: 2,
        },
        rangeStack: [],
      },
    } as unknown as GridSelection;

    expect(heatCalcGlideSelectionToExcelRange({
      rows,
      columnKeys,
      selection,
      forceFullRowSelection: true,
    })).toEqual({
      anchor: { rowId: 'row-2', columnKey: 'name' },
      focus: { rowId: 'row-3', columnKey: 'temperature' },
      active: { rowId: 'row-2', columnKey: 'name' },
    });
  });
});
