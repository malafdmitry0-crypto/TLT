/**
 * Shared harness for useElectricalVariantSelection scenario tests.
 * Import this module first (mocks), then import the hook under test in each file.
 *
 * Vitest forbids exporting `vi.hoisted` bindings directly — expose via plain alias.
 */
import type { PropsWithChildren } from 'react';
import { renderHook } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { useLocation, useNavigate } from 'react-router-dom';
import { beforeEach, vi } from 'vitest';
import TestMemoryRouter from '@/__tests__/utils/TestMemoryRouter';
import { useCalculationVariantStore } from '@/store/calculationVariantStore';
import type {
  ElectricalReadinessResponse,
  ElectricalVariant,
} from '@/types/electricalVariant';

const hoistedApiMocks = vi.hoisted(() => ({
  list: vi.fn(),
  readiness: vi.fn(),
  initialize: vi.fn(),
  create: vi.fn(),
  copy: vi.fn(),
  rename: vi.fn(),
  activate: vi.fn(),
  remove: vi.fn(),
}));

export const apiMocks = hoistedApiMocks;

vi.mock('@/api/electricalVariants', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/api/electricalVariants')>();
  return {
    ...actual,
    listElectricalVariants: hoistedApiMocks.list,
    getElectricalVariantReadiness: hoistedApiMocks.readiness,
    initializeElectricalVariants: hoistedApiMocks.initialize,
    createEmptyElectricalVariant: hoistedApiMocks.create,
    copyElectricalVariant: hoistedApiMocks.copy,
    renameElectricalVariant: hoistedApiMocks.rename,
    activateElectricalVariant: hoistedApiMocks.activate,
    deleteElectricalVariant: hoistedApiMocks.remove,
  };
});

import { useElectricalVariantSelection } from '@/hooks/useElectricalVariantSelection';
export { useElectricalVariantSelection };

export const PROJECT_ID = 'project-a';
export const ER_1_ID = '11111111-1111-4111-8111-111111111111';
export const ER_2_ID = '22222222-2222-4222-8222-222222222222';
export const ER_3_ID = '33333333-3333-4333-8333-333333333333';
export const UNKNOWN_ID = '99999999-9999-4999-8999-999999999999';

export function responseLost(message: string): Error & { status: undefined } {
  return Object.assign(new Error(message), { status: undefined });
}

export function variant(
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

export const ER_1 = variant(ER_1_ID, 'Основное решение', 0, true);
export const ER_2 = variant(ER_2_ID, 'Экономичный вариант', 1);
export const ER_3 = variant(ER_3_ID, 'Резерв', 2);

export function setup(
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

