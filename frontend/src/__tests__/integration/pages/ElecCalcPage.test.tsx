import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import ElecCalcPage from '@/pages/ElecCalcPage';
import { useProjectStore } from '@/store/projectStore';
import type { Project, ProjectObject } from '@/types/project';

vi.mock('@/api/projects', () => ({
  listObjects: vi.fn(),
  deleteObject: vi.fn(),
}));

vi.mock('@/api/calculations', () => ({
  batchCalcElectrical: vi.fn(),
  listCables: vi.fn().mockResolvedValue([]),
  listElectricalCalcs: vi.fn(),
  selectCableManual: vi.fn(),
}));

const mockProject: Project = {
  id: 'p-1',
  name: 'Электро',
  description: null,
  task_number: null,
  user_id: null,
  session_id: 'sid',
  status: 'draft',
  owner_email: null,
  object_types: [],
  created_at: '2026-01-01T00:00:00Z',
  updated_at: '2026-01-01T00:00:00Z',
};

function makeObject(over: Partial<ProjectObject> = {}): ProjectObject {
  return {
    id: 'o-1',
    project_id: 'p-1',
    object_type: 'pipe',
    sort_order: 0,
    params: { name: 'Труба-1' },
    results: { heat_loss_per_meter: 50, total_heat_loss: 5000 },
    is_valid: true,
    validation_errors: null,
    created_at: '2026-01-01T00:00:00Z',
    updated_at: '2026-01-01T00:00:00Z',
    ...over,
  };
}

function renderPage() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={qc}>
      <MemoryRouter>
        <ElecCalcPage />
      </MemoryRouter>
    </QueryClientProvider>
  );
}

describe('ElecCalcPage (integration)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    useProjectStore.getState().setCurrentProject(null);
  });

  it('показывает заглушку без проекта', () => {
    renderPage();
    expect(screen.getByText(/Проект не выбран/i)).toBeInTheDocument();
  });

  it('пустой проект — показывает alert «Нет объектов»', async () => {
    const { listObjects } = await import('@/api/projects');
    const { listElectricalCalcs } = await import('@/api/calculations');
    (listObjects as ReturnType<typeof vi.fn>).mockResolvedValue([]);
    (listElectricalCalcs as ReturnType<typeof vi.fn>).mockResolvedValue([]);
    useProjectStore.getState().setCurrentProject(mockProject);
    renderPage();
    await waitFor(() => {
      expect(screen.getByText(/Нет объектов/i)).toBeInTheDocument();
    });
  });

  it('переключатель вариантов СО1..СО4 присутствует', async () => {
    const { listObjects } = await import('@/api/projects');
    const { listElectricalCalcs } = await import('@/api/calculations');
    (listObjects as ReturnType<typeof vi.fn>).mockResolvedValue([]);
    (listElectricalCalcs as ReturnType<typeof vi.fn>).mockResolvedValue([]);
    useProjectStore.getState().setCurrentProject(mockProject);
    renderPage();
    await waitFor(() => {
      expect(screen.getByRole('button', { name: 'СО1' })).toBeInTheDocument();
    });
    expect(screen.getAllByRole('button').some((b) => b.textContent === 'СО1')).toBe(true);
    expect(screen.getAllByRole('button').some((b) => b.textContent === 'СО4')).toBe(true);
  });

  it('при наличии валидного объекта показывает кнопку «Выполнить электрорасчёт»', async () => {
    const { listObjects } = await import('@/api/projects');
    const { listElectricalCalcs } = await import('@/api/calculations');
    (listObjects as ReturnType<typeof vi.fn>).mockResolvedValue([makeObject()]);
    (listElectricalCalcs as ReturnType<typeof vi.fn>).mockResolvedValue([]);
    useProjectStore.getState().setCurrentProject(mockProject);
    renderPage();
    await waitFor(() => {
      expect(
        screen.getByRole('button', { name: /Выполнить электрорасчёт/i })
      ).toBeInTheDocument();
    });
  });

  it('при успешном расчёте отображает подобранный кабель в карточке объекта', async () => {
    const { listObjects } = await import('@/api/projects');
    const { listElectricalCalcs } = await import('@/api/calculations');
    (listObjects as ReturnType<typeof vi.fn>).mockResolvedValue([makeObject()]);
    (listElectricalCalcs as ReturnType<typeof vi.fn>).mockResolvedValue([
      {
        id: 'c-1',
        object_id: 'o-1',
        cable_type: 'self_regulating',
        cable_mark: 'ТЛТ-30',
        variant_number: 1,
        results: {
          selected_cable: 'ТЛТ-30',
          cable_length: 11,
          total_power: 600,
          current: 2.7,
          voltage: 220,
        },
      },
    ]);
    useProjectStore.getState().setCurrentProject(mockProject);
    renderPage();
    await waitFor(() => {
      expect(screen.getAllByText('ТЛТ-30').length).toBeGreaterThan(0);
    });
  });
});
