import { renderHook } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import { useElecCalcTableNavigation } from '@/pages/electrical/useElecCalcTableNavigation';
import type { ProjectObjectsPageCursor } from '@/types/project';

const nextCursor: ProjectObjectsPageCursor = {
  sort_order: 20,
  id: 'object-20',
};

function setup(overrides: Partial<Parameters<typeof useElecCalcTableNavigation>[0]> = {}) {
  const setTablePage = vi.fn();
  const loadNextElectricalGlidePage = vi.fn();
  const options: Parameters<typeof useElecCalcTableNavigation>[0] = {
    tablePage: 2,
    tablePageSize: 50,
    totalObjects: 120,
    filteredCount: 75,
    electricalGlideEnabled: true,
    loadedObjectsCount: 50,
    hasNextPage: true,
    nextElectricalPageCursor: nextCursor,
    isElectricalPageFetching: false,
    setTablePage,
    loadNextElectricalGlidePage,
    ...overrides,
  };

  return {
    setTablePage,
    loadNextElectricalGlidePage,
    ...renderHook((props: Parameters<typeof useElecCalcTableNavigation>[0]) =>
      useElecCalcTableNavigation(props), {
      initialProps: options,
    }),
  };
}

describe('useElecCalcTableNavigation', () => {
  it('builds Ant table pagination from filtered count', () => {
    const { result } = setup();
    const pagination = result.current.electricalPagination;

    expect(pagination).toMatchObject({
      current: 2,
      pageSize: 50,
      total: 75,
      pageSizeOptions: ['25', '50', '100'],
      showSizeChanger: true,
      hideOnSinglePage: false,
      size: 'small',
    });
    expect(pagination && typeof pagination === 'object' && pagination.showTotal?.(75, [51, 75]))
      .toBe('51-75 из 75');
  });

  it('falls back to total objects and hides pagination on a single page', () => {
    const { result } = setup({
      tablePage: 1,
      tablePageSize: 50,
      totalObjects: 30,
      filteredCount: undefined,
    });

    expect(result.current.filteredTableCount).toBe(30);
    expect(result.current.electricalPagination).toMatchObject({
      current: 1,
      pageSize: 50,
      total: 30,
      hideOnSinglePage: true,
    });
  });

  it('builds infinite loading only for Glide mode', () => {
    const { result, rerender } = setup();

    expect(result.current.electricalInfiniteLoading).toEqual({
      loaded: 50,
      total: 75,
      hasNextPage: true,
      loading: false,
    });

    rerender({
      tablePage: 2,
      tablePageSize: 50,
      totalObjects: 120,
      filteredCount: 75,
      electricalGlideEnabled: false,
      loadedObjectsCount: 50,
      hasNextPage: true,
      nextElectricalPageCursor: nextCursor,
      isElectricalPageFetching: false,
      setTablePage: vi.fn(),
      loadNextElectricalGlidePage: vi.fn(),
    });

    expect(result.current.electricalInfiniteLoading).toBeNull();
  });

  it('forwards page change and load-more requests to pagination state', () => {
    const { result, setTablePage, loadNextElectricalGlidePage } = setup({
      isElectricalPageFetching: true,
    });

    result.current.handleElectricalGlidePageChange(4);
    result.current.handleElectricalGlideLoadMore();

    expect(setTablePage).toHaveBeenCalledWith(4);
    expect(loadNextElectricalGlidePage).toHaveBeenCalledWith({
      isFetching: true,
      hasNextPage: true,
      nextCursor,
    });
  });

  it('does not report infinite next page without a cursor', () => {
    const { result } = setup({
      nextElectricalPageCursor: null,
    });

    expect(result.current.electricalInfiniteLoading).toMatchObject({
      hasNextPage: false,
    });
  });
});
