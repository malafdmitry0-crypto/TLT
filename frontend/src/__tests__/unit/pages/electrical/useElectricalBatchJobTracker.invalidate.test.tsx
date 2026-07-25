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

describe('useElectricalBatchJobTracker — success invalidate / nav mismatch', () => {
  beforeEach(() => {
    vi.clearAllMocks();
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

});
