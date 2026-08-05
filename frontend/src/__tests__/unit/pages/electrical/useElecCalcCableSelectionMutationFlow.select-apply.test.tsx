import type { ReactNode } from 'react';
import { act, renderHook } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { appMessage as message } from '@/feedback/appFeedback';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import {
  selectCableForVariants,
} from '@/api/calculations';
import { electricalDataQueryKeys } from '@/api/electricalQueryKeys';
import {
  electricalAssignmentQueryKeys,
  patchElectricalAssignmentOverrides,
} from '@/api/electricalVariants';
import {
  cableMarkOptionValue,
  type CableMarkSelectOption,
} from '@/pages/electrical/elecCalcCableOptionModel';
import type { CableTypeKey } from '@/domain/electrical/elecCalcMainTableModel';
import { useElecCalcCableSelectionMutationFlow } from '@/pages/electrical/useElecCalcCableSelectionMutationFlow';
import type { ElectricalCalcSummary } from '@/types/calculation';
import type { ElectricalAssignment } from '@/types/electricalVariant';
import type { ProjectObject } from '@/types/project';

vi.mock('@/feedback/appFeedback', () => ({
  appMessage: {

    success: vi.fn(),
    warning: vi.fn(),
    error: vi.fn(),
  
  },
}));

vi.mock('@/api/calculations', () => ({
  selectCableForVariants: vi.fn(),
}));

vi.mock('@/api/electricalVariants', async (importOriginal) => ({
  ...await importOriginal<typeof import('@/api/electricalVariants')>(),
  patchElectricalAssignmentOverrides: vi.fn(),
}));

const ER_1_ID = '11111111-1111-4111-8111-111111111111';
const ER_2_ID = '22222222-2222-4222-8222-222222222222';
const ER_4_ID = '44444444-4444-4444-8444-444444444444';
const ER_2_TARGET = {
  id: ER_2_ID,
  name: 'Летний ЭР',
  legacyVariantNumber: 2 as const,
};
const ER_4_TARGET = {
  id: ER_4_ID,
  name: 'Пиковый ЭР',
  legacyVariantNumber: 4 as const,
};

function createWrapper(queryClient: QueryClient) {
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

function assignmentResponse(
  overrides: Partial<ElectricalAssignment> = {},
): ElectricalAssignment {
  return {
    id: 'assignment-1',
    project_id: 'project-1',
    electrical_variant_id: ER_2_ID,
    object_id: 'object-1',
    system_type: 'self_regulating',
    assignment_state: 'stale',
    requested_cable_type: 'self_regulating_tt',
    max_section_start_current_a: null,
    electrical_overrides: {},
    object_version_snapshot: 1,
    version: 8,
    diagnostics: {},
    object: projectObject(),
    created_at: '2026-06-01T00:00:00Z',
    updated_at: '2026-06-01T00:00:00Z',
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
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: { retry: false },
      mutations: { retry: false },
    },
  });
  const closeCableMarkModal = vi.fn();
  const setElectricalQueryCalculation = vi.fn();
  const defaultOption = option('extended', '30ТТВ2-СР');
  const options: Parameters<typeof useElecCalcCableSelectionMutationFlow>[0] = {
    projectId: 'project-1',
    electricalVariantId: ER_2_ID,
    electricalVariantName: ER_2_TARGET.name,
    canMutate: true,
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
    assignmentByObjectId: new Map([[
      'object-1',
      {
        object_id: 'object-1',
        system_type: 'self_regulating',
        assignment_state: 'ready',
        version: 7,
      },
    ]]),
    objects: [projectObject()],
    cableMarkModalObject: projectObject(),
    cableMarkModalCableType: 'self_regulating_tt' as CableTypeKey,
    cableMarkModalValue: defaultOption[0],
    cableMarkModalTargetVariantsForSubmit: [ER_2_TARGET, ER_4_TARGET],
    cableMarkModalOptionByValue: new Map([defaultOption]),
    closeCableMarkModal,
    ...overrides,
  };
  return {
    closeCableMarkModal,
    setElectricalQueryCalculation,
    queryClient,
    ...renderHook(() => useElecCalcCableSelectionMutationFlow(options), {
      wrapper: createWrapper(queryClient),
    }),
  };
}

