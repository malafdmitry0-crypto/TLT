import type { ReactNode } from 'react';
import { act, renderHook, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { appMessage as message } from '@/feedback/appFeedback';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { getCalcTask } from '@/api/calculations';
import { electricalDataQueryKeys } from '@/api/electricalQueryKeys';
import {
  useElectricalBatchJobTracker,
  type ElectricalBatchJobMetadata,
} from '@/pages/electrical/useElectricalBatchJobTracker';
import type {
  CalculationTaskResponse,
  CalculationTaskStatus,
} from '@/types/calculation';

vi.mock('@/feedback/appFeedback', () => ({
  appMessage: {

    info: vi.fn(),
    success: vi.fn(),
    warning: vi.fn(),
    error: vi.fn(),
  
  },
}));

vi.mock('@/api/calculations', () => ({
  getCalcTask: vi.fn(),
}));

const ER_ONE = '11111111-1111-4111-8111-111111111111';
const ER_TWO = '22222222-2222-4222-8222-222222222222';

function metadata(
  electricalVariantId: string,
  electricalVariantName: string,
  overrides: Partial<ElectricalBatchJobMetadata> = {},
): ElectricalBatchJobMetadata {
  return {
    projectId: 'project-1',
    electricalVariantId,
    electricalVariantName,
    scope: 'all',
    ...overrides,
  };
}

function task(
  id: string,
  electricalVariantId: string,
  status: CalculationTaskStatus = 'running',
  overrides: Partial<CalculationTaskResponse> = {},
): CalculationTaskResponse {
  return {
    id,
    type: 'electrical_batch',
    status,
    project_id: 'project-1',
    electrical_variant_id: electricalVariantId,
    progress: { current: 0, total: 2, phase: null, percent: 0 },
    result: null,
    error_message: null,
    cancel_requested: false,
    created_at: '2026-07-18T00:00:00Z',
    started_at: '2026-07-18T00:00:01Z',
    finished_at: null,
    links: { status: '', result: '', cancel: '' },
    ...overrides,
  };
}

function setup() {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: { retry: false },
    },
  });
  const wrapper = ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
  );
  return {
    queryClient,
    ...renderHook(() => useElectricalBatchJobTracker(), { wrapper }),
  };
}

