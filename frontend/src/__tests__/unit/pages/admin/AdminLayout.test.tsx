import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Routes, Route } from 'react-router-dom';
import TestMemoryRouter from '@/__tests__/utils/TestMemoryRouter';
import AdminLayout from '@/pages/admin/AdminLayout';
import { useAuthStore } from '@/store/authStore';
import { logout as logoutApi } from '@/api/auth';

vi.mock('@/api/auth', () => ({
  logout: vi.fn().mockResolvedValue(undefined),
}));

describe('AdminLayout', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    useAuthStore.setState({
      role: 'admin',
      user: { id: 'a', email: 'a@x', full_name: null, role: 'admin', is_active: true },
      sessionId: null,
      accessToken: 'a',
      refreshToken: 'r',
    });
  });

  it('рендерит шапку Администрирование, меню и кнопку Выход', async () => {
    render(
      <TestMemoryRouter initialEntries={['/admin/users']}>
        <Routes>
          <Route path="/admin" element={<AdminLayout />}>
            <Route path="users" element={<div>USERS-CONTENT</div>} />
          </Route>
        </Routes>
      </TestMemoryRouter>
    );
    expect(await screen.findByText(/Администрирование/i)).toBeInTheDocument();
    expect(await screen.findByText('USERS-CONTENT')).toBeInTheDocument();
    expect(await screen.findByText('Каталоги спецификации')).toBeInTheDocument();
    expect(await screen.findByText('Выход')).toBeInTheDocument();
  });

  it('выходит по Enter через семантическую кнопку и возвращает на главную', async () => {
    const user = userEvent.setup();

    render(
      <TestMemoryRouter initialEntries={['/admin/users']}>
        <Routes>
          <Route path="/admin" element={<AdminLayout />}>
            <Route path="users" element={<div>USERS-CONTENT</div>} />
          </Route>
          <Route path="/" element={<div>HOME</div>} />
        </Routes>
      </TestMemoryRouter>
    );

    const logoutButton = screen.getByRole('button', { name: 'Выход' });
    await user.tab();
    expect(logoutButton).toHaveFocus();
    await user.keyboard('{Enter}');

    expect(logoutApi).toHaveBeenCalledOnce();
    expect(useAuthStore.getState().role).toBeNull();
    expect(await screen.findByText('HOME')).toBeInTheDocument();
  });

  it('выходит по клику мыши через ту же кнопку', async () => {
    const user = userEvent.setup();

    render(
      <TestMemoryRouter initialEntries={['/admin/users']}>
        <Routes>
          <Route path="/admin" element={<AdminLayout />}>
            <Route path="users" element={<div>USERS-CONTENT</div>} />
          </Route>
          <Route path="/" element={<div>HOME</div>} />
        </Routes>
      </TestMemoryRouter>
    );

    await user.click(screen.getByRole('button', { name: 'Выход' }));

    expect(logoutApi).toHaveBeenCalledOnce();
    expect(useAuthStore.getState().role).toBeNull();
    expect(await screen.findByText('HOME')).toBeInTheDocument();
  });
});
