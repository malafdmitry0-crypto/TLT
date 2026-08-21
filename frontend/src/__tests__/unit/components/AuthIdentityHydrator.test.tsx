import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, render, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import AuthIdentityHydrator from '@/components/common/AuthIdentityHydrator';
import { getCurrentGuestSession, getMe } from '@/api/auth';
import { useAuthStore } from '@/store/authStore';
import { useProjectStore } from '@/store/projectStore';

vi.mock('@/api/auth', () => ({
  getMe: vi.fn(),
  getCurrentGuestSession: vi.fn(),
}));

const guestProject = {
  id: 'guest-project-1', name: 'Мой проект', description: null, task_number: null,
  user_id: null, session_id: 'guest-session-1', status: 'draft' as const,
  owner_email: null, object_types: [], created_at: '2026-08-21T00:00:00Z',
  updated_at: '2026-08-21T00:00:00Z',
};

const employee = {
  id: 'employee-1',
  email: 'employee@example.test',
  full_name: null,
  role: 'employee' as const,
  is_active: true,
};

function renderHydrator() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return render(
    <QueryClientProvider client={queryClient}>
      <AuthIdentityHydrator />
    </QueryClientProvider>,
  );
}

describe('AuthIdentityHydrator', () => {
  beforeEach(() => {
    localStorage.clear();
    useAuthStore.setState({
      role: null,
      user: null,
      sessionId: null,
      accessToken: null,
      refreshToken: null,
    });
    vi.mocked(getMe).mockReset();
    vi.mocked(getCurrentGuestSession).mockReset();
    vi.mocked(getCurrentGuestSession).mockResolvedValue(null);
    useProjectStore.getState().setCurrentProject(null);
  });

  it('restores the authoritative guest project after F5', async () => {
    useAuthStore.setState({ role: 'guest', sessionId: 'guest-session-1' });
    vi.mocked(getCurrentGuestSession).mockResolvedValue({
      session_id: 'guest-session-1',
      project: guestProject,
    });

    renderHydrator();

    await waitFor(() => {
      expect(useProjectStore.getState().currentProject).toEqual(guestProject);
    });
    expect(localStorage.getItem('session_id')).toBe('guest-session-1');
  });

  it('restores a guest from the server cookie when local identity is absent', async () => {
    vi.mocked(getCurrentGuestSession).mockResolvedValue({
      session_id: 'guest-session-1',
      project: guestProject,
    });

    renderHydrator();

    await waitFor(() => {
      expect(useAuthStore.getState().role).toBe('guest');
      expect(useProjectStore.getState().currentProject?.id).toBe('guest-project-1');
    });
  });

  it('does not reuse an empty anonymous probe after explicit guest login', async () => {
    vi.mocked(getCurrentGuestSession)
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce({ session_id: 'guest-session-1', project: guestProject });
    renderHydrator();
    await waitFor(() => expect(getCurrentGuestSession).toHaveBeenCalledOnce());

    act(() => useAuthStore.getState().setGuest('guest-session-1'));

    await waitFor(() => {
      expect(getCurrentGuestSession).toHaveBeenCalledTimes(2);
      expect(useAuthStore.getState().role).toBe('guest');
      expect(useProjectStore.getState().currentProject?.id).toBe('guest-project-1');
    });
  });

  it('restores the employee id used by project write permissions after F5', async () => {
    localStorage.setItem('role', 'employee');
    useAuthStore.setState({ role: 'employee', user: null });
    vi.mocked(getMe).mockResolvedValue(employee);

    renderHydrator();

    await waitFor(() => {
      expect(useAuthStore.getState().user).toEqual(employee);
    });
    expect(getMe).toHaveBeenCalledOnce();
  });

  it('does not request identity for an already hydrated employee', () => {
    useAuthStore.setState({ role: 'employee', user: employee });

    renderHydrator();

    expect(getMe).not.toHaveBeenCalled();
  });

  it('does not restore a request that finishes after logout', async () => {
    let resolveIdentity: ((value: typeof employee) => void) | undefined;
    vi.mocked(getMe).mockReturnValue(new Promise((resolve) => {
      resolveIdentity = resolve;
    }));
    useAuthStore.setState({ role: 'employee', user: null });
    renderHydrator();

    useAuthStore.getState().logout();
    await act(async () => {
      resolveIdentity?.(employee);
    });

    expect(useAuthStore.getState().role).toBeNull();
    expect(useAuthStore.getState().user).toBeNull();
  });
});
