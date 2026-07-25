import './useHeatCalcObjectsDataModel.test-harness';
import { waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  getObjectQueryCapabilities,
  getObjectsSummary,
  listObjects,
  queryObjects,
} from '@/api/projects';
import { getInsulation } from '@/api/references';
import {
  makeCapabilities,
  makeObject,
  makeQueryResponse,
  setupHook,
} from './useHeatCalcObjectsDataModel.test-harness';

describe('useHeatCalcObjectsDataModel — query / prefetch / scope', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    Object.defineProperty(window, 'requestIdleCallback', { configurable: true, value: undefined });
    Object.defineProperty(window, 'cancelIdleCallback', { configurable: true, value: undefined });
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

  it('idle-prefetches all objects only when the summary fits the current page limit', async () => {
    const requestIdleCallback = vi.fn((callback: () => void) => {
      callback();
      return 1;
    });
    Object.defineProperty(window, 'requestIdleCallback', { configurable: true, value: requestIdleCallback });
    Object.defineProperty(window, 'cancelIdleCallback', { configurable: true, value: vi.fn() });

    setupHook();

    await waitFor(() => {
      expect(requestIdleCallback).toHaveBeenCalled();
      expect(listObjects).toHaveBeenCalledWith('project-1');
    });
  });

  it('skips idle-prefetch of the full object list for large paginated projects', async () => {
    const requestIdleCallback = vi.fn((callback: () => void) => {
      callback();
      return 1;
    });
    Object.defineProperty(window, 'requestIdleCallback', { configurable: true, value: requestIdleCallback });
    Object.defineProperty(window, 'cancelIdleCallback', { configurable: true, value: vi.fn() });
    (getObjectsSummary as ReturnType<typeof vi.fn>).mockResolvedValue({
      total: 500,
      valid: 500,
      invalid: 0,
      by_type: { pipe: 500, tank: 0 },
      valid_by_type: { pipe: 500, tank: 0 },
      electrical_calculations_total: 0,
      successful_electrical_calculations: 0,
      failed_electrical_calculations: 0,
      objects_with_successful_electrical_calculation: 0,
    });

    const { result } = setupHook();

    await waitFor(() => {
      expect(result.current.projectObjectCount).toBe(500);
      expect(queryObjects).toHaveBeenCalled();
    });

    expect(requestIdleCallback).not.toHaveBeenCalled();
    expect(listObjects).not.toHaveBeenCalled();
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

  it('uses the full object list in Excel mode without also running the paginated typed query', async () => {
    const fullList = [
      makeObject({ id: 'pipe-a', sort_order: 1, params: { name: 'Alpha pipe' } }),
      makeObject({ id: 'pipe-b', sort_order: 2, params: { name: 'Beta pipe' } }),
    ];
    (listObjects as ReturnType<typeof vi.fn>).mockResolvedValue(fullList);

    const { result } = setupHook({
      excelModeEnabled: true,
    });

    await waitFor(() => {
      expect(listObjects).toHaveBeenCalledWith('project-1');
      expect(result.current.allProjectObjects).toEqual(fullList);
    });

    expect(getObjectQueryCapabilities).toHaveBeenCalledWith('project-1', 'pipe');
    expect(queryObjects).not.toHaveBeenCalled();
    expect(result.current.objectQueryRequest).toBeNull();
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

});
