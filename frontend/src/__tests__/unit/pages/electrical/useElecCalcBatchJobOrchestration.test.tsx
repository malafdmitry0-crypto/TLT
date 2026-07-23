import type { ReactNode } from 'react';
import { act, renderHook } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { message } from 'antd';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { cancelCalcTask, enqueueElectricalVariantBatchJob } from '@/api/calculations';
import { useElecCalcBatchJobOrchestration } from '@/pages/electrical/useElecCalcBatchJobOrchestration';
import type { CableTypeKey } from '@/domain/electrical/elecCalcMainTableModel';
import type {
  ElectricalBatchJobCompletion,
  TrackedElectricalBatchJob,
} from '@/pages/electrical/useElectricalBatchJobTracker';
import type { CalculationTaskResponse } from '@/types/calculation';

vi.mock('antd', () => ({
  message: {
    info: vi.fn(),
    success: vi.fn(),
    warning: vi.fn(),
    error: vi.fn(),
  },
}));

vi.mock('@/api/calculations', () => ({
  cancelCalcTask: vi.fn(),
  enqueueElectricalVariantBatchJob: vi.fn(),
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
  const registerJob = vi.fn(() => true);
  const options: Parameters<typeof useElecCalcBatchJobOrchestration>[0] = {
    canMutate: true,
    projectId: 'project-1',
    electricalVariantId: '11111111-1111-4111-8111-111111111111',
    electricalVariantName: 'Основное ЭР',
    trackedJob: null,
    completion: null,
    registerJob,
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
    ...overrides,
  };
  return {
    options,
    registerJob,
    setCableTypeDraftByObjectId,
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
    electrical_variant_id: '11111111-1111-4111-8111-111111111111',
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
    vi.mocked(enqueueElectricalVariantBatchJob).mockResolvedValue(task() as never);
  });

  it('enqueues selected batch with electrical params, skip_manual and object overrides', async () => {
    const { result, options, registerJob } = setup();

    await act(async () => {
      await result.current.batchMut.mutateAsync({
        scope: 'selected',
        objectIds: ['object-1'],
        skipManual: false,
      });
    });

    expect(options.objectOverridesForIds).toHaveBeenCalledWith(['object-1']);
    expect(enqueueElectricalVariantBatchJob).toHaveBeenCalledWith(
      'project-1',
      '11111111-1111-4111-8111-111111111111',
      'builtin',
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
    expect(registerJob).toHaveBeenCalledWith(
      expect.objectContaining({ id: 'task-1' }),
      {
        projectId: 'project-1',
        electricalVariantId: '11111111-1111-4111-8111-111111111111',
        electricalVariantName: 'Основное ЭР',
        scope: 'selected',
        objectIds: ['object-1'],
      },
    );
    expect(message.info).not.toHaveBeenCalled();
  });

  it('rejects a second enqueue while the exact ER already has a tracked job', async () => {
    const trackedJob = {
      taskId: 'task-existing',
      projectId: 'project-1',
      electricalVariantId: '11111111-1111-4111-8111-111111111111',
      electricalVariantName: 'Основное ЭР',
      scope: 'all',
      objectIds: [],
      latestTask: task({ id: 'task-existing' }) as CalculationTaskResponse,
      error: null,
    } satisfies TrackedElectricalBatchJob;
    const { result } = setup({ trackedJob });

    await expect(result.current.batchMut.mutateAsync({ scope: 'all' }))
      .rejects.toThrow('уже выполняется электрорасчёт');
    expect(enqueueElectricalVariantBatchJob).not.toHaveBeenCalled();
  });

  it('blocks enqueue defensively for a read-only project', async () => {
    const { result } = setup({ canMutate: false });

    await expect(result.current.batchMut.mutateAsync({ scope: 'all' }))
      .rejects.toThrow('режиме просмотра');
    expect(enqueueElectricalVariantBatchJob).not.toHaveBeenCalled();
  });

  it('cancels the tracked task and keeps its immutable ER descriptor', async () => {
    const trackedJob = {
      taskId: 'task-existing',
      projectId: 'project-1',
      electricalVariantId: '11111111-1111-4111-8111-111111111111',
      electricalVariantName: 'Основное ЭР',
      scope: 'selected',
      objectIds: ['object-1'],
      latestTask: task({ id: 'task-existing' }) as CalculationTaskResponse,
      error: null,
    } satisfies TrackedElectricalBatchJob;
    vi.mocked(cancelCalcTask).mockResolvedValue(task({
      id: 'task-existing',
      status: 'cancelled',
    }) as never);
    const { result, registerJob } = setup({ trackedJob });

    await act(async () => {
      await result.current.cancelJobMut.mutateAsync();
    });

    expect(cancelCalcTask).toHaveBeenCalledWith('task-existing');
    expect(registerJob).toHaveBeenCalledWith(
      expect.objectContaining({ id: 'task-existing', status: 'cancelled' }),
      {
        projectId: 'project-1',
        electricalVariantId: '11111111-1111-4111-8111-111111111111',
        electricalVariantName: 'Основное ЭР',
        scope: 'selected',
        objectIds: ['object-1'],
      },
    );
  });

  it('clears only draft rows completed for this ER and processes a task once', () => {
    const completion = {
      taskId: 'task-completed',
      projectId: 'project-1',
      electricalVariantId: '11111111-1111-4111-8111-111111111111',
      electricalVariantName: 'Основное ЭР',
      scope: 'selected',
      objectIds: ['object-1'],
      status: 'succeeded',
      task: task({
        id: 'task-completed',
        status: 'succeeded',
        result: { scope: 'selected', calculated: 1, skipped: 0, heat_loss_failed: 0 },
      }) as CalculationTaskResponse,
    } satisfies ElectricalBatchJobCompletion;
    const { setCableTypeDraftByObjectId, rerender } = setup({ completion });

    expect(setCableTypeDraftByObjectId).toHaveBeenCalledTimes(1);
    const updater = setCableTypeDraftByObjectId.mock.calls[0]?.[0] as (
      previous: Record<string, CableTypeKey>,
    ) => Record<string, CableTypeKey>;
    expect(updater({
      'object-1': 'three_core',
      'object-2': 'self_regulating',
    })).toEqual({ 'object-2': 'self_regulating' });

    rerender();
    expect(setCableTypeDraftByObjectId).toHaveBeenCalledTimes(1);
  });
});
