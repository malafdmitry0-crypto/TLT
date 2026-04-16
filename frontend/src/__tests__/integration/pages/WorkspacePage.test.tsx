import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import WorkspacePage from '@/pages/WorkspacePage';
import { useProjectStore } from '@/store/projectStore';
import type { Project } from '@/types/project';

vi.mock('@/api/projects', () => ({ listObjects: vi.fn() }));
vi.mock('@/api/calculations', () => ({ listElectricalCalcs: vi.fn() }));
vi.mock('@/api/specifications', () => ({ getSpecification: vi.fn() }));

const project: Project = {
  id: 'p1', name: 'P', description: null, task_number: null,
  user_id: null, session_id: 'sid', status: 'draft',
  owner_email: null, object_types: [],
  created_at: '2026-04-15T00:00:00Z', updated_at: '2026-04-15T00:00:00Z',
};

function renderPage() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={qc}>
      <MemoryRouter>
        <WorkspacePage />
      </MemoryRouter>
    </QueryClientProvider>
  );
}

describe('WorkspacePage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    useProjectStore.getState().setCurrentProject(null);
  });

  it('без проекта показывает приветствие', () => {
    renderPage();
    expect(screen.getByText(/Добро пожаловать в HeatCalc/i)).toBeInTheDocument();
    expect(screen.getByText(/Начните с выбора или создания проекта/i)).toBeInTheDocument();
  });

  it('с пустым проектом показывает шаги, шаг 1 активен', async () => {
    const { listObjects } = await import('@/api/projects');
    const { listElectricalCalcs } = await import('@/api/calculations');
    const { getSpecification } = await import('@/api/specifications');
    (listObjects as ReturnType<typeof vi.fn>).mockResolvedValue([]);
    (listElectricalCalcs as ReturnType<typeof vi.fn>).mockResolvedValue([]);
    (getSpecification as ReturnType<typeof vi.fn>).mockResolvedValue(null);

    useProjectStore.getState().setCurrentProject(project);
    renderPage();
    await waitFor(() => {
      expect(screen.getAllByText(/Теплопотери/i)[0]).toBeInTheDocument();
      expect(screen.getAllByText(/Добавьте объекты/i)[0]).toBeInTheDocument();
    });
  });

  it('с объектами + расчётами показывает прогресс', async () => {
    const { listObjects } = await import('@/api/projects');
    const { listElectricalCalcs } = await import('@/api/calculations');
    const { getSpecification } = await import('@/api/specifications');
    (listObjects as ReturnType<typeof vi.fn>).mockResolvedValue([
      { id: 'o1', is_valid: true, object_type: 'pipe', params: {}, results: {}, validation_errors: null, sort_order: 0, project_id: 'p1' },
      { id: 'o2', is_valid: true, object_type: 'pipe', params: {}, results: {}, validation_errors: null, sort_order: 1, project_id: 'p1' },
    ]);
    (listElectricalCalcs as ReturnType<typeof vi.fn>).mockResolvedValue([
      { id: 'e1', object_id: 'o1', cable_mark: 'ТЛТ-25', results: { selected_cable: 'ТЛТ-25' }, variant_number: 1, project_id: 'p1' },
      { id: 'e2', object_id: 'o2', cable_mark: 'ТЛТ-30', results: { selected_cable: 'ТЛТ-30' }, variant_number: 1, project_id: 'p1' },
    ]);
    (getSpecification as ReturnType<typeof vi.fn>).mockResolvedValue({
      id: 's1', items: [{ category: 'cable', name: 'X', unit: 'м', quantity: 5 }],
    });

    useProjectStore.getState().setCurrentProject(project);
    renderPage();
    await waitFor(() => {
      // Все шаги выполнены — отчёт активен
      expect(screen.getAllByText(/2 объектов ✓/i)[0]).toBeInTheDocument();
    });
  });

  it('failed calcs показывает количество ошибок', async () => {
    const { listObjects } = await import('@/api/projects');
    const { listElectricalCalcs } = await import('@/api/calculations');
    const { getSpecification } = await import('@/api/specifications');
    (listObjects as ReturnType<typeof vi.fn>).mockResolvedValue([
      { id: 'o1', is_valid: true, object_type: 'pipe', params: {}, results: {}, validation_errors: null, sort_order: 0, project_id: 'p1' },
    ]);
    (listElectricalCalcs as ReturnType<typeof vi.fn>).mockResolvedValue([
      { id: 'e1', object_id: 'o1', cable_mark: null, results: { error: 'failed' }, variant_number: 1, project_id: 'p1' },
    ]);
    (getSpecification as ReturnType<typeof vi.fn>).mockResolvedValue(null);

    useProjectStore.getState().setCurrentProject(project);
    renderPage();
    await waitFor(() => {
      expect(screen.getAllByText(/ошибок: 1/i)[0]).toBeInTheDocument();
    });
  });
});
