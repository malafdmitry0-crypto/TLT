import { describe, expect, it } from 'vitest';
import { buildHeatCalcWorkspaceLoadState } from '@/pages/heatcalc/useHeatCalcObjectsDataModel';

describe('useHeatCalcObjectsDataModel — workspace load state', () => {
  function slice(overrides: Partial<Parameters<typeof buildHeatCalcWorkspaceLoadState>[0][number]> = {}) {
    return {
      enabled: true,
      isError: false,
      error: null as Error | null,
      isFetching: false,
      hasUsableSnapshot: false,
      refetch: vi.fn(),
      ...overrides,
    };
  }

  it('ignores errors from disabled queries', () => {
    const inactive = slice({
      enabled: false,
      isError: true,
      error: new Error('inactive boom'),
    });
    const active = slice({ hasUsableSnapshot: true });
    const state = buildHeatCalcWorkspaceLoadState([inactive, active]);
    expect(state.error).toBeNull();
    expect(state.isBlockingError).toBe(false);
    expect(state.hasUsableSnapshot).toBe(true);
    state.retry();
    expect(inactive.refetch).not.toHaveBeenCalled();
  });

  it('surfaces first enabled error and blocks without snapshot', () => {
    const first = slice({
      isError: true,
      error: new Error('summary failed'),
    });
    const second = slice({
      isError: true,
      error: new Error('capabilities failed'),
    });
    const state = buildHeatCalcWorkspaceLoadState([first, second]);
    expect(state.error?.message).toBe('summary failed');
    expect(state.isBlockingError).toBe(true);
    expect(state.hasUsableSnapshot).toBe(false);
    state.retry();
    expect(first.refetch).toHaveBeenCalledTimes(1);
    expect(second.refetch).toHaveBeenCalledTimes(1);
  });

  it('keeps stale snapshot usable while retrying a failed refetch', () => {
    const failedWithStale = slice({
      isError: true,
      error: new Error('refetch 500'),
      isFetching: true,
      hasUsableSnapshot: true,
    });
    const healthy = slice({ hasUsableSnapshot: true });
    const state = buildHeatCalcWorkspaceLoadState([failedWithStale, healthy]);
    expect(state.error?.message).toBe('refetch 500');
    expect(state.hasUsableSnapshot).toBe(true);
    expect(state.isBlockingError).toBe(false);
    expect(state.isRetrying).toBe(true);
    state.retry();
    expect(failedWithStale.refetch).toHaveBeenCalledTimes(1);
    expect(healthy.refetch).not.toHaveBeenCalled();
  });
});

