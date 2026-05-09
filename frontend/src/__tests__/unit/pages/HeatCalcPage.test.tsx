import { describe, it, expect, vi, beforeEach } from 'vitest';
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import HeatCalcPage from '@/pages/HeatCalcPage';
import { getUserPreference, updateUserPreference } from '@/api/preferences';
import { useAuthStore } from '@/store/authStore';
import { useProjectStore } from '@/store/projectStore';
import { useWorkspaceHeaderStore } from '@/store/workspaceHeaderStore';
import type { Project, ProjectObject, ProjectObjectsQueryRequest } from '@/types/project';
import {
  HEATCALC_GUEST_TABLE_COLUMN_STORAGE_KEY,
  HEATCALC_REGISTERED_TABLE_COLUMN_CACHE_KEY,
  HEATCALC_TABLE_COLUMN_PREF_KEY,
} from '@/utils/heatCalcTableColumns';
import {
  HEATCALC_GUEST_TABLE_VIEW_STORAGE_KEY,
  HEATCALC_REGISTERED_TABLE_VIEW_CACHE_KEY,
  HEATCALC_TABLE_VIEW_PREF_KEY,
} from '@/utils/heatCalcTableViewSettings';

// ── Моки API ─────────────────────────────────────────────────────────────────

vi.mock('@/api/projects', () => {
  const listObjects = vi.fn().mockResolvedValue([]);
  async function getObjectsSummary() {
    const all = await listObjects();
    const byType = {
      pipe: all.filter((item: ProjectObject) => item.object_type === 'pipe').length,
      tank: all.filter((item: ProjectObject) => item.object_type === 'tank').length,
    };
    const validByType = {
      pipe: all.filter((item: ProjectObject) => item.object_type === 'pipe' && item.is_valid).length,
      tank: all.filter((item: ProjectObject) => item.object_type === 'tank' && item.is_valid).length,
    };
    const valid = all.filter((item: ProjectObject) => item.is_valid).length;
    return {
      total: all.length,
      valid,
      invalid: all.length - valid,
      by_type: byType,
      valid_by_type: validByType,
      electrical_calculations_total: 0,
      successful_electrical_calculations: 0,
      failed_electrical_calculations: 0,
      objects_with_successful_electrical_calculation: 0,
    };
  }
  function valueFor(record: ProjectObject, key: string) {
    if (key === 'name') return record.params.name;
    if (key === 'pipe_outer_diameter') return Number(record.params.outer_diameter) * 1000;
    if (key === 'process_temperature') return record.params.process_temperature;
    return record.params[key];
  }
  const queryObjects = vi.fn(async (_projectId: string, payload: ProjectObjectsQueryRequest) => {
    const all = await listObjects();
    const typeItems = all.filter((item: ProjectObject) => item.object_type === payload.object_type);
    let items = [...typeItems];
    for (const filter of payload.filters ?? []) {
      items = items.filter((item) => {
        const value = valueFor(item, filter.key);
        if (filter.op === 'contains') {
          return String(value ?? '').toLocaleLowerCase('ru').includes(String(filter.value ?? '').toLocaleLowerCase('ru'));
        }
        if (filter.op === 'range') {
          const numericValue = Number(value);
          if (!Number.isFinite(numericValue)) return !!filter.include_empty;
          if (Number.isFinite(filter.min) && numericValue < Number(filter.min)) return false;
          if (Number.isFinite(filter.max) && numericValue > Number(filter.max)) return false;
          return true;
        }
        return true;
      });
    }
    if (payload.sort?.key) {
      const sort = payload.sort;
      items.sort((left, right) => {
        const leftValue = Number(valueFor(left, sort.key));
        const rightValue = Number(valueFor(right, sort.key));
        const comparison = leftValue - rightValue;
        return sort.dir === 'desc' ? -comparison : comparison;
      });
    }
    const page = Number(payload.page ?? 1);
    const pageSize = Number(payload.page_size ?? 50);
    const offset = (page - 1) * pageSize;
    const pageItems = items.slice(offset, offset + pageSize);
    return {
      items: pageItems,
      page_info: {
        page,
        page_size: pageSize,
        offset,
        total_pages: items.length ? Math.ceil(items.length / pageSize) : 0,
        has_next_page: page * pageSize < items.length,
        has_previous_page: page > 1,
      },
      counts: {
        total: all.length,
        by_type: {
          pipe: all.filter((item: ProjectObject) => item.object_type === 'pipe').length,
          tank: all.filter((item: ProjectObject) => item.object_type === 'tank').length,
        },
        filtered: items.length,
      },
      query: { object_type: payload.object_type, sort: payload.sort ?? null },
    };
  });
  const getObjectQueryCapabilities = vi.fn(async (_projectId: string, objectType: 'pipe' | 'tank') => ({
    version: 1,
    object_type: objectType,
    default_page_size: 50,
    max_page_size: 200,
    default_sort: { key: 'sort_order', dir: 'asc' },
    search: { enabled: true, max_text_length: 120, default_columns: ['name'] },
    fields: [],
  }));
  return {
    listObjects,
    getObjectsSummary: vi.fn(getObjectsSummary),
    queryObjects,
    getObjectQueryCapabilities,
    createObject: vi.fn(),
    updateObject: vi.fn(),
    deleteObject: vi.fn(),
    reorderObjects: vi.fn(),
  };
});