describe('useElectricalBatchJobTracker', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('tracks two concurrent ER jobs in parent-local state with stable registration methods', () => {
    const { result, rerender } = setup();
    const registerJob = result.current.registerJob;
    const registerJobId = result.current.registerJobId;

    act(() => {
      result.current.registerJob(
        task('task-er-1', ER_ONE),
        metadata(ER_ONE, 'Основной ЭР', {
          scope: 'selected',
          objectIds: ['object-1', 'object-2'],
        }),
      );
      result.current.registerJob(
        task('task-er-2', ER_TWO, 'queued'),
        metadata(ER_TWO, 'Резервный ЭР'),
      );
    });

    rerender();

    expect(result.current.registerJob).toBe(registerJob);
    expect(result.current.registerJobId).toBe(registerJobId);
    expect(result.current.trackedJobs).toHaveLength(2);
    expect(result.current.trackedJobs).toEqual(expect.arrayContaining([
      expect.objectContaining({
        taskId: 'task-er-1',
        electricalVariantId: ER_ONE,
        electricalVariantName: 'Основной ЭР',
        objectIds: ['object-1', 'object-2'],
        latestTask: expect.objectContaining({ id: 'task-er-1' }),
      }),
      expect.objectContaining({
        taskId: 'task-er-2',
        electricalVariantId: ER_TWO,
        electricalVariantName: 'Резервный ЭР',
        latestTask: expect.objectContaining({ id: 'task-er-2' }),
      }),
    ]));
    expect(message.info).toHaveBeenCalledWith(
      'Основной ЭР · электрорасчёт выбранных объектов (2) поставлен в очередь',
    );
    expect(message.info).toHaveBeenCalledWith(
      'Резервный ЭР · электрорасчёт всех объектов поставлен в очередь',
    );
  });

  it('invalidates only the exact UUID variant and project summary after success', async () => {
    const { queryClient, result } = setup();
    const invalidate = vi.spyOn(queryClient, 'invalidateQueries').mockResolvedValue();
    const succeededTask = task('task-success', ER_TWO, 'succeeded', {
      finished_at: '2026-07-18T00:00:04Z',
      result: {
        calculated: 2,
        skipped: 0,
        heat_loss_failed: 0,
        errors: [],
        results: [],
      },
    });

    act(() => {
      result.current.registerJob(
        succeededTask,
        metadata(ER_TWO, 'ЭР для склада', {
          scope: 'selected',
          objectIds: ['object-8', 'object-9'],
        }),
      );
    });

    await waitFor(() => {
      expect(result.current.completionByVariant[ER_TWO]?.status).toBe('succeeded');
      expect(result.current.trackedJobs).toHaveLength(0);
    });

    expect(invalidate).toHaveBeenCalledTimes(2);
    expect(invalidate).toHaveBeenCalledWith({
      queryKey: electricalDataQueryKeys.variant('project-1', ER_TWO),
    });
    expect(invalidate).toHaveBeenCalledWith({
      queryKey: ['project', 'project-1', 'objects', 'summary'],
    });
    expect(invalidate).not.toHaveBeenCalledWith({
      queryKey: electricalDataQueryKeys.variant('project-1', ER_ONE),
    });
    expect(message.success).toHaveBeenCalledWith(
      'ЭР для склада · расчёт выполнен для выбранных объектов (2): 2',
    );
  });

  it('loads a navigation job id but rejects a project/ER mismatch without invalidation', async () => {
    const { queryClient, result } = setup();
    const invalidate = vi.spyOn(queryClient, 'invalidateQueries').mockResolvedValue();
    vi.mocked(getCalcTask).mockResolvedValue(task('task-mismatch', ER_TWO, 'succeeded', {
      finished_at: '2026-07-18T00:00:05Z',
      result: {
        calculated: 99,
        skipped: 0,
        heat_loss_failed: 0,
        errors: [],
        results: [],
      },
    }));

    act(() => {
      result.current.registerJobId(
        'task-mismatch',
        metadata(ER_ONE, 'Ожидаемый ЭР', {
          scope: 'selected',
          objectIds: ['object-expected'],
        }),
      );
    });

    await waitFor(() => {
      expect(result.current.completionByVariant[ER_ONE]?.status).toBe('mismatch');
      expect(result.current.trackedJobs).toHaveLength(0);
    });

    expect(getCalcTask).toHaveBeenCalledWith('task-mismatch');
    expect(invalidate).not.toHaveBeenCalled();
    expect(message.success).not.toHaveBeenCalled();
    expect(message.error).toHaveBeenCalledWith(
      'Ожидаемый ЭР · ответ задачи для выбранных объектов (1) '
      + 'не соответствует проекту или ЭР; данные не обновлены',
    );
  });

  it('retries a transient first lookup failure and completes the restored job', async () => {
    const { result } = setup();
    vi.mocked(getCalcTask)
      .mockRejectedValueOnce(new Error('temporary network error'))
      .mockResolvedValueOnce(task('task-retry', ER_ONE, 'succeeded', {
        finished_at: '2026-07-18T00:00:06Z',
        result: {
          calculated: 1,
          skipped: 0,
          heat_loss_failed: 0,
          errors: [],
          results: [],
        },
      }));

    act(() => {
      result.current.registerJobId('task-retry', metadata(ER_ONE, 'Основной ЭР'));
    });

    await waitFor(() => {
      expect(result.current.completionByVariant[ER_ONE]?.status).toBe('succeeded');
      expect(result.current.trackedJobs).toHaveLength(0);
    }, { timeout: 3_000 });
    expect(getCalcTask).toHaveBeenCalledTimes(2);
  });

  it('releases the ER after bounded lookup failures instead of deadlocking controls', async () => {
    const { result } = setup();
    vi.mocked(getCalcTask).mockRejectedValue(new Error('task endpoint unavailable'));

    act(() => {
      result.current.registerJobId('task-unavailable', metadata(ER_ONE, 'Основной ЭР'));
    });

    await waitFor(() => {
      expect(result.current.completionByVariant[ER_ONE]).toEqual(expect.objectContaining({
        taskId: 'task-unavailable',
        status: 'failed',
        task: null,
      }));
      expect(result.current.trackedJobs).toHaveLength(0);
    }, { timeout: 3_000 });

    expect(getCalcTask).toHaveBeenCalledTimes(3);
    expect(message.error).toHaveBeenCalledWith(
      'Основной ЭР · не удалось получить состояние расчёта всех объектов: '
      + 'task endpoint unavailable',
    );
  });

  it('rejects a registered task from another project before tracking or announcing it', () => {
    const { queryClient, result } = setup();
    const invalidate = vi.spyOn(queryClient, 'invalidateQueries').mockResolvedValue();

    let accepted = true;
    act(() => {
      accepted = result.current.registerJob(
        task('task-other-project', ER_ONE, 'queued', { project_id: 'project-foreign' }),
        metadata(ER_ONE, 'Основной ЭР'),
      );
    });

    expect(accepted).toBe(false);
    expect(result.current.trackedJobs).toHaveLength(0);
    expect(result.current.completionByVariant[ER_ONE]).toEqual(expect.objectContaining({
      taskId: 'task-other-project',
      status: 'mismatch',
    }));
    expect(message.info).not.toHaveBeenCalled();
    expect(message.error).toHaveBeenCalledWith(
      'Основной ЭР · ответ задачи для всех объектов '
      + 'не соответствует проекту или ЭР; данные не обновлены',
    );
    expect(invalidate).not.toHaveBeenCalled();
  });

  it('records failed and cancelled terminal jobs with descriptor-aware messages', async () => {
    const { result } = setup();

    act(() => {
      result.current.registerJob(
        task('task-failed', ER_ONE, 'failed', {
          error_message: 'Каталог недоступен',
          finished_at: '2026-07-18T00:00:07Z',
        }),
        metadata(ER_ONE, 'Основной ЭР', {
          scope: 'selected',
          objectIds: ['object-1'],
        }),
      );
      result.current.registerJob(
        task('task-cancelled', ER_TWO, 'cancelled', {
          finished_at: '2026-07-18T00:00:08Z',
        }),
        metadata(ER_TWO, 'Резервный ЭР'),
      );
    });

    await waitFor(() => {
      expect(result.current.completionByVariant[ER_ONE]?.status).toBe('failed');
      expect(result.current.completionByVariant[ER_TWO]?.status).toBe('cancelled');
    });

    expect(message.error).toHaveBeenCalledWith(
      'Основной ЭР · электрорасчёт выбранных объектов (1) '
      + 'завершился ошибкой: Каталог недоступен',
    );
    expect(message.warning).toHaveBeenCalledWith(
      'Резервный ЭР · электрорасчёт всех объектов отменён',
    );
  });
});
