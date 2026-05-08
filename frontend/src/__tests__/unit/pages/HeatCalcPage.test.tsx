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
  batchCalcElectrical: vi.fn().mockResolvedValue({ calculated: 0, skipped: 0, heat_loss_failed: 0, errors: [], results: [] }),
  listCables: vi.fn().mockResolvedValue([]),
  listElectricalCalcs: vi.fn().mockResolvedValue([]),
  selectCableManual: vi.fn(),
}));

vi.mock('@/api/references', () => ({
  getClimate: vi.fn().mockResolvedValue([]),
  getCablesTt: vi.fn().mockResolvedValue([]),
  getInsulation: vi.fn().mockResolvedValue([]),
  getPipeMaterials: vi.fn().mockResolvedValue([]),
  getResistiveCables: vi.fn().mockResolvedValue({ single_core: [], three_core: [], common: {} }),
  getSoilConductivity: vi.fn().mockResolvedValue([]),
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
    params: {
      name: 'Труба DN100',
      outer_diameter: 0.1143,
      pipe_length: 25,
      insulation_thickness: 0.05,
      insulation_material: 'mineral_wool',
      process_temperature: 60,
      ambient_temperature: -20,
      valve_count: 1,
      flange_count: 2,
      support_count: 3,
    },
    results: { heat_loss_per_meter: 50, total_heat_loss: 5000 },
    is_valid: true,
    validation_errors: null,
    created_at: '2024-01-01T00:00:00Z',
    updated_at: '2024-01-01T00:00:00Z',
    ...overrides,
  };
}

function makeTank(overrides: Partial<ProjectObject> = {}): ProjectObject {
  return makeObject({
    id: 'tank-1',
    object_type: 'tank',
    sort_order: 1,
    params: {
      name: 'Резервуар прямоугольный',
      shape: 'rectangular',
      length: 3,
      width: 2,
      height: 1.5,
      placement: 'outdoor',
      insulation_thickness: 0.08,
      insulation_material: 'foam_glass',
      process_temperature: 70,
      ambient_temperature: -25,
      q_additional: 150,
    },
    results: { heat_loss_per_m2: 35, total_heat_loss: 2500 },
    ...overrides,
  });
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
      const { listElectricalCalcs } = await import('@/api/calculations');
      (listObjects as ReturnType<typeof vi.fn>).mockResolvedValue([makeObject()]);

      useProjectStore.getState().setCurrentProject(mockProject);
      renderPage();

      fireEvent.click(screen.getByRole('button', { name: 'Результаты расчёта' }));

      await waitFor(() => {
        expect(screen.getByRole('button', { name: /Выполнить электрорасчёт СО1/i })).toBeInTheDocument();
      });
      expect(listElectricalCalcs).toHaveBeenCalledWith('proj-test-1', 1);
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
        expect(batchCalcElectrical).toHaveBeenCalledWith(
          'proj-test-1',
          'builtin',
          2,
          'self_regulating',
          expect.objectContaining({
            supplyVoltage: 220,
            windingCoefficient: 1,
            layingStep: 0.1,
          }),
        );
      });
    });
  });

  describe('Переключатель типа объектов', () => {
    it('по умолчанию показывает только трубопроводы', async () => {
      const { listObjects } = await import('@/api/projects');
      (listObjects as ReturnType<typeof vi.fn>).mockResolvedValue([
        makeObject(),
        makeTank(),
      ]);

      useProjectStore.getState().setCurrentProject(mockProject);
      renderPage();

      await waitFor(() => {
        expect(screen.getByText('Труба DN100')).toBeInTheDocument();
      });
      expect(screen.queryByText('Резервуар прямоугольный')).not.toBeInTheDocument();
      expect(screen.getAllByText('DN').length).toBeGreaterThan(0);
      expect(screen.getAllByText('L, м').length).toBeGreaterThan(0);
    });

    it('при переключении на резервуары показывает только резервуары и их колонки', async () => {
      const { listObjects } = await import('@/api/projects');
      (listObjects as ReturnType<typeof vi.fn>).mockResolvedValue([
        makeObject(),
        makeTank(),
      ]);

      useProjectStore.getState().setCurrentProject(mockProject);
      const user = (await import('@testing-library/user-event')).default.setup();
      renderPage();

      await user.click(await screen.findByText('Резервуары'));

      await waitFor(() => {
        expect(screen.getByText('Резервуар прямоугольный')).toBeInTheDocument();
      });
      expect(screen.queryByText('Труба DN100')).not.toBeInTheDocument();
      expect(screen.getAllByText('Форма').length).toBeGreaterThan(0);
      expect(screen.getAllByText('Габариты').length).toBeGreaterThan(0);
      expect(screen.getAllByText('Размещение').length).toBeGreaterThan(0);
      expect(screen.queryByText('DN')).not.toBeInTheDocument();
      expect(screen.queryByText('L, м')).not.toBeInTheDocument();
      expect(screen.queryByText('Зад.')).not.toBeInTheDocument();
      expect(document.body.textContent).toMatch(/3\s*000.*2\s*000.*1\s*500 мм/);
    });

    it('кнопка «Добавить» открывает форму активного типа без dropdown', async () => {
      useProjectStore.getState().setCurrentProject(mockProject);
      const user = (await import('@testing-library/user-event')).default.setup();
      renderPage();

      await user.click(screen.getByRole('button', { name: /Добавить/i }));
      expect(await screen.findByText('Геометрия трубы')).toBeInTheDocument();

      await user.click(screen.getByRole('button', { name: 'Отменить' }));
      await user.click(screen.getByText('Резервуары'));
      await user.click(screen.getByRole('button', { name: /Добавить/i }));

      expect(await screen.findByText('Форма и геометрия резервуара')).toBeInTheDocument();
    });

    it('при переключении типа очищает выбранные строки', async () => {
      const { listObjects } = await import('@/api/projects');
      (listObjects as ReturnType<typeof vi.fn>).mockResolvedValue([
        makeObject(),
        makeTank(),
      ]);

      useProjectStore.getState().setCurrentProject(mockProject);
      const user = (await import('@testing-library/user-event')).default.setup();
      renderPage();

      await screen.findByText('Труба DN100');
      const rowCheckboxes = screen.getAllByRole('checkbox');
      await user.click(rowCheckboxes[1]);

      expect(await screen.findByText(/Выбрано: 1/)).toBeInTheDocument();
      await user.click(screen.getByText('Резервуары'));
      await waitFor(() => {
        expect(screen.queryByText(/Выбрано: 1/)).not.toBeInTheDocument();
      });
    });

    it('на вкладке результатов меняет единицы q для труб и резервуаров', async () => {
      const { listObjects } = await import('@/api/projects');
      (listObjects as ReturnType<typeof vi.fn>).mockResolvedValue([
        makeObject(),
        makeTank(),
      ]);

      useProjectStore.getState().setCurrentProject(mockProject);
      const user = (await import('@testing-library/user-event')).default.setup();
      renderPage();

      await user.click(screen.getByRole('button', { name: 'Результаты расчёта' }));
      await waitFor(() => {
        expect(screen.getAllByText('q, Вт/м').length).toBeGreaterThan(0);
      });

      await user.click(screen.getByText('Резервуары'));
      await waitFor(() => {
        expect(screen.getAllByText('q, Вт/м²').length).toBeGreaterThan(0);
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
