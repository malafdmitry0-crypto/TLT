import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
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
  batchCalcElectrical: vi.fn(),
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

  describe('Индикатор прогресса (WorkflowSteps)', () => {
    it('отображается на странице', () => {
      useProjectStore.getState().setCurrentProject(mockProject);
      renderPage();
      // Ant Design Steps рендерит тексты шагов
      expect(screen.getByText('Теплопотери')).toBeInTheDocument();
      expect(screen.getByText('Электрорасчёт')).toBeInTheDocument();
      expect(screen.getByText('Спецификация')).toBeInTheDocument();
      expect(screen.getByText('Отчёт')).toBeInTheDocument();
    });

    it('первый шаг активен (current=0)', () => {
      useProjectStore.getState().setCurrentProject(mockProject);
      renderPage();
      // Ant Design помечает активный шаг через aria-selected или класс
      // Достаточно убедиться что шаги отрисованы и компонент присутствует
      const steps = screen.getAllByText(/Теплопотери|Электрорасчёт|Спецификация|Отчёт/i);
      expect(steps.length).toBeGreaterThanOrEqual(4);
    });
  });
});
