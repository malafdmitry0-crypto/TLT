import type { ReactNode } from 'react';
import { act, renderHook } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { Modal, message } from 'antd';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import {
  copyElectricalVariant,
  enqueueElectricalBatchJob,
} from '@/api/calculations';
import { useElecCalcBatchJobOrchestration } from '@/pages/electrical/useElecCalcBatchJobOrchestration';
import type { CableTypeKey } from '@/pages/electrical/elecCalcMainTableModel';

vi.mock('antd', () => ({
  Modal: {
    confirm: vi.fn(),
  },
  message: {
    info: vi.fn(),
    success: vi.fn(),
    warning: vi.fn(),
    error: vi.fn(),
  },
}));

vi.mock('@/api/calculations', () => ({
  cancelCalcTask: vi.fn(),
  copyElectricalVariant: vi.fn(),
  enqueueElectricalBatchJob: vi.fn(),
  getCalcTask: vi.fn(),
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

function setup(overrides: Partial<Parameters<typeof useElecCalcBatchJobOrchestration>[0]> = {}) {
  const setCableTypeDraftByObjectId = vi.fn();
  const resetTablePageAndCursors = vi.fn();
  const setSelectedRowKeys = vi.fn();
  const setVariant = vi.fn();
  const options = {
    initialActiveJobId: null,
    projectId: 'project-1',
    variant: 1 as const,
    effectiveSource: 'builtin' as const,
    recalc: {
      selectionPolicy: 'technical_minimum' as const,
      supplyVoltage: 220,
      connectionType: 'line_1ph',
      windingCoefficient: 1.05,
      heatingHeight: 0.2,
      layingStep: 0.12,
      maintainTemperature: 60,
      vaporTemperature: 120,
      aggressiveProduct: false,
    },
    selectedCableType: null,
    defaultCableType: 'single_core' as CableTypeKey,
    cableTypeForRecalculation: 'self_regulating' as CableTypeKey,
    normalizeAvailableCableType: (type: CableTypeKey | null | undefined) =>
      type ?? 'self_regulating',
    objectOverridesForIds: vi.fn(() => [
      { object_id: 'object-1', cable_type: 'three_core' as CableTypeKey },
    ]),
    setCableTypeDraftByObjectId,
    resetTablePageAndCursors,
    setSelectedRowKeys,
    setVariant,
    ...overrides,
  };
  return {
    options,
    setCableTypeDraftByObjectId,
    resetTablePageAndCursors,
    setSelectedRowKeys,
    setVariant,
    ...renderHook(() => useElecCalcBatchJobOrchestration(options), {
      wrapper: createWrapper(),
    }),
  };
}

function task(overrides: Record<string, unknown> = {}) {
  return {
    id: 'task-1',
    type: 'electrical_batch',
    status: 'running',
    project_id: 'project-1',
    progress: { current: 0, total: 1, phase: null, percent: 0 },
    result: null,
    error_message: null,
    cancel_requested: false,
    created_at: '2026-06-01T00:00:00Z',
    started_at: null,
    finished_at: null,
    links: { status: '', result: '', cancel: '' },
    ...overrides,
  };
}

describe('useElecCalcBatchJobOrchestration', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(enqueueElectricalBatchJob).mockResolvedValue(task() as never);
    vi.mocked(copyElectricalVariant).mockResolvedValue({
      project_id: 'project-1',
      source_variant_number: 1,
      target_variant_number: 2,
      copied_count: 3,
      project_objects_count: 5,
      deleted_target_count: 0,
      overwrite_applied: false,
      specification_regenerated: true,
      validated_count: 2,
      validation_failed_count: 1,
    });
  });

  it('enqueues selected batch with electrical params, skip_manual and object overrides', async () => {
    const { result, options } = setup();

    await act(async () => {
      await result.current.batchMut.mutateAsync({
        scope: 'selected',
        objectIds: ['object-1'],
        skipManual: false,
      });
    });

    expect(options.objectOverridesForIds).toHaveBeenCalledWith(['object-1']);
    expect(enqueueElectricalBatchJob).toHaveBeenCalledWith(
      'project-1',
      'builtin',
      1,
      'single_core',
      expect.objectContaining({
        supplyVoltage: 220,
        selectionMode: 'auto',
        selectionPolicy: 'technical_minimum',
        connectionType: 'line_1ph',
        windingCoefficient: 1.05,
        heatingHeight: 0.2,
        layingStep: 0.12,
        maintainTemperature: 60,
        vaporTemperature: 120,
        aggressiveProduct: false,
        skipManual: false,
        objectIds: ['object-1'],
        objectOverrides: [{ object_id: 'object-1', cable_type: 'three_core' }],
      }),
    );
    expect(message.info).toHaveBeenCalledWith(
      'СО1 · электрорасчёт выбранных объектов поставлен в очередь',
    );
  });

  it('copies variant without starting batch recalculation and resets page state', async () => {
    const {
      result,
      resetTablePageAndCursors,
      setCableTypeDraftByObjectId,
      setSelectedRowKeys,
      setVariant,
    } = setup();

    await act(async () => {
      await result.current.copyVariantMut.mutateAsync({ targetVariant: 2 });
    });

    expect(copyElectricalVariant).toHaveBeenCalledWith({
      project_id: 'project-1',
      source_variant_number: 1,
      target_variant_number: 2,
      overwrite: false,
      regenerate_specification: true,
    });
    expect(enqueueElectricalBatchJob).not.toHaveBeenCalled();
    expect(resetTablePageAndCursors).toHaveBeenCalledTimes(1);
    expect(setSelectedRowKeys).toHaveBeenCalledWith([]);
    expect(setCableTypeDraftByObjectId).toHaveBeenCalledWith({});
    expect(setVariant).toHaveBeenCalledWith(2);
    expect(message.success).toHaveBeenCalledWith(
      'СО2 создан на основании СО1: скопировано 3, успешно проверено 2',
    );
    expect(message.warning).toHaveBeenCalledWith(
      'В СО2 есть ошибки проверки скопированного выбора: 1. Новый кабель автоматически не подбирался.',
    );
    expect(message.info).toHaveBeenCalledWith(
      'В проекте объектов: 5, скопировано расчётов: 3. Остальные в СО2 не рассчитаны.',
    );
  });

  it('asks for overwrite confirmation when target variant is not empty', async () => {
    const error = Object.assign(new Error('target not empty'), {
      status: 409,
      code: 'target_not_empty',
    });
    vi.mocked(copyElectricalVariant).mockRejectedValue(error);
    const { result } = setup();

    await act(async () => {
      await expect(result.current.copyVariantMut.mutateAsync({ targetVariant: 2 }))
        .rejects.toThrow('target not empty');
    });

    expect(Modal.confirm).toHaveBeenCalledWith(expect.objectContaining({
      title: 'СО2 уже содержит расчёты',
      okText: 'Заменить',
      okButtonProps: { danger: true },
    }));
  });
});
