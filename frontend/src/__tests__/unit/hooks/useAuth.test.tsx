import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useAuth } from '@/hooks/useAuth';
import { useAuthStore } from '@/store/authStore';
import { useProjectStore } from '@/store/projectStore';

vi.mock('@/api/auth', () => ({
  createGuestSession: vi.fn(),
  login: vi.fn(),
  getMe: vi.fn(),
}));

const project = {
  id: 'p1',
  name: 'Авто',
  description: null,
  task_number: null,
  user_id: null,
  session_id: 'sid-1',
  status: 'draft' as const,
  owner_email: null,
  object_types: [],
  created_at: '2026-04-15T00:00:00Z',
  updated_at: '2026-04-15T00:00:00Z',
};

describe('useAuth', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    useAuthStore.getState().logout();
    useProjectStore.getState().setCurrentProject(null);
  });

  it('loginAsGuest сохраняет session_id и делает project текущим', async () => {
    const { createGuestSession } = await import('@/api/auth');
    (createGuestSession as ReturnType<typeof vi.fn>).mockResolvedValue({
      session_id: 'sid-1',
      project,
    });

    const { result } = renderHook(() => useAuth());
    await act(async () => {
      await result.current.loginAsGuest();
    });

    expect(useAuthStore.getState().role).toBe('guest');
    expect(useAuthStore.getState().sessionId).toBe('sid-1');
    expect(useProjectStore.getState().currentProject?.id).toBe('p1');
  });

  it('loginAsEmployee сохраняет user и tokens', async () => {
    const { login, getMe } = await import('@/api/auth');
    (login as ReturnType<typeof vi.fn>).mockResolvedValue({
      access_token: 'A',
      refresh_token: 'R',
      token_type: 'bearer',
    });
    (getMe as ReturnType<typeof vi.fn>).mockResolvedValue({
      id: 'u1',
      email: 'e@t.ru',
      full_name: null,
      role: 'employee',
      is_active: true,
    });

    const { result } = renderHook(() => useAuth());
    await act(async () => {
      await result.current.loginAsEmployee('e@t.ru', 'pass');
    });

    expect(useAuthStore.getState().role).toBe('employee');
    expect(useAuthStore.getState().accessToken).toBe('A');
    expect(localStorage.getItem('access_token')).toBe('A');
  });

  it('loginAsGuest сбрасывает старый currentProject перед запросом', async () => {
    const { createGuestSession } = await import('@/api/auth');
    (createGuestSession as ReturnType<typeof vi.fn>).mockResolvedValue({
      session_id: 'sid-2',
      project,
    });
    // Ставим «старый» проект
    useProjectStore.getState().setCurrentProject({
      ...project,
      id: 'old-project',
    });

    const { result } = renderHook(() => useAuth());
    await act(async () => {
      await result.current.loginAsGuest();
    });

    // После логина — новый, не старый
    expect(useProjectStore.getState().currentProject?.id).toBe('p1');
  });
});
