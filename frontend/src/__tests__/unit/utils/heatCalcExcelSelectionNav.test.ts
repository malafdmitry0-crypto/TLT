// @vitest-environment node
import { describe, expect, it } from 'vitest';

import {
  clampExcelGridIndices,
  computeMovedExcelSelectionIndices,
  excelCellPositionAt,
  excelSelectedCoordinates,
} from '@/utils/heatCalcExcelSelectionNav';

describe('heatCalcExcelSelectionNav', () => {
  const rowIds = ['row-1', 'row-2', 'row-3'];
  const columns = ['name', 'pipe_length', 'supply_voltage'];

  it('maps indices to cell positions and rejects OOB', () => {
    expect(excelCellPositionAt(rowIds, columns, 1, 2)).toEqual({
      rowId: 'row-2',
      columnKey: 'supply_voltage',
    });
    expect(excelCellPositionAt(rowIds, columns, 9, 0)).toBeNull();
    expect(excelCellPositionAt(rowIds, columns, 0, 9)).toBeNull();
  });

  it('resolves selected cell coordinates from object id + column key', () => {
    const rows = rowIds.map((id) => ({ id }));
    expect(
      excelSelectedCoordinates(rows, columns, { objectId: 'row-2', columnKey: 'pipe_length' }),
    ).toEqual({ rowIndex: 1, columnIndex: 1 });
    expect(
      excelSelectedCoordinates(rows, columns, { objectId: 'missing', columnKey: 'name' }),
    ).toBeNull();
    expect(excelSelectedCoordinates(rows, columns, null)).toBeNull();
  });

  it('moves selection with optional column wrap', () => {
    expect(
      computeMovedExcelSelectionIndices({ rowIndex: 0, columnIndex: 2 }, 0, 1, 3, true),
    ).toEqual({ rowIndex: 1, columnIndex: 0 });
    expect(
      computeMovedExcelSelectionIndices({ rowIndex: 1, columnIndex: 0 }, 0, -1, 3, true),
    ).toEqual({ rowIndex: 0, columnIndex: 2 });
    expect(
      computeMovedExcelSelectionIndices({ rowIndex: 1, columnIndex: 1 }, 1, 0, 3, false),
    ).toEqual({ rowIndex: 2, columnIndex: 1 });
  });

  it('clamps indices into the grid', () => {
    expect(clampExcelGridIndices(-5, 99, 3, 3)).toEqual({ rowIndex: 0, columnIndex: 2 });
    expect(clampExcelGridIndices(10, -1, 3, 3)).toEqual({ rowIndex: 2, columnIndex: 0 });
    expect(clampExcelGridIndices(0, 0, 0, 3)).toBeNull();
  });
});
