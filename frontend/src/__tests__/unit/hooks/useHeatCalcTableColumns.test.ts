// @vitest-environment node
import { describe, expect, it, vi } from 'vitest';

import type { HeatCalcContextMenuTrigger } from '@/components/heatcalc/HeatCalcContextMenuTrigger';
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

describe('HeatCalcContextMenuTrigger structural contract', () => {
  it('accepts mouse-like and pointer-like events without cast for menu open', () => {
    const openRow = vi.fn((rowIndex: number, event: HeatCalcContextMenuTrigger) => {
      event.preventDefault();
      event.stopPropagation();
      return { rowIndex, x: event.clientX, y: event.clientY };
    });

    const mouseLike: HeatCalcContextMenuTrigger = {
      clientX: 40,
      clientY: 80,
      preventDefault: vi.fn(),
      stopPropagation: vi.fn(),
    };
    const pointerLike: HeatCalcContextMenuTrigger = {
      clientX: 120,
      clientY: 160,
      preventDefault: vi.fn(),
      stopPropagation: vi.fn(),
    };

    expect(openRow(2, mouseLike)).toEqual({ rowIndex: 2, x: 40, y: 80 });
    expect(openRow(3, pointerLike)).toEqual({ rowIndex: 3, x: 120, y: 160 });
    expect(mouseLike.preventDefault).toHaveBeenCalled();
    expect(pointerLike.stopPropagation).toHaveBeenCalled();
  });
});
