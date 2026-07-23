import { act, renderHook } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import { useHeatCalcNormalGridDraftInvalidation } from '@/pages/heatcalc/useHeatCalcNormalGridDraftInvalidation';
import type { DraftRowsById } from '@/utils/heatCalcInlineEdit';

describe('useHeatCalcNormalGridDraftInvalidation', () => {
  it('registers invalidator and fires on draft identity change', () => {
    const invalidate = vi.fn();
    const rowA = { id: 'a' } as DraftRowsById[string];
    const rowA2 = { id: 'a' } as DraftRowsById[string];

    const { result, rerender } = renderHook(
      ({ drafts, excel }) => useHeatCalcNormalGridDraftInvalidation(drafts, excel),
      { initialProps: { drafts: { a: rowA } as DraftRowsById, excel: false } },
    );

    act(() => {
      result.current.registerNormalGridDraftInvalidator(invalidate);
    });

    rerender({ drafts: { a: rowA2 } as DraftRowsById, excel: false });
    expect(invalidate).toHaveBeenCalledWith(['a']);
  });

  it('skips invalidation in excel mode', () => {
    const invalidate = vi.fn();
    const rowA = { id: 'a' } as DraftRowsById[string];
    const rowA2 = { id: 'a' } as DraftRowsById[string];

    const { result, rerender } = renderHook(
      ({ drafts, excel }) => useHeatCalcNormalGridDraftInvalidation(drafts, excel),
      { initialProps: { drafts: { a: rowA } as DraftRowsById, excel: true } },
    );
    act(() => {
      result.current.registerNormalGridDraftInvalidator(invalidate);
    });
    rerender({ drafts: { a: rowA2 } as DraftRowsById, excel: true });
    expect(invalidate).not.toHaveBeenCalled();
  });
});
