import { act, renderHook } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { useElecCalcPaginationState } from '@/pages/electrical/useElecCalcPaginationState';
import type { ElectricalQueryResponse } from '@/types/calculation';
import type { ProjectObjectsPageCursor } from '@/types/project';

function cursor(id: string, sortOrder = 10): ProjectObjectsPageCursor {
  return {
    sort_order: sortOrder,
    id,
    key: 'object_name',
    value: id,
    value_is_null: false,
  };
}

function response(id: string): ElectricalQueryResponse {
  return {
    items: [],
    calculations: [],
    summary: {
      total_objects: 0,
      valid_objects: 0,
      invalid_objects: 0,
      electrical_calculations_total: 0,
      calculated_count: 0,
      failed_count: 0,
      total_cable_length: 0,
      total_power: 0,
      total_current: 0,
    },
    page_info: {
      page: 1,
      page_size: 25,
      offset: 0,
      total_pages: 1,
      has_next_page: false,
      has_previous_page: false,
      next_cursor: null,
    },
    counts: {
      total: 0,
      filtered: 0,
    },
    query: {
      variant_number: 1,
      sort: null,
    },
    ...({ id } as Record<string, unknown>),
  };
}

describe('useElecCalcPaginationState', () => {
  it('tracks page, page size and current cursor', () => {
    const { result } = renderHook(() => useElecCalcPaginationState());
    const nextCursor = cursor('row-25', 25);

    expect(result.current.tablePage).toBe(1);
    expect(result.current.tablePageSize).toBe(50);
    expect(result.current.electricalPageCursor).toBeNull();

    act(() => {
      result.current.rememberNextCursor({
        nextCursor,
        isFetching: false,
        isPlaceholderData: false,
      });
      result.current.setTablePage(2);
      result.current.setTablePageSize(50);
    });

    expect(result.current.tablePage).toBe(2);
    expect(result.current.tablePageSize).toBe(50);
    expect(result.current.electricalPageCursor).toEqual(nextCursor);
  });

  it('stores loaded pages for Glide mode and resets the cache separately', () => {
    const { result } = renderHook(() => useElecCalcPaginationState());
    const firstPage = response('page-1');
    const secondPage = response('page-2');

    act(() => {
      result.current.rememberElectricalPage({
        electricalGlideEnabled: true,
        electricalPage: firstPage,
        isFetching: false,
        isPlaceholderData: false,
      });
    });

    expect(result.current.electricalInfinitePages).toEqual({ 1: firstPage });

    act(() => {
      result.current.loadNextElectricalGlidePage({
        isFetching: false,
        hasNextPage: true,
        nextCursor: cursor('row-25', 25),
      });
    });
    act(() => {
      result.current.rememberElectricalPage({
        electricalGlideEnabled: true,
        electricalPage: secondPage,
        isFetching: false,
        isPlaceholderData: false,
      });
    });

    expect(result.current.tablePage).toBe(2);
    expect(result.current.electricalInfinitePages).toEqual({
      1: firstPage,
      2: secondPage,
    });

    act(() => {
      result.current.resetPaginationCache();
    });

    expect(result.current.electricalPageCursor).toBeNull();
    expect(result.current.electricalInfinitePages).toEqual({});
  });

  it('does not advance load-more when a page is already fetching or has no cursor', () => {
    const { result } = renderHook(() => useElecCalcPaginationState());

    act(() => {
      result.current.loadNextElectricalGlidePage({
        isFetching: true,
        hasNextPage: true,
        nextCursor: cursor('row-25', 25),
      });
      result.current.loadNextElectricalGlidePage({
        isFetching: false,
        hasNextPage: false,
        nextCursor: cursor('row-25', 25),
      });
      result.current.loadNextElectricalGlidePage({
        isFetching: false,
        hasNextPage: true,
        nextCursor: null,
      });
    });

    expect(result.current.tablePage).toBe(1);
    expect(result.current.electricalPageCursor).toBeNull();
  });
});
