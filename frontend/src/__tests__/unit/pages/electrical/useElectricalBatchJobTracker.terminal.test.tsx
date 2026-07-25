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

describe('useElectricalBatchJobTracker — failed / cancelled messages', () => {
  beforeEach(() => {
    vi.clearAllMocks();
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
