import { renderHook } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

const buildElectricalErrorItems = vi.hoisted(() => vi.fn());
const resolveActiveElectricalErrorItem = vi.hoisted(() => vi.fn());
const electricalErrorGuidanceForItem = vi.hoisted(() => vi.fn());

vi.mock('@/pages/electrical/elecCalcErrorSummaryModel', () => ({
  buildElectricalErrorItems,
  resolveActiveElectricalErrorItem,
  electricalErrorGuidanceForItem,
}));

import { useElecCalcErrorSummaryState } from '@/pages/electrical/useElecCalcErrorSummaryState';

describe('useElecCalcErrorSummaryState', () => {
  it('composes error items and guidance', () => {
    buildElectricalErrorItems.mockReturnValue([{ objectId: 'a' }]);
    resolveActiveElectricalErrorItem.mockReturnValue({ objectId: 'a' });
    electricalErrorGuidanceForItem.mockReturnValue({ title: 'fix' });

    const { result } = renderHook(() => useElecCalcErrorSummaryState({
      objects: [{ id: 'a' } as never],
      calcByObjectId: {},
      electricalDisplayOffset: 0,
      activeRowId: 'a',
    }));

    expect(result.current.electricalErrorItems).toEqual([{ objectId: 'a' }]);
    expect(result.current.activeElectricalErrorItem).toEqual({ objectId: 'a' });
    expect(result.current.activeElectricalErrorGuidance).toEqual({ title: 'fix' });
  });
});
