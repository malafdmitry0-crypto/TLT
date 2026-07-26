import { AxiosError } from 'axios';
import { vi } from 'vitest';
import apiClient from '@/api/client';
import { useAuthStore } from '@/store/authStore';
import { useProjectStore } from '@/store/projectStore';

export const originalAdapter = apiClient.defaults.adapter;

export const recoveredProject = {
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

export function getHeader(headers: unknown, name: string): unknown {
  if (!headers) return undefined;
  if (typeof (headers as { get?: unknown }).get === 'function') {
    return (headers as { get: (key: string) => unknown }).get(name);
  }
  return (headers as Record<string, unknown>)[name];
}

export function unauthorized(config: unknown, detail = 'Unauthorized') {
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

export function httpError(config: unknown, status = 502, detail: unknown = 'Bad Gateway') {
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

export function resetApiClientTestState() {
  vi.useRealTimers();
  vi.restoreAllMocks();
  apiClient.defaults.adapter = originalAdapter;
  useAuthStore.getState().logout();
  useProjectStore.getState().setCurrentProject(null);
  localStorage.clear();
  document.cookie = 'csrf_token=; Max-Age=0';
}
