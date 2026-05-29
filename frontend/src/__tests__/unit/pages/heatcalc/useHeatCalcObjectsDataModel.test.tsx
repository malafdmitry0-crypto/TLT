import type { ReactNode } from 'react';
import { renderHook, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import {
  getObjectQueryCapabilities,
  getObjectsSummary,
  listObjects,
  queryObjects,
} from '@/api/projects';
import { getInsulation } from '@/api/references';
import {
  buildHeatCalcEnumOptionsByColumn,
  buildHeatCalcVisibleRowsModel,
  useHeatCalcObjectsDataModel,
} from '@/pages/heatcalc/useHeatCalcObjectsDataModel';
import type {
  ObjectQueryCapabilities,
  ObjectQueryFieldCapability,
  Project,
  ProjectObject,
  ProjectObjectsQueryResponse,
} from '@/types/project';
import {
  createEmptyTableViewState,
  type HeatCalcColumnValueAccessors,
  type HeatCalcIndexedTableRow,
} from '@/utils/heatCalcTableFindability';
import {
  getDefaultTableColumnSettings,
  type HeatCalcResolvedColumnMeta,
} from '@/utils/heatCalcTableColumns';
import { getDefaultTableViewSettings } from '@/utils/heatCalcTableViewSettings';
import { INAPPLICABLE_TABLE_VALUE } from '@/pages/heatcalc/heatCalcPageUtils';

vi.mock('@/api/projects', () => ({
  getObjectQueryCapabilities: vi.fn(),
  getObjectsSummary: vi.fn(),
  listObjects: vi.fn(),
  queryObjects: vi.fn(),
}));

vi.mock('@/api/references', () => ({
  getInsulation: vi.fn(),
}));

const mockProject: Project = {
  id: 'project-1',
  name: 'Проект',
  description: null,
  task_number: null,
  user_id: null,
  session_id: 'session-1',
  status: 'draft',
  owner_email: null,
  object_types: [],
  created_at: '2026-01-01T00:00:00Z',
  updated_at: '2026-01-01T00:00:00Z',
};

function makeObject(overrides: Partial<ProjectObject> = {}): ProjectObject {
  return {
    id: 'pipe-1',
    project_id: 'project-1',
    object_type: 'pipe',
    sort_order: 0,
    version: 1,
    params: {
      name: 'Alpha pipe',
      placement: 'outdoor',
      pipe_length: 25,
    },
    results: null,
    is_valid: true,
    validation_errors: null,
    created_at: '2026-01-01T00:00:00Z',
    updated_at: '2026-01-01T00:00:00Z',
    ...overrides,
  };
}

function makeQueryResponse(
  items: ProjectObject[],
  overrides: Partial<ProjectObjectsQueryResponse> = {},
): ProjectObjectsQueryResponse {
  const objectType = items[0]?.object_type === 'tank' ? 'tank' : 'pipe';
  return {
    items,
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
      total: items.length,
      by_type: {
        pipe: items.filter((item) => item.object_type === 'pipe').length,
        tank: items.filter((item) => item.object_type === 'tank').length,
      },
      filtered: items.length,
    },
    query: {
      object_type: objectType,
      sort: null,
    },
    ...overrides,
  };
}

function capability(
  key: string,
  overrides: Partial<ObjectQueryFieldCapability> = {},
): ObjectQueryFieldCapability {
  return {
    key,
    label: key,
    title: key,
    data_type: 'text',
    unit: null,
    filter: { enabled: true, ops: ['contains'], include_empty: true },
    sort: { enabled: true },
    options: null,
    ...overrides,
  };
}

function makeCapabilities(
  objectType: 'pipe' | 'tank',
  fields: ObjectQueryFieldCapability[] = [capability('name')],
): ObjectQueryCapabilities {
  return {
    version: 1,
    object_type: objectType,
    default_page_size: 25,
    max_page_size: 200,
    default_sort: { key: 'sort_order', dir: 'asc' },
    search: { enabled: true, max_text_length: 120, default_columns: ['name'] },
    fields,
  };
}

function meta(key: string): HeatCalcResolvedColumnMeta {
  return {
    key,
    labels: { short: key, compact: key, full: key },
    label: key,
    title: key,
    group: 'test',
    width: 120,
    defaultWidthPct: 10,
    minWidthPx: 80,
    widthPct: 10,
    visible: true,
  };
}

