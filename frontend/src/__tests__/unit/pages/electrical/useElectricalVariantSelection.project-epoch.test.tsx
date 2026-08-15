import type { PropsWithChildren } from 'react';
import { act, renderHook, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { useLocation } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import TestMemoryRouter from '@/__tests__/utils/TestMemoryRouter';
import { useCalculationVariantStore } from '@/store/calculationVariantStore';
import type { ElectricalVariant } from '@/types/electricalVariant';

const apiMocks = vi.hoisted(() => ({
  list: vi.fn(),
  create: vi.fn(),
}));

vi.mock('@/api/electricalVariants', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/api/electricalVariants')>();
  return {
    ...actual,
    listElectricalVariants: apiMocks.list,
    createEmptyElectricalVariant: apiMocks.create,
    getElectricalVariantReadiness: vi.fn(),
    initializeElectricalVariants: vi.fn(),
    copyElectricalVariant: vi.fn(),
    renameElectricalVariant: vi.fn(),
    activateElectricalVariant: vi.fn(),
    deleteElectricalVariant: vi.fn(),
  };
});

import { useElectricalVariantSelection } from '@/hooks/useElectricalVariantSelection';

const PROJECT_A_ID = 'project-a';
const PROJECT_B_ID = 'project-b';
const ER_A_ID = '11111111-1111-4111-8111-111111111111';
const ER_A_LATE_ID = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const ER_B_ID = '22222222-2222-4222-8222-222222222222';

function variant(projectId: string, id: string): ElectricalVariant {
  return {
    id,
    project_id: projectId,
    name: `ЭР ${projectId}`,
    sort_order: 0,
    is_active: true,
    copied_from_id: null,
    legacy_variant_number: 1,
    specification_state: 'not_generated',
    created_at: '2026-08-15T00:00:00Z',
    updated_at: '2026-08-15T00:00:00Z',
  };
}

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((resolvePromise) => {
    resolve = resolvePromise;
  });
  return { promise, resolve };
}

function setup(syncRouteSelection = true) {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: { retry: false },
      mutations: { retry: false },
    },
  });
  let currentSearch = '';

  function LocationProbe() {
    currentSearch = useLocation().search;
    return null;
  }

  function Wrapper({ children }: PropsWithChildren) {
    return (
      <QueryClientProvider client={queryClient}>
        <TestMemoryRouter initialEntries={['/workspace/elec-calc']}>
          <LocationProbe />
          {children}
        </TestMemoryRouter>
      </QueryClientProvider>
    );
  }

  return {
    getSearch: () => currentSearch,
    ...renderHook(
      ({ projectId }: { projectId: string }) => useElectricalVariantSelection({
        projectId,
        syncRouteSelection,
      }),
      { wrapper: Wrapper, initialProps: { projectId: PROJECT_A_ID } },
    ),
  };
}

describe('useElectricalVariantSelection — project epoch', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    useCalculationVariantStore.setState({
      selectedVariantIdByProject: {},
      variantByProject: {},
    });
    apiMocks.list.mockImplementation(async (projectId: string) => [
      projectId === PROJECT_A_ID
        ? variant(PROJECT_A_ID, ER_A_ID)
        : variant(PROJECT_B_ID, ER_B_ID),
    ]);
  });

  it('ignores a project A mutation that settles after switching to project B', async () => {
    const lateCreate = deferred<ElectricalVariant>();
    apiMocks.create.mockReturnValue(lateCreate.promise);
    const rendered = setup();

    await waitFor(() => expect(rendered.result.current.selectedVariantId).toBe(ER_A_ID));
    let pendingCreate!: Promise<ElectricalVariant>;
    act(() => {
      pendingCreate = rendered.result.current.createVariant('Запоздалый ЭР');
    });
    await waitFor(() => expect(apiMocks.create).toHaveBeenCalled());

    rendered.rerender({ projectId: PROJECT_B_ID });
    await waitFor(() => expect(rendered.result.current.selectedVariantId).toBe(ER_B_ID));
    await waitFor(() => expect(rendered.getSearch()).toContain(`er=${ER_B_ID}`));

    lateCreate.resolve(variant(PROJECT_A_ID, ER_A_LATE_ID));
    await act(async () => {
      await pendingCreate;
    });

    expect(rendered.result.current.projectId).toBe(PROJECT_B_ID);
    expect(rendered.result.current.selectedVariantId).toBe(ER_B_ID);
    expect(rendered.getSearch()).toContain(`er=${ER_B_ID}`);
    expect(useCalculationVariantStore.getState().selectedVariantIdByProject).toEqual({
      [PROJECT_A_ID]: ER_A_ID,
      [PROJECT_B_ID]: ER_B_ID,
    });
  });

  it('lets a read-only controller persist selection without writing the route', async () => {
    const rendered = setup(false);

    await waitFor(() => expect(rendered.result.current.selectedVariantId).toBe(ER_A_ID));

    expect(rendered.getSearch()).toBe('');
    expect(useCalculationVariantStore.getState().selectedVariantIdByProject[PROJECT_A_ID])
      .toBe(ER_A_ID);
  });
});
