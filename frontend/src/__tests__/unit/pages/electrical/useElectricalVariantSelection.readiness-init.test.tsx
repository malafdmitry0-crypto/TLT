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

vi.mock('@/api/electricalVariants', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/api/electricalVariants')>();
  return {
    ...actual,
    listElectricalVariants: apiMocks.list,
    getElectricalVariantReadiness: apiMocks.readiness,
    initializeElectricalVariants: apiMocks.initialize,
    createEmptyElectricalVariant: apiMocks.create,
    copyElectricalVariant: apiMocks.copy,
    renameElectricalVariant: apiMocks.rename,
    activateElectricalVariant: apiMocks.activate,
    deleteElectricalVariant: apiMocks.remove,
  };
});

import { useElectricalVariantSelection } from '@/hooks/useElectricalVariantSelection';

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
  apiMocks.activate.mockImplementation(async (_projectId: string, id: string) => ({
    ...ER_1,
    id,
    is_active: true,
  }));
  apiMocks.readiness.mockResolvedValue({
    project_id: PROJECT_ID,
    ready: false,
    total_objects: 0,
    ready_objects: 0,
    issues: [],
  } satisfies ElectricalReadinessResponse);
});

describe('useElectricalVariantSelection — readiness-init', () => {
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
