import type { ReactNode } from 'react';
import { act, renderHook, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { message } from 'antd';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import {
  selectCableForVariants,
} from '@/api/calculations';
import {
  AUTO_CABLE_MARK_VALUE,
  cableMarkOptionValue,
  type CableMarkSelectOption,
} from '@/pages/electrical/elecCalcCableOptionModel';
import type { CableTypeKey } from '@/pages/electrical/elecCalcMainTableModel';
import { useElecCalcCableSelectionMutationFlow } from '@/pages/electrical/useElecCalcCableSelectionMutationFlow';
import type { CalculationVariant } from '@/store/calculationVariantStore';
import type { ElectricalCalcSummary } from '@/types/calculation';
import type { ProjectObject } from '@/types/project';

vi.mock('antd', () => ({
  message: {
    success: vi.fn(),
    error: vi.fn(),
  },
}));

vi.mock('@/api/calculations', () => ({
  selectCableForVariants: vi.fn(),
}));

function createWrapper() {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: { retry: false },
      mutations: { retry: false },
    },
  });
  return function Wrapper({ children }: { children: ReactNode }) {
    return <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>;
  };
}

function projectObject(overrides: Partial<ProjectObject> = {}): ProjectObject {
  return {
    id: 'object-1',
    project_id: 'project-1',
    object_type: 'pipe',
    sort_order: 1,
    version: 1,
    params: { name: 'Труба-1' },
    results: {},
    is_valid: true,
    validation_errors: null,
    created_at: '2026-06-01T00:00:00Z',
    updated_at: '2026-06-01T00:00:00Z',
    ...overrides,
  };
}

function calculation(overrides: Partial<ElectricalCalcSummary> = {}): ElectricalCalcSummary {
  return {
    id: 'calc-1',
    project_id: 'project-1',
    object_id: 'object-1',
    cable_type: 'self_regulating',
    cable_mark: 'ТЛТ-30',
    variant_number: 2,
    params: {},
    results: {},
    ...overrides,
  };
}

function option(
  source: 'builtin' | 'extended',
  mark: string,
): [string, CableMarkSelectOption] {
  const value = cableMarkOptionValue(source, mark);
  return [value, {
    value,
    label: mark,
    searchLabel: mark,
    mark,
    optionSource: source,
    cableSource: source,
  }];
}

function setup(
  overrides: Partial<Parameters<typeof useElecCalcCableSelectionMutationFlow>[0]> = {},
) {
  const closeCableMarkModal = vi.fn();
  const setElectricalQueryCalculation = vi.fn();
  const defaultOption = option('extended', '30ТТВ2-СР');
  const options = {
    projectId: 'project-1',
    variant: 2 as const,
    effectiveSource: 'all' as const,
    recalc: {
      selectionPolicy: 'technical_minimum' as const,
      supplyVoltage: 220,
      connectionType: 'line_1ph',
      windingCoefficient: 1.1,
      heatingHeight: 0.25,
      layingStep: 0.12,
      maintainTemperature: 80,
      vaporTemperature: 140,
      aggressiveProduct: true,
    },
    normalizeAvailableCableType: (type: CableTypeKey) => type,
    setElectricalQueryCalculation,
    cableMarkModalObject: projectObject(),
    cableMarkModalCableType: 'self_regulating_tt' as CableTypeKey,
    cableMarkModalValue: defaultOption[0],
    cableMarkModalTargetVariantsForSubmit: [2, 4] as CalculationVariant[],
    cableMarkModalOptionByValue: new Map([defaultOption]),
    closeCableMarkModal,
    ...overrides,
  };
  return {
    closeCableMarkModal,
    setElectricalQueryCalculation,
    ...renderHook(() => useElecCalcCableSelectionMutationFlow(options), {
      wrapper: createWrapper(),
    }),
  };
}

