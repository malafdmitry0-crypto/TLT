import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import TestMemoryRouter from '@/__tests__/utils/TestMemoryRouter';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import ProjectsPage from '@/pages/ProjectsPage';
import { useAuthStore } from '@/store/authStore';
import { useProjectStore } from '@/store/projectStore';
import type { Project } from '@/types/project';

vi.mock('@/api/projects', () => ({
  listProjects: vi.fn(),
  deleteProject: vi.fn(),
  createProject: vi.fn(),
  duplicateProject: vi.fn(),
  exportProjectCsv: vi.fn(),
  exportProjectsCsvBulk: vi.fn(),
  importProjectCsv: vi.fn(),
  importProjectsCsvBulk: vi.fn(),
}));

const proj = (over: Partial<Project>): Project => ({
  id: '1',
  name: 'Объект А',
  description: null,
  task_number: null,
  user_id: 'user-1',
  session_id: null,
  status: 'draft',
  owner_email: 'engineer@tlt.ru',
  object_types: [],
  created_at: '2026-04-01T00:00:00Z',
  updated_at: '2026-04-10T00:00:00Z',
  ...over,
});

function renderPage() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={qc}>
      <TestMemoryRouter>
        <ProjectsPage />
      </TestMemoryRouter>
    </QueryClientProvider>
  );
}

describe('ProjectsPage (integration)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    useProjectStore.getState().setCurrentProject(null);
    useAuthStore.setState({
      role: 'employee',
      user: {
        id: 'user-1',
        email: 'engineer@tlt.ru',
        full_name: null,
        role: 'employee',
        is_active: true,
      },
      sessionId: null,
      accessToken: 'tok',
      refreshToken: 'tok',
    });
  });

  it('отображает список проектов от API', async () => {
    const { listProjects } = await import('@/api/projects');
    (listProjects as ReturnType<typeof vi.fn>).mockResolvedValue([
      proj({ id: '1', name: 'Объект Аркуда' }),
      proj({ id: '2', name: 'Объект Богатырь', status: 'completed' }),
    ]);
    renderPage();
    await waitFor(() => {
      expect(screen.getByText('Объект Аркуда')).toBeInTheDocument();
      expect(screen.getByText('Объект Богатырь')).toBeInTheDocument();
    });
  });

  it('фильтрует по поиску названия', async () => {
    const { listProjects } = await import('@/api/projects');
    (listProjects as ReturnType<typeof vi.fn>).mockResolvedValue([
      proj({ id: '1', name: 'Аркуда' }),
      proj({ id: '2', name: 'Богатырь' }),
    ]);
    renderPage();
    await screen.findByText('Аркуда');

    const search = screen.getByPlaceholderText(/По названию/i);
    await userEvent.type(search, 'Богат');
    await waitFor(() => {
      expect(screen.queryByText('Аркуда')).not.toBeInTheDocument();
      expect(screen.getByText('Богатырь')).toBeInTheDocument();
    });
  });

  it('фильтр «Мои проекты» оставляет только проекты user-1', async () => {
    const { listProjects } = await import('@/api/projects');
    (listProjects as ReturnType<typeof vi.fn>).mockResolvedValue([
      proj({ id: '1', name: 'Свой', user_id: 'user-1' }),
      proj({ id: '2', name: 'Чужой', user_id: 'user-2' }),
    ]);
    renderPage();
    await screen.findByText('Свой');
    await screen.findByText('Чужой');

    // В новой раскладке Segmented имеет короткие лейблы «Все» / «Мои»
    await userEvent.click(screen.getByText('Мои'));
    await waitFor(() => {
      expect(screen.getByText('Свой')).toBeInTheDocument();
      expect(screen.queryByText('Чужой')).not.toBeInTheDocument();
    });
  });

  it('гостю не показывается переключатель Сегмент Все/Мои', async () => {
    useAuthStore.setState({
      role: 'guest',
      user: null,
      sessionId: 'sid-1',
      accessToken: null,
      refreshToken: null,
    });
    const { listProjects } = await import('@/api/projects');
    (listProjects as ReturnType<typeof vi.fn>).mockResolvedValue([]);
    renderPage();
    await screen.findByText(/Список проектов/i);
    // У сотрудника — Segmented с лейблами «Все»/«Мои» в левой панели; у гостя его нет
    expect(screen.queryByRole('radio', { name: 'Все' })).not.toBeInTheDocument();
    expect(screen.queryByRole('radio', { name: 'Мои' })).not.toBeInTheDocument();
  });

  it('пакетный экспорт и загрузка доступны только сотруднику', async () => {
    const { listProjects } = await import('@/api/projects');
    (listProjects as ReturnType<typeof vi.fn>).mockResolvedValue([proj({ id: '1' })]);
    renderPage();
    await screen.findByText('Объект А');
    expect(screen.getByRole('button', { name: /Экспорт/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Пакетная загрузка/i })).toBeInTheDocument();
    // Одиночная загрузка — всем
    expect(screen.getByRole('button', { name: 'Загрузить CSV' })).toBeInTheDocument();
  });

  it('гостю пакетные кнопки скрыты, одиночная загрузка есть', async () => {
    useAuthStore.setState({
      role: 'guest',
      user: null,
      sessionId: 'sid-1',
      accessToken: null,
      refreshToken: null,
    });
    const { listProjects } = await import('@/api/projects');
    (listProjects as ReturnType<typeof vi.fn>).mockResolvedValue([]);
    renderPage();
    await screen.findByText(/Список проектов/i);
    expect(screen.queryByRole('button', { name: /Экспорт/i })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Пакетная загрузка/i })).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Загрузить CSV' })).toBeInTheDocument();
  });

  it('сотруднику доступна кнопка «Дублировать»', async () => {
    const { listProjects, duplicateProject } = await import('@/api/projects');
    (listProjects as ReturnType<typeof vi.fn>).mockResolvedValue([
      proj({ id: '1', name: 'Исходный' }),
    ]);
    (duplicateProject as ReturnType<typeof vi.fn>).mockResolvedValue(
      proj({ id: '2', name: 'Исходный (копия)' })
    );
    renderPage();
    await screen.findByText('Исходный');

    await userEvent.click(screen.getByRole('button', { name: 'Дублировать' }));
    await waitFor(() => {
      expect(duplicateProject).toHaveBeenCalledWith('1');
    });
  });

  it('гостю кнопка «Дублировать» не показывается', async () => {
    useAuthStore.setState({
      role: 'guest',
      user: null,
      sessionId: 'sid-1',
      accessToken: null,
      refreshToken: null,
    });
    const { listProjects } = await import('@/api/projects');
    (listProjects as ReturnType<typeof vi.fn>).mockResolvedValue([
      proj({ id: '1', name: 'Исходный', user_id: null, session_id: 'sid-1', owner_email: null }),
    ]);
    renderPage();
    await screen.findByText('Исходный');
    expect(screen.queryByRole('button', { name: 'Дублировать' })).not.toBeInTheDocument();
  });

  it('отображает пустое состояние при отсутствии проектов', async () => {
    const { listProjects } = await import('@/api/projects');
    (listProjects as ReturnType<typeof vi.fn>).mockResolvedValue([]);
    renderPage();
    await waitFor(() => {
      expect(screen.getByText('Проекты не найдены')).toBeInTheDocument();
    });
  });
});
