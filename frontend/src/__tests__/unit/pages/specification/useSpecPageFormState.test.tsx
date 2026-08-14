import { act, renderHook } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { useSpecPageFormState } from '@/pages/specification/useSpecPageFormState';

describe('useSpecPageFormState', () => {
  it('starts required numeric specification settings at one', () => {
    const { result } = renderHook(() => useSpecPageFormState());

    expect(result.current.minLengthK2i).toBe('1');
    expect(result.current.reserveCoeff).toBe('1');
  });

  it('exposes the newest catalog selection synchronously for immediate submit', () => {
    const { result } = renderHook(() => useSpecPageFormState());

    let submitSnapshot: Record<string, string> = {};
    act(() => {
      result.current.setDraftCatalogSelections((previous) => ({
        ...previous,
        'opaque:er-1:connection': 'item-b',
      }));
      submitSnapshot = result.current.getDraftCatalogSelections();
    });

    expect(submitSnapshot).toEqual({
      'opaque:er-1:connection': 'item-b',
    });
    expect(result.current.draftCatalogSelections).toEqual(submitSnapshot);
  });

  it('keeps the synchronous snapshot aligned when workflow state clears selections', () => {
    const { result } = renderHook(() => useSpecPageFormState());

    act(() => {
      result.current.setDraftCatalogSelections({ group: 'item-a' });
      result.current.setDraftCatalogSelections({});
    });

    expect(result.current.getDraftCatalogSelections()).toEqual({});
    expect(result.current.draftCatalogSelections).toEqual({});
  });
});
