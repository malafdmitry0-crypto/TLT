import { describe, expect, it, vi } from 'vitest';

import {
  buildExcelSelectionLookup,
  isExcelCellSelectedByLookup,
} from '@/hooks/useHeatCalcTableColumns';
import { createExcelSelectionRange } from '@/utils/heatCalcExcelMode';

describe('useHeatCalcTableColumns selection lookup', () => {
  it('checks selected Excel cells through precomputed indexes without per-cell indexOf', () => {
    const rowIds = ['r0', 'r1', 'r2', 'r3'];
    const columnKeys = ['c0', 'c1', 'c2', 'c3'];
    const indexOfSpy = vi.spyOn(Array.prototype, 'indexOf');
    const lookup = buildExcelSelectionLookup(
      createExcelSelectionRange(
        { rowId: 'r1', columnKey: 'c1' },
        { rowId: 'r2', columnKey: 'c2' },
      ),
      rowIds,
      columnKeys,
    );

    const selected = isExcelCellSelectedByLookup(lookup, 'r2', 'c2');
    const outside = isExcelCellSelectedByLookup(lookup, 'r3', 'c2');
    const missing = isExcelCellSelectedByLookup(lookup, 'missing', 'c2');
    const indexOfCallCount = indexOfSpy.mock.calls.length;
    indexOfSpy.mockRestore();

    expect(selected).toBe(true);
    expect(outside).toBe(false);
    expect(missing).toBe(false);
    expect(indexOfCallCount).toBe(0);
  });
});
