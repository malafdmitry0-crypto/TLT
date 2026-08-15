import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, render, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import AuthIdentityHydrator from '@/components/common/AuthIdentityHydrator';
import { getMe } from '@/api/auth';
import { useAuthStore } from '@/store/authStore';

vi.mock('@/api/auth', () => ({
  getMe: vi.fn(),
}));

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
