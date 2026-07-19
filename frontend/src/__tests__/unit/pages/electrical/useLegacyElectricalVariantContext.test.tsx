import type { PropsWithChildren } from 'react';
import { act, renderHook, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import TestMemoryRouter from '@/__tests__/utils/TestMemoryRouter';
import { useCalculationVariantStore } from '@/store/calculationVariantStore';
import type { ElectricalVariant } from '@/types/electricalVariant';

const listMock = vi.hoisted(() => vi.fn());
vi.mock('@/api/electricalVariants', () => ({
  electricalVariantQueryKeys: {
    list: (projectId: string) => ['project', projectId, 'electrical-variants'],
    readiness: (projectId: string) => ['project', projectId, 'electrical-readiness'],
    detail: (projectId: string, variantId: string) =>
      ['project', projectId, 'electrical-variant', variantId],
  },
  listElectricalVariants: listMock,
  getElectricalVariantReadiness: vi.fn(),
  initializeElectricalVariants: vi.fn(),
  createEmptyElectricalVariant: vi.fn(),
  copyElectricalVariant: vi.fn(),
  renameElectricalVariant: vi.fn(),
  activateElectricalVariant: vi.fn(),
  deleteElectricalVariant: vi.fn(),
}));

import { useLegacyElectricalVariantContext } from '@/pages/electrical/useLegacyElectricalVariantContext';

const projectId = 'project-1';
const first: ElectricalVariant = {
  id: '11111111-1111-4111-8111-111111111111',
  project_id: projectId,
  name: 'Основное ЭР',
  sort_order: 0,
  is_active: true,
  copied_from_id: null,
  legacy_variant_number: 1,
  specification_state: 'not_generated',
  created_at: '2026-07-18T00:00:00Z',
  updated_at: '2026-07-18T00:00:00Z',
};
const fifth: ElectricalVariant = {
  ...first,
  id: '55555555-5555-4555-8555-555555555555',
  name: 'Пятая ЭР',
  sort_order: 4,
  is_active: false,
  legacy_variant_number: null,
};

function createWrapper(
  initialEntry = '/workspace/specification',
  queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  }),
) {
  return function Wrapper({ children }: PropsWithChildren) {
    return (
      <QueryClientProvider client={queryClient}>
        <TestMemoryRouter initialEntries={[initialEntry]}>
          {children}
        </TestMemoryRouter>
      </QueryClientProvider>
    );
  };
}

function wrapper({ children }: PropsWithChildren) {
  return (
    <QueryClientProvider client={new QueryClient({
      defaultOptions: { queries: { retry: false } },
    })}>
      <TestMemoryRouter initialEntries={['/workspace/specification']}>
        {children}
      </TestMemoryRouter>
    </QueryClientProvider>
  );
}

describe('useLegacyElectricalVariantContext', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    useCalculationVariantStore.setState({
      selectedVariantIdByProject: {},
      variantByProject: {},
    });
    listMock.mockResolvedValue([first, fifth]);
  });

  it('resolves active UUID and its authoritative legacy adapter after reload', async () => {
    const { result } = renderHook(
      () => useLegacyElectricalVariantContext(projectId),
      { wrapper },
    );

    await waitFor(() => expect(result.current.selectedVariant?.id).toBe(first.id));
    expect(result.current.legacyVariantNumber).toBe(1);
    expect(useCalculationVariantStore.getState().selectedVariantIdByProject[projectId])
      .toBe(first.id);
  });

  it('returns null instead of falling back to ER1 for a fifth ER', async () => {
    useCalculationVariantStore.getState().setSelectedVariantId(projectId, fifth.id);
    useCalculationVariantStore.getState().setVariant(projectId, 4);
    const { result } = renderHook(
      () => useLegacyElectricalVariantContext(projectId),
      { wrapper },
    );

    await waitFor(() => expect(result.current.selectedVariant?.id).toBe(fifth.id));
    expect(result.current.legacyVariantNumber).toBeNull();
    await waitFor(() => {
      expect(useCalculationVariantStore.getState().variantByProject[projectId]).toBeUndefined();
    });
  });

  it('switches by exact UUID and rejects an unknown ID', async () => {
    const { result } = renderHook(
      () => useLegacyElectricalVariantContext(projectId),
      { wrapper },
    );
    await waitFor(() => expect(result.current.selectedVariant).not.toBeNull());

    act(() => result.current.selectVariant(fifth.id));
    await waitFor(() => expect(result.current.selectedVariant?.id).toBe(fifth.id));
    act(() => result.current.selectVariant('unknown'));
    expect(result.current.selectedVariant?.id).toBe(fifth.id);
  });

  it('honors a direct report/specification deep-link UUID before active state', async () => {
    const { result } = renderHook(
      () => useLegacyElectricalVariantContext(projectId),
      { wrapper: createWrapper(`/workspace/report?er=${fifth.id}`) },
    );

    await waitFor(() => expect(result.current.selectedVariant?.id).toBe(fifth.id));
    expect(result.current.legacyVariantNumber).toBeNull();
    expect(useCalculationVariantStore.getState().selectedVariantIdByProject[projectId])
      .toBe(fifth.id);
  });

  it('does not expose a cached legacy slot until the authoritative list validates its UUID', async () => {
    const deleted = { ...first, id: '22222222-2222-4222-8222-222222222222', is_active: false };
    const replacement = { ...deleted, id: '33333333-3333-4333-8333-333333333333' };
    let resolveList!: (variants: ElectricalVariant[]) => void;
    listMock.mockReturnValue(new Promise((resolve) => {
      resolveList = resolve;
    }));
    const queryClient = new QueryClient({
      defaultOptions: { queries: { retry: false, staleTime: 30_000 } },
    });
    queryClient.setQueryData(
      ['project', projectId, 'electrical-variants'],
      [first, deleted],
    );
    const { result } = renderHook(
      () => useLegacyElectricalVariantContext(projectId),
      {
        wrapper: createWrapper(
          `/workspace/specification?er=${deleted.id}`,
          queryClient,
        ),
      },
    );

    expect(result.current.isLoading).toBe(true);
    expect(result.current.selectedVariant).toBeNull();
    expect(result.current.legacyVariantNumber).toBeNull();

    resolveList([first, replacement]);
    await waitFor(() => expect(result.current.selectedVariant?.id).toBe(first.id));
    expect(result.current.legacyVariantNumber).toBe(1);
  });
});
