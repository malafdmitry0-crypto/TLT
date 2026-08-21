// @vitest-environment node
import { describe, expect, it } from 'vitest';

import {
  EXCEL_CELL_DOUBLE_CLICK_MS,
  excelFullColumnEndpoints,
  excelFullRowEndpoints,
  excelShiftColumnAnchor,
  excelShiftRowAnchor,
  isExcelRowIndexSelected,
  isExcelSelectionStale,
  isRepeatedExcelCellClick,
} from '@/utils/heatCalcExcelSelectionGestures';

describe('heatCalcExcelSelectionGestures', () => {
  const rowIds = ['row-1', 'row-2', 'row-3'];
  const columns = ['name', 'pipe_length', 'supply_voltage'];

  it('detects repeated cell click within threshold', () => {
    const prev = { rowIndex: 1, columnIndex: 2, at: 1000 };
    expect(isRepeatedExcelCellClick(prev, 1, 2, 1000 + EXCEL_CELL_DOUBLE_CLICK_MS - 1)).toBe(true);
    expect(isRepeatedExcelCellClick(prev, 1, 2, 1000 + EXCEL_CELL_DOUBLE_CLICK_MS + 1)).toBe(false);
    expect(isRepeatedExcelCellClick(prev, 0, 2, 1100)).toBe(false);
    expect(isRepeatedExcelCellClick(null, 1, 2, 1100)).toBe(false);
  });

  it('builds full row and column endpoints', () => {
    expect(excelFullRowEndpoints(rowIds, columns, 1)).toEqual({
      start: { rowId: 'row-2', columnKey: 'name' },
      end: { rowId: 'row-2', columnKey: 'supply_voltage' },
    });
    expect(excelFullColumnEndpoints(rowIds, columns, 1)).toEqual({
      start: { rowId: 'row-1', columnKey: 'pipe_length' },
      end: { rowId: 'row-3', columnKey: 'pipe_length' },
    });
    expect(excelFullRowEndpoints(rowIds, [], 0)).toBeNull();
    expect(excelFullColumnEndpoints([], columns, 0)).toBeNull();
  });

  it('resolves shift anchors for row/column gestures', () => {
    const range = {
      anchor: { rowId: 'row-2', columnKey: 'pipe_length' },
      focus: { rowId: 'row-2', columnKey: 'name' },
    };
    const start = { rowId: 'row-1', columnKey: 'name' };
    expect(excelShiftRowAnchor(range, 'name', start, true)).toEqual({
      rowId: 'row-2',
      columnKey: 'name',
    });
    expect(excelShiftRowAnchor(range, 'name', start, false)).toEqual(start);
    expect(excelShiftColumnAnchor(range, 'row-1', start, true)).toEqual({
      rowId: 'row-1',
      columnKey: 'pipe_length',
    });
  });

  it('detects selected row index and stale selection', () => {
    const range = {
      anchor: { rowId: 'row-1', columnKey: 'name' },
      focus: { rowId: 'row-2', columnKey: 'supply_voltage' },
    };
    expect(isExcelRowIndexSelected(range, rowIds, columns, 1)).toBe(true);
    expect(isExcelRowIndexSelected(range, rowIds, columns, 2)).toBe(false);
    const rows = rowIds.map((id) => ({ id }));
    expect(isExcelSelectionStale({ objectId: 'missing', columnKey: 'name' }, rows, columns)).toBe(true);
    expect(isExcelSelectionStale({ objectId: 'row-1', columnKey: 'name' }, rows, columns)).toBe(false);
    expect(isExcelSelectionStale(null, rows, columns)).toBe(false);
  });
});
