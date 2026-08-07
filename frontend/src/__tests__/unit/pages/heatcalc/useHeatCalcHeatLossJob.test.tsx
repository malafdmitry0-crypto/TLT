import type { ReactNode } from 'react';
import { act, renderHook, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { cancelCalcTask, enqueueHeatLossBatchJob, getCalcTask } from '@/api/calculations';
import { useHeatCalcHeatLossJob } from '@/pages/heatcalc/useHeatCalcHeatLossJob';
import type { CalculationTaskResponse, CalculationTaskStatus } from '@/types/calculation';
import type { ProjectObject } from '@/types/project';

vi.mock('@/api/calculations', () => ({
  cancelCalcTask: vi.fn(),
  enqueueHeatLossBatchJob: vi.fn(),
  getCalcTask: vi.fn(),
}));

function makeObject(overrides: Partial<ProjectObject> = {}): ProjectObject {
  return {
    id: 'pipe-1',
    project_id: 'project-1',
    object_type: 'pipe',
    sort_order: 0,
    params: { name: 'Труба DN100' },
    results: null,
    is_valid: true,
    validation_errors: null,
    created_at: '2024-01-01T00:00:00Z',
    updated_at: '2024-01-01T00:00:00Z',
    version: 1,
    ...overrides,
  };
}

function makeTask(overrides: Partial<CalculationTaskResponse> = {}): CalculationTaskResponse {
  const status: CalculationTaskStatus = overrides.status ?? 'queued';
  return {
    id: 'heat-task-1',
    type: 'heat_loss_batch',
    status,
    project_id: 'project-1',
    progress: { current: 0, total: null, phase: status, percent: null },
    result: null,
    error_message: null,
    cancel_requested: false,
    created_at: '2026-01-01T00:00:00Z',
    started_at: null,
    finished_at: null,
    links: {
      status: '/api/v1/calc/jobs/heat-task-1',
      result: '/api/v1/calc/jobs/heat-task-1/result',
      cancel: '/api/v1/calc/jobs/heat-task-1/cancel',
    },
    ...overrides,
  };
}

function setupHook(
  overrides: Partial<Parameters<typeof useHeatCalcHeatLossJob>[0]> = {},
) {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: { retry: false },
      mutations: { retry: false },
    },
  });
  const wrapper = ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
  );
  const rendered = renderHook(() => useHeatCalcHeatLossJob({
    dirtyDraftRowCount: 0,
    projectId: 'project-1',
    projectObjectCount: 2,
    selectedRowId: null,
    selectedVisibleRows: [],
    submittingObject: false,
    ...overrides,
  }), { wrapper });

  return { ...rendered, queryClient };
}

