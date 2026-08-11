import type { ReactNode } from 'react';
import { act, renderHook, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { getCableOptions } from '@/api/calculations';
import { useElecCalcCableMarkModalState } from '@/pages/electrical/useElecCalcCableMarkModalState';
import { AUTO_CABLE_MARK_VALUE } from '@/pages/electrical/elecCalcCableOptionModel';
import type { ProjectObject } from '@/types/project';

vi.mock('@/api/calculations', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/api/calculations')>();
  return { ...actual, getCableOptions: vi.fn() };
});

function wrapper() {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
  );
}

const object: ProjectObject = {
  id: 'object-1', project_id: 'project-1', object_type: 'pipe', sort_order: 0, version: 1,
  params: {}, results: {}, is_valid: true, validation_errors: null, created_at: '', updated_at: '',
};

function renderState() {
  return renderHook(() => useElecCalcCableMarkModalState({
    objects: [object],
    calcByObjectId: {},
    electricalVariantId: 'er-current',
    getSavedCableTypeForObject: () => 'self_regulating_tt',
    normalizeAvailableCableType: (type) => type,
    cableMarkOptionsFor: () => [{
      value: AUTO_CABLE_MARK_VALUE,
      label: 'Авто',
      searchLabel: 'Авто',
      mark: null,
      optionSource: 'builtin',
    }],
    cableMarkValueForCalc: () => AUTO_CABLE_MARK_VALUE,
    findCableRowForMark: () => null,
  }), { wrapper: wrapper() });
}

describe('useElecCalcCableMarkModalState', () => {
  beforeEach(() => {
    vi.mocked(getCableOptions).mockReset();
  });

  it('keeps only object and current-ER state; there is no multi-ER target model', () => {
    vi.mocked(getCableOptions).mockResolvedValue([]);
    const { result } = renderState();
    act(() => result.current.open(object));
    expect(result.current.object).toEqual(object);
    expect(result.current.value).toBe(AUTO_CABLE_MARK_VALUE);
    expect(result.current).not.toHaveProperty('targetVariants');
    act(() => result.current.close());
    expect(result.current.object).toBeNull();
  });

  it('explains when no catalog cable is temperature-eligible', async () => {
    vi.mocked(getCableOptions).mockResolvedValue([{
      model: 'ТЛТ-25',
      series: '25ТТ',
      base_model: '25ТТ',
      eligible: false,
      passport_power_w_per_m: 25,
      min_ambient_temperature_c: -60,
      max_product_temperature_c: 65,
      object_ambient_temperature_c: -70,
      object_product_temperature_c: 80,
      unavailable_reason: 'ELECTRICAL_CABLE_TEMPERATURE_LIMIT_EXCEEDED',
    }]);
    const { result } = renderState();
    act(() => result.current.open(object));
    await waitFor(() => expect(result.current.autoAvailability.message).toContain('среда -70 °C'));
    expect(result.current.autoAvailability).toMatchObject({ kind: 'temperature', blocked: true });
    expect(result.current.autoAvailability.message).toContain('продукт 80 °C');
  });

  it('retries a failed availability request and clears the stale blocker on success', async () => {
    vi.mocked(getCableOptions)
      .mockRejectedValueOnce(new Error('network'))
      .mockResolvedValueOnce([{
        model: 'ТЛТ-25',
        series: '25ТТ',
        base_model: '25ТТ',
        eligible: true,
        passport_power_w_per_m: 25,
        min_ambient_temperature_c: -60,
        max_product_temperature_c: 65,
        unavailable_reason: null,
      }]);
    const { result } = renderState();
    act(() => result.current.open(object));
    await waitFor(() => expect(result.current.autoAvailability.kind).toBe('request_error'));

    act(() => result.current.retryAutoAvailability());

    await waitFor(() => expect(result.current.autoAvailability.kind).toBe('available'));
    expect(getCableOptions).toHaveBeenCalledTimes(2);
  });
});
