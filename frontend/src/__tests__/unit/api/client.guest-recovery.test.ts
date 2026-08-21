import axios from 'axios';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import apiClient from '@/api/client';
import { useAuthStore } from '@/store/authStore';
import { useProjectStore } from '@/store/projectStore';
import {
  getHeader,
  recoveredProject,
  resetApiClientTestState,
  unauthorized,
} from './client.test-helpers';

describe('apiClient guest recovery', () => {
  beforeEach(() => {
    resetApiClientTestState();
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

  it('не заменяет истекшую guest session новой после 401', async () => {
    localStorage.setItem('session_id', 'sid-expired');
    localStorage.setItem('role', 'guest');
    useAuthStore.getState().setGuest('sid-expired');

    const postSpy = vi.spyOn(axios, 'post').mockResolvedValue({
      data: { session_id: 'sid-new', project: recoveredProject },
    });
    const adapter = vi.fn(async (config) => {
      throw unauthorized(config);
    });
    apiClient.defaults.adapter = adapter;

    await expect(apiClient.get('/references/insulation')).rejects.toThrow('Unauthorized');

    expect(postSpy).not.toHaveBeenCalled();
    expect(localStorage.getItem('session_id')).toBeNull();
    expect(useAuthStore.getState().sessionId).toBeNull();
    expect(useProjectStore.getState().currentProject).toBeNull();
    expect(adapter).toHaveBeenCalledOnce();
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
