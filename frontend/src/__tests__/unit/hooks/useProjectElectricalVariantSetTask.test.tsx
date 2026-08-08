import type { ReactNode } from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { renderHook, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import {
  getActiveElectricalVariantSetTask,
  getElectricalVariantSetTask,
} from '@/api/electricalVariantSetTasks';
import type { ElectricalVariantSetTask } from '@/api/electricalVariantSetTasks';
import { useProjectElectricalVariantSetTask } from '@/hooks/useProjectElectricalVariantSetTask';

vi.mock('@/api/electricalVariantSetTasks', () => ({
  cancelElectricalVariantSetTask: vi.fn(),
  getActiveElectricalVariantSetTask: vi.fn(),
  getElectricalVariantSetTask: vi.fn(),
}));

function wrapper({ children }: { children: ReactNode }) {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
}

describe('useProjectElectricalVariantSetTask', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('uses server state as the project-wide write lock', async () => {
    const workflow: ElectricalVariantSetTask = {
      id: 'workflow-1',
      project_id: 'project-1',
      status: 'running',
      stage: 'electrical',
      task_version: 1,
      electrical_variant_ids: ['variant-1'],
      progress: { current: 1, total: 3, percent: 33.3 },
      queue_deadline_at: null,
      execution_deadline_at: '2026-08-07T10:10:00Z',
      result: { requested_electrical_variant_ids: [], completed_electrical_variant_ids: [], failed_electrical_variant_ids: [], per_variant: {} },
      error_message: null,
      cancel_requested: false,
      created_at: '2026-08-07T10:00:00Z',
      started_at: '2026-08-07T10:00:01Z',
      finished_at: null,
      status_url: '/api/v1/electrical-variant-set-tasks/workflow-1',
      cancel_url: '/api/v1/electrical-variant-set-tasks/workflow-1/cancel',
      retry_url: '/api/v1/electrical-variant-set-tasks/workflow-1/retry',
    };
    vi.mocked(getActiveElectricalVariantSetTask).mockResolvedValue(workflow);
    vi.mocked(getElectricalVariantSetTask).mockResolvedValue(workflow);

    const { result } = renderHook(
      () => useProjectElectricalVariantSetTask('project-1'),
      { wrapper },
    );

    await waitFor(() => expect(result.current.task?.id).toBe('workflow-1'));
    expect(result.current.isCalculationLocked).toBe(true);
    expect(getActiveElectricalVariantSetTask).toHaveBeenCalledWith(
      'project-1',
      expect.any(AbortSignal),
    );
  });

  it('does not query without a project', () => {
    const { result } = renderHook(
      () => useProjectElectricalVariantSetTask(undefined),
      { wrapper },
    );

    expect(result.current.task).toBeNull();
    expect(result.current.isCalculationLocked).toBe(false);
    expect(getActiveElectricalVariantSetTask).not.toHaveBeenCalled();
  });

  it('never carries an old project lock into a newly selected project', async () => {
    const oldWorkflow: ElectricalVariantSetTask = {
      id: 'workflow-old',
      project_id: 'project-old',
      status: 'running',
      stage: 'heat',
      task_version: 1,
      electrical_variant_ids: [],
      progress: { current: 0, total: 2, percent: 0 },
      queue_deadline_at: null,
      execution_deadline_at: null,
      result: { requested_electrical_variant_ids: [], completed_electrical_variant_ids: [], failed_electrical_variant_ids: [], per_variant: {} },
      error_message: null,
      cancel_requested: false,
      created_at: '2026-08-07T10:00:00Z',
      started_at: null,
      finished_at: null,
      status_url: '/old',
      cancel_url: '/old/cancel',
      retry_url: '/old/retry',
    };
    vi.mocked(getActiveElectricalVariantSetTask).mockImplementation(async (projectId) => (
      projectId === 'project-old' ? oldWorkflow : null
    ));
    vi.mocked(getElectricalVariantSetTask).mockResolvedValue(oldWorkflow);

    const { result, rerender } = renderHook(
      ({ projectId }) => useProjectElectricalVariantSetTask(projectId),
      { wrapper, initialProps: { projectId: 'project-old' } },
    );
    await waitFor(() => expect(result.current.isCalculationLocked).toBe(true));

    rerender({ projectId: 'project-new' });

    await waitFor(() => expect(result.current.task).toBeNull());
    expect(result.current.isCalculationLocked).toBe(false);
  });

  it('releases a stale detail lock when the server reports no active workflow', async () => {
    const runningWorkflow: ElectricalVariantSetTask = {
      id: 'workflow-reload',
      project_id: 'project-1',
      status: 'running',
      stage: 'electrical',
      task_version: 1,
      electrical_variant_ids: ['variant-1'],
      progress: { current: 1, total: 3, percent: 33.3 },
      queue_deadline_at: null,
      execution_deadline_at: '2026-08-07T10:10:00Z',
      result: { requested_electrical_variant_ids: [], completed_electrical_variant_ids: [], failed_electrical_variant_ids: [], per_variant: {} },
      error_message: null,
      cancel_requested: false,
      created_at: '2026-08-07T10:00:00Z',
      started_at: '2026-08-07T10:00:01Z',
      finished_at: null,
      status_url: '/api/v1/electrical-variant-set-tasks/workflow-reload',
      cancel_url: '/api/v1/electrical-variant-set-tasks/workflow-reload/cancel',
      retry_url: '/api/v1/electrical-variant-set-tasks/workflow-reload/retry',
    };
    vi.mocked(getActiveElectricalVariantSetTask)
      .mockResolvedValueOnce(runningWorkflow)
      .mockResolvedValue(null);
    vi.mocked(getElectricalVariantSetTask).mockResolvedValue(runningWorkflow);

    const { result } = renderHook(
      () => useProjectElectricalVariantSetTask('project-1'),
      { wrapper },
    );
    await waitFor(() => expect(result.current.isCalculationLocked).toBe(true));

    await result.current.query.refetch();

    await waitFor(() => expect(result.current.query.data).toBeNull());
    expect(result.current.task).toBeNull();
    expect(result.current.isCalculationLocked).toBe(false);
  });
});
