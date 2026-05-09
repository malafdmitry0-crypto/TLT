import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import WorkspacePage from '@/pages/WorkspacePage';
import { useProjectStore } from '@/store/projectStore';
import type { Project } from '@/types/project';

vi.mock('@/api/projects', () => ({ getObjectsSummary: vi.fn() }));
vi.mock('@/api/specifications', () => ({ getSpecification: vi.fn() }));

const project: Project = {
  id: 'p1', name: 'P', description: null, task_number: null,
  user_id: null, session_id: 'sid', status: 'draft',
  owner_email: null, object_types: [],
  created_at: '2026-04-15T00:00:00Z', updated_at: '2026-04-15T00:00:00Z',
};

function summary(overrides: Partial<{
  total: number;
  valid: number;
  invalid: number;
  by_type: { pipe: number; tank: number };
  valid_by_type: { pipe: number; tank: number };
  electrical_calculations_total: number;
  successful_electrical_calculations: number;
  failed_electrical_calculations: number;
  objects_with_successful_electrical_calculation: number;
}> = {}) {
  const total = overrides.total ?? 0;
  const valid = overrides.valid ?? 0;
  return {
    total,
    valid,
    invalid: overrides.invalid ?? total - valid,
    by_type: overrides.by_type ?? { pipe: 0, tank: 0 },
    valid_by_type: overrides.valid_by_type ?? { pipe: 0, tank: 0 },
    electrical_calculations_total: overrides.electrical_calculations_total ?? 0,
    successful_electrical_calculations: overrides.successful_electrical_calculations ?? 0,
    failed_electrical_calculations: overrides.failed_electrical_calculations ?? 0,
    objects_with_successful_electrical_calculation:
      overrides.objects_with_successful_electrical_calculation ?? 0,
  };
}

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
    const { getObjectsSummary } = await import('@/api/projects');
    const { getSpecification } = await import('@/api/specifications');
    (getObjectsSummary as ReturnType<typeof vi.fn>).mockResolvedValue(summary());
    (getSpecification as ReturnType<typeof vi.fn>).mockResolvedValue(null);

    useProjectStore.getState().setCurrentProject(project);
    renderPage();
    await waitFor(() => {
      expect(screen.getAllByText(/Теплопотери/i)[0]).toBeInTheDocument();
      expect(screen.getAllByText(/Добавьте объекты/i)[0]).toBeInTheDocument();
    });
  });

  it('с объектами + расчётами показывает прогресс', async () => {
    const { getObjectsSummary } = await import('@/api/projects');
    const { getSpecification } = await import('@/api/specifications');
    (getObjectsSummary as ReturnType<typeof vi.fn>).mockResolvedValue(summary({
      total: 2,
      valid: 2,
      by_type: { pipe: 2, tank: 0 },
      valid_by_type: { pipe: 2, tank: 0 },
      electrical_calculations_total: 2,
      successful_electrical_calculations: 2,
      objects_with_successful_electrical_calculation: 2,
    }));
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
    const { getObjectsSummary } = await import('@/api/projects');
    const { getSpecification } = await import('@/api/specifications');
    (getObjectsSummary as ReturnType<typeof vi.fn>).mockResolvedValue(summary({
      total: 1,
      valid: 1,
      by_type: { pipe: 1, tank: 0 },
      valid_by_type: { pipe: 1, tank: 0 },
      electrical_calculations_total: 1,
      failed_electrical_calculations: 1,
    }));
    (getSpecification as ReturnType<typeof vi.fn>).mockResolvedValue(null);

    useProjectStore.getState().setCurrentProject(project);
    renderPage();
    await waitFor(() => {
      expect(screen.getAllByText(/ошибок: 1/i)[0]).toBeInTheDocument();
    });
  });
});
