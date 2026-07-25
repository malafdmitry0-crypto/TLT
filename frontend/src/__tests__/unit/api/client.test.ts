import axios, { AxiosError } from 'axios';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import apiClient, { withIdempotencyKey } from '@/api/client';
import {
  copyElectricalVariant,
  enqueueElectricalBatchJob,
  enqueueElectricalVariantBatchJob,
  enqueueHeatLossBatchJob,
  getElectricalQueryCapabilities,
  selectCableForVariants,
} from '@/api/calculations';
import { getSpecification } from '@/api/specifications';
import { enqueueReportExportJob, getReportPreview } from '@/api/reports';
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
    useProjectStore.getState().setCurrentProject(null);
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

  it('не сбрасывает читаемый проект после 403 на lifecycle mutation', async () => {
    const currentProject = { ...recoveredProject, id: 'project-1' };
    useProjectStore.getState().setCurrentProject(currentProject);
    const adapter = vi.fn(async (config) => {
      throw httpError(config, 403, {
        code: 'PROJECT_ACCESS_DENIED',
        message: 'Недостаточно прав для изменения проекта',
      });
    });
    apiClient.defaults.adapter = adapter;

    await expect(
      apiClient.patch('/projects/project-1/electrical-variants/er-1', { name: 'ЭР' }),
    ).rejects.toMatchObject({ status: 403, code: 'PROJECT_ACCESS_DENIED' });

    expect(localStorage.getItem('tlt-current-project')).not.toBeNull();
    expect(useProjectStore.getState().currentProject?.id).toBe('project-1');
  });

  it('сбрасывает stale проект после authoritative GET 403 для того же project id', async () => {
    const currentProject = { ...recoveredProject, id: 'project-1' };
    useProjectStore.getState().setCurrentProject(currentProject);
    window.history.pushState({}, '', '/workspace/elec-calc');
    const adapter = vi.fn(async (config) => {
      throw httpError(config, 403, {
        code: 'PROJECT_ACCESS_DENIED',
        message: 'Нет доступа к проекту',
      });
    });
    apiClient.defaults.adapter = adapter;

    await expect(
      apiClient.get('/projects/project-1/electrical-variants'),
    ).rejects.toMatchObject({ status: 403, code: 'PROJECT_ACCESS_DENIED' });

    expect(localStorage.getItem('tlt-current-project')).toBeNull();
    expect(useProjectStore.getState().currentProject).toBeNull();
  });

  it('не сбрасывает текущий проект после GET 403 для другого project id', async () => {
    const currentProject = { ...recoveredProject, id: 'project-current' };
    useProjectStore.getState().setCurrentProject(currentProject);
    const adapter = vi.fn(async (config) => {
      throw httpError(config, 403, 'Нет доступа к другому проекту');
    });
    apiClient.defaults.adapter = adapter;

    await expect(apiClient.get('/projects/project-foreign')).rejects.toMatchObject({
      status: 403,
    });

    expect(useProjectStore.getState().currentProject?.id).toBe('project-current');
    expect(localStorage.getItem('tlt-current-project')).not.toBeNull();
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
    await enqueueReportExportJob('project-1', 'pdf', 'er-1', ['summary']);
    await copyElectricalVariant({
      project_id: 'project-1',
      source_variant_number: 1,
      target_variant_number: 2,
    });

    expect(adapter).toHaveBeenCalledTimes(4);
    for (const [config] of adapter.mock.calls) {
      expect(getHeader(config.headers, 'Idempotency-Key')).toEqual(expect.any(String));
    }
    expect(JSON.parse(String(adapter.mock.calls[3]?.[0]?.data))).toMatchObject({
      regenerate_specification: false,
    });
  });

  it('ставит электрический batch job по UUID без deprecated variant_number', async () => {
    const adapter = vi.fn(async (config) => ({
      config,
      data: { id: 'task-er', status: 'queued' },
      headers: {},
      status: 202,
      statusText: 'Accepted',
    }));
    apiClient.defaults.adapter = adapter;

    await enqueueElectricalVariantBatchJob(
      'project-1',
      '11111111-1111-4111-8111-111111111111',
    );

    const config = adapter.mock.calls[0][0];
    const payload = typeof config.data === 'string' ? JSON.parse(config.data) : config.data;
    expect(payload).toMatchObject({
      project_id: 'project-1',
      electrical_variant_id: '11111111-1111-4111-8111-111111111111',
    });
    expect(payload).not.toHaveProperty('variant_number');
    expect(getHeader(config.headers, 'Idempotency-Key')).toEqual(expect.any(String));
  });

  it('ставит export отчёта по UUID без deprecated variant_number', async () => {
    const adapter = vi.fn(async (config) => ({
      config,
      data: { id: 'task-report', status: 'queued' },
      headers: {},
      status: 202,
      statusText: 'Accepted',
    }));
    apiClient.defaults.adapter = adapter;

    await enqueueReportExportJob('project-1', 'pdf', 'er-report-1', ['summary']);

    const config = adapter.mock.calls[0][0];
    expect(config.params).toMatchObject({
      electrical_variant_id: 'er-report-1',
      sections: ['summary'],
    });
    expect(config.params).not.toHaveProperty('variant_number');
    expect(getHeader(config.headers, 'Idempotency-Key')).toEqual(expect.any(String));
  });

  it('передаёт UUID-precondition во все transitional numeric data-plane запросы', async () => {
    const adapter = vi.fn(async (config) => ({
      config,
      data: config.url?.includes('query-capabilities')
        ? { fields: [] }
        : config.url?.includes('/preview')
          ? { project_id: 'project-1', html: '', sections: [], variant_number: 2 }
          : config.url?.includes('/select-cable/variants')
            ? []
            : null,
      headers: {},
      status: 200,
      statusText: 'OK',
    }));
    apiClient.defaults.adapter = adapter;

    await getElectricalQueryCapabilities('project-1', 2, 'er-2');
    await getSpecification('project-1', 2, 'er-2');
    await getReportPreview('project-1', 2, 'er-2', ['summary']);
    await selectCableForVariants(
      'object-1',
      null,
      'builtin',
      [1, 2],
      'self_regulating',
      {},
      { 1: 'er-1', 2: 'er-2' },
    );

    const [capabilities, specification, preview, selection] = adapter.mock.calls.map(
      ([config]) => config,
    );
    expect(capabilities.params).toMatchObject({
      project_id: 'project-1',
      variant_number: 2,
      electrical_variant_id: 'er-2',
    });
    expect(specification.params).toMatchObject({
      variant: 2,
      electrical_variant_id: 'er-2',
    });
    expect(preview.params).toMatchObject({
      variant_number: 2,
      electrical_variant_id: 'er-2',
    });
    const selectionPayload = typeof selection.data === 'string'
      ? JSON.parse(selection.data)
      : selection.data;
    expect(selectionPayload).toMatchObject({
      variant_numbers: [1, 2],
      electrical_variant_ids: { 1: 'er-1', 2: 'er-2' },
    });
  });

  it('передаёт object_ids в async heat-loss job для точечного пересчёта', async () => {
    const adapter = vi.fn(async (config) => ({
      config,
      data: { id: 'task-1', status: 'queued' },
      headers: {},
      status: 200,
      statusText: 'OK',
    }));
    apiClient.defaults.adapter = adapter;

    await enqueueHeatLossBatchJob('project-1', true, ['object-1', 'object-3']);

    expect(adapter).toHaveBeenCalledWith(expect.objectContaining({
      data: JSON.stringify({
        project_id: 'project-1',
        include_errors: true,
        object_ids: ['object-1', 'object-3'],
      }),
    }));
  });

  it('не перетирает явно переданный Idempotency-Key', () => {
    const config = withIdempotencyKey({ headers: { 'Idempotency-Key': 'same-click' } });
    expect(getHeader(config.headers, 'Idempotency-Key')).toBe('same-click');
  });
});
