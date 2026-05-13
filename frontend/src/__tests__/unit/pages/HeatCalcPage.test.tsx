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
import {
  HEATCALC_GUEST_CALCULATION_DETAILS_STORAGE_KEY,
  HEATCALC_CALCULATION_DETAILS_PREF_KEY,
} from '@/utils/heatCalcCalculationDetailsSettings';
import {
  HEATCALC_FIELD_INPUT_PREF_KEY,
  HEATCALC_GUEST_FIELD_INPUT_STORAGE_KEY,
  HEATCALC_REGISTERED_FIELD_INPUT_CACHE_KEY,
} from '@/utils/heatCalcFieldInputSettings';

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
  enqueueElectricalBatchJob: vi.fn().mockResolvedValue({ id: 'task-1', status: 'queued' }),
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

async function openTableSettingsOtherTab(
  user: { click: (element: Element) => Promise<unknown> },
  dialog: HTMLElement,
) {
  await user.click(within(dialog).getByRole('tab', { name: 'Остальное' }));
  expect(within(dialog).getByText('Размер текста таблицы')).toBeInTheDocument();
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
    it('отсутствует на странице расчёта теплопотерь', () => {
      useProjectStore.getState().setCurrentProject(mockProject);
      renderPage();
      expect(screen.queryByRole('button', { name: /электрорасчёт/i })).not.toBeInTheDocument();
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

    it('при переключении на резервуар показывает только резервуары и форму добавления резервуара', async () => {
      const { listObjects } = await import('@/api/projects');
      (listObjects as ReturnType<typeof vi.fn>).mockResolvedValue([
        makeObject(),
        makeTank(),
      ]);

      useProjectStore.getState().setCurrentProject(mockProject);
      const user = (await import('@testing-library/user-event')).default.setup();
      renderPage();

      const typeToolbar = screen.getByRole('toolbar', { name: 'Тип объекта и блок параметров' });
      expect(await screen.findByText('Геометрия трубы')).toBeInTheDocument();
      expect(within(typeToolbar).getByText('Режим: добавление')).toBeInTheDocument();
      await user.click(await within(typeToolbar).findByRole('button', { name: /Резервуар:/ }));
      expect(within(typeToolbar).getByRole('button', { name: /Резервуар:/ })).toHaveAttribute('aria-pressed', 'true');

      await waitFor(() => {
        expect(screen.getByText('Резервуар прямоугольный')).toBeInTheDocument();
      });
      await waitFor(() => {
        expect(within(typeToolbar).getByText('Режим: добавление')).toBeInTheDocument();
      });
      expect(useWorkspaceHeaderStore.getState().context).toBeNull();
      expect(screen.queryByText('Труба DN100')).not.toBeInTheDocument();
      expect(screen.getAllByText('Форма').length).toBeGreaterThan(0);
      expect(screen.getAllByText('Габариты').length).toBeGreaterThan(0);
      expect(screen.getAllByText('Размещение').length).toBeGreaterThan(0);
      expect(screen.queryByText('DN')).not.toBeInTheDocument();
      expect(screen.queryByText('L, м')).not.toBeInTheDocument();
      expect(screen.queryByText('Зад.')).not.toBeInTheDocument();
      expect(document.body.textContent).toMatch(/3\s*000.*2\s*000.*1\s*500 мм/);
      expect(screen.getByText('Форма и геометрия резервуара')).toBeInTheDocument();

      await user.click(screen.getByText('Резервуар прямоугольный'));
      await waitFor(() => {
        expect(within(typeToolbar).getByText('Режим: изменение')).toBeInTheDocument();
      });

      await user.click(within(typeToolbar).getByRole('button', { name: /Трубопровод:/ }));
      expect(within(typeToolbar).getByRole('button', { name: /Трубопровод:/ })).toHaveAttribute('aria-pressed', 'true');
      await waitFor(() => {
        expect(within(typeToolbar).getByText('Режим: добавление')).toBeInTheDocument();
      });
      expect(screen.getByText('Геометрия трубы')).toBeInTheDocument();
    });

    it('режим «Все» показывает трубопроводы и резервуары в одной таблице', async () => {
      const { listObjects } = await import('@/api/projects');
      (listObjects as ReturnType<typeof vi.fn>).mockResolvedValue([
        makeObject(),
        makeTank(),
      ]);

      useProjectStore.getState().setCurrentProject(mockProject);
      const user = (await import('@testing-library/user-event')).default.setup();
      renderPage();

      const typeToolbar = screen.getByRole('toolbar', { name: 'Тип объекта и блок параметров' });
      await user.click(await within(typeToolbar).findByRole('button', { name: /Все:/ }));

      expect(within(typeToolbar).getByRole('button', { name: /Все:/ })).toHaveAttribute('aria-pressed', 'true');
      expect(await screen.findByText('Труба DN100')).toBeInTheDocument();
      expect(await screen.findByText('Резервуар прямоугольный')).toBeInTheDocument();
      expect(screen.getAllByText('Тип').length).toBeGreaterThan(0);
    });

    it('настройки таблицы для режима «Все» сохраняются отдельно от труб и резервуаров', async () => {
      const { listObjects } = await import('@/api/projects');
      (listObjects as ReturnType<typeof vi.fn>).mockResolvedValue([
        makeObject(),
        makeTank(),
      ]);

      useProjectStore.getState().setCurrentProject(mockProject);
      const user = (await import('@testing-library/user-event')).default.setup();
      renderPage();

      const typeToolbar = screen.getByRole('toolbar', { name: 'Тип объекта и блок параметров' });
      await user.click(await within(typeToolbar).findByRole('button', { name: /Все:/ }));
      expect(await screen.findByText('Труба DN100')).toBeInTheDocument();
      expect(await screen.findByText('Резервуар прямоугольный')).toBeInTheDocument();

      await user.click(screen.getByRole('button', { name: 'Настройки отображения' }));
      const dialog = await screen.findByRole('dialog', { name: 'Настройки таблицы' });
      expect(within(dialog).getByText('Все')).toBeInTheDocument();
      await user.click(within(dialog).getByRole('checkbox', { name: 'Температура поддержания' }));
      await user.click(within(dialog).getByRole('button', { name: 'Применить' }));

      await waitFor(() => {
        expect(screen.queryAllByRole('columnheader').map((header) => header.textContent)).not.toContain('Т подд.');
      });
      const saved = JSON.parse(localStorage.getItem(HEATCALC_GUEST_TABLE_COLUMN_STORAGE_KEY) ?? '{}');
      expect(saved.types.all.visibleOrder).not.toContain('process_temperature');
      expect(saved.types.pipe.visibleOrder).toContain('process_temperature');
      expect(saved.types.tank.visibleOrder).toContain('process_temperature');
    }, 10_000);

    it('режим «Все» позволяет включить поля труб и резервуаров и показывает прочерки для чужого типа', async () => {
      const { listObjects } = await import('@/api/projects');
      (listObjects as ReturnType<typeof vi.fn>).mockResolvedValue([
        makeObject(),
        makeTank(),
      ]);

      useProjectStore.getState().setCurrentProject(mockProject);
      const user = (await import('@testing-library/user-event')).default.setup();
      renderPage();

      const typeToolbar = screen.getByRole('toolbar', { name: 'Тип объекта и блок параметров' });
      await user.click(await within(typeToolbar).findByRole('button', { name: /Все:/ }));
      expect(await screen.findByText('Труба DN100')).toBeInTheDocument();
      expect(await screen.findByText('Резервуар прямоугольный')).toBeInTheDocument();
      expect(screen.queryAllByRole('columnheader').map((header) => header.textContent)).not.toContain('DN');
      expect(screen.queryAllByRole('columnheader').map((header) => header.textContent)).not.toContain('Форма');

      await user.click(screen.getByRole('button', { name: 'Настройки отображения' }));
      const dialog = await screen.findByRole('dialog', { name: 'Настройки таблицы' });
      expect(within(dialog).getByRole('checkbox', { name: 'DN' })).not.toBeChecked();
      expect(within(dialog).getByRole('checkbox', { name: 'Форма резервуара' })).not.toBeChecked();
      await user.click(within(dialog).getByRole('checkbox', { name: 'DN' }));
      await user.click(within(dialog).getByRole('checkbox', { name: 'Форма резервуара' }));
      await user.click(within(dialog).getByRole('button', { name: 'Применить' }));

      const table = document.querySelector<HTMLElement>('.calc-spreadsheet');
      expect(table).not.toBeNull();
      await waitFor(() => {
        const headerTexts = Array.from(table!.querySelectorAll('thead th'))
          .map((header) => header.textContent?.replace(/\s+/g, ' ').trim() ?? '');
        expect(headerTexts).toContain('DN');
        expect(headerTexts).toContain('Форма');
      });
      const headerTexts = Array.from(table!.querySelectorAll('thead th'))
        .map((header) => header.textContent?.replace(/\s+/g, ' ').trim() ?? '');
      const dnIndex = headerTexts.findIndex((text) => text === 'DN');
      const shapeIndex = headerTexts.findIndex((text) => text === 'Форма');
      expect(dnIndex).toBeGreaterThan(-1);
      expect(shapeIndex).toBeGreaterThan(-1);

      const pipeRow = screen.getByText('Труба DN100').closest('tr');
      const tankRow = screen.getByText('Резервуар прямоугольный').closest('tr');
      expect(pipeRow).not.toBeNull();
      expect(tankRow).not.toBeNull();
      const pipeCells = Array.from(pipeRow!.querySelectorAll('td'))
        .map((cell) => cell.textContent?.replace(/\s+/g, ' ').trim() ?? '');
      const tankCells = Array.from(tankRow!.querySelectorAll('td'))
        .map((cell) => cell.textContent?.replace(/\s+/g, ' ').trim() ?? '');

      expect(pipeCells[dnIndex]).toBe('DN100');
      expect(pipeCells[shapeIndex]).toBe('—');
      expect(tankCells[dnIndex]).toBe('—');
      expect(tankCells[shapeIndex]).toBe('Прямоуг.');

      const saved = JSON.parse(localStorage.getItem(HEATCALC_GUEST_TABLE_COLUMN_STORAGE_KEY) ?? '{}');
      expect(saved.types.all.visibleOrder).toEqual(expect.arrayContaining(['pipe_dn', 'tank_shape']));
      expect(saved.types.pipe.visibleOrder).toContain('pipe_dn');
      expect(saved.types.tank.visibleOrder).toContain('tank_shape');
    }, 10_000);

    it('кнопка «Добавить» сбрасывает форму активного типа без dropdown', async () => {
      useProjectStore.getState().setCurrentProject(mockProject);
      const user = (await import('@testing-library/user-event')).default.setup();
      renderPage();

      const formActionsToolbar = screen.getByRole('toolbar', { name: 'Действия блока заполнения' });
      const addButton = within(formActionsToolbar).getByRole('button', { name: 'Добавить' });
      expect(await screen.findByText('Геометрия трубы')).toBeInTheDocument();
      await user.type(screen.getByTestId('object-name-input'), 'Черновик трубы');
      await user.click(addButton);
      await waitFor(() => {
        expect(screen.getByTestId('object-name-input')).toHaveValue('');
      });

      await user.click(screen.getByRole('button', { name: /Резервуар:/ }));
      await user.click(addButton);

      expect(await screen.findByText('Форма и геометрия резервуара')).toBeInTheDocument();
    }, 10_000);

    it('основные действия toolbar доступны по имени при icon-only отображении', async () => {
      useProjectStore.getState().setCurrentProject(mockProject);
      renderPage();

      const addButton = screen.getByRole('button', { name: 'Добавить' });
      const tableFieldsButton = screen.getByRole('button', { name: 'Настройки отображения' });
      const saveButton = screen.getByRole('button', { name: 'Сохранить' });
      const deleteButton = screen.getByRole('button', { name: 'Удалить выбранные' });
      const importButton = screen.getByRole('button', { name: 'Импорт XLSX/CSV' });

      const typeToolbar = screen.getByRole('toolbar', { name: 'Тип объекта и блок параметров' });
      const formActionsToolbar = screen.getByRole('toolbar', { name: 'Действия блока заполнения' });
      const tableActionsToolbar = screen.getByRole('toolbar', { name: 'Действия таблицы объектов' });
      const paramsBlock = screen.getByLabelText('Блок заполнения параметров');
      expect(typeToolbar.compareDocumentPosition(paramsBlock) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
      expect(paramsBlock.compareDocumentPosition(formActionsToolbar) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
      expect(formActionsToolbar.compareDocumentPosition(tableActionsToolbar) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
      expect(formActionsToolbar.parentElement).toBe(tableActionsToolbar.parentElement);
      expect(formActionsToolbar.parentElement).toHaveClass('actionbar-actions-row');
      expect(within(typeToolbar).getByRole('button', { name: /Трубопровод:/ })).toHaveAttribute('aria-pressed', 'true');
      expect(within(typeToolbar).getByRole('button', { name: /Резервуар:/ })).toHaveAttribute('aria-pressed', 'false');
      expect(within(typeToolbar).getByRole('button', { name: /Все:/ })).toHaveAttribute('aria-pressed', 'false');
      expect(within(typeToolbar).getByText('Режим: добавление')).toBeInTheDocument();
      expect(within(typeToolbar).getByRole('checkbox', { name: 'Показать блок заполнения параметров' })).toBeChecked();
      expect(within(formActionsToolbar).getByRole('button', { name: 'Добавить' })).toBe(addButton);
      expect(within(formActionsToolbar).getByRole('button', { name: 'Сохранить' })).toBe(saveButton);
      expect(within(formActionsToolbar).getByRole('button', { name: 'Удалить выбранные' })).toBe(deleteButton);
      expect(deleteButton).toBeDisabled();
      expect(deleteButton.textContent).toContain('Удалить');
      expect(saveButton.compareDocumentPosition(deleteButton) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
      expect(within(formActionsToolbar).queryByRole('button', { name: 'Сбросить' })).not.toBeInTheDocument();
      expect(within(tableActionsToolbar).getByRole('button', { name: 'Настройки отображения' })).toBe(tableFieldsButton);
      expect(within(tableActionsToolbar).getByRole('button', { name: 'Добавить копии выбранных' })).toBeDisabled();
      expect(within(tableActionsToolbar).queryByRole('button', { name: 'Удалить выбранные' })).not.toBeInTheDocument();
      expect(within(tableActionsToolbar).getByRole('button', { name: 'Импорт XLSX/CSV' })).toBe(importButton);
      expect(within(tableActionsToolbar).queryByRole('button', { name: 'Трубопровод' })).not.toBeInTheDocument();
      expect(within(tableActionsToolbar).queryByRole('button', { name: 'Резервуар' })).not.toBeInTheDocument();
      expect(within(tableActionsToolbar).queryByText(/Режим:/)).not.toBeInTheDocument();
      expect(within(tableActionsToolbar).queryByRole('checkbox', { name: 'Показать блок заполнения параметров' })).not.toBeInTheDocument();
      expect(within(tableActionsToolbar).queryByText(/Все рассчитаны/)).not.toBeInTheDocument();
      expect(useWorkspaceHeaderStore.getState().context).toBeNull();
      expect(tableFieldsButton.textContent).toContain('Настройки отображения');
      expect(addButton).toHaveClass('action-add-button');
      expect(addButton.textContent).toContain('Добавить');
      expect(saveButton).toHaveClass('action-save-button');
      expect(saveButton).not.toBeDisabled();
      expect(importButton.textContent).toContain('Импорт');
      expect(within(typeToolbar).getByRole('button', { name: /Трубопровод:\s*0/ })).toBeInTheDocument();
      expect(within(typeToolbar).getByRole('button', { name: /Резервуар:\s*0/ })).toBeInTheDocument();
      expect(within(typeToolbar).getByRole('button', { name: /Все:\s*0/ })).toBeInTheDocument();
      expect(screen.queryByLabelText('Количество объектов')).not.toBeInTheDocument();
      expect(await screen.findByText('Геометрия трубы')).toBeInTheDocument();
      expect(screen.queryByRole('button', { name: 'Сбросить' })).not.toBeInTheDocument();
    });

    it('скрывает блок вручную, убирает режим и сбрасывает заполненные параметры', async () => {
      useProjectStore.getState().setCurrentProject(mockProject);
      const user = (await import('@testing-library/user-event')).default.setup();
      renderPage();
      const paramsBlock = () =>
        document.querySelector<HTMLElement>('[aria-label="Блок заполнения параметров"]');

      const typeToolbar = screen.getByRole('toolbar', { name: 'Тип объекта и блок параметров' });
      const visibilityToggle = within(typeToolbar).getByRole('checkbox', {
        name: 'Показать блок заполнения параметров',
      });
      expect(visibilityToggle).toBeChecked();
      expect(paramsBlock()).toBeVisible();
      expect(await screen.findByText('Геометрия трубы')).toBeInTheDocument();
      await user.type(screen.getByTestId('object-name-input'), 'Черновик трубы');
      expect(screen.getByTestId('object-name-input')).toHaveValue('Черновик трубы');

      await user.click(visibilityToggle);
      expect(visibilityToggle).not.toBeChecked();
      expect(paramsBlock()).not.toBeVisible();
      expect(screen.queryByRole('toolbar', { name: 'Действия блока заполнения' })).not.toBeInTheDocument();
      expect(within(typeToolbar).queryByText(/Режим:/)).not.toBeInTheDocument();
      expect(screen.queryByTestId('object-name-input')).not.toBeInTheDocument();

      expect(screen.queryByRole('button', { name: 'Добавить' })).not.toBeInTheDocument();
      expect(within(typeToolbar).queryByText(/Режим:/)).not.toBeInTheDocument();
      expect(paramsBlock()).not.toBeVisible();

      await user.click(visibilityToggle);
      expect(visibilityToggle).toBeChecked();
      expect(await screen.findByText('Геометрия трубы')).toBeInTheDocument();
      expect(screen.getByRole('toolbar', { name: 'Действия блока заполнения' })).toBeInTheDocument();
      expect(within(typeToolbar).getByText('Режим: добавление')).toBeInTheDocument();
      expect(screen.getByTestId('object-name-input')).toHaveValue('');
      expect(paramsBlock()).toBeVisible();
    }, 10_000);

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
      await user.click(screen.getByRole('button', { name: 'Настройки отображения' }));
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

      await user.click(screen.getByRole('button', { name: /Резервуар:/ }));
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
      await user.click(screen.getByRole('button', { name: 'Настройки отображения' }));
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
      await user.click(screen.getByRole('button', { name: 'Настройки отображения' }));
      const dialog = await screen.findByRole('dialog', { name: 'Настройки таблицы' });
      await openTableSettingsOtherTab(user, dialog);
      await user.click(within(dialog).getByText('Крупный'));
      await user.click(within(dialog).getByRole('button', { name: 'Применить' }));

      await waitFor(() => {
        expect(document.querySelector('.calc-spreadsheet--large')).toBeInTheDocument();
      });
      const saved = JSON.parse(localStorage.getItem(HEATCALC_GUEST_TABLE_VIEW_STORAGE_KEY) ?? '{}');
      expect(saved).toEqual({
        version: 1,
        fontSize: 'large',
        inlineEditingEnabled: false,
        formPlacement: 'top',
      });
      expect(saved).not.toHaveProperty('fontSizePx');
    }, 10_000);

    it('сохраняет положение блока параметров в настройках отображения', async () => {
      const { listObjects } = await import('@/api/projects');
      (listObjects as ReturnType<typeof vi.fn>).mockResolvedValue([makeObject()]);

      useProjectStore.getState().setCurrentProject(mockProject);
      const user = (await import('@testing-library/user-event')).default.setup();
      renderPage();

      await screen.findByText('Труба DN100');
      await user.click(screen.getByRole('button', { name: 'Настройки отображения' }));
      const dialog = await screen.findByRole('dialog', { name: 'Настройки таблицы' });
      await openTableSettingsOtherTab(user, dialog);
      await user.click(within(dialog).getByText('Слева'));
      await user.click(within(dialog).getByRole('button', { name: 'Применить' }));

      await waitFor(() => {
        expect(document.querySelector('.heatcalc-workspace-layout--left')).toBeInTheDocument();
      });
      const saved = JSON.parse(localStorage.getItem(HEATCALC_GUEST_TABLE_VIEW_STORAGE_KEY) ?? '{}');
      expect(saved).toMatchObject({
        version: 1,
        fontSize: 'standard',
        inlineEditingEnabled: false,
        formPlacement: 'left',
      });
    }, 10_000);

    it('показывает расшифровку расчёта без ошибочного Tср', async () => {
      const { listObjects } = await import('@/api/projects');
      (listObjects as ReturnType<typeof vi.fn>).mockResolvedValue([
        makeObject({
          params: {
            ...makeObject().params,
            process_temperature: 60,
            ambient_temperature: -20,
            ambient_temperature_source: 'climate',
          },
          results: {
            heat_loss_per_meter: 50,
            total_heat_loss: 5000,
            alpha_vnesh: 24.1,
            safety_factor: 1.2,
            insulation_resistance: 1.5447,
            external_resistance: 0.0389,
            effective_length: 64,
          },
        }),
      ]);

      useProjectStore.getState().setCurrentProject(mockProject);
      const user = (await import('@testing-library/user-event')).default.setup();
      renderPage();

      await user.click(await screen.findByText('Труба DN100'));

      expect(await screen.findByText('Расшифровка расчёта:')).toBeInTheDocument();
      expect(screen.getByText('ΔT: 80°C')).toBeInTheDocument();
      expect(screen.getByText('α примен.: 24,1 Вт/м²К')).toBeInTheDocument();
      expect(screen.getByText('Lэфф: 64,0 м')).toBeInTheDocument();
      expect(screen.queryByText(/Tср/)).not.toBeInTheDocument();
      expect(screen.queryByText(/\(—\)/)).not.toBeInTheDocument();
    }, 10_000);

    it('сохраняет настройки расшифровки расчёта отдельно от настроек таблицы', async () => {
      const { listObjects } = await import('@/api/projects');
      (listObjects as ReturnType<typeof vi.fn>).mockResolvedValue([makeObject()]);

      useProjectStore.getState().setCurrentProject(mockProject);
      const user = (await import('@testing-library/user-event')).default.setup();
      renderPage();

      await screen.findByText('Труба DN100');
      expect(localStorage.getItem(HEATCALC_GUEST_CALCULATION_DETAILS_STORAGE_KEY)).toBeNull();
      await user.click(screen.getByRole('button', { name: 'Настройки отображения' }));
      const dialog = await screen.findByRole('dialog', { name: 'Настройки таблицы' });
      await openTableSettingsOtherTab(user, dialog);
      await user.click(within(dialog).getByText('Подробно'));
      await user.click(within(dialog).getByRole('button', { name: 'Применить' }));

      const saved = JSON.parse(localStorage.getItem(HEATCALC_GUEST_CALCULATION_DETAILS_STORAGE_KEY) ?? '{}');
      expect(saved).toMatchObject({ version: 1, preset: 'detailed' });
      expect(saved.visibleMetrics).toContain('thermal_resistance');
      expect(saved.visibleMetrics).toContain('temperature_source');
    }, 10_000);

    it('сохраняет гостевой шаг числового поля и применяет его в форме', async () => {
      const { listObjects } = await import('@/api/projects');
      (listObjects as ReturnType<typeof vi.fn>).mockResolvedValue([makeObject()]);

      useProjectStore.getState().setCurrentProject(mockProject);
      const user = (await import('@testing-library/user-event')).default.setup();
      renderPage();

      await screen.findByText('Труба DN100');
      await screen.findByText('Геометрия трубы');
      await user.click(screen.getByRole('button', { name: 'Настройки отображения' }));
      const dialog = await screen.findByRole('dialog', { name: 'Настройки таблицы' });
      const stepInput = within(dialog).getByRole('spinbutton', { name: 'Шаг: Наружный диаметр' });
      fireEvent.change(stepInput, { target: { value: '10' } });
      fireEvent.blur(stepInput);
      await user.click(within(dialog).getByRole('button', { name: 'Применить' }));

      const saved = JSON.parse(localStorage.getItem(HEATCALC_GUEST_FIELD_INPUT_STORAGE_KEY) ?? '{}');
      expect(saved.fields.pipe.outer_diameter_mm).toEqual({ step: 10 });
      await waitFor(() => {
        expect(screen.getByTestId('outer-diameter-input')).toHaveAttribute('step', '10');
      });
    }, 10_000);

    it('включает inline-редактирование через настройки таблицы и сохраняет draft только по кнопке', async () => {
      const { listObjects, updateObject } = await import('@/api/projects');
      const source = makeObject();
      (listObjects as ReturnType<typeof vi.fn>).mockResolvedValue([source]);
      (updateObject as ReturnType<typeof vi.fn>).mockResolvedValue(
        makeObject({ params: { ...source.params, name: 'Труба inline' } }),
      );

      useProjectStore.getState().setCurrentProject(mockProject);
      const user = (await import('@testing-library/user-event')).default.setup();
      renderPage();

      await screen.findByText('Труба DN100');
      await user.click(screen.getByRole('button', { name: 'Настройки отображения' }));
      const dialog = await screen.findByRole('dialog', { name: 'Настройки таблицы' });
      await openTableSettingsOtherTab(user, dialog);
      const inlineToggle = within(dialog).getByRole('checkbox', { name: 'Редактировать ячейки в таблице' });
      expect(inlineToggle).not.toBeChecked();
      await user.click(inlineToggle);
      await user.click(within(dialog).getByRole('button', { name: 'Применить' }));

      await user.click(await screen.findByText('Труба DN100'));
      const editor = await screen.findByDisplayValue('Труба DN100');
      await user.clear(editor);
      await user.type(editor, 'Труба inline');
      await user.keyboard('{Enter}');

      expect(updateObject).not.toHaveBeenCalled();
      expect(await screen.findByText('Несохранено: 1')).toBeInTheDocument();
      expect(screen.getByText('Труба inline')).toBeInTheDocument();
      const dirtyCell = screen.getByRole('button', { name: 'Труба inline' });
      expect(dirtyCell).toHaveClass('dirty');
      expect(dirtyCell.closest('tr')).toHaveClass('row-dirty');
      expect(dirtyCell.closest('td')).toHaveClass('editable-cell-enabled');

      expect(screen.queryByText('Сохранить все (1)')).not.toBeInTheDocument();
      await user.click(screen.getByRole('button', { name: 'Сохранить' }));

      await waitFor(() => {
        expect(updateObject).toHaveBeenCalledWith(
          'proj-test-1',
          source.id,
          expect.objectContaining({
            params: expect.objectContaining({ name: 'Труба inline' }),
          }),
        );
      });
      await waitFor(() => {
        expect(screen.queryByText('Несохранено: 1')).not.toBeInTheDocument();
      });
      const saved = JSON.parse(localStorage.getItem(HEATCALC_GUEST_TABLE_VIEW_STORAGE_KEY) ?? '{}');
      expect(saved.inlineEditingEnabled).toBe(true);
    }, 30_000);

    it('подсвечивает только inline-редактируемые ячейки при включенном режиме', async () => {
      const { listObjects } = await import('@/api/projects');
      (listObjects as ReturnType<typeof vi.fn>).mockResolvedValue([makeObject()]);

      useProjectStore.getState().setCurrentProject(mockProject);
      const user = (await import('@testing-library/user-event')).default.setup();
      renderPage();

      const table = document.querySelector<HTMLElement>('.calc-spreadsheet');
      expect(table).not.toBeNull();
      const tableElement = table!;
      await waitFor(() => {
        expect(within(tableElement).getByText('Труба DN100')).toBeInTheDocument();
      });
      const initialNameCell = within(tableElement).getByText('Труба DN100').closest('td');
      expect(initialNameCell).not.toHaveClass('editable-cell-enabled');
      expect(within(tableElement).queryByRole('button', { name: 'Труба DN100' })).not.toBeInTheDocument();

      await user.click(screen.getByRole('button', { name: 'Настройки отображения' }));
      const dialog = await screen.findByRole('dialog', { name: 'Настройки таблицы' });
      await openTableSettingsOtherTab(user, dialog);
      await user.click(within(dialog).getByRole('checkbox', { name: 'Редактировать ячейки в таблице' }));
      await user.click(within(dialog).getByRole('button', { name: 'Применить' }));

      const editableName = await within(tableElement).findByRole('button', { name: 'Труба DN100' });
      expect(editableName).toHaveClass('editable-cell-display');
      expect(editableName.closest('td')).toHaveClass('editable-cell-host');
      expect(editableName.closest('td')).toHaveClass('editable-cell-enabled');

      const bodyRow = editableName.closest('tr');
      expect(bodyRow).not.toBeNull();
      const rowNumberCell = bodyRow!.querySelectorAll('td')[1];
      expect(rowNumberCell).toBeInstanceOf(HTMLElement);
      expect(rowNumberCell).not.toHaveClass('editable-cell-enabled');
    }, 10_000);

    it('подсвечивает невалидную inline-ячейку до сохранения и не отправляет её', async () => {
      const { listObjects, updateObject } = await import('@/api/projects');
      const source = makeObject();
      (listObjects as ReturnType<typeof vi.fn>).mockResolvedValue([source]);
      (updateObject as ReturnType<typeof vi.fn>).mockResolvedValue(
        makeObject({ params: { ...source.params, name: 'Труба valid' } }),
      );

      useProjectStore.getState().setCurrentProject(mockProject);
      const user = (await import('@testing-library/user-event')).default.setup();
      renderPage();

      await screen.findByText('Труба DN100');
      await user.click(screen.getByRole('button', { name: 'Настройки отображения' }));
      const dialog = await screen.findByRole('dialog', { name: 'Настройки таблицы' });
      await openTableSettingsOtherTab(user, dialog);
      await user.click(within(dialog).getByRole('checkbox', { name: 'Редактировать ячейки в таблице' }));
      await user.click(within(dialog).getByRole('button', { name: 'Применить' }));

      await user.click(await screen.findByText('Труба DN100'));
      const editor = await screen.findByDisplayValue('Труба DN100');
      await user.clear(editor);
      await user.keyboard('{Enter}');

      expect(await screen.findByText('Укажите значение')).toBeInTheDocument();
      expect(editor).toHaveClass('error');
      expect(await screen.findByText('Несохранено: 1')).toBeInTheDocument();

      await user.click(screen.getByRole('button', { name: 'Сохранить' }));
      expect(updateObject).not.toHaveBeenCalled();

      await user.type(editor, 'Труба valid');
      await user.keyboard('{Enter}');

      await waitFor(() => {
        expect(screen.queryByText('Укажите значение')).not.toBeInTheDocument();
      });
      const fixedCell = await screen.findByRole('button', { name: 'Труба valid' });
      expect(fixedCell).not.toHaveClass('error');

      await user.click(screen.getByRole('button', { name: 'Сохранить' }));
      await waitFor(() => {
        expect(updateObject).toHaveBeenCalledWith(
          'proj-test-1',
          source.id,
          expect.objectContaining({
            params: expect.objectContaining({ name: 'Труба valid' }),
          }),
        );
      });
    }, 30_000);

    it('сохраняет валидные dirty-строки и оставляет невалидные dirty-строки', async () => {
      const { listObjects, updateObject } = await import('@/api/projects');
      const baseParams = makeObject().params;
      const invalidSource = makeObject({
        id: 'pipe-invalid',
        params: { ...baseParams, name: 'Труба invalid' },
      });
      const validSource = makeObject({
        id: 'pipe-valid',
        sort_order: 1,
        params: { ...baseParams, name: 'Труба valid' },
      });
      (listObjects as ReturnType<typeof vi.fn>).mockResolvedValue([invalidSource, validSource]);
      (updateObject as ReturnType<typeof vi.fn>).mockImplementation(
        async (_projectId: string, objectId: string, payload: { params: Record<string, unknown> }) =>
          makeObject({ id: objectId, params: payload.params }),
      );

      useProjectStore.getState().setCurrentProject(mockProject);
      const user = (await import('@testing-library/user-event')).default.setup();
      renderPage();

      await screen.findByText('Труба invalid');
      await user.click(screen.getByRole('button', { name: 'Настройки отображения' }));
      const dialog = await screen.findByRole('dialog', { name: 'Настройки таблицы' });
      await openTableSettingsOtherTab(user, dialog);
      await user.click(within(dialog).getByRole('checkbox', { name: 'Редактировать ячейки в таблице' }));
      await user.click(within(dialog).getByRole('button', { name: 'Применить' }));

      await user.click(await screen.findByRole('button', { name: 'Труба invalid' }));
      const invalidEditor = await screen.findByDisplayValue('Труба invalid');
      await user.clear(invalidEditor);
      await user.keyboard('{Enter}');
      expect(await screen.findByText('Укажите значение')).toBeInTheDocument();

      await user.click(await screen.findByRole('button', { name: 'Труба valid' }));
      const validEditor = await screen.findByDisplayValue('Труба valid');
      await user.clear(validEditor);
      await user.type(validEditor, 'Труба valid saved');
      await user.keyboard('{Enter}');
      expect(await screen.findByText('Несохранено: 2')).toBeInTheDocument();

      await user.click(screen.getByRole('button', { name: 'Сохранить' }));

      await waitFor(() => {
        expect(updateObject).toHaveBeenCalledTimes(1);
      });
      expect(updateObject).toHaveBeenCalledWith(
        'proj-test-1',
        'pipe-valid',
        expect.objectContaining({
          params: expect.objectContaining({ name: 'Труба valid saved' }),
        }),
      );
      expect(screen.getByTitle('Укажите значение')).toHaveClass('error');
      await waitFor(() => {
        expect(screen.getByText('Несохранено: 1')).toBeInTheDocument();
      });
    }, 30_000);

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
          settings: { version: 1, fontSize: 'large', inlineEditingEnabled: false, formPlacement: 'top' },
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
        expect(getUserPreference).toHaveBeenCalledWith(HEATCALC_CALCULATION_DETAILS_PREF_KEY);
        expect(getUserPreference).toHaveBeenCalledWith(HEATCALC_FIELD_INPUT_PREF_KEY);
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
      await user.click(screen.getByRole('button', { name: 'Настройки отображения' }));
      const dialog = await screen.findByRole('dialog', { name: 'Настройки таблицы' });
      await user.click(within(dialog).getByRole('checkbox', { name: 'DN' }));
      const stepInput = within(dialog).getByRole('spinbutton', { name: 'Шаг: Наружный диаметр' });
      fireEvent.change(stepInput, { target: { value: '2.5' } });
      fireEvent.blur(stepInput);
      await openTableSettingsOtherTab(user, dialog);
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
        expect(updateUserPreference).toHaveBeenCalledWith(
          HEATCALC_FIELD_INPUT_PREF_KEY,
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
      expect(viewCached.settings).toEqual({
        version: 1,
        fontSize: 'large',
        inlineEditingEnabled: false,
        formPlacement: 'top',
      });
      const fieldInputPayload = (updateUserPreference as ReturnType<typeof vi.fn>).mock.calls.find(
        ([key]) => key === HEATCALC_FIELD_INPUT_PREF_KEY,
      )?.[1];
      expect(fieldInputPayload.fields.pipe.outer_diameter_mm).toEqual({ step: 2.5 });
      const fieldInputCached = JSON.parse(localStorage.getItem(HEATCALC_REGISTERED_FIELD_INPUT_CACHE_KEY) ?? '{}');
      expect(fieldInputCached.userId).toBe('user-test-1');
      expect(fieldInputCached.settings.fields.pipe.outer_diameter_mm).toEqual({ step: 2.5 });
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
      expect(screen.getByRole('button', { name: /Трубопровод:\s*2/ })).toBeInTheDocument();
      expect(screen.getByRole('button', { name: /Все:\s*2/ })).toBeInTheDocument();
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
    }, 10_000);

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

      await user.click(screen.getByRole('button', { name: 'Настройки отображения' }));
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
      expect(screen.getByRole('button', { name: /Трубопровод:\s*2/ })).toBeInTheDocument();
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

      await user.click(screen.getByRole('button', { name: /Резервуар:/ }));
      expect(await screen.findByText('Резервуар основной')).toBeInTheDocument();
      expect(screen.queryByText('1/1')).not.toBeInTheDocument();
    }, 10_000);

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
        expect(screen.getByText('Режим: изменение')).toBeInTheDocument();
      });
      const table = document.querySelector<HTMLElement>('.calc-spreadsheet');
      expect(table).not.toBeNull();
      const rowCheckboxes = within(table!).getAllByRole('checkbox');
      await user.click(rowCheckboxes[1]);
      expect(await screen.findByRole('button', { name: /Трубопровод:\s*1 из 2/ })).toBeInTheDocument();
      expect(screen.queryByText(/Выбрано:/)).not.toBeInTheDocument();

      await openColumnFilter(user, 'Наименование');
      await user.type(await screen.findByLabelText('Поиск: Наименование'), 'юг');
      await user.click(screen.getByRole('button', { name: 'Применить' }));

      await waitFor(() => {
        expect(screen.getByRole('button', { name: /Трубопровод:\s*2/ })).toBeInTheDocument();
      });
      expect(screen.getByText('Режим: изменение')).toBeInTheDocument();
      expect(screen.getByText('Труба Юг')).toBeInTheDocument();
    }, 10_000);

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
      const table = document.querySelector<HTMLElement>('.calc-spreadsheet');
      expect(table).not.toBeNull();
      const rowCheckboxes = within(table!).getAllByRole('checkbox');
      await user.click(rowCheckboxes[1]);

      expect(await screen.findByRole('button', { name: /Трубопровод:\s*1 из 1/ })).toBeInTheDocument();
      expect(screen.queryByText(/Выбрано:/)).not.toBeInTheDocument();
      await user.click(screen.getByRole('button', { name: /Резервуар:/ }));
      await waitFor(() => {
        expect(screen.getByRole('button', { name: /Резервуар:\s*1/ })).toHaveAttribute('aria-pressed', 'true');
      });
      expect(screen.queryByText(/Выбрано:/)).not.toBeInTheDocument();
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
        expect(screen.getByText('Режим: изменение')).toBeInTheDocument();
      });
      expect(useWorkspaceHeaderStore.getState().context).toBeNull();

      const toolbarSaveButton = screen
        .getAllByRole('button', { name: 'Сохранить' })
        .find((button) => button.classList.contains('action-save-button'));
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
        expect(screen.getByText('Режим: добавление')).toBeInTheDocument();
      });
      expect(screen.getByText('Геометрия трубы')).toBeInTheDocument();
      expect(screen.queryByText(/Параметры объекта «Труба DN100»/)).not.toBeInTheDocument();
    });

    it('создаёт копии объектов, выбранных галочками', async () => {
      const { listObjects, createObject } = await import('@/api/projects');
      const source = makeObject();
      const secondSource = makeObject({
        id: 'obj-2',
        sort_order: 1,
        params: { ...source.params, name: 'Труба DN150' },
      });
      const objects = [source, secondSource];
      (listObjects as ReturnType<typeof vi.fn>).mockImplementation(async () => objects);
      (createObject as ReturnType<typeof vi.fn>).mockImplementation(
        async (_projectId: string, payload: { object_type: 'pipe' | 'tank'; params: Record<string, unknown>; sort_order: number }) => {
          const created = makeObject({
            id: `copy-${payload.sort_order}`,
            object_type: payload.object_type,
            params: payload.params,
            sort_order: payload.sort_order,
          });
          objects.push(created);
          return created;
        },
      );

      useProjectStore.getState().setCurrentProject(mockProject);
      renderPage();

      await screen.findByText('Труба DN100');
      const table = document.querySelector<HTMLElement>('.calc-spreadsheet');
      expect(table).not.toBeNull();
      const rowCheckboxes = within(table!).getAllByRole('checkbox');
      fireEvent.click(rowCheckboxes[1]);
      fireEvent.click(rowCheckboxes[2]);
      fireEvent.click(screen.getByRole('button', { name: 'Добавить копии выбранных' }));

      await waitFor(() => {
        expect(createObject).toHaveBeenCalledTimes(2);
      });
      expect(createObject).toHaveBeenNthCalledWith(
        1,
        'proj-test-1',
        expect.objectContaining({
          object_type: 'pipe',
          params: expect.objectContaining({ name: 'Труба DN100 (копия)' }),
          sort_order: 2,
        }),
      );
      expect(createObject).toHaveBeenNthCalledWith(
        2,
        'proj-test-1',
        expect.objectContaining({
          object_type: 'pipe',
          params: expect.objectContaining({ name: 'Труба DN150 (копия)' }),
          sort_order: 3,
        }),
      );
      await waitFor(() => {
        expect(screen.getByText('Режим: изменение')).toBeInTheDocument();
        expect(screen.getByTestId('object-name-input')).toHaveValue('Труба DN150 (копия)');
      });
      await waitFor(() => {
        const rows = [...document.querySelectorAll('.calc-spreadsheet .ant-table-tbody > tr[data-row-key]')];
        const focusedRow = rows.find((row) => row.textContent?.includes('Труба DN150 (копия)'));
        expect(focusedRow).toHaveClass('row-selected');
        expect(within(focusedRow as HTMLElement).getByRole('checkbox')).not.toBeChecked();
      });
    });

    it('удаляет объекты, выбранные галочками', async () => {
      const { listObjects, deleteObject } = await import('@/api/projects');
      const source = makeObject();
      const secondSource = makeObject({
        id: 'obj-2',
        sort_order: 1,
        params: { ...source.params, name: 'Труба DN150' },
      });
      (listObjects as ReturnType<typeof vi.fn>).mockResolvedValue([source, secondSource]);
      (deleteObject as ReturnType<typeof vi.fn>).mockResolvedValue(undefined);

      useProjectStore.getState().setCurrentProject(mockProject);
      renderPage();

      await screen.findByText('Труба DN100');
      const table = document.querySelector<HTMLElement>('.calc-spreadsheet');
      expect(table).not.toBeNull();
      const rowCheckboxes = within(table!).getAllByRole('checkbox');
      fireEvent.click(rowCheckboxes[1]);
      fireEvent.click(rowCheckboxes[2]);
      fireEvent.click(screen.getByRole('button', { name: 'Удалить выбранные' }));
      fireEvent.click(await screen.findByRole('button', { name: 'Удалить' }));

      await waitFor(() => {
        expect(deleteObject).toHaveBeenCalledTimes(2);
      });
      expect(deleteObject).toHaveBeenNthCalledWith(
        1,
        'proj-test-1',
        source.id,
      );
      expect(deleteObject).toHaveBeenNthCalledWith(
        2,
          'proj-test-1',
        secondSource.id,
      );
    });
  });
});