describe('useHeatCalcHeatLossJob', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    window.sessionStorage.clear();
    (enqueueHeatLossBatchJob as ReturnType<typeof vi.fn>).mockResolvedValue(makeTask());
    (getCalcTask as ReturnType<typeof vi.fn>).mockResolvedValue(makeTask({
      status: 'running',
      progress: { current: 1, total: 2, phase: 'calculate', percent: 50 },
    }));
    (cancelCalcTask as ReturnType<typeof vi.fn>).mockResolvedValue(makeTask({
      status: 'cancelled',
      cancel_requested: true,
    }));
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('sends selected row ids for scoped recalculation before the active row id', async () => {
    const first = makeObject({ id: 'pipe-1' });
    const second = makeObject({ id: 'pipe-2' });
    const { result } = setupHook({
      selectedRowId: 'pipe-active',
      selectedVisibleRows: [
        { record: first, sourceIndex: 0 },
        { record: second, sourceIndex: 1 },
      ],
    });

    expect(result.current.heatLossRecalcTooltip).toBe('Пересчитать теплопотери выбранных строк (2)');
    expect(result.current.heatLossScopedRecalcDisabled).toBe(false);

    await act(async () => {
      result.current.recalcScoped();
    });

    await waitFor(() => {
      expect(enqueueHeatLossBatchJob).toHaveBeenCalledWith('project-1', true, ['pipe-1', 'pipe-2']);
    });
  });

  it('uses the active row id when no selected rows exist', async () => {
    const { result } = setupHook({ selectedRowId: 'pipe-active' });

    await act(async () => {
      result.current.recalcScoped();
    });

    await waitFor(() => {
      expect(enqueueHeatLossBatchJob).toHaveBeenCalledWith('project-1', true, ['pipe-active']);
    });
    expect(result.current.heatLossRecalcAriaLabel).toBe('Пересчитать теплопотери активной строки');
  });

  it('disables recalculation while draft rows are dirty', () => {
    const { result } = setupHook({
      dirtyDraftRowCount: 1,
      selectedRowId: 'pipe-active',
    });

    expect(result.current.heatLossRecalcDisabled).toBe(true);
    expect(result.current.heatLossScopedRecalcDisabled).toBe(true);
    expect(result.current.heatLossRecalcTooltip).toBe(
      'Сохраните или сбросьте изменения в таблице перед пересчётом',
    );
    expect(result.current.heatLossRecalcAllTooltip).toBe(
      'Сохраните или сбросьте изменения в таблице перед пересчётом',
    );
  });

  it('disables recalculation for an empty project', () => {
    const { result } = setupHook({ projectObjectCount: 0 });

    expect(result.current.heatLossRecalcDisabled).toBe(true);
    expect(result.current.heatLossScopedRecalcDisabled).toBe(true);
    expect(result.current.heatLossRecalcTooltip).toBe('Добавьте объекты для пересчёта');
    expect(result.current.heatLossRecalcAllTooltip).toBe('Добавьте объекты для пересчёта');
  });

  it('tracks an active job and exposes the progress label', async () => {
    const { result } = setupHook();

    await act(async () => {
      result.current.recalcAll();
    });

    await waitFor(() => {
      expect(getCalcTask).toHaveBeenCalledWith('heat-task-1');
    });
    await waitFor(() => {
      expect(result.current.isHeatLossJobActive).toBe(true);
    });
    expect(result.current.activeHeatLossJobId).toBe('heat-task-1');
    expect(result.current.heatLossJobProgressLabel).toBe('1/2 (50%)');
    expect(result.current.heatLossRecalcDisabled).toBe(true);
  });

  it('restores a persisted job after remount and keeps controls locked during lookup failure', async () => {
    window.sessionStorage.setItem('tlt:active-calc-job:heat-loss:project-1', 'heat-restored');
    (getCalcTask as ReturnType<typeof vi.fn>).mockRejectedValue(new Error('status unavailable'));

    const { result } = setupHook();

    await waitFor(() => {
      expect(getCalcTask).toHaveBeenCalledWith('heat-restored');
      expect(result.current.activeHeatLossJobId).toBe('heat-restored');
      expect(result.current.isHeatLossJobActive).toBe(true);
      expect(result.current.heatLossRecalcDisabled).toBe(true);
      expect(result.current.heatLossJobIssue).toMatch(/остаётся активной/i);
    });
  });

  it('invalidates dependent project data and clears the job after success', async () => {
    (getCalcTask as ReturnType<typeof vi.fn>).mockResolvedValue(makeTask({
      status: 'succeeded',
      progress: { current: 1, total: 1, phase: 'done', percent: 100 },
      result: { updated: 1, failed: 0, errors: [] },
    }));
    const { result, queryClient } = setupHook();
    const invalidateSpy = vi.spyOn(queryClient, 'invalidateQueries');

    await act(async () => {
      result.current.recalcAll();
    });

    await waitFor(() => {
      expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: ['project', 'project-1', 'objects'] });
    });
    await waitFor(() => {
      expect(result.current.activeHeatLossJobId).toBeNull();
    });
  });

  it('clears the job after failure', async () => {
    (getCalcTask as ReturnType<typeof vi.fn>).mockResolvedValue(makeTask({
      status: 'failed',
      error_message: 'boom',
    }));
    const { result } = setupHook();

    await act(async () => {
      result.current.recalcAll();
    });

    await waitFor(() => {
      expect(getCalcTask).toHaveBeenCalledWith('heat-task-1');
    });
    await waitFor(() => {
      expect(result.current.activeHeatLossJobId).toBeNull();
    });
  });

  it('cancels the current job', async () => {
    const { result } = setupHook();

    await act(async () => {
      result.current.recalcAll();
    });
    await waitFor(() => {
      expect(result.current.activeHeatLossJobId).toBe('heat-task-1');
    });

    await act(async () => {
      result.current.cancelJob();
    });

    await waitFor(() => {
      expect(cancelCalcTask).toHaveBeenCalledWith('heat-task-1');
    });
  });
});
