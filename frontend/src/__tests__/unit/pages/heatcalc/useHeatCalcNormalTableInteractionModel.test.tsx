import { act, renderHook, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import {
  buildHeatCalcNormalTableRowClassName,
  useHeatCalcNormalTableInteractionModel,
} from '@/pages/heatcalc/useHeatCalcNormalTableInteractionModel';
import type { HeatCalcTableColumnRenderSpec } from '@/hooks/useHeatCalcTableColumns';
import type { ProjectObject, ProjectObjectsQueryResponse } from '@/types/project';
import type {
  DraftRowsById,
  DraftRowState,
} from '@/utils/heatCalcInlineEdit';
import type {
  HeatCalcColumnKey,
  HeatCalcResolvedColumnMeta,
} from '@/utils/heatCalcTableColumns';

const clipboardMocks = vi.hoisted(() => ({
  copyToClipboard: vi.fn(async () => undefined),
}));

vi.mock('@/utils/clipboard', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/utils/clipboard')>();
  return {
    ...actual,
    copyToClipboard: clipboardMocks.copyToClipboard,
  };
});

function makeObject(overrides: Partial<ProjectObject> = {}): ProjectObject {
  return {
    id: 'pipe-1',
    project_id: 'project-1',
    object_type: 'pipe',
    sort_order: 0,
    version: 1,
    params: {
      name: 'Труба DN100',
      pipe_length: 25,
    },
    results: { total_heat_loss: 100 },
    is_valid: true,
    validation_errors: null,
    created_at: '2026-01-01T00:00:00Z',
    updated_at: '2026-01-01T00:00:00Z',
    ...overrides,
  };
}

function makeDraft(row: ProjectObject, overrides: Partial<DraftRowState> = {}): DraftRowState {
  return {
    objectId: row.id,
    objectType: row.object_type === 'tank' ? 'tank' : 'pipe',
    baseVersion: row.version,
    baseFormValues: { name: row.params.name },
    draftFormValues: { name: `${row.params.name} draft` },
    dirtyFields: { name: `${row.params.name} draft` },
    errors: {},
    saving: false,
    sourceParams: row.params,
    ...overrides,
  };
}

function column(overrides: Partial<HeatCalcResolvedColumnMeta>): HeatCalcResolvedColumnMeta {
  const key = overrides.key ?? 'name';
  return {
    key,
    labels: { short: key, full: key, compact: key },
    label: key,
    title: key,
    group: 'test',
    width: 80,
    defaultWidthPct: 8,
    minWidthPx: 40,
    widthPct: 8,
    visible: true,
    ...overrides,
  };
}

function makeObjectQueryResult(overrides: Partial<ProjectObjectsQueryResponse> = {}): ProjectObjectsQueryResponse {
  return {
    items: [makeObject()],
    page_info: {
      page: 2,
      page_size: 75,
      offset: 75,
      total_pages: 4,
      has_next_page: true,
      has_previous_page: true,
      next_cursor: {
        sort_order: 2,
        id: 'pipe-2',
      },
    },
    counts: {
      total: 5,
      by_type: { pipe: 5, tank: 0 },
      filtered: 5,
    },
    query: {
      object_type: 'pipe',
      sort: null,
    },
    ...overrides,
  };
}

const columnRenderers = {
  name: {
    copyValue: (record: ProjectObject) => String(record.params.name ?? ''),
  },
  pipe_length: {
    copyValue: (record: ProjectObject) => String(record.params.pipe_length ?? ''),
  },
} as Record<HeatCalcColumnKey, HeatCalcTableColumnRenderSpec>;

function makeOptions(overrides: Partial<Parameters<typeof useHeatCalcNormalTableInteractionModel>[0]> = {}) {
  const first = makeObject({ id: 'pipe-1', params: { name: 'Труба 1', pipe_length: 25 } });
  const second = makeObject({ id: 'pipe-2', params: { name: 'Труба 2', pipe_length: 30 } });
  return {
    activeTablePage: 2,
    changeNormalTablePage: vi.fn(),
    columnRenderers,
    draftRowsById: {},
    excelModeEnabled: false,
    filteredTableCount: 5,
    isAllObjectScope: false,
    isSavableDraftRow: (row: DraftRowState | undefined) => !!row && Object.keys(row.dirtyFields).length > 0,
    loadNextNormalPage: vi.fn(),
    normalGlideEnabled: true,
    objectQueryFetching: false,
    objectQueryResult: makeObjectQueryResult(),
    selectedRowId: null,
    selectedRowKeys: [],
    sourceColumnMetas: [
      column({ key: 'name', title: 'Наименование', copyTitle: 'Имя' }),
      column({ key: 'pipe_length', title: 'Длина' }),
    ],
    visibleTableObjectsLength: 2,
    visibleTableRows: [
      { record: first, sourceIndex: 0 },
      { record: second, sourceIndex: 1 },
    ],
    notifySuccess: vi.fn(),
    ...overrides,
  } satisfies Parameters<typeof useHeatCalcNormalTableInteractionModel>[0];
}

