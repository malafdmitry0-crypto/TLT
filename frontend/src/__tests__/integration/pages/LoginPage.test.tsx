import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import LoginPage from '@/pages/LoginPage';
import { useAuthStore } from '@/store/authStore';

vi.mock('@/api/auth', () => ({
  login: vi.fn(),
  getMe: vi.fn(),
}));

const navigateMock = vi.fn();
vi.mock('react-router-dom', async () => {
  const actual = await vi.importActual<typeof import('react-router-dom')>(
    'react-router-dom'
  );
  return { ...actual, useNavigate: () => navigateMock };
});

describe('LoginPage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    useAuthStore.getState().logout();
  });

  function renderAt(path: string) {
    return render(
      <MemoryRouter initialEntries={[path]}>
        <Routes>
          <Route path="/login" element={<LoginPage />} />
        </Routes>
      </MemoryRouter>
    );
  }

  it('renders email and password fields', () => {
    renderAt('/login?role=employee');
    expect(screen.getByLabelText('Email')).toBeInTheDocument();
    expect(screen.getByLabelText('Пароль')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Войти' })).toBeInTheDocument();
  });

  it('в режиме сотрудника передаёт employee и ведёт в рабочую область', async () => {
    const { login, getMe } = await import('@/api/auth');
    (login as ReturnType<typeof vi.fn>).mockResolvedValue({
      access_token: 'A',
      refresh_token: 'R',
      token_type: 'bearer',
    });
    (getMe as ReturnType<typeof vi.fn>).mockResolvedValue({
      id: 'u1',
      email: 'employee@test.com',
      full_name: null,
      role: 'employee',
      is_active: true,
    });

    renderAt('/login?role=employee');
    await userEvent.type(screen.getByLabelText('Email'), 'employee@test.com');
    await userEvent.type(screen.getByLabelText('Пароль'), 'emp12345');
    await userEvent.click(screen.getByRole('button', { name: 'Войти' }));

    await waitFor(() => {
      expect(login).toHaveBeenCalledWith({
        email: 'employee@test.com',
        password: 'emp12345',
        role: 'employee',
      });
      expect(navigateMock).toHaveBeenCalledWith('/workspace/heat-calc');
    });
  });

  it('в режиме администратора передаёт admin и ведёт в админку', async () => {
    const { login, getMe } = await import('@/api/auth');
    (login as ReturnType<typeof vi.fn>).mockResolvedValue({
      access_token: 'A',
      refresh_token: 'R',
      token_type: 'bearer',
    });
    (getMe as ReturnType<typeof vi.fn>).mockResolvedValue({
      id: 'u2',
      email: 'admin@test.com',
      full_name: null,
      role: 'admin',
      is_active: true,
    });

    renderAt('/login?role=admin');
    await userEvent.type(screen.getByLabelText('Email'), 'admin@test.com');
    await userEvent.type(screen.getByLabelText('Пароль'), 'admin123');
    await userEvent.click(screen.getByRole('button', { name: 'Войти' }));

    await waitFor(() => {
      expect(login).toHaveBeenCalledWith({
        email: 'admin@test.com',
        password: 'admin123',
        role: 'admin',
      });
      expect(navigateMock).toHaveBeenCalledWith('/admin/users');
    });
  });
});
