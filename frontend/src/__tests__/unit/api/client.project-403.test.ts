/* eslint-disable @typescript-eslint/no-unused-vars -- scenario split keeps shared preamble fixtures */
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

describe('apiClient — project 403 handling', () => {
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

});