describe('useHeatCalcNormalTableInteractionModel', () => {
  beforeEach(() => {
    clipboardMocks.copyToClipboard.mockClear();
  });

  it('builds row class names for status, selection, Excel errors, dirty drafts, and new rows', () => {
    const invalid = makeObject({
      id: 'new:pipe:1',
      results: null,
      is_valid: false,
      validation_errors: { message: 'bad' },
    });
    const draftRowsById: DraftRowsById = {
      [invalid.id]: makeDraft(invalid, { errors: { name: 'Ошибка' } }),
    };

    expect(buildHeatCalcNormalTableRowClassName({
      draftRowsById,
      excelModeEnabled: true,
      isSavableDraftRow: (row) => !!row,
      record: invalid,
      selectedRowId: invalid.id,
    })).toBe('row-invalid row-selected row-excel-error row-excel-dirty row-excel-new');
  });

  it('returns normal pagination and infinite loading state', () => {
    const { result, rerender } = renderHook(
      (props: ReturnType<typeof makeOptions>) => useHeatCalcNormalTableInteractionModel(props),
      { initialProps: makeOptions() },
    );

    expect(result.current.normalTablePagination).toMatchObject({
      current: 2,
      pageSize: 75,
      total: 5,
      showSizeChanger: false,
      hideOnSinglePage: true,
      size: 'small',
    });
    expect(result.current.normalInfiniteLoading).toEqual({
      loaded: 2,
      total: 5,
      hasNextPage: true,
      loading: false,
    });

    rerender(makeOptions({ normalGlideEnabled: false }));

    expect(result.current.normalInfiniteLoading).toBeNull();
  });

  it('keeps rowClassName stable across draft row changes while reading the latest draft', () => {
    const first = makeObject({ id: 'pipe-1', params: { name: 'Труба 1', pipe_length: 25 } });
    const options = makeOptions({
      visibleTableRows: [{ record: first, sourceIndex: 0 }],
    });
    const { result, rerender } = renderHook(
      (props: ReturnType<typeof makeOptions>) => useHeatCalcNormalTableInteractionModel(props),
      { initialProps: options },
    );
    const rowClassName = result.current.tableRowClassName;

    expect(rowClassName(first)).toBe('');

    rerender({
      ...options,
      draftRowsById: { [first.id]: makeDraft(first) },
    });

    expect(result.current.tableRowClassName).toBe(rowClassName);
    expect(rowClassName(first)).toContain('row-dirty');
  });

  it('delegates load more and page change to table state callbacks with current query result', () => {
    const loadNextNormalPage = vi.fn();
    const changeNormalTablePage = vi.fn();
    const objectQueryResult = makeObjectQueryResult();
    const { result } = renderHook(() => useHeatCalcNormalTableInteractionModel(makeOptions({
      changeNormalTablePage,
      loadNextNormalPage,
      objectQueryFetching: true,
      objectQueryResult,
    })));

    act(() => {
      result.current.handleNormalLoadMore();
      result.current.handleNormalTablePageChange(3);
    });

    expect(loadNextNormalPage).toHaveBeenCalledWith(objectQueryResult, {
      excelModeEnabled: false,
      objectQueryFetching: true,
    });
    expect(changeNormalTablePage).toHaveBeenCalledWith(3, objectQueryResult);
  });

  it('copies selected normal table rows as TSV on Ctrl+C', async () => {
    const notifySuccess = vi.fn();
    renderHook(() => useHeatCalcNormalTableInteractionModel(makeOptions({
      notifySuccess,
      selectedRowKeys: ['pipe-2'],
    })));

    act(() => {
      document.dispatchEvent(new KeyboardEvent('keydown', {
        key: 'c',
        ctrlKey: true,
        bubbles: true,
      }));
    });

    await waitFor(() => {
      expect(clipboardMocks.copyToClipboard).toHaveBeenCalledWith('Имя\tДлина\r\nТруба 2\t30');
      expect(notifySuccess).toHaveBeenCalledWith('Скопировано строк: 1');
    });
  });

  it('does not copy rows in Excel mode or while text input is focused', () => {
    renderHook(() => useHeatCalcNormalTableInteractionModel(makeOptions({
      excelModeEnabled: true,
      selectedRowKeys: ['pipe-2'],
    })));

    act(() => {
      document.dispatchEvent(new KeyboardEvent('keydown', {
        key: 'c',
        ctrlKey: true,
        bubbles: true,
      }));
    });

    expect(clipboardMocks.copyToClipboard).not.toHaveBeenCalled();

    const input = document.createElement('input');
    document.body.appendChild(input);
    input.focus();
    renderHook(() => useHeatCalcNormalTableInteractionModel(makeOptions({
      selectedRowKeys: ['pipe-2'],
    })));

    act(() => {
      document.dispatchEvent(new KeyboardEvent('keydown', {
        key: 'c',
        ctrlKey: true,
        bubbles: true,
      }));
    });

    expect(clipboardMocks.copyToClipboard).not.toHaveBeenCalled();
  });
});