function setupHook(
  overrides: Partial<Parameters<typeof useHeatCalcObjectsDataModel>[0]> = {},
) {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: { retry: false },
      mutations: { retry: false },
    },
  });
  const wrapper = ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
  );
  const props = {
    activeObjectQueryCursor: null,
    activeObjectScope: 'pipe',
    activeTableColumnScope: 'pipe',
    activeTableObjectType: 'pipe',
    activeTablePage: 1,
    activeTableViewState: createEmptyTableViewState(),
    allTableViewState: createEmptyTableViewState(),
    excelModeEnabled: false,
    isAllObjectScope: false,
    project: mockProject,
    queryClient,
    tableColumnSettings: getDefaultTableColumnSettings(),
    tableViewSettings: getDefaultTableViewSettings(),
    tableFindabilityEnabled: true,
    mergeNormalLoadedRows: vi.fn(),
    rememberObjectQueryCursor: vi.fn(),
    resetNormalLoadMoreRequest: vi.fn(),
    ...overrides,
  } satisfies Parameters<typeof useHeatCalcObjectsDataModel>[0];

  return {
    queryClient,
    ...renderHook(
      (hookProps: typeof props) => useHeatCalcObjectsDataModel(hookProps),
      { initialProps: props, wrapper },
    ),
  };
}

