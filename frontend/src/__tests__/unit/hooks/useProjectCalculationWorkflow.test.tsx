import type { ReactNode } from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { renderHook, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import {
  getActiveCalculationWorkflow,
  getCalculationWorkflow,
} from '@/api/calculationWorkflows';
import type { CalculationWorkflow } from '@/api/calculationWorkflows';
import { useProjectCalculationWorkflow } from '@/hooks/useProjectCalculationWorkflow';

vi.mock('@/api/calculationWorkflows', () => ({
  cancelCalculationWorkflow: vi.fn(),
  getActiveCalculationWorkflow: vi.fn(),
  getCalculationWorkflow: vi.fn(),
}));

function wrapper({ children }: { children: ReactNode }) {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
}

describe('useProjectCalculationWorkflow', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('uses server state as the project-wide write lock', async () => {
    const workflow: CalculationWorkflow = {
      id: 'workflow-1',
      project_id: 'project-1',
      status: 'running',
      stage: 'electrical',
      workflow_version: 1,
      variant_ids: ['variant-1'],
      progress: { current: 1, total: 3, percent: 33.3 },
      queue_deadline_at: null,
      execution_deadline_at: '2026-08-07T10:10:00Z',
      interaction_deadline_at: null,
      waiting_results: [],
      result: null,
      error_message: null,
      cancel_requested: false,
      created_at: '2026-08-07T10:00:00Z',
      started_at: '2026-08-07T10:00:01Z',
      finished_at: null,
      status_url: '/api/v1/calculation-workflows/workflow-1',
      cancel_url: '/api/v1/calculation-workflows/workflow-1/cancel',
      resume_url: '/api/v1/calculation-workflows/workflow-1/resume',
      retry_url: '/api/v1/calculation-workflows/workflow-1/retry',
    };
    vi.mocked(getActiveCalculationWorkflow).mockResolvedValue(workflow);
    vi.mocked(getCalculationWorkflow).mockResolvedValue(workflow);

    const { result } = renderHook(
      () => useProjectCalculationWorkflow('project-1'),
      { wrapper },
    );

    await waitFor(() => expect(result.current.workflow?.id).toBe('workflow-1'));
    expect(result.current.isCalculationLocked).toBe(true);
    expect(getActiveCalculationWorkflow).toHaveBeenCalledWith(
      'project-1',
      expect.any(AbortSignal),
    );
  });

  it('does not query without a project', () => {
    const { result } = renderHook(
      () => useProjectCalculationWorkflow(undefined),
      { wrapper },
    );

    expect(result.current.workflow).toBeNull();
    expect(result.current.isCalculationLocked).toBe(false);
    expect(getActiveCalculationWorkflow).not.toHaveBeenCalled();
  });

  it('never carries an old project lock into a newly selected project', async () => {
    const oldWorkflow: CalculationWorkflow = {
      id: 'workflow-old',
      project_id: 'project-old',
      status: 'running',
      stage: 'heat',
      workflow_version: 1,
      variant_ids: [],
      progress: { current: 0, total: 2, percent: 0 },
      queue_deadline_at: null,
      execution_deadline_at: null,
      interaction_deadline_at: null,
      waiting_results: [],
      result: null,
      error_message: null,
      cancel_requested: false,
      created_at: '2026-08-07T10:00:00Z',
      started_at: null,
      finished_at: null,
      status_url: '/old',
      cancel_url: '/old/cancel',
      resume_url: '/old/resume',
      retry_url: '/old/retry',
    };
    vi.mocked(getActiveCalculationWorkflow).mockImplementation(async (projectId) => (
      projectId === 'project-old' ? oldWorkflow : null
    ));
    vi.mocked(getCalculationWorkflow).mockResolvedValue(oldWorkflow);

    const { result, rerender } = renderHook(
      ({ projectId }) => useProjectCalculationWorkflow(projectId),
      { wrapper, initialProps: { projectId: 'project-old' } },
    );
    await waitFor(() => expect(result.current.isCalculationLocked).toBe(true));

    rerender({ projectId: 'project-new' });

    await waitFor(() => expect(result.current.workflow).toBeNull());
    expect(result.current.isCalculationLocked).toBe(false);
  });

  it('releases a stale detail lock when the server reports no active workflow', async () => {
    const runningWorkflow: CalculationWorkflow = {
      id: 'workflow-reload',
      project_id: 'project-1',
      status: 'running',
      stage: 'electrical',
      workflow_version: 1,
      variant_ids: ['variant-1'],
      progress: { current: 1, total: 3, percent: 33.3 },
      queue_deadline_at: null,
      execution_deadline_at: '2026-08-07T10:10:00Z',
      interaction_deadline_at: null,
      waiting_results: [],
      result: null,
      error_message: null,
      cancel_requested: false,
      created_at: '2026-08-07T10:00:00Z',
      started_at: '2026-08-07T10:00:01Z',
      finished_at: null,
      status_url: '/api/v1/calculation-workflows/workflow-reload',
      cancel_url: '/api/v1/calculation-workflows/workflow-reload/cancel',
      resume_url: '/api/v1/calculation-workflows/workflow-reload/resume',
      retry_url: '/api/v1/calculation-workflows/workflow-reload/retry',
    };
    vi.mocked(getActiveCalculationWorkflow)
      .mockResolvedValueOnce(runningWorkflow)
      .mockResolvedValue(null);
    vi.mocked(getCalculationWorkflow).mockResolvedValue(runningWorkflow);

    const { result } = renderHook(
      () => useProjectCalculationWorkflow('project-1'),
      { wrapper },
    );
    await waitFor(() => expect(result.current.isCalculationLocked).toBe(true));

    await result.current.query.refetch();

    await waitFor(() => expect(result.current.query.data).toBeNull());
    expect(result.current.workflow).toBeNull();
    expect(result.current.isCalculationLocked).toBe(false);
  });
});
