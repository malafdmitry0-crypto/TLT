/* eslint-disable @typescript-eslint/no-unused-vars -- scenario split keeps shared preamble */
import type { ReactNode } from 'react';
import { act, renderHook, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { message } from 'antd';
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

vi.mock('antd', () => ({
  message: {
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

describe('useElectricalBatchJobTracker — lookup retry / release / foreign reject', () => {
  beforeEach(() => {
    vi.clearAllMocks();
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

});