describe('useElecCalcCableSelectionMutationFlow', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(selectCableForVariants).mockResolvedValue([calculation()]);
  });

  it('sends manual cable selection payload with target variants and selected source', async () => {
    const { result } = setup();

    await act(async () => {
      await result.current.manualCableMut.mutateAsync({
        objectId: 'object-1',
        mark: '30ТТВ2-СР',
        cableType: 'self_regulating_tt',
        cableSource: 'extended',
        targetVariants: [2, 4],
      });
    });

    expect(selectCableForVariants).toHaveBeenCalledWith(
      'object-1',
      '30ТТВ2-СР',
      'extended',
      [2, 4],
      'self_regulating_tt',
      {
        supplyVoltage: 220,
        selectionMode: undefined,
        selectionPolicy: 'technical_minimum',
        connectionType: 'line_1ph',
        windingCoefficient: 1.1,
        heatingHeight: 0.25,
        layingStep: 0.12,
        maintainTemperature: 80,
        vaporTemperature: 140,
        aggressiveProduct: true,
      },
    );
    expect(message.success).toHaveBeenCalledWith('Кабель выбран, расчёт обновлён: СО2, СО4');
  });

  it('falls back auto selection to the active variant and effective source', async () => {
    const { result } = setup({ effectiveSource: 'builtin' });

    await act(async () => {
      await result.current.autoCableMut.mutateAsync({
        objectId: 'object-1',
        cableType: 'single_core',
        targetVariants: [],
      });
    });

    expect(selectCableForVariants).toHaveBeenCalledWith(
      'object-1',
      null,
      'builtin',
      [2],
      'single_core',
      expect.objectContaining({
        selectionMode: 'auto',
        selectionPolicy: 'technical_minimum',
        connectionType: 'line_1ph',
      }),
    );
    expect(message.success).toHaveBeenCalledWith('Автоподбор выполнен');
  });

  it('sends layout edit payload and writes returned calculations to page cache helper', async () => {
    const { result, setElectricalQueryCalculation } = setup();
    vi.mocked(selectCableForVariants).mockResolvedValue([
      calculation({ id: 'calc-updated', cable_mark: 'ТЛТ-30' }),
    ]);

    await act(async () => {
      await result.current.electricalLayoutMut.mutateAsync({
        objectId: 'object-1',
        cableMark: null,
        cableSource: 'all',
        cableType: 'self_regulating',
        windingPitchMm: 400,
        numberOfThreads: 2,
      });
    });

    expect(selectCableForVariants).toHaveBeenCalledWith(
      'object-1',
      null,
      'all',
      [2],
      'self_regulating',
      expect.objectContaining({
        windingPitchMm: 400,
        numberOfThreads: 2,
        layingStep: 0.12,
        aggressiveProduct: true,
      }),
    );
    expect(setElectricalQueryCalculation).toHaveBeenCalledWith(
      expect.objectContaining({ id: 'calc-updated' }),
    );
    expect(message.success).toHaveBeenCalledWith('Параметры укладки сохранены, расчёт обновлён');
  });

  it('applies selected modal mark and closes the modal only after success', async () => {
    const selected = option('extended', '30ТТВ2-СР');
    const { result, closeCableMarkModal } = setup({
      cableMarkModalValue: selected[0],
      cableMarkModalOptionByValue: new Map([selected]),
    });

    act(() => {
      result.current.applyCableMarkModal();
    });

    await waitFor(() => {
      expect(selectCableForVariants).toHaveBeenCalledWith(
        'object-1',
        '30ТТВ2-СР',
        'extended',
        [2, 4],
        'self_regulating_tt',
        expect.any(Object),
      );
      expect(closeCableMarkModal).toHaveBeenCalledTimes(1);
    });
  });

  it('keeps the modal open when auto apply fails', async () => {
    vi.mocked(selectCableForVariants).mockRejectedValueOnce(new Error('auto failed'));
    const { result, closeCableMarkModal } = setup({
      cableMarkModalValue: AUTO_CABLE_MARK_VALUE,
      cableMarkModalOptionByValue: new Map(),
    });

    act(() => {
      result.current.applyCableMarkModal();
    });

    await waitFor(() => {
      expect(message.error).toHaveBeenCalledWith('auto failed');
    });
    expect(closeCableMarkModal).not.toHaveBeenCalled();
  });
});
