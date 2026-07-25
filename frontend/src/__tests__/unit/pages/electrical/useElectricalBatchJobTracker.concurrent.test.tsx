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

describe('useElectricalBatchJobTracker — concurrent ER jobs', () => {
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

});