describe('useHeatCalcObjectsDataModel', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    (getObjectsSummary as ReturnType<typeof vi.fn>).mockResolvedValue({
      total: 2,
      valid: 2,
      invalid: 0,
      by_type: { pipe: 2, tank: 0 },
      valid_by_type: { pipe: 2, tank: 0 },
      electrical_calculations_total: 0,
      successful_electrical_calculations: 0,
      failed_electrical_calculations: 0,
      objects_with_successful_electrical_calculation: 0,
    });
    (getObjectQueryCapabilities as ReturnType<typeof vi.fn>).mockResolvedValue(makeCapabilities('pipe'));
    (queryObjects as ReturnType<typeof vi.fn>).mockResolvedValue(makeQueryResponse([
      makeObject({ id: 'pipe-1', sort_order: 1 }),
      makeObject({ id: 'pipe-2', sort_order: 2, params: { name: 'Beta pipe', placement: 'indoor' } }),
    ]));
    (listObjects as ReturnType<typeof vi.fn>).mockResolvedValue([]);
    (getInsulation as ReturnType<typeof vi.fn>).mockResolvedValue([]);
  });

  it('builds a typed pipe query request and exposes query-backed counts', async () => {
    const rememberObjectQueryCursor = vi.fn();
    const mergeNormalLoadedRows = vi.fn();
    const resetNormalLoadMoreRequest = vi.fn();
    const { result } = setupHook({
      rememberObjectQueryCursor,
      mergeNormalLoadedRows,
      resetNormalLoadMoreRequest,
    });

    await waitFor(() => {
      expect(queryObjects).toHaveBeenCalledWith(
        'project-1',
        expect.objectContaining({ object_type: 'pipe', page: 1, page_size: 25 }),
      );
      expect(result.current.objectQueryResult?.items).toHaveLength(2);
    });

    expect(result.current.objectQueryKey).toEqual([
      'project',
      'project-1',
      'objects',
      'query',
      expect.objectContaining({ object_type: 'pipe' }),
    ]);
    expect(result.current.pipeCount).toBe(2);
    expect(result.current.projectObjectCount).toBe(2);
    expect(rememberObjectQueryCursor).toHaveBeenCalledWith(result.current.objectQueryResult);
    expect(mergeNormalLoadedRows).toHaveBeenCalledWith(result.current.objectQueryResult, {
      excelModeEnabled: false,
    });
    expect(resetNormalLoadMoreRequest).toHaveBeenCalled();
  });

  it('switches the typed query model to tank scope', async () => {
    (getObjectsSummary as ReturnType<typeof vi.fn>).mockResolvedValue({
      total: 1,
      valid: 1,
      invalid: 0,
      by_type: { pipe: 0, tank: 1 },
      valid_by_type: { pipe: 0, tank: 1 },
      electrical_calculations_total: 0,
      successful_electrical_calculations: 0,
      failed_electrical_calculations: 0,
      objects_with_successful_electrical_calculation: 0,
    });
    (getObjectQueryCapabilities as ReturnType<typeof vi.fn>).mockResolvedValue(makeCapabilities('tank'));
    (queryObjects as ReturnType<typeof vi.fn>).mockResolvedValue(makeQueryResponse([
      makeObject({ id: 'tank-1', object_type: 'tank', params: { name: 'Tank' } }),
    ]));

    const { result } = setupHook({
      activeObjectScope: 'tank',
      activeTableColumnScope: 'tank',
      activeTableObjectType: 'tank',
    });

    await waitFor(() => {
      expect(getObjectQueryCapabilities).toHaveBeenCalledWith('project-1', 'tank');
      expect(queryObjects).toHaveBeenCalledWith(
        'project-1',
        expect.objectContaining({ object_type: 'tank' }),
      );
      expect(result.current.tankCount).toBe(1);
    });
  });

  it('uses the all-objects list and local all-scope filtering without typed query capabilities', async () => {
    const alpha = makeObject({ id: 'pipe-a', sort_order: 2, params: { name: 'Alpha pipe' } });
    const beta = makeObject({ id: 'tank-b', object_type: 'tank', sort_order: 1, params: { name: 'Beta tank' } });
    (listObjects as ReturnType<typeof vi.fn>).mockResolvedValue([beta, alpha]);

    const { result } = setupHook({
      activeObjectScope: 'all',
      activeTableColumnScope: 'all',
      isAllObjectScope: true,
      allTableViewState: {
        filters: { name: { kind: 'text', value: 'Alpha' } },
      },
    });

    await waitFor(() => {
      expect(listObjects).toHaveBeenCalledWith('project-1');
      expect(result.current.allProjectObjects).toHaveLength(2);
    });

    expect(getObjectQueryCapabilities).not.toHaveBeenCalled();
    expect(queryObjects).not.toHaveBeenCalled();
    expect(result.current.visibleAllTableRows.map(({ record }) => record.id)).toEqual(['pipe-a']);
  });

  it('ignores filters and sorting when table findability is feature-flagged off', async () => {
    setupHook({
      activeTableViewState: {
        filters: { name: { kind: 'text', value: 'Alpha' } },
        sort: { columnKey: 'pipe_outer_diameter', direction: 'desc' },
      },
      tableFindabilityEnabled: false,
    });

    await waitFor(() => {
      expect(queryObjects).toHaveBeenCalledWith(
        'project-1',
        expect.objectContaining({
          filters: [],
          sort: null,
        }),
      );
    });
  });

  it('keeps Excel visible rows separate from base query rows', () => {
    const queryRow = makeObject({ id: 'query-row' });
    const excelBaseRow = makeObject({ id: 'base-row' });
    const excelRow = makeObject({ id: 'excel-row' });
    const excelTableRows: HeatCalcIndexedTableRow<ProjectObject>[] = [{ record: excelRow, sourceIndex: 7 }];

    const model = buildHeatCalcVisibleRowsModel({
      activeTableObjectType: 'pipe',
      excelBaseRows: [excelBaseRow],
      excelModeEnabled: true,
      excelRows: [excelRow],
      excelTableRows,
      isAllObjectScope: false,
      normalLoadedRowsByType: { pipe: [], tank: [] },
      objectQueryResult: makeQueryResponse([queryRow]),
      visibleAllTableRows: [],
    });

    expect(model.baseVisibleTableObjects).toEqual([excelBaseRow]);
    expect(model.visibleTableObjects).toEqual([excelRow]);
    expect(model.visibleTableRows).toEqual(excelTableRows);
    expect(model.visibleSourceIndexById.get('excel-row')).toBe(7);
  });

  it('uses loaded normal rows before first-page query rows', () => {
    const queryRow = makeObject({ id: 'query-row' });
    const loadedRow = makeObject({ id: 'loaded-row' });

    const model = buildHeatCalcVisibleRowsModel({
      activeTableObjectType: 'pipe',
      excelBaseRows: [],
      excelModeEnabled: false,
      excelRows: [],
      excelTableRows: [],
      isAllObjectScope: false,
      normalLoadedRowsByType: { pipe: [loadedRow], tank: [] },
      objectQueryResult: makeQueryResponse([queryRow]),
      visibleAllTableRows: [],
    });

    expect(model.baseVisibleTableObjects).toEqual([loadedRow]);
    expect(model.visibleTableRows).toEqual([{ record: loadedRow, sourceIndex: 0 }]);
  });

  it('deduplicates and sorts all-scope enum options while skipping inapplicable cells', () => {
    const rows: HeatCalcIndexedTableRow<ProjectObject>[] = [
      { record: makeObject({ id: 'one', params: { placement: 'outdoor' } }), sourceIndex: 0 },
      { record: makeObject({ id: 'two', params: { placement: 'indoor' } }), sourceIndex: 1 },
      { record: makeObject({ id: 'three', params: { placement: 'outdoor' } }), sourceIndex: 2 },
      { record: makeObject({ id: 'four', object_type: 'tank', params: { placement: '—' } }), sourceIndex: 3 },
    ];
    const accessors: HeatCalcColumnValueAccessors<ProjectObject> = {
      placement: (record) => record.params.placement === '—'
        ? INAPPLICABLE_TABLE_VALUE
        : record.params.placement,
    };

    const options = buildHeatCalcEnumOptionsByColumn({
      allIndexedTableRows: rows,
      fieldCapabilityByKey: new Map(),
      isAllObjectScope: true,
      sourceColumnMetas: [meta('placement')],
      tableValueAccessors: accessors,
    });

    expect(options.placement).toEqual([
      { label: 'indoor', value: 'indoor' },
      { label: 'outdoor', value: 'outdoor' },
    ]);
  });
});
