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

describe('apiClient — async jobs & idempotency', () => {
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
