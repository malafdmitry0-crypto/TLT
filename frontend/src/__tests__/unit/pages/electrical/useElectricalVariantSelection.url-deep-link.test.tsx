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

describe('useElectricalVariantSelection — url-deep-link', () => {
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
});
