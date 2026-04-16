import { describe, it, expect, beforeEach } from 'vitest';
import { useAuthStore } from '@/store/authStore';

describe('authStore', () => {
  beforeEach(() => {
    useAuthStore.getState().logout();
    localStorage.clear();
  });

  it('setGuest stores sessionId and role', () => {
    useAuthStore.getState().setGuest('abc');
    expect(useAuthStore.getState().role).toBe('guest');
    expect(useAuthStore.getState().sessionId).toBe('abc');
    expect(localStorage.getItem('session_id')).toBe('abc');
  });

  it('setEmployee stores user and tokens', () => {
    useAuthStore.getState().setEmployee(
      {
        id: '1',
        email: 'e@x',
        full_name: null,
        role: 'employee',
        is_active: true,
      },
      { access: 'A', refresh: 'R' }
    );
    expect(useAuthStore.getState().role).toBe('employee');
    expect(localStorage.getItem('access_token')).toBe('A');
  });

  it('logout clears state', () => {
    useAuthStore.getState().setGuest('abc');
    useAuthStore.getState().logout();
    expect(useAuthStore.getState().role).toBeNull();
    expect(localStorage.getItem('session_id')).toBeNull();
  });

  it('readInitialState восстанавливает гостя из localStorage', async () => {
    localStorage.setItem('session_id', 'foo');
    const { readInitialState } = await import('@/store/authStore');
    const s = readInitialState();
    expect(s.role).toBe('guest');
    expect(s.sessionId).toBe('foo');
  });

  it('readInitialState восстанавливает сотрудника из токенов', async () => {
    localStorage.setItem('access_token', 'A');
    localStorage.setItem('refresh_token', 'R');
    localStorage.setItem('role', 'admin');
    const { readInitialState } = await import('@/store/authStore');
    const s = readInitialState();
    expect(s.role).toBe('admin');
    expect(s.accessToken).toBe('A');
  });
});
