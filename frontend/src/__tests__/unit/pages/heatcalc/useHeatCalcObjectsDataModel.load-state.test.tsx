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
  buildHeatCalcWorkspaceLoadState,
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
import { INAPPLICABLE_TABLE_VALUE } from '@/utils/heatCalcPageUtils';

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

describe('useHeatCalcObjectsDataModel — load-state / buildHeatCalcWorkspaceLoadState', () => {
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

