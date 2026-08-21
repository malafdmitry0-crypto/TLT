/** Vitest API module mocks for HeatCalc page tests. */
import { vi } from 'vitest';
import type { ProjectObject, ProjectObjectsQueryRequest } from '@/types/project';

vi.mock('@/api/projects', () => {
  const listObjects = vi.fn().mockResolvedValue([]);
  async function getObjectsSummary(projectId: string) {
    const all = await listObjects(projectId);
    const byType = {
      pipe: all.filter((item: ProjectObject) => item.object_type === 'pipe').length,
      tank: all.filter((item: ProjectObject) => item.object_type === 'tank').length,
    };
    const validByType = {
      pipe: all.filter((item: ProjectObject) => item.object_type === 'pipe' && item.is_valid).length,
      tank: all.filter((item: ProjectObject) => item.object_type === 'tank' && item.is_valid).length,
    };
    const valid = all.filter((item: ProjectObject) => item.is_valid).length;
    return {
      total: all.length,
      valid,
      invalid: all.length - valid,
      by_type: byType,
      valid_by_type: validByType,
      electrical_calculations_total: 0,
      successful_electrical_calculations: 0,
      failed_electrical_calculations: 0,
      objects_with_successful_electrical_calculation: 0,
    };
  }
  function valueFor(record: ProjectObject, key: string) {
    if (key === 'name') return record.params.name;
    if (key === 'pipe_outer_diameter') return Number(record.params.outer_diameter) * 1000;
    if (key === 'process_temperature') return record.params.process_temperature;
    return record.params[key];
  }
  const queryObjects = vi.fn(async (projectId: string, payload: ProjectObjectsQueryRequest) => {
    const all = await listObjects(projectId);
    const typeItems = all.filter((item: ProjectObject) => item.object_type === payload.object_type);
    let items = [...typeItems];
    for (const filter of payload.filters ?? []) {
      items = items.filter((item) => {
        const value = valueFor(item, filter.key);
        if (filter.op === 'contains') {
          return String(value ?? '').toLocaleLowerCase('ru').includes(String(filter.value ?? '').toLocaleLowerCase('ru'));
        }
        if (filter.op === 'range') {
          const numericValue = Number(value);
          if (!Number.isFinite(numericValue)) return !!filter.include_empty;
          if (Number.isFinite(filter.min) && numericValue < Number(filter.min)) return false;
          if (Number.isFinite(filter.max) && numericValue > Number(filter.max)) return false;
          return true;
        }
        return true;
      });
    }
    if (payload.sort?.key) {
      const sort = payload.sort;
      items.sort((left, right) => {
        const leftValue = Number(valueFor(left, sort.key));
        const rightValue = Number(valueFor(right, sort.key));
        const comparison = leftValue - rightValue;
        return sort.dir === 'desc' ? -comparison : comparison;
      });
    }
    const page = Number(payload.page ?? 1);
    const pageSize = Number(payload.page_size ?? 50);
    const offset = (page - 1) * pageSize;
    const pageItems = items.slice(offset, offset + pageSize);
    const hasNextPage = page * pageSize < items.length;
    const lastItem = pageItems[pageItems.length - 1];
    return {
      items: pageItems,
      page_info: {
        page,
        page_size: pageSize,
        offset,
        total_pages: items.length ? Math.ceil(items.length / pageSize) : 0,
        has_next_page: hasNextPage,
        has_previous_page: page > 1,
        next_cursor: hasNextPage && lastItem
          ? {
            sort_order: lastItem.sort_order,
            id: lastItem.id,
            key: 'sort_order',
            value: lastItem.sort_order,
            value_is_null: false,
          }
          : null,
      },
      counts: {
        total: all.length,
        by_type: {
          pipe: all.filter((item: ProjectObject) => item.object_type === 'pipe').length,
          tank: all.filter((item: ProjectObject) => item.object_type === 'tank').length,
        },
        filtered: items.length,
      },
      query: { object_type: payload.object_type, sort: payload.sort ?? null },
    };
  });
  const getObjectQueryCapabilities = vi.fn(async (_projectId: string, objectType: 'pipe' | 'tank') => ({
    version: 1,
    object_type: objectType,
    default_page_size: 50,
    max_page_size: 200,
    default_sort: { key: 'sort_order', dir: 'asc' },
    search: { enabled: true, max_text_length: 120, default_columns: ['name'] },
    fields: [],
  }));
  return {
    listObjects,
    getObjectsSummary: vi.fn(getObjectsSummary),
    queryObjects,
    getObjectQueryCapabilities,
    createObject: vi.fn(),
    updateObject: vi.fn(),
    deleteObject: vi.fn(),
  };
});

vi.mock('@/api/calculations', () => ({
  cancelCalcTask: vi.fn(),
  enqueueElectricalBatchJob: vi.fn().mockResolvedValue({ id: 'task-1', status: 'queued' }),
  enqueueHeatLossBatchJob: vi.fn().mockResolvedValue({
    id: 'heat-task-1',
    type: 'heat_loss_batch',
    status: 'queued',
    project_id: 'proj-test-1',
    progress: { current: 0, total: null, phase: 'queued', percent: null },
    result: null,
    error_message: null,
    cancel_requested: false,
    created_at: '2026-01-01T00:00:00Z',
    started_at: null,
    finished_at: null,
    links: {
      status: '/api/v1/calc/jobs/heat-task-1',
      result: '/api/v1/calc/jobs/heat-task-1/result',
      cancel: '/api/v1/calc/jobs/heat-task-1/cancel',
    },
  }),
  getCalcTask: vi.fn().mockResolvedValue({
    id: 'heat-task-1',
    type: 'heat_loss_batch',
    status: 'running',
    project_id: 'proj-test-1',
    progress: { current: 1, total: 2, phase: 'calculate', percent: 50 },
    result: null,
    error_message: null,
    cancel_requested: false,
    created_at: '2026-01-01T00:00:00Z',
    started_at: null,
    finished_at: null,
    links: {
      status: '/api/v1/calc/jobs/heat-task-1',
      result: '/api/v1/calc/jobs/heat-task-1/result',
      cancel: '/api/v1/calc/jobs/heat-task-1/cancel',
    },
  }),
}));

vi.mock('@/api/references', () => ({
  getClimate: vi.fn().mockResolvedValue([]),
  getInsulation: vi.fn().mockResolvedValue([]),
  getPipeMaterials: vi.fn().mockResolvedValue([]),
  getSoilConductivity: vi.fn().mockResolvedValue([]),
}));

vi.mock('@/api/preferences', () => ({
  getUserPreference: vi.fn(async (key: string) => ({
    key,
    value: null,
    user_id: 'user-test-1',
  })),
  updateUserPreference: vi.fn(),
}));

// Кейс §5.9/§5.11: без сохранённых проектных настроек (version=0) страница
// работает от localStorage; тесты project-sync переопределяют реализацию.
vi.mock('@/api/displaySettings', () => ({
  PROJECT_DISPLAY_SETTINGS_QUERY_KEY: 'project-display-settings',
  getProjectDisplaySettings: vi.fn(async (projectId: string) => ({
    project_id: projectId,
    version: 0,
    settings: {},
  })),
  updateProjectDisplaySettings: vi.fn(
    async (projectId: string, expectedVersion: number, next: Record<string, unknown>) => ({
      project_id: projectId,
      version: expectedVersion + 1,
      settings: next,
    }),
  ),
  isDisplaySettingsVersionConflict: vi.fn(() => false),
}));
