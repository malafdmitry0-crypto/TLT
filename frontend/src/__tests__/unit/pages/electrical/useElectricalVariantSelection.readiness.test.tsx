import {
  apiMocks,
  ER_1,
  ER_1_ID,
  PROJECT_ID,
  setup,
} from './useElectricalVariantSelection.test-harness';
import { act, waitFor } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

describe('useElectricalVariantSelection — readiness & initialize', () => {
  it('exposes readiness and initializes ER1 only for an empty list', async () => {
    const readiness: ElectricalReadinessResponse = {
      project_id: PROJECT_ID,
      ready: true,
      total_objects: 2,
      ready_objects: 2,
      issues: [],
    };
    apiMocks.list.mockResolvedValueOnce([]).mockResolvedValueOnce([ER_1]);
    apiMocks.readiness.mockResolvedValue(readiness);
    apiMocks.initialize.mockResolvedValue({
      project_id: PROJECT_ID,
      created: true,
      assignments_created: 2,
      variant: ER_1,
    });
    const rendered = setup();

    await waitFor(() => expect(rendered.result.current.readiness).toEqual(readiness));
    expect(rendered.result.current.isEmpty).toBe(true);

    await act(async () => {
      await rendered.result.current.initializeVariant();
    });

    expect(apiMocks.initialize).toHaveBeenCalledWith(PROJECT_ID);
    await waitFor(() => expect(rendered.result.current.selectedVariant?.id).toBe(ER_1_ID));
    expect(rendered.getSearch()).toContain(`er=${ER_1_ID}`);
  });

  it('revalidates a fresh cached negative readiness result after returning from heat loss', async () => {
    const staleBlocked: ElectricalReadinessResponse = {
      project_id: PROJECT_ID,
      ready: false,
      total_objects: 1,
      ready_objects: 0,
      issues: [{
        code: 'HEAT_NOT_READY',
        message: 'Старое состояние',
        object_id: 'object-1',
        details: {},
      }],
    };
    const nowReady: ElectricalReadinessResponse = {
      ...staleBlocked,
      ready: true,
      ready_objects: 1,
      issues: [],
    };
    let resolveReadiness!: (value: ElectricalReadinessResponse) => void;
    apiMocks.list.mockResolvedValue([]);
    apiMocks.readiness.mockReturnValue(new Promise((resolve) => {
      resolveReadiness = resolve;
    }));
    const rendered = setup('/workspace/elec-calc', (queryClient) => {
      queryClient.setDefaultOptions({
        queries: { retry: false, staleTime: 30_000 },
        mutations: { retry: false },
      });
      queryClient.setQueryData(
        ['project', PROJECT_ID, 'electrical-readiness'],
        staleBlocked,
      );
    });

    await waitFor(() => expect(apiMocks.readiness).toHaveBeenCalledWith(PROJECT_ID));
    expect(rendered.result.current.isEmpty).toBe(true);
    expect(rendered.result.current.isReadinessFetching).toBe(true);
    expect(rendered.result.current.readiness).toEqual(staleBlocked);

    resolveReadiness(nowReady);
    await waitFor(() => expect(rendered.result.current.readiness).toEqual(nowReady));
  });

  it('refreshes readiness and list after an initialize precondition conflict', async () => {
    const ready: ElectricalReadinessResponse = {
      project_id: PROJECT_ID,
      ready: true,
      total_objects: 1,
      ready_objects: 1,
      issues: [],
    };
    const blocked: ElectricalReadinessResponse = {
      ...ready,
      ready: false,
      ready_objects: 0,
      issues: [{
        code: 'HEAT_RESULT_STALE',
        message: 'Теплопотери изменились',
        object_id: 'object-1',
        details: {},
      }],
    };
    apiMocks.list.mockResolvedValue([]);
    apiMocks.readiness.mockResolvedValueOnce(ready).mockResolvedValue(blocked);
    apiMocks.initialize.mockRejectedValue(new Error('Готовность проекта изменилась'));
    const rendered = setup();

    await waitFor(() => expect(rendered.result.current.readiness).toEqual(ready));
    await act(async () => {
      await expect(rendered.result.current.initializeVariant())
        .rejects.toThrow('Готовность проекта изменилась');
    });

    await waitFor(() => expect(rendered.result.current.readiness).toEqual(blocked));
    expect(apiMocks.list.mock.calls.length).toBeGreaterThanOrEqual(2);
    expect(apiMocks.readiness.mock.calls.length).toBeGreaterThanOrEqual(2);
  });

});
