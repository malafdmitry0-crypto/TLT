import { beforeEach, describe, expect, it, vi } from 'vitest';

import apiClient from '@/api/client';
import { exportReport } from '@/api/reports';
import type { CalculationTaskResponse } from '@/types/calculation';

vi.mock('@/api/client', () => ({
  default: {
    get: vi.fn(),
    post: vi.fn(),
  },
  withIdempotencyKey: vi.fn((config = {}) => config),
}));

function reportTask(status: CalculationTaskResponse['status']): CalculationTaskResponse {
  return {
    id: 'report-task-1',
    type: 'report_export',
    status,
    project_id: 'project-1',
    progress: { current: 0, total: 1, phase: status, percent: 0 },
    result: null,
    error_message: null,
    cancel_requested: false,
    created_at: '2026-08-07T00:00:00Z',
    started_at: null,
    finished_at: null,
    links: { status: '', result: '', cancel: '' },
  };
}

describe('report export task recovery', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    window.sessionStorage.clear();
  });

  it('resumes a persisted active task instead of enqueueing a duplicate after reload', async () => {
    const storageKey = 'tlt:report-export-task:project-1:er-1:pdf:summary';
    window.sessionStorage.setItem(storageKey, 'report-task-1');
    vi.mocked(apiClient.get)
      .mockResolvedValueOnce({ data: reportTask('running') })
      .mockResolvedValueOnce({ data: reportTask('succeeded') })
      .mockResolvedValueOnce({ data: new Blob(['pdf']) });

    const result = await exportReport('project-1', 'pdf', 'er-1', ['summary']);

    expect(result).toBeInstanceOf(Blob);
    expect(apiClient.post).not.toHaveBeenCalled();
    expect(apiClient.get).toHaveBeenNthCalledWith(1, '/reports/jobs/report-task-1');
    expect(apiClient.get).toHaveBeenNthCalledWith(3, '/reports/jobs/report-task-1/download', {
      responseType: 'blob',
    });
    expect(window.sessionStorage.getItem(storageKey)).toBeNull();
  });
});
