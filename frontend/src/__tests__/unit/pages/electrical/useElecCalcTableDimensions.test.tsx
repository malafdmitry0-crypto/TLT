import { renderHook } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import {
  ELECTRICAL_TABLE_SCROLL_Y,
  useElecCalcTableDimensions,
} from '@/pages/electrical/useElecCalcTableDimensions';

describe('useElecCalcTableDimensions', () => {
  it('keeps the minimum horizontal scroll width for compact column sets', () => {
    const { result } = renderHook(() => useElecCalcTableDimensions({
      visibleElectricalColumnMetas: [
        { width: 100, minWidthPx: 80 },
        { width: 120, minWidthPx: 90 },
      ],
    }));

    expect(result.current.electricalTableScrollX).toBe(1200);
    expect(result.current.electricalTableScrollY).toBe(ELECTRICAL_TABLE_SCROLL_Y);
  });

  it('sums visible column widths with min width fallback', () => {
    const { result } = renderHook(() => useElecCalcTableDimensions({
      visibleElectricalColumnMetas: [
        { width: 400, minWidthPx: 80 },
        { width: 500, minWidthPx: 600 },
        { width: 700, minWidthPx: 120 },
      ],
    }));

    expect(result.current.electricalTableScrollX).toBe(1736);
  });
});
