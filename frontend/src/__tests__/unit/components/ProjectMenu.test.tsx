import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import TestMemoryRouter from '@/__tests__/utils/TestMemoryRouter';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import ProjectMenu from '@/components/layout/ProjectMenu';
import { useAuthStore } from '@/store/authStore';
import { useProjectStore } from '@/store/projectStore';

vi.mock('@/api/projects', () => ({
  createProject: vi.fn(),
  exportProjectCsv: vi.fn(),
  importProjectCsv: vi.fn(),
}));

function renderMenu(initialEntries: string[] = ['/']) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={qc}>
      <TestMemoryRouter initialEntries={initialEntries}>
        <ProjectMenu />
      </TestMemoryRouter>
    </QueryClientProvider>
  );
}

describe('ProjectMenu', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    useProjectStore.getState().setCurrentProject(null);
  });

  it('у пользователя (гостя) нет кнопок «Новый проект» и «Открыть»', () => {
    useAuthStore.setState({
      role: 'guest',
      user: null,
      sessionId: 'sid-1',
      accessToken: null,
      refreshToken: null,
    });
    renderMenu();
    expect(screen.queryByRole('button', { name: 'Новый проект' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Открыть' })).not.toBeInTheDocument();
    // Кнопки загрузить/скачать — всем
    expect(screen.getByRole('button', { name: /Скачать/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Загрузить/i })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Выход' })).not.toBeInTheDocument();
  });

  it('сотруднику показываются обе кнопки управления проектами', () => {
    useAuthStore.setState({
      role: 'employee',
      user: {
        id: 'u1',
        email: 'e@t.ru',
        full_name: null,
        role: 'employee',
        is_active: true,
      },
      sessionId: null,
      accessToken: 'tok',
      refreshToken: 'tok',
    });
    renderMenu();
    expect(screen.getByRole('button', { name: 'Новый проект' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Открыть' })).toBeInTheDocument();
  });

  it('на странице проектов не дублирует глобальные действия проекта', () => {
    useAuthStore.setState({
      role: 'employee',
      user: {
        id: 'u1',
        email: 'e@t.ru',
        full_name: null,
        role: 'employee',
        is_active: true,
      },
      sessionId: null,
      accessToken: 'tok',
      refreshToken: 'tok',
    });
    renderMenu(['/projects']);
    expect(screen.queryByRole('button', { name: 'Новый проект' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Открыть' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Скачать/i })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Загрузить/i })).not.toBeInTheDocument();
  });
});
