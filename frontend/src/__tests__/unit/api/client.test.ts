import axios, { AxiosError } from 'axios';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import apiClient, { withIdempotencyKey } from '@/api/client';
import {
  copyElectricalVariant,
  enqueueElectricalBatchJob,
  enqueueHeatLossBatchJob,
} from '@/api/calculations';
import { enqueueReportExportJob } from '@/api/reports';
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

function httpError(config: unknown, status = 502, detail: unknown = 'Bad Gateway') {
  return new AxiosError(
    `Request failed with status code ${status}`,
    'ERR_BAD_RESPONSE',
    config as never,
    undefined,
    {
      config: config as never,
      data: { detail },
      headers: {},
      status,
      statusText: typeof detail === 'string' ? detail : 'Error',
    },
  );
}

describe('apiClient guest recovery', () => {
  beforeEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
    apiClient.defaults.adapter = originalAdapter;
    useAuthStore.getState().logout();
    useProjectStore.getState().setCurrentProject(null);
    localStorage.clear();
    document.cookie = 'csrf_token=; Max-Age=0';
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

  it('после 401 один раз refresh-ит employee session и повторяет запрос', async () => {
    localStorage.setItem('role', 'employee');
    useAuthStore.getState().setAccessToken('old-token');
    document.cookie = 'csrf_token=csrf-1';

    const postSpy = vi.spyOn(axios, 'post').mockResolvedValue({
      data: { access_token: 'new-token', token_type: 'bearer' },
    });
    const adapter = vi.fn(async (config) => {
      if (getHeader(config.headers, 'Authorization') === 'Bearer new-token') {
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

    const response = await apiClient.get('/projects');

    expect(response.data).toEqual({ ok: true });
    expect(postSpy).toHaveBeenCalledTimes(1);
    expect(postSpy).toHaveBeenCalledWith(
      expect.stringContaining('/auth/refresh'),
      undefined,
      expect.objectContaining({
        withCredentials: true,
        headers: { 'X-CSRF-Token': 'csrf-1' },
      }),
    );
    expect(useAuthStore.getState().accessToken).toBe('new-token');
    expect(localStorage.getItem('access_token')).toBeNull();
  });
});

describe('apiClient network retry and idempotency', () => {
  beforeEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
    apiClient.defaults.adapter = originalAdapter;
    useAuthStore.getState().logout();
    localStorage.clear();
  });

  afterEach(() => {
    vi.useRealTimers();
    apiClient.defaults.adapter = originalAdapter;
  });

  it('повторяет GET один раз после 5xx и сохраняет исходный config', async () => {
    vi.useFakeTimers();
    const adapter = vi.fn(async (config) => {
      if (adapter.mock.calls.length === 1) {
        throw httpError(config);
      }
      return {
        config,
        data: { ok: true },
        headers: {},
        status: 200,
        statusText: 'OK',
      };
    });
    apiClient.defaults.adapter = adapter;

    const request = apiClient.get('/unstable', { headers: { 'X-Test': '1' } });
    await vi.advanceTimersByTimeAsync(200);

    await expect(request).resolves.toMatchObject({ data: { ok: true } });
    expect(adapter).toHaveBeenCalledTimes(2);
    expect(getHeader(adapter.mock.calls[1][0].headers, 'X-Test')).toBe('1');
  });

  it('не повторяет POST после 5xx', async () => {
    const adapter = vi.fn(async (config) => {
      throw httpError(config);
    });
    apiClient.defaults.adapter = adapter;

    await expect(apiClient.post('/unstable', { ok: true })).rejects.toThrow('Bad Gateway');
    expect(adapter).toHaveBeenCalledTimes(1);
  });

  it('сохраняет structured error code из detail object', async () => {
    const adapter = vi.fn(async (config) => {
      throw httpError(config, 409, {
        code: 'target_not_empty',
        message: 'СО2 уже содержит расчёты',
      });
    });
    apiClient.defaults.adapter = adapter;

    await expect(apiClient.post('/calc/electrical/variants/copy', {})).rejects.toMatchObject({
      message: 'СО2 уже содержит расчёты',
      status: 409,
      code: 'target_not_empty',
    });
  });

  it('добавляет Idempotency-Key к async job мутациям', async () => {
    const adapter = vi.fn(async (config) => ({
      config,
      data: { id: 'task-1', status: 'queued' },
      headers: {},
      status: 200,
      statusText: 'OK',
    }));
    apiClient.defaults.adapter = adapter;

    await enqueueElectricalBatchJob('project-1');
    await enqueueHeatLossBatchJob('project-1');
    await enqueueReportExportJob('project-1', 'pdf', 1, ['summary']);
    await copyElectricalVariant({
      project_id: 'project-1',
      source_variant_number: 1,
      target_variant_number: 2,
    });

    expect(adapter).toHaveBeenCalledTimes(4);
    for (const [config] of adapter.mock.calls) {
      expect(getHeader(config.headers, 'Idempotency-Key')).toEqual(expect.any(String));
    }
  });

  it('не перетирает явно переданный Idempotency-Key', () => {
    const config = withIdempotencyKey({ headers: { 'Idempotency-Key': 'same-click' } });
    expect(getHeader(config.headers, 'Idempotency-Key')).toBe('same-click');
  });
});