describe('useElecCalcCableSelectionMutationFlow — select-apply', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(selectCableForVariants).mockResolvedValue([calculation()]);
    vi.mocked(patchElectricalAssignmentOverrides).mockResolvedValue(assignmentResponse());
  });
  it('sends manual cable selection payload with target variants and selected source', async () => {
    const tank = projectObject({
      object_type: 'tank',
      params: { name: 'Резервуар-1', shape: 'cylindrical', steam_tracing: 'yes' },
    });
    const { result, setElectricalQueryCalculation, queryClient } = setup({
      objects: [tank],
      cableMarkModalObject: tank,
    });
    const currentQueryKey = [
      ...electricalDataQueryKeys.queries('project-1', ER_2_ID),
      { page: 1 },
    ] as const;
    const otherQueryKey = [
      ...electricalDataQueryKeys.queries('project-1', ER_4_ID),
      { page: 1 },
    ] as const;
    queryClient.setQueryData(currentQueryKey, {
      assignments: [{
        object_id: 'object-1',
        system_type: 'self_regulating',
        assignment_state: 'ready',
        version: 7,
      }],
    });
    queryClient.setQueryData(otherQueryKey, {
      assignments: [{
        object_id: 'object-1',
        system_type: 'self_regulating',
        assignment_state: 'ready',
        version: 19,
      }],
    });
    queryClient.setQueryData(
      electricalDataQueryKeys.variant('project-1', ER_1_ID),
      { marker: 'unrelated' },
    );
    queryClient.setQueryData(
      electricalDataQueryKeys.variant('project-1', ER_2_ID),
      { marker: 'target-2' },
    );
    queryClient.setQueryData(
      electricalDataQueryKeys.variant('project-1', ER_4_ID),
      { marker: 'target-4' },
    );

    await act(async () => {
      await result.current.manualCableMut.mutateAsync({
        objectId: 'object-1',
        mark: '30ТТВ2-СР',
        cableType: 'self_regulating_tt',
        cableSource: 'extended',
        targetVariants: [ER_2_TARGET, ER_4_TARGET],
      });
    });

    expect(patchElectricalAssignmentOverrides).toHaveBeenCalledTimes(1);
    expect(patchElectricalAssignmentOverrides).toHaveBeenCalledWith(
      'project-1',
      ER_2_ID,
      'object-1',
      {
        expected_version: 7,
        steam_temperature_c: 140,
        maintain_temperature_c: 80,
        aggressive_product: true,
        manual_cable_model: '30ТТВ2',
        tank_heating_height_m: 0.25,
        tank_laying_step_m: 0.12,
      },
    );
    expect(vi.mocked(patchElectricalAssignmentOverrides).mock.invocationCallOrder[0])
      .toBeLessThan(vi.mocked(selectCableForVariants).mock.invocationCallOrder[0]);
    expect(selectCableForVariants).toHaveBeenCalledWith(
      'object-1',
      '30ТТВ2-СР',
      'extended',
      [2, 4],
      'self_regulating_tt',
      {
        selectionMode: undefined,
        selectionPolicy: 'technical_minimum',
        heatingHeight: 0.25,
        layingStep: 0.12,
        maintainTemperature: 80,
        vaporTemperature: 140,
        aggressiveProduct: true,
      },
      {
        2: ER_2_ID,
        4: ER_4_ID,
      },
    );
    expect(queryClient.getQueryData(currentQueryKey)).toMatchObject({
      assignments: [{
        object_id: 'object-1',
        assignment_state: 'stale',
        version: 8,
      }],
    });
    expect(queryClient.getQueryData(otherQueryKey)).toMatchObject({
      assignments: [{
        object_id: 'object-1',
        assignment_state: 'ready',
        version: 19,
      }],
    });
    expect(setElectricalQueryCalculation).toHaveBeenCalledWith(
      expect.objectContaining({ id: 'calc-1' }),
      ER_2_TARGET,
    );
    expect(queryClient.getQueryState(
      electricalDataQueryKeys.variant('project-1', ER_2_ID),
    )?.isInvalidated).toBe(true);
    expect(queryClient.getQueryState(
      electricalDataQueryKeys.variant('project-1', ER_4_ID),
    )?.isInvalidated).toBe(true);
    expect(queryClient.getQueryState(
      electricalDataQueryKeys.variant('project-1', ER_1_ID),
    )?.isInvalidated).toBe(false);
    expect(message.success).toHaveBeenCalledWith(
      'Кабель выбран, расчёт обновлён: Летний ЭР, Пиковый ЭР',
    );
  });
  it('falls back auto selection to the active variant and effective source', async () => {
    const { result, setElectricalQueryCalculation } = setup({ effectiveSource: 'builtin' });

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
      { 2: ER_2_ID },
    );
    expect(patchElectricalAssignmentOverrides).not.toHaveBeenCalled();
    expect(setElectricalQueryCalculation).toHaveBeenCalledWith(
      expect.objectContaining({ id: 'calc-1' }),
      ER_2_TARGET,
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
        cableType: 'self_regulating_tt',
        windingPitchMm: 400,
        numberOfThreads: 2,
      });
    });

    expect(patchElectricalAssignmentOverrides).toHaveBeenCalledWith(
      'project-1',
      ER_2_ID,
      'object-1',
      {
        expected_version: 7,
        steam_temperature_c: 140,
        maintain_temperature_c: 80,
        aggressive_product: true,
        winding_pitch_mm: 400,
        thread_count: 2,
      },
    );
    expect(selectCableForVariants).toHaveBeenCalledWith(
      'object-1',
      null,
      'all',
      [2],
      'self_regulating_tt',
      {
        selectionMode: undefined,
        selectionPolicy: 'technical_minimum',
        windingPitchMm: 400,
        numberOfThreads: 2,
        maintainTemperature: 80,
        vaporTemperature: 140,
        aggressiveProduct: true,
      },
      { 2: ER_2_ID },
    );
    expect(setElectricalQueryCalculation).toHaveBeenCalledWith(
      expect.objectContaining({ id: 'calc-updated' }),
      ER_2_TARGET,
    );
    expect(message.success).toHaveBeenCalledWith('Параметры укладки сохранены, расчёт обновлён');
  });

  it('clears stale T2 and manual model before auto TT selection when steam is disabled', async () => {
    const pipe = projectObject({
      params: { name: 'Труба-1', steam_tracing: 'no', vapor_temperature: 190 },
    });
    const { result } = setup({
      objects: [pipe],
      cableMarkModalObject: pipe,
      recalc: {
        selectionPolicy: 'technical_minimum',
        supplyVoltage: 230,
        connectionType: 'line_1ph',
        windingCoefficient: 1,
        heatingHeight: null,
        layingStep: undefined,
        maintainTemperature: undefined,
        vaporTemperature: 190,
        aggressiveProduct: undefined,
      },
    });

    await act(async () => {
      await result.current.autoCableMut.mutateAsync({
        objectId: 'object-1',
        cableType: 'self_regulating_tt',
        targetVariants: [ER_2_TARGET],
      });
    });

    expect(patchElectricalAssignmentOverrides).toHaveBeenCalledWith(
      'project-1',
      ER_2_ID,
      'object-1',
      {
        expected_version: 7,
        steam_temperature_c: null,
        manual_cable_model: null,
      },
    );
    expect(selectCableForVariants).toHaveBeenCalledWith(
      'object-1',
      null,
      'all',
      [2],
      'self_regulating_tt',
      {
        selectionMode: undefined,
        selectionPolicy: 'technical_minimum',
      },
      { 2: ER_2_ID },
    );
  });

  it('refetches only the current UUID ER and skips calculation on assignment version conflict', async () => {
    const conflict = Object.assign(new Error('Версия assignment устарела'), {
      status: 409,
      code: 'ELECTRICAL_ASSIGNMENT_VERSION_CONFLICT',
    });
    vi.mocked(patchElectricalAssignmentOverrides).mockRejectedValueOnce(conflict);
    const { result, queryClient } = setup();
    const currentQueryKey = [
      ...electricalDataQueryKeys.queries('project-1', ER_2_ID),
      { page: 1 },
    ] as const;
    const otherQueryKey = [
      ...electricalDataQueryKeys.queries('project-1', ER_4_ID),
      { page: 1 },
    ] as const;
    queryClient.setQueryData(currentQueryKey, { assignments: [] });
    queryClient.setQueryData(otherQueryKey, { assignments: [] });
    queryClient.setQueryData(
      electricalAssignmentQueryKeys.root('project-1', ER_2_ID),
      { marker: 'current-assignments' },
    );
    queryClient.setQueryData(
      electricalAssignmentQueryKeys.root('project-1', ER_4_ID),
      { marker: 'other-assignments' },
    );

    await act(async () => {
      await expect(result.current.manualCableMut.mutateAsync({
        objectId: 'object-1',
        mark: '30ТТВ2-СР',
        cableType: 'self_regulating_tt',
        cableSource: 'extended',
        targetVariants: [ER_2_TARGET],
      })).rejects.toBe(conflict);
    });

    expect(selectCableForVariants).not.toHaveBeenCalled();
    expect(queryClient.getQueryState(currentQueryKey)?.isInvalidated).toBe(true);
    expect(queryClient.getQueryState(otherQueryKey)?.isInvalidated).toBe(false);
    expect(queryClient.getQueryState(
      electricalAssignmentQueryKeys.root('project-1', ER_2_ID),
    )?.isInvalidated).toBe(true);
    expect(queryClient.getQueryState(
      electricalAssignmentQueryKeys.root('project-1', ER_4_ID),
    )?.isInvalidated).toBe(false);
    expect(message.error).toHaveBeenCalledWith(
      'Данные текущего ЭР изменились. Обновили их — повторите действие.',
    );
  });
});
