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

describe('apiClient — network retry', () => {
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

});
