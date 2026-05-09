import axios, { AxiosError } from 'axios';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import apiClient from '@/api/client';
import { useAuthStore } from '@/store/authStore';
import { useProjectStore } from '@/store/projectStore';

const originalAdapter = apiClient.defaults.adapter;

const recoveredProject = {
  id: 'p-new',
  name: 'Recovered guest project',
  description: null,
  task_number: null,
  user_id: null,
  session_id: 'sid-new',
  status: 'draft' as const,
  owner_email: null,
  object_types: [],
  created_at: '2026-05-09T00:00:00Z',
  updated_at: '2026-05-09T00:00:00Z',
};

function getHeader(headers: unknown, name: string): unknown {
  if (!headers) return undefined;
  if (typeof (headers as { get?: unknown }).get === 'function') {
    return (headers as { get: (key: string) => unknown }).get(name);
  }
  return (headers as Record<string, unknown>)[name];
}

function unauthorized(config: unknown, detail = 'Unauthorized') {
  return new AxiosError(
    'Request failed with status code 401',
    'ERR_BAD_REQUEST',
    config as never,
    undefined,
    {
      config: config as never,
      data: { detail },
      headers: {},
      status: 401,
      statusText: 'Unauthorized',
    },
  );
}

describe('apiClient guest recovery', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    apiClient.defaults.adapter = originalAdapter;
    useAuthStore.getState().logout();
    useProjectStore.getState().setCurrentProject(null);
    localStorage.clear();
  });

  it('не создает guest session из произвольного 401 без guest context', async () => {
    const postSpy = vi.spyOn(axios, 'post').mockResolvedValue({
      data: { session_id: 'sid-new', project: recoveredProject },
    });
    apiClient.defaults.adapter = vi.fn(async (config) => {
      throw unauthorized(config);
    });

    await expect(apiClient.get('/references/insulation')).rejects.toThrow('Unauthorized');

    expect(postSpy).not.toHaveBeenCalled();
    expect(localStorage.getItem('session_id')).toBeNull();
    expect(useProjectStore.getState().currentProject).toBeNull();
  });

  it('дедуплицирует параллельное восстановление guest session', async () => {
    localStorage.setItem('session_id', 'sid-expired');
    localStorage.setItem('role', 'guest');
    useAuthStore.getState().setGuest('sid-expired');

    const postSpy = vi.spyOn(axios, 'post').mockResolvedValue({
      data: { session_id: 'sid-new', project: recoveredProject },
    });
    const adapter = vi.fn(async (config) => {
      if (getHeader(config.headers, 'X-Session-Id') === 'sid-new') {
        return {
          config,
          data: { ok: true },
          headers: {},
          status: 200,
          statusText: 'OK',
        };
      }
      throw unauthorized(config);
    });
    apiClient.defaults.adapter = adapter;

    await Promise.all([
      apiClient.get('/references/insulation'),
      apiClient.get('/references/climate'),
      apiClient.get('/references/pipe-materials'),
    ]);

    expect(postSpy).toHaveBeenCalledTimes(1);
    expect(localStorage.getItem('session_id')).toBe('sid-new');
    expect(useAuthStore.getState().sessionId).toBe('sid-new');
    expect(useProjectStore.getState().currentProject?.id).toBe('p-new');
    expect(adapter).toHaveBeenCalledTimes(6);
  });

  it('не запускает guest recovery для auth endpoints', async () => {
    useAuthStore.getState().setGuest('sid-expired');
    const postSpy = vi.spyOn(axios, 'post').mockResolvedValue({
      data: { session_id: 'sid-new', project: recoveredProject },
    });
    apiClient.defaults.adapter = vi.fn(async (config) => {
      throw unauthorized(config, 'Bad credentials');
    });

    await expect(apiClient.post('/auth/login', { email: 'x', password: 'bad' })).rejects.toThrow('Bad credentials');

    expect(postSpy).not.toHaveBeenCalled();
    expect(localStorage.getItem('session_id')).toBe('sid-expired');
  });
});
