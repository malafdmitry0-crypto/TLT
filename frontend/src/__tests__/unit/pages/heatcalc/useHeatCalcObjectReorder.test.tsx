import { act, renderHook } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { QueryClient } from '@tanstack/react-query';

const listObjects = vi.hoisted(() => vi.fn());
const reorderObjects = vi.hoisted(() => vi.fn());
const success = vi.hoisted(() => vi.fn());
const error = vi.hoisted(() => vi.fn());

vi.mock('@/api/projects', () => ({
  listObjects,
  reorderObjects,
}));

vi.mock('@/feedback/appFeedback', async () => {
  const actual = await vi.importActual<typeof import('@/feedback/appFeedback')>(
    '@/feedback/appFeedback',
  );
  return {
    ...actual,
    appMessage: { ...actual.appMessage, success, error },
  };
});

import { useHeatCalcObjectReorder } from '@/pages/heatcalc/useHeatCalcObjectReorder';

describe('useHeatCalcObjectReorder', () => {
  const queryClient = {
    invalidateQueries: vi.fn().mockResolvedValue(undefined),
  } as unknown as QueryClient;

  beforeEach(() => {
    vi.clearAllMocks();
    listObjects.mockResolvedValue([
      { id: 'a', sort_order: 0 },
      { id: 'b', sort_order: 1 },
      { id: 'c', sort_order: 2 },
    ]);
    reorderObjects.mockResolvedValue(undefined);
  });

  it('no-ops without project or in excel mode', async () => {
    const { result } = renderHook(() => useHeatCalcObjectReorder({
      projectId: null,
      excelModeEnabled: false,
      visibleTableObjects: [{ id: 'a' }, { id: 'b' }],
      queryClient,
    }));
    await act(async () => {
      await result.current.handleObjectsRowMoved(0, 1);
    });
    expect(listObjects).not.toHaveBeenCalled();

    const excel = renderHook(() => useHeatCalcObjectReorder({
      projectId: 'p1',
      excelModeEnabled: true,
      visibleTableObjects: [{ id: 'a' }, { id: 'b' }],
      queryClient,
    }));
    await act(async () => {
      await excel.result.current.handleObjectsRowMoved(0, 1);
    });
    expect(listObjects).not.toHaveBeenCalled();
  });

  it('rebuilds full order and reorders on visible move', async () => {
    const { result } = renderHook(() => useHeatCalcObjectReorder({
      projectId: 'p1',
      excelModeEnabled: false,
      visibleTableObjects: [{ id: 'a' }, { id: 'b' }, { id: 'c' }],
      queryClient,
    }));

    await act(async () => {
      await result.current.handleObjectsRowMoved(0, 2);
    });

    expect(listObjects).toHaveBeenCalledWith('p1');
    expect(reorderObjects).toHaveBeenCalledWith('p1', ['b', 'c', 'a']);
    expect(queryClient.invalidateQueries).toHaveBeenCalled();
    expect(success).toHaveBeenCalled();
  });

  it('surfaces API errors', async () => {
    reorderObjects.mockRejectedValueOnce(new Error('boom'));
    const { result } = renderHook(() => useHeatCalcObjectReorder({
      projectId: 'p1',
      excelModeEnabled: false,
      visibleTableObjects: [{ id: 'a' }, { id: 'b' }],
      queryClient,
    }));

    await act(async () => {
      await result.current.handleObjectsRowMoved(0, 1);
    });
    expect(error).toHaveBeenCalled();
  });
});