vi.mock('@/api/calculations', () => ({
  batchCalcElectrical: vi.fn().mockResolvedValue({ calculated: 0, skipped: 0, heat_loss_failed: 0, errors: [], results: [] }),
}));

vi.mock('@/api/references', () => ({
  getClimate: vi.fn().mockResolvedValue([]),
  getInsulation: vi.fn().mockResolvedValue([]),
  getPipeMaterials: vi.fn().mockResolvedValue([]),
  getSoilConductivity: vi.fn().mockResolvedValue([]),
}));

vi.mock('@/api/preferences', () => ({
  getUserPreference: vi.fn(async (key: string) => ({
    key,
    value: null,
    user_id: 'user-test-1',
  })),
  updateUserPreference: vi.fn(),
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

async function openColumnFilter(user: { click: (element: Element) => Promise<unknown> }, label: string) {
  await user.click(screen.getAllByLabelText(`Фильтр ${label}`)[0]);
}

// ── Тесты ────────────────────────────────────────────────────────────────────

describe('HeatCalcPage', () => {
  beforeEach(() => {
    localStorage.clear();
    useAuthStore.getState().logout();
    useProjectStore.getState().setCurrentProject(null);
    useWorkspaceHeaderStore.getState().setContext(null);
    vi.clearAllMocks();
    (getUserPreference as ReturnType<typeof vi.fn>).mockImplementation(async (key: string) => ({
      key,
      value: null,
      user_id: 'user-test-1',
    }));
    (updateUserPreference as ReturnType<typeof vi.fn>).mockReset();
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
      await waitFor(
        () => {
          const btn = screen.getByRole('button', { name: /электрорасчёт/i });
          expect(btn).not.toBeDisabled();
        },
        { timeout: 5000 },
      );
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

    it('при переключении на резервуары показывает только резервуары и не открывает форму автоматически', async () => {
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
      await waitFor(() => {
        expect(useWorkspaceHeaderStore.getState().context).toMatchObject({
          title: 'Параметры объекта',
          modeLabel: 'выберите строку или нажмите «+»',
        });
      });
      expect(screen.queryByText('Труба DN100')).not.toBeInTheDocument();
      expect(screen.getAllByText('Форма').length).toBeGreaterThan(0);
      expect(screen.getAllByText('Габариты').length).toBeGreaterThan(0);
      expect(screen.getAllByText('Размещение').length).toBeGreaterThan(0);
      expect(screen.queryByText('DN')).not.toBeInTheDocument();
      expect(screen.queryByText('L, м')).not.toBeInTheDocument();
      expect(screen.queryByText('Зад.')).not.toBeInTheDocument();
      expect(document.body.textContent).toMatch(/3\s*000.*2\s*000.*1\s*500 мм/);
      expect(screen.queryByText('Форма и геометрия резервуара')).not.toBeInTheDocument();

      await user.click(screen.getByText('Резервуар прямоугольный'));
      await waitFor(() => {
        expect(useWorkspaceHeaderStore.getState().context?.title).toMatch(
          /Параметры объекта «Резервуар прямоугольный»/,
        );
      });

      await user.click(screen.getByLabelText('Трубопровод'));
      expect(screen.getByText('Труба')).toBeInTheDocument();
      await waitFor(() => {
        expect(useWorkspaceHeaderStore.getState().context).toMatchObject({
          title: 'Параметры объекта',
          modeLabel: 'выберите строку или нажмите «+»',
        });
      });
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
    }, 10_000);

    it('основные действия toolbar доступны по имени при icon-only отображении', async () => {
      useProjectStore.getState().setCurrentProject(mockProject);
      const user = (await import('@testing-library/user-event')).default.setup();
      renderPage();

      const addButton = screen.getByRole('button', { name: 'Добавить' });
      const tableFieldsButton = screen.getByRole('button', { name: 'Настройки таблицы' });
      const saveButton = screen.getByRole('button', { name: 'Сохранить изменения' });
      const importButton = screen.getByRole('button', { name: 'Импорт XLSX/CSV' });

      expect(screen.getByText('Труба')).toBeInTheDocument();
      expect(screen.getByLabelText('Трубопровод')).toBeInTheDocument();
      expect(screen.getByLabelText('Резервуары')).toBeInTheDocument();
      expect(screen.queryByText('Трубопровод')).not.toBeInTheDocument();
      expect(screen.queryByText('Резервуары')).not.toBeInTheDocument();
      expect(tableFieldsButton).toHaveClass('action-icon-button');
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

    it('берёт дефолтные колонки из JSON и не пишет гостевой localStorage до изменения', async () => {
      const { listObjects } = await import('@/api/projects');
      (listObjects as ReturnType<typeof vi.fn>).mockResolvedValue([makeObject()]);

      useProjectStore.getState().setCurrentProject(mockProject);
      renderPage();

      await screen.findByText('Труба DN100');
      expect(screen.getAllByText('DN').length).toBeGreaterThan(0);
      expect(localStorage.getItem(HEATCALC_GUEST_TABLE_COLUMN_STORAGE_KEY)).toBeNull();
    });

    it('сохраняет гостевые настройки колонок в localStorage и применяет их только к выбранному типу', async () => {
      const { listObjects } = await import('@/api/projects');
      (listObjects as ReturnType<typeof vi.fn>).mockResolvedValue([
        makeObject(),
        makeTank(),
      ]);

      useProjectStore.getState().setCurrentProject(mockProject);
      const user = (await import('@testing-library/user-event')).default.setup();
      renderPage();

      await screen.findByText('Труба DN100');
      await user.click(screen.getByRole('button', { name: 'Настройки таблицы' }));
      const dialog = await screen.findByRole('dialog', { name: 'Настройки таблицы' });
      await user.click(within(dialog).getByRole('checkbox', { name: 'DN' }));
      await user.click(within(dialog).getByRole('button', { name: 'Применить' }));

      await waitFor(() => {
        expect(screen.queryAllByRole('columnheader').map((header) => header.textContent)).not.toContain('DN');
      });
      const saved = JSON.parse(localStorage.getItem(HEATCALC_GUEST_TABLE_COLUMN_STORAGE_KEY) ?? '{}');
      expect(saved.types.pipe.visibleOrder).not.toContain('pipe_dn');
      expect(saved.types.pipe.columns.pipe_dn).not.toHaveProperty('visible');
      expect(saved.types.pipe.columns.pipe_dn).not.toHaveProperty('order');
      expect(saved.types.tank.visibleOrder).toContain('tank_dimensions');

      await user.click(screen.getByLabelText('Резервуары'));
      await waitFor(() => {
        expect(screen.getByText('Резервуар прямоугольный')).toBeInTheDocument();
      });
      expect(screen.getAllByText('Габариты').length).toBeGreaterThan(0);
    }, 10_000);

    it('сохраняет порядок и ширину колонок из окна «Настройки таблицы»', async () => {
      const { listObjects } = await import('@/api/projects');
      (listObjects as ReturnType<typeof vi.fn>).mockResolvedValue([makeObject()]);

      useProjectStore.getState().setCurrentProject(mockProject);
      const user = (await import('@testing-library/user-event')).default.setup();
      renderPage();

      await screen.findByText('Труба DN100');
      await user.click(screen.getByRole('button', { name: 'Настройки таблицы' }));
      const dialog = await screen.findByRole('dialog', { name: 'Настройки таблицы' });
      const visibleColumnKeys = () =>
        Array.from(dialog.querySelectorAll('.column-layout-row:not(.hidden)'))
          .map((row) => row.getAttribute('data-column-key'));

      const orderInput = within(dialog).getByRole('spinbutton', { name: 'Порядок: DN' });
      const widthInput = within(dialog).getByRole('spinbutton', { name: 'Ширина: DN' });
      fireEvent.change(orderInput, { target: { value: '3' } });
      expect(visibleColumnKeys().slice(0, 5)).toEqual([
        'index',
        'name',
        'pipe_outer_diameter',
        'pipe_dn',
        'pipe_length',
      ]);
      fireEvent.blur(orderInput);
      await waitFor(() => {
        expect(visibleColumnKeys().slice(0, 5)).toEqual([
          'index',
          'name',
          'pipe_dn',
          'pipe_outer_diameter',
          'pipe_length',
        ]);
      });
      fireEvent.change(widthInput, { target: { value: '12.5' } });
      fireEvent.blur(widthInput);
      await user.click(within(dialog).getByRole('button', { name: 'Применить' }));

      const saved = JSON.parse(localStorage.getItem(HEATCALC_GUEST_TABLE_COLUMN_STORAGE_KEY) ?? '{}');
      expect(saved.types.pipe.visibleOrder.slice(0, 5)).toEqual([
        'index',
        'name',
        'pipe_dn',
        'pipe_outer_diameter',
        'pipe_length',
      ]);
      expect(saved.types.pipe.columns.pipe_dn).toMatchObject({ widthPct: 12.5 });
      expect(saved.types.pipe.columns.pipe_dn).not.toHaveProperty('visible');
      expect(saved.types.pipe.columns.pipe_dn).not.toHaveProperty('order');
    }, 10_000);

    it('сохраняет размер текста таблицы отдельной guest-настройкой', async () => {
      const { listObjects } = await import('@/api/projects');
      (listObjects as ReturnType<typeof vi.fn>).mockResolvedValue([makeObject()]);

      useProjectStore.getState().setCurrentProject(mockProject);
      const user = (await import('@testing-library/user-event')).default.setup();
      renderPage();

      await screen.findByText('Труба DN100');
      expect(localStorage.getItem(HEATCALC_GUEST_TABLE_VIEW_STORAGE_KEY)).toBeNull();
      await user.click(screen.getByRole('button', { name: 'Настройки таблицы' }));
      const dialog = await screen.findByRole('dialog', { name: 'Настройки таблицы' });
      await user.click(within(dialog).getByText('Крупный'));
      await user.click(within(dialog).getByRole('button', { name: 'Применить' }));

      await waitFor(() => {
        expect(document.querySelector('.calc-spreadsheet--large')).toBeInTheDocument();
      });
      const saved = JSON.parse(localStorage.getItem(HEATCALC_GUEST_TABLE_VIEW_STORAGE_KEY) ?? '{}');
      expect(saved).toEqual({ version: 1, fontSize: 'large' });
      expect(saved).not.toHaveProperty('fontSizePx');
    }, 10_000);

    it('для зарегистрированного пользователя без записи очищает кеш и возвращает дефолтный JSON', async () => {
      const { listObjects } = await import('@/api/projects');
      const { getUserPreference } = await import('@/api/preferences');
      (listObjects as ReturnType<typeof vi.fn>).mockResolvedValue([makeObject()]);
      (getUserPreference as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
        key: HEATCALC_TABLE_COLUMN_PREF_KEY,
        value: null,
        user_id: 'user-test-1',
      });
      localStorage.setItem(
        HEATCALC_REGISTERED_TABLE_COLUMN_CACHE_KEY,
        JSON.stringify({
          userId: 'user-test-1',
          settings: { version: 1, table: { pipe: ['name'], tank: ['name'] } },
          cachedAt: '2026-05-08T00:00:00.000Z',
        }),
      );
      localStorage.setItem(
        HEATCALC_REGISTERED_TABLE_VIEW_CACHE_KEY,
        JSON.stringify({
          userId: 'user-test-1',
          settings: { version: 1, fontSize: 'large' },
          cachedAt: '2026-05-08T00:00:00.000Z',
        }),
      );
      useAuthStore.getState().setEmployee(
        {
          id: 'user-test-1',
          email: 'user@test.local',
          full_name: null,
          role: 'employee',
          is_active: true,
        },
        { access: 'access-token', refresh: 'refresh-token' },
      );

      useProjectStore.getState().setCurrentProject(mockProject);
      renderPage();

      await waitFor(() => {
        expect(getUserPreference).toHaveBeenCalledWith(HEATCALC_TABLE_COLUMN_PREF_KEY);
        expect(getUserPreference).toHaveBeenCalledWith(HEATCALC_TABLE_VIEW_PREF_KEY);
      });
      await waitFor(() => {
        expect(localStorage.getItem(HEATCALC_REGISTERED_TABLE_COLUMN_CACHE_KEY)).toBeNull();
        expect(localStorage.getItem(HEATCALC_REGISTERED_TABLE_VIEW_CACHE_KEY)).toBeNull();
      });
      await waitFor(() => {
        expect(screen.getAllByText('DN').length).toBeGreaterThan(0);
      });
    });

    it('для зарегистрированного пользователя сохраняет настройки через API и кеширует только ответ БД', async () => {
      const { listObjects } = await import('@/api/projects');
      const { updateUserPreference } = await import('@/api/preferences');
      (listObjects as ReturnType<typeof vi.fn>).mockResolvedValue([makeObject()]);
      (updateUserPreference as ReturnType<typeof vi.fn>).mockImplementation(async (key, value) => ({
        key,
        value,
        user_id: 'user-test-1',
      }));
      useAuthStore.getState().setEmployee(
        {
          id: 'user-test-1',
          email: 'user@test.local',
          full_name: null,
          role: 'employee',
          is_active: true,
        },
        { access: 'access-token', refresh: 'refresh-token' },
      );

      useProjectStore.getState().setCurrentProject(mockProject);
      const user = (await import('@testing-library/user-event')).default.setup();
      renderPage();

      await screen.findByText('Труба DN100');
      await user.click(screen.getByRole('button', { name: 'Настройки таблицы' }));
      const dialog = await screen.findByRole('dialog', { name: 'Настройки таблицы' });
      await user.click(within(dialog).getByRole('checkbox', { name: 'DN' }));
      await user.click(within(dialog).getByText('Крупный'));
      await user.click(within(dialog).getByRole('button', { name: 'Применить' }));

      await waitFor(() => {
        expect(updateUserPreference).toHaveBeenCalledWith(
          HEATCALC_TABLE_COLUMN_PREF_KEY,
          expect.any(Object),
        );
        expect(updateUserPreference).toHaveBeenCalledWith(
          HEATCALC_TABLE_VIEW_PREF_KEY,
          expect.any(Object),
        );
      });
      const preferencePayload = (updateUserPreference as ReturnType<typeof vi.fn>).mock.calls.find(
        ([key]) => key === HEATCALC_TABLE_COLUMN_PREF_KEY,
      )?.[1];
      expect(preferencePayload).toBeDefined();
      expect(preferencePayload.types.pipe.visibleOrder).not.toContain('pipe_dn');
      expect(preferencePayload.types.pipe.columns.pipe_dn).not.toHaveProperty('visible');
      expect(preferencePayload.types.pipe.columns.pipe_dn).not.toHaveProperty('order');
      await waitFor(() => {
        expect(screen.queryAllByRole('columnheader').map((header) => header.textContent)).not.toContain('DN');
      });
      const cached = JSON.parse(localStorage.getItem(HEATCALC_REGISTERED_TABLE_COLUMN_CACHE_KEY) ?? '{}');
      expect(cached.userId).toBe('user-test-1');
      expect(cached.settings.types.pipe.visibleOrder).not.toContain('pipe_dn');
      expect(cached.settings.types.pipe.columns.pipe_dn).not.toHaveProperty('visible');
      expect(cached.settings.types.pipe.columns.pipe_dn).not.toHaveProperty('order');
      const viewCached = JSON.parse(localStorage.getItem(HEATCALC_REGISTERED_TABLE_VIEW_CACHE_KEY) ?? '{}');
      expect(viewCached.userId).toBe('user-test-1');
      expect(viewCached.settings).toEqual({ version: 1, fontSize: 'large' });
    }, 10_000);

    it('фильтр по наименованию скрывает строки только в таблице, не меняя счётчики расчёта', async () => {
      const { listObjects } = await import('@/api/projects');
      const base = makeObject().params;
      (listObjects as ReturnType<typeof vi.fn>).mockResolvedValue([
        makeObject({ id: 'pipe-north', params: { ...base, name: 'Труба Север' } }),
        makeObject({ id: 'pipe-south', params: { ...base, name: 'Труба Юг' } }),
      ]);

      useProjectStore.getState().setCurrentProject(mockProject);
      const user = (await import('@testing-library/user-event')).default.setup();
      renderPage();

      await screen.findByText('Труба Север');
      await screen.findByText('Труба Юг');
      await openColumnFilter(user, 'Наименование');
      await user.type(await screen.findByLabelText('Поиск: Наименование'), 'юг');
      await user.click(screen.getByRole('button', { name: 'Применить' }));

      await waitFor(() => {
        expect(screen.queryByText('Труба Север')).not.toBeInTheDocument();
      });
      expect(screen.getByText('Труба Юг')).toBeInTheDocument();
      expect(screen.getByText('1/2')).toBeInTheDocument();
      expect(screen.getByLabelText('Статус объектов').textContent).toMatch(/Труб:\s*2/);
      expect(screen.getByLabelText('Статус объектов').textContent).toMatch(/Объектов:\s*2/);
    });

    it('range-фильтр по числовой колонке работает в отображаемых единицах и сбрасывается общей кнопкой', async () => {
      const { listObjects } = await import('@/api/projects');
      const base = makeObject().params;
      (listObjects as ReturnType<typeof vi.fn>).mockResolvedValue([
        makeObject({ id: 'pipe-60', params: { ...base, name: 'Труба 60', outer_diameter: 0.06 } }),
        makeObject({ id: 'pipe-219', params: { ...base, name: 'Труба 219', outer_diameter: 0.219 } }),
      ]);

      useProjectStore.getState().setCurrentProject(mockProject);
      const user = (await import('@testing-library/user-event')).default.setup();
      renderPage();

      await screen.findByText('Труба 60');
      await openColumnFilter(user, 'Наружный диаметр');
      await user.type(await screen.findByLabelText('Минимум: Наружный диаметр'), '100');
      await user.click(screen.getByRole('button', { name: 'Применить' }));

      await waitFor(() => {
        expect(screen.queryByText('Труба 60')).not.toBeInTheDocument();
      });
      expect(screen.getByText('Труба 219')).toBeInTheDocument();

      await user.click(screen.getByRole('button', { name: 'Сбросить фильтры таблицы' }));
      expect(await screen.findByText('Труба 60')).toBeInTheDocument();
      expect(screen.getByText('Труба 219')).toBeInTheDocument();
    });

    it('при скрытии колонки убирает невидимый фильтр по этой колонке', async () => {
      const { listObjects } = await import('@/api/projects');
      const base = makeObject().params;
      (listObjects as ReturnType<typeof vi.fn>).mockResolvedValue([
        makeObject({ id: 'pipe-60', params: { ...base, name: 'Труба 60', outer_diameter: 0.06 } }),
        makeObject({ id: 'pipe-219', params: { ...base, name: 'Труба 219', outer_diameter: 0.219 } }),
      ]);

      useProjectStore.getState().setCurrentProject(mockProject);
      const user = (await import('@testing-library/user-event')).default.setup();
      renderPage();

      await screen.findByText('Труба 60');
      await openColumnFilter(user, 'Наружный диаметр');
      await user.type(await screen.findByLabelText('Минимум: Наружный диаметр'), '100');
      await user.click(screen.getByRole('button', { name: 'Применить' }));
      await waitFor(() => {
        expect(screen.queryByText('Труба 60')).not.toBeInTheDocument();
      });

      await user.click(screen.getByRole('button', { name: 'Настройки таблицы' }));
      const dialog = await screen.findByRole('dialog', { name: 'Настройки таблицы' });
      await user.click(within(dialog).getByRole('checkbox', { name: 'Наружный диаметр' }));
      await user.click(within(dialog).getByRole('button', { name: 'Применить' }));

      expect(await screen.findByText('Труба 60')).toBeInTheDocument();
      expect(screen.getByText('Труба 219')).toBeInTheDocument();
      expect(screen.getByRole('button', { name: 'Сбросить фильтры таблицы' })).toBeDisabled();
    }, 10000);

    it('сортировка по диаметру меняет только визуальный порядок строк', async () => {
      const { listObjects } = await import('@/api/projects');
      const base = makeObject().params;
      (listObjects as ReturnType<typeof vi.fn>).mockResolvedValue([
        makeObject({ id: 'pipe-219', sort_order: 0, params: { ...base, name: 'Труба 219', outer_diameter: 0.219 } }),
        makeObject({ id: 'pipe-60', sort_order: 1, params: { ...base, name: 'Труба 60', outer_diameter: 0.06 } }),
      ]);

      useProjectStore.getState().setCurrentProject(mockProject);
      const user = (await import('@testing-library/user-event')).default.setup();
      renderPage();

      await screen.findByText('Труба 219');
      await user.click(screen.getByRole('columnheader', { name: /Ø, мм/ }));

      await waitFor(() => {
        const rows = [...document.querySelectorAll('.calc-spreadsheet .ant-table-tbody > tr[data-row-key]')];
        expect(rows[0]).toHaveTextContent('Труба 60');
        expect(rows[1]).toHaveTextContent('Труба 219');
      });
      expect(screen.getByLabelText('Статус объектов').textContent).toMatch(/Труб:\s*2/);
    });

    it('фильтры труб не переносятся на резервуары', async () => {
      const { listObjects } = await import('@/api/projects');
      const base = makeObject().params;
      (listObjects as ReturnType<typeof vi.fn>).mockResolvedValue([
        makeObject({ id: 'pipe-north', params: { ...base, name: 'Труба Север' } }),
        makeObject({ id: 'pipe-south', params: { ...base, name: 'Труба Юг' } }),
        makeTank({ id: 'tank-main', params: { ...makeTank().params, name: 'Резервуар основной' } }),
      ]);

      useProjectStore.getState().setCurrentProject(mockProject);
      const user = (await import('@testing-library/user-event')).default.setup();
      renderPage();

      await screen.findByText('Труба Север');
      await openColumnFilter(user, 'Наименование');
      await user.type(await screen.findByLabelText('Поиск: Наименование'), 'юг');
      await user.click(screen.getByRole('button', { name: 'Применить' }));
      await waitFor(() => {
        expect(screen.queryByText('Труба Север')).not.toBeInTheDocument();
      });

      await user.click(screen.getByLabelText('Резервуары'));
      expect(await screen.findByText('Резервуар основной')).toBeInTheDocument();
      expect(screen.queryByText('1/1')).not.toBeInTheDocument();
    });

    it('скрытая фильтром выбранная строка снимается с выбора, но форма остаётся открытой', async () => {
      const { listObjects } = await import('@/api/projects');
      const base = makeObject().params;
      (listObjects as ReturnType<typeof vi.fn>).mockResolvedValue([
        makeObject({ id: 'pipe-north', params: { ...base, name: 'Труба Север' } }),
        makeObject({ id: 'pipe-south', params: { ...base, name: 'Труба Юг' } }),
      ]);

      useProjectStore.getState().setCurrentProject(mockProject);
      const user = (await import('@testing-library/user-event')).default.setup();
      renderPage();

      await user.click(await screen.findByText('Труба Север'));
      await waitFor(() => {
        expect(useWorkspaceHeaderStore.getState().context?.title).toMatch(/Труба Север/);
      });
      const rowCheckboxes = screen.getAllByRole('checkbox');
      await user.click(rowCheckboxes[1]);
      expect(await screen.findByText(/Выбрано: 1/)).toBeInTheDocument();

      await openColumnFilter(user, 'Наименование');
      await user.type(await screen.findByLabelText('Поиск: Наименование'), 'юг');
      await user.click(screen.getByRole('button', { name: 'Применить' }));

      await waitFor(() => {
        expect(screen.queryByText(/Выбрано: 1/)).not.toBeInTheDocument();
      });
      expect(useWorkspaceHeaderStore.getState().context?.title).toMatch(/Труба Север/);
      expect(screen.getByText('Труба Юг')).toBeInTheDocument();
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
      await waitFor(() => {
        expect(useWorkspaceHeaderStore.getState().context).toMatchObject({
          title: expect.stringMatching(/Параметры объекта «Труба DN100»/),
          modeLabel: 'Режим: редактирование',
        });
      });

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
      await waitFor(() => {
        expect(useWorkspaceHeaderStore.getState().context).toMatchObject({
          title: 'Параметры: Трубы',
          modeLabel: 'новая запись',
        });
      });
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
