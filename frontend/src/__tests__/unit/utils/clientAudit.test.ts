import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { recordClientAuditEvent } from '@/utils/clientAudit';
import { useAuthStore } from '@/store/authStore';
import { useProjectStore } from '@/store/projectStore';

describe('clientAudit', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.restoreAllMocks();
    localStorage.clear();
    useAuthStore.getState().logout();
    useProjectStore.getState().setCurrentProject(null);
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => ({ ok: true, status: 202 })),
    );
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  it('отправляет frontend audit event с guest session и project_id', async () => {
    useAuthStore.getState().setGuest('sid-1');
    useProjectStore.getState().setCurrentProject({
      id: '00000000-0000-0000-0000-000000000001',
      name: 'Project',
      description: null,
      task_number: null,
      user_id: null,
      session_id: 'sid-1',
      status: 'draft',
      owner_email: null,
      object_types: [],
      created_at: '2026-05-18T00:00:00Z',
      updated_at: '2026-05-18T00:00:00Z',
    });

    recordClientAuditEvent('frontend.window.error', { message: 'boom' }, {
      severity: 'error',
      result: 'failure',
      error_code: 'frontend_error',
    });

    await vi.advanceTimersByTimeAsync(1000);

    expect(fetch).toHaveBeenCalledTimes(1);
    const [url, init] = vi.mocked(fetch).mock.calls[0];
    expect(String(url)).toContain('/audit/client-events');
    expect(init?.headers).toMatchObject({ 'X-Session-Id': 'sid-1' });
    expect(JSON.parse(String(init?.body))).toMatchObject({
      events: [
        {
          event_type: 'frontend.window.error',
          severity: 'error',
          result: 'failure',
          project_id: '00000000-0000-0000-0000-000000000001',
          details: { message: 'boom' },
          error_code: 'frontend_error',
        },
      ],
    });
  });
});
