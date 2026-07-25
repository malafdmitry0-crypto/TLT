import {
  apiMocks,
  ER_1,
  ER_1_ID,
  ER_2,
  ER_2_ID,
  ER_3,
  PROJECT_ID,
  UNKNOWN_ID,
  setup,
} from './useElectricalVariantSelection.test-harness';
import { act, waitFor } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import type { ElectricalVariant } from '@/types/electricalVariant';
import { useCalculationVariantStore } from '@/store/calculationVariantStore';

describe('useElectricalVariantSelection — URL / deep-link selection', () => {
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
