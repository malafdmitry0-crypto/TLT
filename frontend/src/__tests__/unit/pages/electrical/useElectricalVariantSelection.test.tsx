import type { PropsWithChildren } from 'react';
import { act, renderHook, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { useLocation, useNavigate } from 'react-router-dom';
import TestMemoryRouter from '@/__tests__/utils/TestMemoryRouter';
import { useCalculationVariantStore } from '@/store/calculationVariantStore';
import { electricalDataQueryKeys } from '@/api/electricalQueryKeys';
import type {
  ElectricalReadinessResponse,
  ElectricalVariant,
} from '@/types/electricalVariant';

const apiMocks = vi.hoisted(() => ({
  list: vi.fn(),
  readiness: vi.fn(),
  initialize: vi.fn(),
  create: vi.fn(),
  copy: vi.fn(),
  rename: vi.fn(),
  activate: vi.fn(),
  remove: vi.fn(),
}));

vi.mock('@/api/electricalVariants', () => ({
  electricalVariantQueryKeys: {
    list: (projectId: string) => ['project', projectId, 'electrical-variants'] as const,
    readiness: (projectId: string) => ['project', projectId, 'electrical-readiness'] as const,
    detail: (projectId: string, variantId: string) =>
      ['project', projectId, 'electrical-variant', variantId] as const,
  },
  listElectricalVariants: apiMocks.list,
  getElectricalVariantReadiness: apiMocks.readiness,
  initializeElectricalVariants: apiMocks.initialize,
  createEmptyElectricalVariant: apiMocks.create,
  copyElectricalVariant: apiMocks.copy,
  renameElectricalVariant: apiMocks.rename,
  activateElectricalVariant: apiMocks.activate,
  deleteElectricalVariant: apiMocks.remove,
}));

import { useElectricalVariantSelection } from '@/pages/electrical/useElectricalVariantSelection';

const PROJECT_ID = 'project-a';
const ER_1_ID = '11111111-1111-4111-8111-111111111111';
const ER_2_ID = '22222222-2222-4222-8222-222222222222';
const ER_3_ID = '33333333-3333-4333-8333-333333333333';
const UNKNOWN_ID = '99999999-9999-4999-8999-999999999999';

function responseLost(message: string): Error & { status: undefined } {
  return Object.assign(new Error(message), { status: undefined });
}

function variant(
  id: string,
  name: string,
  sortOrder: number,
  isActive = false,
): ElectricalVariant {
  return {
    id,
    project_id: PROJECT_ID,
    name,
    sort_order: sortOrder,
    is_active: isActive,
    copied_from_id: null,
    legacy_variant_number: sortOrder + 1,
    specification_state: 'not_generated',
    created_at: '2026-07-18T10:00:00Z',
    updated_at: '2026-07-18T10:00:00Z',
  };
}

const ER_1 = variant(ER_1_ID, 'Основное решение', 0, true);
const ER_2 = variant(ER_2_ID, 'Экономичный вариант', 1);
const ER_3 = variant(ER_3_ID, 'Резерв', 2);

function setup(
  initialEntry = '/workspace/elec-calc',
  prepareQueryClient?: (queryClient: QueryClient) => void,
) {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: { retry: false },
      mutations: { retry: false },
    },
  });
  prepareQueryClient?.(queryClient);
  let currentSearch = '';
  let navigateFromTest: ReturnType<typeof useNavigate> | null = null;

  function LocationProbe() {
    currentSearch = useLocation().search;
    navigateFromTest = useNavigate();
    return null;
  }

  function Wrapper({ children }: PropsWithChildren) {
    return (
      <QueryClientProvider client={queryClient}>
        <TestMemoryRouter initialEntries={[initialEntry]}>
          <LocationProbe />
          {children}
        </TestMemoryRouter>
      </QueryClientProvider>
    );
  }

  return {
    queryClient,
    getSearch: () => currentSearch,
    navigate: (to: string) => navigateFromTest?.(to),
    ...renderHook(() => useElectricalVariantSelection({ projectId: PROJECT_ID }), {
      wrapper: Wrapper,
    }),
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  useCalculationVariantStore.setState({
    selectedVariantIdByProject: {},
    variantByProject: {},
  });
  apiMocks.list.mockResolvedValue([ER_1, ER_2]);
  apiMocks.readiness.mockResolvedValue({
    project_id: PROJECT_ID,
    ready: false,
    total_objects: 0,
    ready_objects: 0,
    issues: [],
  } satisfies ElectricalReadinessResponse);
});

