import { describe, expect, it } from 'vitest';
import {
  createExcelSelectionRange,
  getExcelSelectedCellPositions,
  normalizeExcelSelectionRange,
} from '@/utils/heatCalcExcelSelectionModel';

describe('heatCalcExcelSelectionModel', () => {
  const rowIds = ['r1', 'r2', 'r3'];
  const columnKeys = ['a', 'b', 'c'];

  it('normalizes anchor/focus into a closed range', () => {
    const range = createExcelSelectionRange(
      { rowId: 'r3', columnKey: 'c' },
      { rowId: 'r1', columnKey: 'a' },
    );
    expect(normalizeExcelSelectionRange(range, rowIds, columnKeys)).toEqual({
      top: 0,
      bottom: 2,
      left: 0,
      right: 2,
    });
  });

  it('enumerates selected cells in row-major order', () => {
    const range = createExcelSelectionRange(
      { rowId: 'r1', columnKey: 'a' },
      { rowId: 'r2', columnKey: 'b' },
    );
    expect(getExcelSelectedCellPositions(range, null, rowIds, columnKeys)).toEqual([
      { rowId: 'r1', columnKey: 'a' },
      { rowId: 'r1', columnKey: 'b' },
      { rowId: 'r2', columnKey: 'a' },
      { rowId: 'r2', columnKey: 'b' },
    ]);
  });
});
