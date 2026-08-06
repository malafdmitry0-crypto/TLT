import type { ReactNode } from 'react';
import { act, renderHook, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { appMessage as message } from '@/feedback/appFeedback';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import {
  selectCableForVariants,
} from '@/api/calculations';
import { patchElectricalAssignmentOverrides } from '@/api/electricalVariants';
import {
  AUTO_CABLE_MARK_VALUE,
  cableMarkOptionValue,
  type CableMarkSelectOption,
} from '@/pages/electrical/elecCalcCableOptionModel';
import type { CableTypeKey } from '@/domain/electrical/elecCalcMainTableModel';
import { useElecCalcCableSelectionMutationFlow } from '@/pages/electrical/useElecCalcCableSelectionMutationFlow';
import type { ElectricalCalcSummary } from '@/types/calculation';
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

describe('useElecCalcCableSelectionMutationFlow — modal-readonly', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(selectCableForVariants).mockResolvedValue([calculation()]);
    vi.mocked(patchElectricalAssignmentOverrides).mockResolvedValue({
      id: 'assignment-1',
      project_id: 'project-1',
      electrical_variant_id: ER_2_ID,
      object_id: 'object-1',
      system_type: 'self_regulating',
      assignment_state: 'stale',
      requested_cable_type: 'self_regulating_tt',
      electrical_overrides: {},
      object_version_snapshot: 1,
      version: 8,
      diagnostics: {},
      object: projectObject(),
      created_at: '2026-06-01T00:00:00Z',
      updated_at: '2026-06-01T00:00:00Z',
    });
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
        {
          2: ER_2_ID,
          4: ER_4_ID,
        },
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
  it('rejects direct cable and layout mutations when the project is read-only', async () => {
    const { result, closeCableMarkModal } = setup({ canMutate: false });
    const denied = 'Недостаточно прав для изменения электрорасчёта';

    await act(async () => {
      await expect(result.current.manualCableMut.mutateAsync({
        objectId: 'object-1',
        mark: '30ТТВ2-СР',
        cableType: 'self_regulating_tt',
        cableSource: 'extended',
        targetVariants: [ER_2_TARGET],
      })).rejects.toThrow(denied);
      await expect(result.current.autoCableMut.mutateAsync({
        objectId: 'object-1',
        cableType: 'self_regulating',
        targetVariants: [ER_2_TARGET],
      })).rejects.toThrow(denied);
      await expect(result.current.electricalLayoutMut.mutateAsync({
        objectId: 'object-1',
        cableMark: null,
        cableSource: 'builtin',
        cableType: 'self_regulating',
        windingPitchMm: 300,
        numberOfThreads: 2,
      })).rejects.toThrow(denied);
    });

    act(() => result.current.applyCableMarkModal());

    expect(selectCableForVariants).not.toHaveBeenCalled();
    expect(closeCableMarkModal).not.toHaveBeenCalled();
    expect(message.warning).toHaveBeenCalledWith(expect.stringContaining(denied));
  });
});
