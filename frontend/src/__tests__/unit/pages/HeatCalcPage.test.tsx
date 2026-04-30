import { describe, it, expect, vi, beforeEach } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import HeatCalcPage from '@/pages/HeatCalcPage';
import { useProjectStore } from '@/store/projectStore';
import type { Project, ProjectObject } from '@/types/project';

// ── Моки API ─────────────────────────────────────────────────────────────────

vi.mock('@/api/projects', () => ({
  listObjects: vi.fn().mockResolvedValue([]),
  createObject: vi.fn(),
  updateObject: vi.fn(),
  deleteObject: vi.fn(),
  reorderObjects: vi.fn(),
}));

vi.mock('@/api/calculations', () => ({
  batchCalcElectrical: vi.fn().mockResolvedValue({ calculated: 0, skipped: 0, errors: [], results: [] }),
  listCables: vi.fn().mockResolvedValue([]),
  listElectricalCalcs: vi.fn().mockResolvedValue([]),
  selectCableManual: vi.fn(),
}));

vi.mock('@/api/references', () => ({
  getInsulation: vi.fn().mockResolvedValue([]),
}));

// ── Вспомогательные функции ───────────────────────────────────────────────────

const mockProject: Project = {
  id: 'proj-test-1',
  name: 'Тестовый проект',
  description: '',
  user_id: null,
  session_id: 'sess-test',
  status: 'draft',
  task_number: null,
  object_types: [],
  created_at: '2024-01-01T00:00:00Z',
  updated_at: '2024-01-01T00:00:00Z',
  owner_email: null,
};

function makeObject(overrides: Partial<ProjectObject> = {}): ProjectObject {
  return {
    id: 'obj-1',
    project_id: 'proj-test-1',
    object_type: 'pipe',
    sort_order: 0,
    params: { name: 'Труба DN100' },
    results: { heat_loss_per_meter: 50, total_heat_loss: 5000 },
    is_valid: true,
    validation_errors: null,
    created_at: '2024-01-01T00:00:00Z',
    updated_at: '2024-01-01T00:00:00Z',
    ...overrides,
  };
}

function renderPage() {
  const qc = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return render(
    <QueryClientProvider client={qc}>
      <MemoryRouter>
        <HeatCalcPage />
      </MemoryRouter>
    </QueryClientProvider>
  );
}

// ── Тесты ────────────────────────────────────────────────────────────────────

describe('HeatCalcPage', () => {
  beforeEach(() => {
    useProjectStore.getState().setCurrentProject(null);
    vi.clearAllMocks();
  });

  describe('Кнопка «Сформировать отчёт»', () => {
    it('отсутствует на странице при наличии проекта', () => {
      useProjectStore.getState().setCurrentProject(mockProject);
      renderPage();
      expect(screen.queryByText(/Сформировать отчёт/i)).not.toBeInTheDocument();
    });

    it('отсутствует на странице без проекта', () => {
      renderPage();
      expect(screen.queryByText(/Сформировать отчёт/i)).not.toBeInTheDocument();
    });
  });

  describe('Кнопка «Электрорасчёт»', () => {
    it('задизейблена когда нет объектов (validCount=0)', () => {
      useProjectStore.getState().setCurrentProject(mockProject);
      renderPage();
      const btn = screen.getByRole('button', { name: /электрорасчёт/i });
      expect(btn).toBeDisabled();
    });

    it('активна при наличии хотя бы одного валидного объекта', async () => {
      const { listObjects } = await import('@/api/projects');
      (listObjects as ReturnType<typeof vi.fn>).mockResolvedValue([makeObject()]);

      useProjectStore.getState().setCurrentProject(mockProject);
      const qc = new QueryClient({
        defaultOptions: { queries: { retry: false } },
      });
      render(
        <QueryClientProvider client={qc}>
          <MemoryRouter>
            <HeatCalcPage />
          </MemoryRouter>
        </QueryClientProvider>
      );

      // Ждём пока React Query загрузит данные и кнопка разблокируется
      await waitFor(() => {
        const btn = screen.getByRole('button', { name: /электрорасчёт/i });
        expect(btn).not.toBeDisabled();
      });
    });
  });

  describe('Вкладки таблицы', () => {
    it('отображает вкладки исходных данных и результатов', () => {
      useProjectStore.getState().setCurrentProject(mockProject);
      renderPage();
      expect(screen.getByRole('button', { name: 'Исходные данные' })).toBeInTheDocument();
      expect(screen.getByRole('button', { name: 'Результаты расчёта' })).toBeInTheDocument();
    });

    it('на вкладке результатов показывает расчёт выбранного СО', async () => {
      const { listObjects } = await import('@/api/projects');
      (listObjects as ReturnType<typeof vi.fn>).mockResolvedValue([makeObject()]);

      useProjectStore.getState().setCurrentProject(mockProject);
      renderPage();

      fireEvent.click(screen.getByRole('button', { name: 'Результаты расчёта' }));

      await waitFor(() => {
        expect(screen.getByRole('button', { name: /Выполнить электрорасчёт СО1/i })).toBeInTheDocument();
      });
      expect(screen.getByText('Тип кабеля:')).toBeInTheDocument();
      expect(screen.getByRole('button', { name: 'СО4' })).toBeInTheDocument();
    });

    it('на вкладке результатов запускает электрорасчёт выбранного СО', async () => {
      const { listObjects } = await import('@/api/projects');
      const { batchCalcElectrical } = await import('@/api/calculations');
      (listObjects as ReturnType<typeof vi.fn>).mockResolvedValue([makeObject()]);

      useProjectStore.getState().setCurrentProject(mockProject);
      renderPage();

      fireEvent.click(screen.getByRole('button', { name: 'Результаты расчёта' }));
      fireEvent.click(screen.getByRole('button', { name: 'СО2' }));
      const button = await screen.findByRole('button', { name: /Выполнить электрорасчёт СО2/i });
      await waitFor(() => {
        expect(button).not.toBeDisabled();
      });
      fireEvent.click(button);

      await waitFor(() => {
        expect(batchCalcElectrical).toHaveBeenCalledWith('proj-test-1', 'builtin', 2);
      });
    });
  });

  describe('Панель действий объекта', () => {
    it('создаёт копию выбранного объекта через «Создать на основании»', async () => {
      const { listObjects, createObject } = await import('@/api/projects');
      const source = makeObject();
      (listObjects as ReturnType<typeof vi.fn>).mockResolvedValue([source]);
      (createObject as ReturnType<typeof vi.fn>).mockResolvedValue(
        makeObject({ id: 'obj-copy', params: { ...source.params, name: 'Труба DN100 (копия)' } }),
      );

      useProjectStore.getState().setCurrentProject(mockProject);
      renderPage();

      fireEvent.click(await screen.findByText('Труба DN100'));
      fireEvent.click(screen.getByRole('button', { name: 'Создать на основании' }));

      await waitFor(() => {
        expect(createObject).toHaveBeenCalledWith(
          'proj-test-1',
          expect.objectContaining({
            object_type: 'pipe',
            params: expect.objectContaining({ name: 'Труба DN100 (копия)' }),
            sort_order: 1,
          }),
        );
      });
    });
  });
});