describe('useElectricalVariantSelection', () => {
  it('does not expose a fabricated ER while the backend list is loading', async () => {
    let resolveList!: (variants: ElectricalVariant[]) => void;
    apiMocks.list.mockReturnValue(new Promise((resolve) => {
      resolveList = resolve;
    }));

    const rendered = setup();

    expect(rendered.result.current.isLoading).toBe(true);
    expect(rendered.result.current.variants).toEqual([]);
    expect(rendered.result.current.selectedVariant).toBeNull();
    expect(rendered.getSearch()).toBe('');

    resolveList([ER_1]);
    await waitFor(() => expect(rendered.result.current.selectedVariant?.id).toBe(ER_1_ID));
  });

  it('uses a valid URL UUID before persisted and active selections and preserves other params', async () => {
    useCalculationVariantStore.getState().setSelectedVariantId(PROJECT_ID, ER_1_ID);
    const rendered = setup(`/workspace/elec-calc?view=table&er=${ER_2_ID}`);

    await waitFor(() => expect(rendered.result.current.selectedVariant?.id).toBe(ER_2_ID));

    expect(rendered.getSearch()).toContain('view=table');
    expect(rendered.getSearch()).toContain(`er=${ER_2_ID}`);
    expect(
      useCalculationVariantStore.getState().selectedVariantIdByProject[PROJECT_ID],
    ).toBe(ER_2_ID);
  });

  it('falls back from an invalid or deleted URL UUID to backend active and not persisted', async () => {
    useCalculationVariantStore.getState().setSelectedVariantId(PROJECT_ID, ER_2_ID);
    const rendered = setup(`/workspace/elec-calc?er=${UNKNOWN_ID}&view=grid`);

    await waitFor(() => expect(rendered.result.current.selectedVariant?.id).toBe(ER_1_ID));

    expect(rendered.getSearch()).toContain(`er=${ER_1_ID}`);
    expect(rendered.getSearch()).toContain('view=grid');
  });

  it('preserves a deep-link UUID missing from stale cache until the fresh list validates it', async () => {
    const freshVariant = { ...ER_3, id: UNKNOWN_ID, name: 'Новый серверный ЭР' };
    let resolveList!: (variants: ElectricalVariant[]) => void;
    apiMocks.list.mockReturnValue(new Promise((resolve) => {
      resolveList = resolve;
    }));
    const rendered = setup(
      `/workspace/elec-calc?view=grid&er=${UNKNOWN_ID}`,
      (queryClient) => {
        queryClient.setQueryData(
          ['project', PROJECT_ID, 'electrical-variants'],
          [ER_1, ER_2],
        );
      },
    );

    expect(rendered.result.current.isLoading).toBe(true);
    expect(rendered.result.current.selectedVariant).toBeNull();
    expect(rendered.getSearch()).toContain(`er=${UNKNOWN_ID}`);

    resolveList([ER_1, ER_2, freshVariant]);
    await waitFor(() => {
      expect(rendered.result.current.selectedVariant?.id).toBe(UNKNOWN_ID);
    });
    expect(rendered.getSearch()).toContain(`er=${UNKNOWN_ID}`);
    expect(
      useCalculationVariantStore.getState().selectedVariantIdByProject[PROJECT_ID],
    ).toBe(UNKNOWN_ID);
  });

  it('forces authoritative validation even when a fresh cache hits a deleted UUID', async () => {
    const replacement = {
      ...ER_3,
      id: UNKNOWN_ID,
      name: 'Новый ЭР в повторно использованном слоте',
      legacy_variant_number: 2,
    };
    let resolveList!: (variants: ElectricalVariant[]) => void;
    apiMocks.list.mockReturnValue(new Promise((resolve) => {
      resolveList = resolve;
    }));
    const rendered = setup(
      `/workspace/elec-calc?er=${ER_2_ID}`,
      (queryClient) => {
        queryClient.setDefaultOptions({
          queries: { retry: false, staleTime: 30_000 },
          mutations: { retry: false },
        });
        queryClient.setQueryData(
          ['project', PROJECT_ID, 'electrical-variants'],
          [ER_1, ER_2],
        );
      },
    );

    expect(apiMocks.list).toHaveBeenCalledWith(PROJECT_ID);
    expect(rendered.result.current.isLoading).toBe(true);
    expect(rendered.result.current.selectedVariant).toBeNull();
    expect(rendered.getSearch()).toContain(`er=${ER_2_ID}`);

    resolveList([ER_1, replacement]);
    await waitFor(() => expect(rendered.result.current.selectedVariant?.id).toBe(ER_1_ID));
    expect(rendered.getSearch()).toContain(`er=${ER_1_ID}`);
    expect(rendered.getSearch()).not.toContain(`er=${ER_2_ID}`);
  });

  it('gates a mounted external URL change until the server revalidates the UUID', async () => {
    const replacement = {
      ...ER_3,
      id: UNKNOWN_ID,
      name: 'Новый ЭР в слоте 2',
      legacy_variant_number: 2,
    };
    const rendered = setup(`/workspace/elec-calc?er=${ER_1_ID}`);
    await waitFor(() => expect(rendered.result.current.selectedVariantId).toBe(ER_1_ID));
    let resolveRevalidation!: (variants: ElectricalVariant[]) => void;
    apiMocks.list.mockReturnValueOnce(new Promise((resolve) => {
      resolveRevalidation = resolve;
    }));

    act(() => rendered.navigate(`/workspace/elec-calc?er=${ER_2_ID}`));

    await waitFor(() => expect(rendered.result.current.isLoading).toBe(true));
    expect(rendered.result.current.selectedVariant).toBeNull();
    expect(rendered.getSearch()).toContain(`er=${ER_2_ID}`);

    resolveRevalidation([ER_1, replacement]);
    await waitFor(() => expect(rendered.result.current.selectedVariantId).toBe(ER_1_ID));
    expect(rendered.getSearch()).toContain(`er=${ER_1_ID}`);
  });

  it('preserves a valid deep link but exposes a retryable list error after fetch failure', async () => {
    apiMocks.list.mockRejectedValue(new Error('Список ЭР недоступен'));
    const rendered = setup(`/workspace/elec-calc?er=${UNKNOWN_ID}`);

    await waitFor(() => expect(rendered.result.current.isError).toBe(true));
    expect(rendered.result.current.isLoading).toBe(false);
    expect(rendered.result.current.listError).toEqual(new Error('Список ЭР недоступен'));
    expect(rendered.result.current.selectedVariant).toBeNull();
    expect(rendered.getSearch()).toContain(`er=${UNKNOWN_ID}`);
  });

  it('uses a valid persisted UUID when the URL has no er parameter', async () => {
    useCalculationVariantStore.getState().setSelectedVariantId(PROJECT_ID, ER_2_ID);
    const rendered = setup('/workspace/elec-calc?view=grid');

    await waitFor(() => expect(rendered.result.current.selectedVariant?.id).toBe(ER_2_ID));
    expect(rendered.getSearch()).toContain(`er=${ER_2_ID}`);
  });

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

  it('runs lifecycle calls with project and exact selected UUID and updates selection', async () => {
    let serverVariants = [ER_1, ER_2];
    apiMocks.list.mockImplementation(() => Promise.resolve(serverVariants));
    apiMocks.create.mockImplementation(async () => {
      serverVariants = [...serverVariants, ER_3];
      return ER_3;
    });
    apiMocks.copy.mockImplementation(async () => {
      const copy = { ...ER_3, id: UNKNOWN_ID, name: 'Копия решения' };
      serverVariants = [...serverVariants, copy];
      return copy;
    });
    apiMocks.rename.mockImplementation(async (_projectId, id, payload) => {
      const renamed = { ...serverVariants.find((item) => item.id === id)!, name: payload.name };
      serverVariants = serverVariants.map((item) => item.id === id ? renamed : item);
      return renamed;
    });
    apiMocks.activate.mockImplementation(async (_projectId, id) => {
      serverVariants = serverVariants.map((item) => ({ ...item, is_active: item.id === id }));
      return serverVariants.find((item) => item.id === id)!;
    });
    apiMocks.remove.mockImplementation(async (_projectId, id) => {
      serverVariants = serverVariants
        .filter((item) => item.id !== id)
        .map((item) => ({ ...item, is_active: item.id === ER_1_ID }));
      return {
        project_id: PROJECT_ID,
        deleted_variant_id: id,
        active_variant_id: ER_1_ID,
      };
    });
    const rendered = setup(`/workspace/elec-calc?er=${ER_2_ID}`);
    await waitFor(() => expect(rendered.result.current.selectedVariant?.id).toBe(ER_2_ID));
    rendered.queryClient.setQueryData(
      [...electricalDataQueryKeys.variant(PROJECT_ID, UNKNOWN_ID), 'query'],
      { foreign: true },
    );

    await act(async () => {
      await rendered.result.current.createVariant('Резерв');
    });
    expect(apiMocks.create).toHaveBeenCalledWith(
      PROJECT_ID,
      { name: 'Резерв' },
      expect.any(String),
    );
    expect(rendered.result.current.selectedVariantId).toBe(ER_3_ID);

    await act(async () => {
      await rendered.result.current.renameVariant(ER_3_ID, 'Новый резерв');
      await rendered.result.current.activateVariant(ER_3_ID);
      await rendered.result.current.copySelectedVariant('Копия решения');
    });
    expect(apiMocks.rename).toHaveBeenCalledWith(PROJECT_ID, ER_3_ID, {
      name: 'Новый резерв',
    });
    expect(apiMocks.activate).toHaveBeenCalledWith(PROJECT_ID, ER_3_ID);
    expect(apiMocks.copy).toHaveBeenCalledWith(PROJECT_ID, ER_3_ID, {
      name: 'Копия решения',
    }, expect.any(String));
    expect(rendered.result.current.selectedVariantId).toBe(UNKNOWN_ID);

    await act(async () => {
      await rendered.result.current.deleteVariant(UNKNOWN_ID);
    });
    expect(apiMocks.remove).toHaveBeenCalledWith(PROJECT_ID, UNKNOWN_ID);
    expect(rendered.result.current.selectedVariantId).toBe(ER_1_ID);
    expect(
      rendered.queryClient.getQueriesData({
        queryKey: electricalDataQueryKeys.variant(PROJECT_ID, UNKNOWN_ID),
      }),
    ).toEqual([]);
  });

  it('surfaces and clears lifecycle mutation errors', async () => {
    apiMocks.create.mockRejectedValue(new Error('Достигнут лимит ЭР'));
    const rendered = setup();
    await waitFor(() => expect(rendered.result.current.selectedVariant).not.toBeNull());

    await act(async () => {
      await expect(rendered.result.current.createVariant()).rejects.toThrow('Достигнут лимит ЭР');
    });
    expect(rendered.result.current.mutationError).toEqual(new Error('Достигнут лимит ЭР'));

    act(() => rendered.result.current.clearMutationError());
    expect(rendered.result.current.mutationError).toBeNull();
  });

  it('reconciles the authoritative lifecycle list after a response-lost mutation error', async () => {
    let serverVariants = [ER_1, ER_2];
    apiMocks.list.mockImplementation(async () => serverVariants);
    apiMocks.create
      .mockImplementationOnce(async () => {
        serverVariants = [...serverVariants, ER_3];
        throw responseLost('Ответ create потерян');
      })
      .mockImplementationOnce(async () => ER_3);
    const rendered = setup();
    await waitFor(() => expect(rendered.result.current.variants).toHaveLength(2));

    await act(async () => {
      await expect(rendered.result.current.createVariant('Резерв')).resolves.toEqual(ER_3);
    });

    expect(rendered.result.current.variants.map((item) => item.id)).toContain(ER_3_ID);
    expect(apiMocks.list.mock.calls.length).toBeGreaterThanOrEqual(2);
    expect(rendered.result.current.isMutating).toBe(false);
    expect(rendered.result.current.mutationError).toBeNull();
    expect(rendered.result.current.mutationNotice).toBeNull();
  });

  it('automatically replays one create intent with the same key after a lost response', async () => {
    let serverVariants: ElectricalVariant[] = [ER_1, ER_2];
    apiMocks.list.mockImplementation(async () => serverVariants);
    apiMocks.create
      .mockImplementationOnce(async () => {
        throw responseLost('Ответ create потерян');
      })
      .mockImplementationOnce(async () => {
        serverVariants = [...serverVariants, ER_3];
        return ER_3;
      });
    const rendered = setup();
    await waitFor(() => expect(rendered.result.current.variants).toHaveLength(2));

    await act(async () => {
      await rendered.result.current.createVariant('  Резерв  ');
    });

    expect(apiMocks.create).toHaveBeenCalledTimes(2);
    expect(apiMocks.create.mock.calls[1]?.[2]).toBe(apiMocks.create.mock.calls[0]?.[2]);
    expect(rendered.result.current.variants.filter((item) => item.id === ER_3_ID)).toHaveLength(1);
  });

  it('never mistakes a concurrent foreign create for a locally rejected create', async () => {
    const foreignFifth = {
      ...ER_3,
      id: UNKNOWN_ID,
      name: 'Чужой пятый ЭР',
      legacy_variant_number: null,
    };
    let listCalls = 0;
    apiMocks.list.mockImplementation(async () => {
      listCalls += 1;
      return listCalls === 1 ? [ER_1, ER_2, ER_3] : [ER_1, ER_2, ER_3, foreignFifth];
    });
    apiMocks.create.mockRejectedValue(Object.assign(
      new Error('Достигнут лимит ЭР'),
      { status: 409 },
    ));
    const rendered = setup();
    await waitFor(() => expect(rendered.result.current.variants).toHaveLength(3));

    await act(async () => {
      await expect(rendered.result.current.createVariant())
        .rejects.toThrow('Достигнут лимит ЭР');
    });

    expect(apiMocks.create).toHaveBeenCalledTimes(1);
    expect(rendered.result.current.mutationNotice).toBeNull();
    expect(rendered.result.current.mutationError).toMatchObject({ status: 409 });
    expect(rendered.result.current.selectedVariantId).not.toBe(foreignFifth.id);
  });

  it('does not report a false failure when rename or delete is proven by reconciliation', async () => {
    let serverVariants: ElectricalVariant[] = [ER_1, ER_2];
    apiMocks.list.mockImplementation(async () => serverVariants);
    apiMocks.rename.mockImplementation(async (_projectId, id, payload) => {
      serverVariants = serverVariants.map((item) => (
        item.id === id ? { ...item, name: payload.name } : item
      ));
      throw new Error('Ответ rename потерян');
    });
    apiMocks.remove.mockImplementation(async (_projectId, id) => {
      serverVariants = serverVariants.filter((item) => item.id !== id);
      throw new Error('Ответ delete потерян');
    });
    const rendered = setup(`/workspace/elec-calc?er=${ER_2_ID}`);
    await waitFor(() => expect(rendered.result.current.selectedVariantId).toBe(ER_2_ID));

    await act(async () => {
      await expect(rendered.result.current.renameVariant(ER_2_ID, 'Сверенное имя'))
        .resolves.toMatchObject({ id: ER_2_ID, name: 'Сверенное имя' });
    });
    expect(rendered.result.current.mutationError).toBeNull();
    expect(rendered.result.current.mutationNotice).toMatch(/Название ЭР сохранено/i);

    await act(async () => {
      await expect(rendered.result.current.deleteVariant(ER_2_ID)).resolves.toBeUndefined();
    });
    await waitFor(() => expect(rendered.result.current.selectedVariantId).toBe(ER_1_ID));
    expect(rendered.result.current.mutationError).toBeNull();
    expect(rendered.result.current.mutationNotice).toMatch(/ЭР удалён/i);
  });

  it('reuses the same copy idempotency key when the same failed intent is retried', async () => {
    apiMocks.copy
      .mockRejectedValueOnce(responseLost('Ответ потерян'))
      .mockRejectedValueOnce(responseLost('Ответ снова потерян'))
      .mockResolvedValueOnce({ ...ER_2, id: UNKNOWN_ID, name: 'Копия' });
    const rendered = setup(`/workspace/elec-calc?er=${ER_2_ID}`);
    await waitFor(() => expect(rendered.result.current.selectedVariantId).toBe(ER_2_ID));

    await act(async () => {
      await expect(rendered.result.current.copySelectedVariant('  Копия  '))
        .rejects.toThrow('Ответ снова потерян');
    });
    await act(async () => {
      await rendered.result.current.copySelectedVariant('Копия');
    });

    const firstKey = apiMocks.copy.mock.calls[0]?.[3];
    const automaticRetryKey = apiMocks.copy.mock.calls[1]?.[3];
    const retryKey = apiMocks.copy.mock.calls[2]?.[3];
    expect(firstKey).toEqual(expect.any(String));
    expect(automaticRetryKey).toBe(firstKey);
    expect(retryKey).toBe(firstKey);
  });
});
