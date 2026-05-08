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
}));

vi.mock('@/api/references', () => ({
  getClimate: vi.fn().mockResolvedValue([]),
  getInsulation: vi.fn().mockResolvedValue([]),
  getPipeMaterials: vi.fn().mockResolvedValue([]),
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
      placement: 'outdoor',
      outer_diameter: 0.1143,
      wall_thickness: 0.004,
      pipe_material: 'carbon_steel',
      pipe_length: 25,
      insulation_thickness: 0.05,
      insulation_material: 'mineral_wool',
      process_temperature: 60,
      ambient_temperature: -20,
      max_ambient_temperature: 35,
      max_process_temperature: 110,
      environment: 'normal',
      zone_classification: 'safe',
      temperature_group: 'T3',
      min_switch_temperature: -20,
      supply_voltage: 220,
      safety_factor: 1.2,
      steam_tracing: 'no',
      valve_count: 1,
      flange_count: 2,
      support_count: 3,
      local_element_equiv_length: 1.5,
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

  describe('Навигация таблицы', () => {
    it('не показывает внутренние вкладки исходных данных и результатов', () => {
      useProjectStore.getState().setCurrentProject(mockProject);
      renderPage();
      expect(screen.queryByRole('button', { name: 'Исходные данные' })).not.toBeInTheDocument();
      expect(screen.queryByRole('button', { name: 'Результаты расчёта' })).not.toBeInTheDocument();
      expect(screen.queryByText('Тип кабеля:')).not.toBeInTheDocument();
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

      await user.click(await screen.findByLabelText('Резервуары'));
      expect(screen.getByText('Резервуар')).toBeInTheDocument();

      await waitFor(() => {
        expect(screen.getByText('Резервуар прямоугольный')).toBeInTheDocument();
      });
      expect(screen.getByText(/Параметры объекта «Резервуар прямоугольный»/)).toBeInTheDocument();
      expect(screen.queryByText('Труба DN100')).not.toBeInTheDocument();
      expect(screen.getAllByText('Форма').length).toBeGreaterThan(0);
      expect(screen.getAllByText('Габариты').length).toBeGreaterThan(0);
      expect(screen.getAllByText('Размещение').length).toBeGreaterThan(0);
      expect(screen.queryByText('DN')).not.toBeInTheDocument();
      expect(screen.queryByText('L, м')).not.toBeInTheDocument();
      expect(screen.queryByText('Зад.')).not.toBeInTheDocument();
      expect(document.body.textContent).toMatch(/3\s*000.*2\s*000.*1\s*500 мм/);

      await user.click(screen.getByLabelText('Трубопровод'));
      expect(screen.getByText('Труба')).toBeInTheDocument();
      expect(screen.getByText(/Параметры объекта «Труба DN100»/)).toBeInTheDocument();
    });

    it('кнопка «Добавить» открывает форму активного типа без dropdown', async () => {
      useProjectStore.getState().setCurrentProject(mockProject);
      const user = (await import('@testing-library/user-event')).default.setup();
      renderPage();

      await user.click(screen.getByRole('button', { name: /Добавить/i }));
      expect(await screen.findByText('Геометрия трубы')).toBeInTheDocument();

      await user.click(screen.getByRole('button', { name: 'Отменить' }));
      await user.click(screen.getByLabelText('Резервуары'));
      await user.click(screen.getByRole('button', { name: /Добавить/i }));

      expect(await screen.findByText('Форма и геометрия резервуара')).toBeInTheDocument();
    });

    it('основные действия toolbar доступны по имени при icon-only отображении', async () => {
      useProjectStore.getState().setCurrentProject(mockProject);
      const user = (await import('@testing-library/user-event')).default.setup();
      renderPage();

      const addButton = screen.getByRole('button', { name: 'Добавить' });
      const saveButton = screen.getByRole('button', { name: 'Сохранить изменения' });
      const importButton = screen.getByRole('button', { name: 'Импорт XLSX/CSV' });

      expect(screen.getByText('Труба')).toBeInTheDocument();
      expect(screen.getByLabelText('Трубопровод')).toBeInTheDocument();
      expect(screen.getByLabelText('Резервуары')).toBeInTheDocument();
      expect(screen.queryByText('Трубопровод')).not.toBeInTheDocument();
      expect(screen.queryByText('Резервуары')).not.toBeInTheDocument();
      expect(addButton).toHaveClass('action-icon-button');
      expect(addButton.textContent?.trim()).toBe('');
      expect(saveButton).toHaveClass('action-icon-button');
      expect(saveButton).toBeDisabled();
      expect(importButton).toHaveClass('action-icon-button');
      expect(importButton.textContent?.trim()).toBe('');
      expect(screen.queryByText('Импорт XLSX/CSV')).not.toBeInTheDocument();

      await user.click(addButton);

      expect(await screen.findByText('Геометрия трубы')).toBeInTheDocument();
      expect(screen.getByRole('button', { name: 'Сохранить изменения' })).not.toBeDisabled();
      expect(screen.getByRole('button', { name: 'Отменить' })).not.toBeDisabled();
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
      await user.click(screen.getByLabelText('Резервуары'));
      await waitFor(() => {
        expect(screen.queryByText(/Выбрано: 1/)).not.toBeInTheDocument();
      });
    });

  });

  describe('Панель действий объекта', () => {
    it('после сохранения редактируемого объекта оставляет форму открытой в режиме новой записи', async () => {
      const { listObjects, updateObject } = await import('@/api/projects');
      const source = makeObject();
      (listObjects as ReturnType<typeof vi.fn>).mockResolvedValue([source]);
      (updateObject as ReturnType<typeof vi.fn>).mockResolvedValue(
        makeObject({
          id: source.id,
          params: { ...source.params, name: 'Труба DN100' },
        }),
      );

      useProjectStore.getState().setCurrentProject(mockProject);
      const user = (await import('@testing-library/user-event')).default.setup();
      renderPage();

      await user.click(await screen.findByText('Труба DN100'));
      expect(screen.getByText(/Параметры объекта «Труба DN100»/)).toBeInTheDocument();
      expect(screen.getByText('Режим: редактирование')).toBeInTheDocument();

      const toolbarSaveButton = screen
        .getAllByRole('button', { name: 'Сохранить изменения' })
        .find((button) => button.classList.contains('action-icon-button'));
      expect(toolbarSaveButton).toBeDefined();
      await user.click(toolbarSaveButton!);

      await waitFor(() => {
        expect(updateObject).toHaveBeenCalledWith(
          'proj-test-1',
          source.id,
          expect.objectContaining({
            params: expect.objectContaining({
              name: 'Труба DN100',
            }),
          }),
        );
      });
      expect(screen.getByText('Параметры: Трубы')).toBeInTheDocument();
      expect(screen.getByText('новая запись')).toBeInTheDocument();
      expect(screen.getByText('Геометрия трубы')).toBeInTheDocument();
      expect(screen.queryByText(/Параметры объекта «Труба DN100»/)).not.toBeInTheDocument();
    });

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
