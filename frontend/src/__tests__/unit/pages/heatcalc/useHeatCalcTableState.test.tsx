import { act, renderHook } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import {
  useHeatCalcTableState,
} from '@/pages/heatcalc/useHeatCalcTableState';
import type {
  ProjectObject,
  ProjectObjectsPageCursor,
  ProjectObjectsQueryResponse,
} from '@/types/project';
import type { HeatCalcObjectType } from '@/utils/heatCalcTableColumns';
import type { HeatCalcColumnFilter } from '@/utils/heatCalcTableFindability';

function makeObject(id: string, objectType: HeatCalcObjectType = 'pipe'): ProjectObject {
  return {
    id,
    project_id: 'project-1',
    object_type: objectType,
    sort_order: 1,
    params: { name: id },
    results: null,
    is_valid: true,
    validation_errors: null,
    created_at: '2026-01-01T00:00:00Z',
    updated_at: '2026-01-01T00:00:00Z',
    version: 1,
  };
}

function response({
  items,
  page,
  offset,
  nextCursor = null,
}: {
  items: ProjectObject[];
  page: number;
  offset: number;
  nextCursor?: ProjectObjectsPageCursor | null;
}): ProjectObjectsQueryResponse {
  return {
    items,
    page_info: {
      page,
      page_size: 2,
      offset,
      total_pages: nextCursor ? page + 1 : page,
      has_next_page: !!nextCursor,
      has_previous_page: page > 1,
      next_cursor: nextCursor,
    },
    counts: {
      total: items.length,
      by_type: { pipe: items.filter((item) => item.object_type === 'pipe').length, tank: 0 },
      filtered: items.length,
    },
    query: {
      object_type: 'pipe',
      sort: null,
    },
  };
}

describe('useHeatCalcTableState', () => {
  it('keeps pipe/tank/all filters isolated and clears selected rows on scope switch', () => {
    const { result } = renderHook(() => useHeatCalcTableState({ projectId: 'project-1' }));
    const pipeNameFilter: HeatCalcColumnFilter = { kind: 'text', value: 'юг' };

    act(() => {
      result.current.setColumnFilter('name', pipeNameFilter);
      result.current.setSelectedRowKeys(['pipe-1']);
    });

    expect(result.current.activeObjectScope).toBe('pipe');
    expect(result.current.activeTableViewState.filters.name).toEqual(pipeNameFilter);
    expect(result.current.selectedRowKeys).toEqual(['pipe-1']);

    act(() => {
      result.current.selectObjectScope('tank');
    });

    expect(result.current.activeObjectScope).toBe('tank');
    expect(result.current.selectedRowKeys).toEqual([]);
    expect(result.current.activeTableViewState.filters).toEqual({});

    act(() => {
      result.current.selectObjectScope('pipe');
    });

    expect(result.current.activeTableViewState.filters.name).toEqual(pipeNameFilter);

    act(() => {
      result.current.selectObjectScope('all');
    });
    act(() => {
      result.current.setColumnFilter('name', { kind: 'text', value: 'общий' });
    });

    expect(result.current.activeObjectScope).toBe('all');
    expect(result.current.activeTableViewState.filters.name).toEqual({ kind: 'text', value: 'общий' });

    act(() => {
      result.current.selectObjectScope('pipe');
    });

    expect(result.current.activeTableViewState.filters.name).toEqual(pipeNameFilter);
  });

  it('resets current page when filters, sort, or table reset change active view state', () => {
    const { result } = renderHook(() => useHeatCalcTableState({ projectId: 'project-1' }));

    act(() => {
      result.current.setTablePage('pipe', 3);
    });
    expect(result.current.activeTablePage).toBe(3);

    act(() => {
      result.current.handleNormalTableSortChange('pipe_outer_diameter', 'asc');
    });
    expect(result.current.activeTablePage).toBe(1);
    expect(result.current.activeTableViewState.sort).toEqual({
      columnKey: 'pipe_outer_diameter',
      direction: 'asc',
    });

    act(() => {
      result.current.setTablePage('pipe', 2);
      result.current.setColumnFilter('name', { kind: 'text', value: 'north' });
    });
    expect(result.current.activeTablePage).toBe(1);
    expect(result.current.activeTableViewState.filters.name).toEqual({ kind: 'text', value: 'north' });

    act(() => {
      result.current.resetCurrentTableViewState();
    });
    expect(result.current.activeTablePage).toBe(1);
    expect(result.current.activeTableViewState.sort).toBeUndefined();
    expect(result.current.activeTableViewState.filters).toEqual({});
  });

  it('tracks cursor pagination and merges normal loaded rows by active type', () => {
    const { result } = renderHook(() => useHeatCalcTableState({ projectId: 'project-1' }));
    const firstCursor: ProjectObjectsPageCursor = {
      sort_order: 2,
      id: 'pipe-2',
      key: 'name',
      value: 'Pipe 2',
      value_is_null: false,
    };
    const page1 = response({
      items: [makeObject('pipe-1'), makeObject('pipe-2')],
      page: 1,
      offset: 0,
      nextCursor: firstCursor,
    });
    const page2 = response({
      items: [makeObject('pipe-3')],
      page: 2,
      offset: 2,
    });

    act(() => {
      result.current.mergeNormalLoadedRows(page1, { excelModeEnabled: false });
      result.current.changeNormalTablePage(2, page1);
    });
    expect(result.current.activeTablePage).toBe(2);
    expect(result.current.activeObjectQueryCursor).toEqual(firstCursor);
    expect(result.current.normalLoadedRowsByType.pipe.map((item) => item.id)).toEqual(['pipe-1', 'pipe-2']);

    act(() => {
      result.current.mergeNormalLoadedRows(page2, { excelModeEnabled: false });
    });
    expect(result.current.normalLoadedRowsByType.pipe.map((item) => item.id)).toEqual([
      'pipe-1',
      'pipe-2',
      'pipe-3',
    ]);

    act(() => {
      result.current.removeNormalLoadedRows(['pipe-2']);
      result.current.upsertNormalLoadedRow({ ...makeObject('pipe-3'), params: { name: 'updated' } });
    });
    expect(result.current.normalLoadedRowsByType.pipe.map((item) => item.id)).toEqual(['pipe-1', 'pipe-3']);
    expect(result.current.normalLoadedRowsByType.pipe[1].params.name).toBe('updated');
  });

  it('prunes selected rows and hidden-column filters without touching wizard state', () => {
    const { result } = renderHook(() => useHeatCalcTableState({ projectId: 'project-1' }));

    act(() => {
      result.current.setSelectedRowKeys(['pipe-1', 'pipe-2']);
      result.current.setColumnFilter('name', { kind: 'text', value: 'pipe' });
      result.current.handleNormalTableSortChange('pipe_outer_diameter', 'asc');
    });

    act(() => {
      result.current.pruneSelectedRows([makeObject('pipe-2')]);
      result.current.cleanHiddenColumnState(['name']);
    });

    expect(result.current.selectedRowKeys).toEqual(['pipe-2']);
    expect(result.current.activeTableViewState.filters.name).toEqual({ kind: 'text', value: 'pipe' });
    expect(result.current.activeTableViewState.sort).toBeUndefined();
  });
});
