import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import TestMemoryRouter from '@/__tests__/utils/TestMemoryRouter';
import HomePage from '@/pages/HomePage';
import { useAuthStore } from '@/store/authStore';
import { useProjectStore } from '@/store/projectStore';

vi.mock('@/api/auth', () => ({
  createGuestSession: vi.fn(),
}));

const navigateMock = vi.fn();
vi.mock('react-router-dom', async () => {
  const actual = await vi.importActual<typeof import('react-router-dom')>(
    'react-router-dom'
  );
  return { ...actual, useNavigate: () => navigateMock };
});

describe('HomePage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    useAuthStore.getState().logout();
    useProjectStore.getState().setCurrentProject(null);
  });

  it('shows role selection options', () => {
    render(
      <TestMemoryRouter>
        <HomePage />
      </TestMemoryRouter>
    );
    expect(screen.getAllByText(/без регистрации/i)[0]).toBeInTheDocument();
    expect(screen.getAllByText(/как сотрудник/i)[0]).toBeInTheDocument();
    expect(screen.getAllByText(/как администратор/i)[0]).toBeInTheDocument();
  });

  it('FA-11: guest TTL copy says 3 days, not 20 minutes', () => {
    render(
      <TestMemoryRouter>
        <HomePage />
      </TestMemoryRouter>
    );
    expect(screen.getByText(/3 дня/i)).toBeInTheDocument();
    expect(screen.queryByText(/20 мин/i)).not.toBeInTheDocument();
  });

  it('разводит вход сотрудника и администратора по разным режимам логина', async () => {
    render(
      <TestMemoryRouter>
        <HomePage />
      </TestMemoryRouter>
    );

    await userEvent.click(screen.getByRole('button', { name: /Войти с паролем/i }));
    expect(navigateMock).toHaveBeenLastCalledWith('/login?role=employee');

    await userEvent.click(screen.getByRole('button', { name: /Войти в админку/i }));
    expect(navigateMock).toHaveBeenLastCalledWith('/login?role=admin');
  });

  it('гостевой вход авто-загружает единственный проект в store', async () => {
    const { createGuestSession } = await import('@/api/auth');
    const project = {
      id: 'p1',
      name: 'Мой проект',
      description: null,
      task_number: null,
      user_id: null,
      session_id: 'sid-xyz',
      status: 'draft' as const,
      owner_email: null,
      object_types: [],
      created_at: '2026-04-15T00:00:00Z',
      updated_at: '2026-04-15T00:00:00Z',
    };
    (createGuestSession as ReturnType<typeof vi.fn>).mockResolvedValue({
      session_id: 'sid-xyz',
      project,
    });

    render(
      <TestMemoryRouter>
        <HomePage />
      </TestMemoryRouter>
    );
    await userEvent.click(screen.getByRole('button', { name: /Начать без регистрации/i }));

    await waitFor(() => {
      expect(useProjectStore.getState().currentProject?.id).toBe('p1');
      expect(useAuthStore.getState().role).toBe('guest');
      expect(navigateMock).toHaveBeenCalledWith('/workspace/heat-calc');
    });
  });
});
