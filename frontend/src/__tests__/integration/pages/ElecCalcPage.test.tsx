import { describe, it, expect, vi, beforeEach } from 'vitest';
import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import TestMemoryRouter from '@/__tests__/utils/TestMemoryRouter';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import ElecCalcPage from '@/pages/ElecCalcPage';
import { useAuthStore } from '@/store/authStore';
import { useProjectStore } from '@/store/projectStore';
import type { ElectricalCalcSummary, ElectricalPageResponse } from '@/types/calculation';
import type { Project, ProjectObject } from '@/types/project';
import { getCalcJobRefetchInterval } from '@/utils/calcJobPolling';
import { ELECTRICAL_GUEST_TABLE_COLUMN_STORAGE_KEY } from '@/utils/electricalTableColumns';
import { ELECTRICAL_GUEST_TABLE_VIEW_STORAGE_KEY } from '@/utils/electricalTableViewSettings';

const apiMocks = vi.hoisted(() => {
  const field = (
    key: string,
    dataType: 'text' | 'number' | 'enum' | 'boolean' = 'text',
    ops: Array<'contains' | 'range' | 'in' | 'equals'> = ['contains'],
    options: Array<{ value: unknown; label: string }> = [],
  ) => ({
    key,
    label: key,
    title: key,
    data_type: dataType,
    unit: null,
    filter: { enabled: ops.length > 0, ops, include_empty: true },
    sort: { enabled: key !== 'index', type: dataType === 'number' ? 'number' : 'text', nulls: 'last' },
    options: options.length
      ? { mode: 'inline', items: options, include_empty: true }
      : null,
  });
  return {
    electricalPage: vi.fn(),
    electricalCapabilities: vi.fn().mockResolvedValue({
      version: 1,
      default_page_size: 50,
      max_page_size: 200,
      default_sort: { key: 'sort_order', dir: 'asc' },
      search: { enabled: true, max_text_length: 120, default_columns: ['object_name'] },
      fields: [
        field('index', 'text', []),
        field('object_name'),
        field('electrical_status', 'enum', ['in'], [
          { value: 'calculated', label: 'Рассчитан' },
          { value: 'error', label: 'Ошибка' },
          { value: 'not_calculated', label: 'Не рассчитан' },
        ]),
        field('cable_mark'),
        field('winding_pitch_mm', 'number', ['range']),
        field('number_of_threads', 'number', ['range']),
        field('cable_length', 'number', ['range']),
        field('total_power', 'number', ['range']),
        field('current', 'number', ['range']),
        field('message'),
      ],
    }),
  };
});

vi.mock('@/api/projects', () => ({
  deleteObject: vi.fn(),
}));

vi.mock('@/api/calculations', () => ({
  cancelCalcTask: vi.fn(),
  enqueueElectricalBatchJob: vi.fn(),
  getCalcTask: vi.fn().mockResolvedValue({
    id: 'task-1',
    type: 'electrical_batch',
    status: 'running',
    project_id: 'p-1',
    progress: { current: 0, total: 1, phase: 'running', percent: 0 },
    result: null,
    error_message: null,
    cancel_requested: false,
    created_at: '2026-01-01T00:00:00Z',
    started_at: null,
    finished_at: null,
    links: {
      status: '/api/v1/calc/jobs/task-1',
      result: '/api/v1/calc/jobs/task-1/result',
      cancel: '/api/v1/calc/jobs/task-1/cancel',
    },
  }),
  getElectricalPage: apiMocks.electricalPage,
  getElectricalQueryCapabilities: apiMocks.electricalCapabilities,
  queryElectrical: apiMocks.electricalPage,
  listCables: vi.fn().mockResolvedValue([]),
  selectCableManual: vi.fn(),
}));

vi.mock('@/api/references', () => ({
  getCablesTt: vi.fn().mockResolvedValue([
    {
      model: '30ТТВ2',
      series: 'ТТВ',
      nominal_power: 30,
      q1: -0.141,
      q2: 32,
      max_product_temp: 120,
      max_vapor_temp: 210,
      voltage: 220,
    },
  ]),
  getResistiveCables: vi.fn().mockResolvedValue({ single_core: [], three_core: [], common: {} }),
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

function makeElectricalPage(
  objects: ProjectObject[],
  calculations: ElectricalCalcSummary[] = [],
  summaryOverrides: Partial<ElectricalPageResponse['summary']> = {},
  pageInfoOverrides: Partial<ElectricalPageResponse['page_info']> = {},
): ElectricalPageResponse {
  const totalObjects = summaryOverrides.total_objects ?? objects.length;
  const calculated = calculations.filter(
    (calc) =>
      calc.results &&
      !calc.results.error &&
      (calc.cable_mark || calc.results.selected_cable),
  );
  const pageSize = pageInfoOverrides.page_size ?? 50;

  return {
    items: objects,
    calculations,
    summary: {
      total_objects: totalObjects,
      valid_objects:
        summaryOverrides.valid_objects ?? objects.filter((obj) => obj.is_valid).length,
      invalid_objects:
        summaryOverrides.invalid_objects ?? totalObjects - objects.filter((obj) => obj.is_valid).length,
      electrical_calculations_total:
        summaryOverrides.electrical_calculations_total ?? calculations.length,
      calculated_count: summaryOverrides.calculated_count ?? calculated.length,
      failed_count:
        summaryOverrides.failed_count ??
        calculations.filter((calc) => typeof calc.results?.error === 'string').length,
      total_cable_length:
        summaryOverrides.total_cable_length ??
        calculated.reduce((sum, calc) => sum + Number(calc.results?.cable_length ?? 0), 0),
      total_power:
        summaryOverrides.total_power ??
        calculated.reduce((sum, calc) => sum + Number(calc.results?.total_power ?? 0), 0),
      total_current:
        summaryOverrides.total_current ??
        calculated.reduce((sum, calc) => sum + Number(calc.results?.current ?? 0), 0),
      ...summaryOverrides,
    },
    page_info: {
      page: 1,
      page_size: pageSize,
      offset: 0,
      total_pages: totalObjects > 0 ? Math.ceil(totalObjects / pageSize) : 0,
      has_next_page: totalObjects > pageSize,
      has_previous_page: false,
      ...pageInfoOverrides,
    },
  };
}

function renderPage(state?: { activeJobId?: string }) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={qc}>
      <TestMemoryRouter initialEntries={[{ pathname: '/workspace/elec-calc', state }]}>
        <ElecCalcPage />
      </TestMemoryRouter>
    </QueryClientProvider>
  );
}

async function openElectricalTableSettingsOtherTab(
  user: { click: (element: Element) => Promise<unknown> },
  dialog: HTMLElement,
) {
  await user.click(within(dialog).getByRole('tab', { name: 'Остальное' }));
  expect(within(dialog).getByText('Размер текста таблицы')).toBeInTheDocument();
}

describe('ElecCalcPage (integration)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    localStorage.clear();
    useAuthStore.getState().logout();
    useProjectStore.getState().setCurrentProject(null);
  });

  it('показывает заглушку без проекта', () => {
    renderPage();
    expect(screen.getByText(/Проект не выбран/i)).toBeInTheDocument();
  });

  it('пустой проект — показывает alert «Нет объектов»', async () => {
    const { getElectricalPage } = await import('@/api/calculations');
    (getElectricalPage as ReturnType<typeof vi.fn>).mockResolvedValue(makeElectricalPage([]));
    useProjectStore.getState().setCurrentProject(mockProject);
    renderPage();
    await waitFor(() => {
      expect(screen.getByText(/Нет объектов/i)).toBeInTheDocument();
    });
  });

  it('подхватывает activeJobId из навигации и начинает polling задачи', async () => {
    const { getCalcTask, getElectricalPage } = await import('@/api/calculations');
    (getElectricalPage as ReturnType<typeof vi.fn>).mockResolvedValue(makeElectricalPage([]));
    useProjectStore.getState().setCurrentProject(mockProject);
    renderPage({ activeJobId: 'task-nav' });
    await waitFor(() => {
      expect(getCalcTask).toHaveBeenCalledWith('task-nav');
    });
  });

  it('использует редкий polling для очереди и фоновой вкладки', () => {
    expect(getCalcJobRefetchInterval('queued', false)).toBe(2000);
    expect(getCalcJobRefetchInterval('enqueued', false)).toBe(2000);
    expect(getCalcJobRefetchInterval('running', false)).toBe(1000);
    expect(getCalcJobRefetchInterval('running', true)).toBe(5000);
    expect(getCalcJobRefetchInterval('succeeded', false)).toBe(false);
  });

  it('переключатель вариантов СО1..СО4 присутствует', async () => {
    const { getElectricalPage } = await import('@/api/calculations');
    (getElectricalPage as ReturnType<typeof vi.fn>).mockResolvedValue(makeElectricalPage([]));
    useProjectStore.getState().setCurrentProject(mockProject);
    renderPage();
    await waitFor(() => {
      expect(screen.getByRole('button', { name: 'СО1' })).toBeInTheDocument();
    });
    expect(screen.getAllByRole('button').some((b) => b.textContent === 'СО1')).toBe(true);
    expect(screen.getAllByRole('button').some((b) => b.textContent === 'СО4')).toBe(true);
  });

  it('запрашивает электрорасчёты только для выбранного варианта СО', async () => {
    const { getElectricalPage } = await import('@/api/calculations');
    (getElectricalPage as ReturnType<typeof vi.fn>).mockResolvedValue(makeElectricalPage([]));
    useProjectStore.getState().setCurrentProject(mockProject);
    const user = (await import('@testing-library/user-event')).default.setup();
    renderPage();

    await waitFor(() => {
      expect(getElectricalPage).toHaveBeenCalledWith(expect.objectContaining({
        project_id: 'p-1',
        variant_number: 1,
        page: 1,
        page_size: 50,
      }));
    });

    await user.click(screen.getByRole('button', { name: 'СО2' }));

    await waitFor(() => {
      expect(getElectricalPage).toHaveBeenCalledWith(expect.objectContaining({
        project_id: 'p-1',
        variant_number: 2,
        page: 1,
        page_size: 50,
      }));
    });
  });

  it('при наличии валидного объекта показывает кнопку «Выполнить электрорасчёт»', async () => {
    const { getElectricalPage } = await import('@/api/calculations');
    (getElectricalPage as ReturnType<typeof vi.fn>).mockResolvedValue(makeElectricalPage([makeObject()]));
    useProjectStore.getState().setCurrentProject(mockProject);
    renderPage();
    await waitFor(() => {
      expect(
        screen.getByRole('button', { name: /Выполнить электрорасчёт/i })
      ).toBeInTheDocument();
    });
  });

  it('пагинирует таблицу электрики, чтобы не рендерить все строки сразу', async () => {
    const { getElectricalPage } = await import('@/api/calculations');
    const objects = Array.from({ length: 80 }, (_, index) =>
      makeObject({
        id: `o-${index + 1}`,
        sort_order: index,
        params: { name: `Труба-${index + 1}` },
      })
    );
    (getElectricalPage as ReturnType<typeof vi.fn>).mockResolvedValue(
      makeElectricalPage(
        objects.slice(0, 50),
        [],
        { total_objects: 80, valid_objects: 80, invalid_objects: 0 },
        { total_pages: 2, has_next_page: true },
      ),
    );
    useProjectStore.getState().setCurrentProject(mockProject);
    renderPage();

    await waitFor(() => {
      expect(screen.getByText('1-50 из 80')).toBeInTheDocument();
    });
    expect(screen.getByText('Труба-1')).toBeInTheDocument();
    expect(screen.getByText('Труба-50')).toBeInTheDocument();
    expect(screen.queryByText('Труба-51')).not.toBeInTheDocument();
    expect(document.querySelector('.ant-pagination')).toBeTruthy();
  });

  it('ставит batch ТЛТ в очередь с electrical params, а не пустым набором', async () => {
    const { enqueueElectricalBatchJob, getElectricalPage } = await import('@/api/calculations');
    (getElectricalPage as ReturnType<typeof vi.fn>).mockResolvedValue(makeElectricalPage([makeObject()]));
    (enqueueElectricalBatchJob as ReturnType<typeof vi.fn>).mockResolvedValue({
      id: 'task-1',
      type: 'electrical_batch',
      status: 'enqueued',
      project_id: 'p-1',
      progress: { current: 0, total: null, phase: 'enqueued', percent: null },
      result: null,
      error_message: null,
      cancel_requested: false,
      created_at: '2026-01-01T00:00:00Z',
      started_at: null,
      finished_at: null,
      links: { status: '', result: '', cancel: '' },
    });
    useProjectStore.getState().setCurrentProject(mockProject);
    const user = (await import('@testing-library/user-event')).default.setup();
    renderPage();

    await waitFor(() => {
      expect(screen.getByRole('button', { name: /Выполнить электрорасчёт СО1/i })).toBeInTheDocument();
    });
    await user.click(screen.getByRole('button', { name: /Выполнить электрорасчёт СО1/i }));

    await waitFor(() => {
      expect(enqueueElectricalBatchJob).toHaveBeenCalledWith(
        'p-1',
        'builtin',
        1,
        'self_regulating',
        expect.objectContaining({
          supplyVoltage: 220,
          windingCoefficient: 1,
          layingStep: 0.1,
        }),
      );
    });
  });

  it('селектор типа кабеля содержит ТТН/ТТВ/ТТХ, single_core, three_core как доступные', async () => {
    const { getElectricalPage } = await import('@/api/calculations');
    (getElectricalPage as ReturnType<typeof vi.fn>).mockResolvedValue(makeElectricalPage([]));
    useProjectStore.getState().setCurrentProject(mockProject);
    const user = (await import('@testing-library/user-event')).default.setup();
    renderPage();
    await waitFor(() => {
      expect(screen.getByText(/Тип кабеля/i)).toBeInTheDocument();
    });
    // Открываем селектор
    const selectors = document.querySelectorAll('.ant-select-selector');
    const cableTypeSelect = Array.from(selectors).find((el) =>
      el.textContent?.includes('Саморегулирующийся')
    );
    expect(cableTypeSelect).toBeTruthy();
    if (cableTypeSelect) {
      await user.click(cableTypeSelect as HTMLElement);
    }
    // Проверяем, что новые типы есть в выпадающем списке и не disabled
    await waitFor(() => {
      expect(screen.getByText(/ТТН\/ТТВ\/ТТХ/i)).toBeInTheDocument();
    });
    expect(screen.getByText(/Однож. пост. мощн./i)).toBeInTheDocument();
    expect(screen.getByText(/Трёхж. пост. мощн./i)).toBeInTheDocument();
  });

  it('при успешном расчёте отображает подобранный кабель в карточке объекта', async () => {
    const { getElectricalPage } = await import('@/api/calculations');
    (getElectricalPage as ReturnType<typeof vi.fn>).mockResolvedValue(
      makeElectricalPage([makeObject()], [
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
      ]),
    );
    useProjectStore.getState().setCurrentProject(mockProject);
    renderPage();
    await waitFor(() => {
      expect(screen.getAllByText('ТЛТ-30').length).toBeGreaterThan(0);
    });
  });

  it('позволяет гостю скрыть колонку электрорасчёта через настройки таблицы', async () => {
    const { getElectricalPage } = await import('@/api/calculations');
    const user = (await import('@testing-library/user-event')).default.setup();
    (getElectricalPage as ReturnType<typeof vi.fn>).mockResolvedValue(
      makeElectricalPage([makeObject()], [
        {
          id: 'c-1',
          object_id: 'o-1',
          cable_type: 'self_regulating',
          cable_mark: 'ТЛТ-30',
          variant_number: 1,
          results: {
            selected_cable: 'ТЛТ-30',
            winding_pitch: 0,
            num_circuits: 1,
            cable_length: 11,
            total_power: 600,
            current: 2.7,
            voltage: 220,
          },
        },
      ]),
    );
    useProjectStore.getState().setCurrentProject(mockProject);
    renderPage();

    await waitFor(() => {
      expect(document.querySelector('.electrical-spreadsheet')?.textContent).toContain('Ток, А');
    });

    await user.click(screen.getByRole('button', { name: /Настройки отображения/i }));
    await user.click(screen.getByRole('checkbox', { name: /Показать Расчётный ток/i }));
    await user.click(screen.getByRole('button', { name: 'Сохранить' }));

    await waitFor(() => {
      expect(document.querySelector('.electrical-spreadsheet')?.textContent).not.toContain('Ток, А');
    });
    const stored = JSON.parse(
      localStorage.getItem(ELECTRICAL_GUEST_TABLE_COLUMN_STORAGE_KEY) ?? '{}',
    );
    expect(stored.visibleOrder).not.toContain('current');
  });

  it('сохраняет размер шрифта и формат заголовков таблицы электрорасчёта', async () => {
    const { getElectricalPage } = await import('@/api/calculations');
    const user = (await import('@testing-library/user-event')).default.setup();
    (getElectricalPage as ReturnType<typeof vi.fn>).mockResolvedValue(
      makeElectricalPage([makeObject()], [
        {
          id: 'c-1',
          object_id: 'o-1',
          cable_type: 'self_regulating',
          cable_mark: 'ТЛТ-30',
          variant_number: 1,
          results: {
            selected_cable: 'ТЛТ-30',
            winding_pitch: 0,
            num_circuits: 1,
            cable_length: 11,
            total_power: 600,
            current: 2.7,
            voltage: 220,
          },
        },
      ]),
    );
    useProjectStore.getState().setCurrentProject(mockProject);
    renderPage();

    await waitFor(() => {
      expect(document.querySelector('.electrical-spreadsheet')?.textContent).toContain('Ток, А');
    });

    await user.click(screen.getByRole('button', { name: /Настройки отображения/i }));
    const dialog = await screen.findByRole('dialog', { name: 'Настройки таблицы электрорасчёта' });
    await openElectricalTableSettingsOtherTab(user, dialog);
    await user.click(within(dialog).getByText('Компактный'));
    await user.click(within(dialog).getAllByText('Полные')[0]);
    await user.click(within(dialog).getByRole('button', { name: 'Сохранить' }));

    await waitFor(() => {
      expect(document.querySelector('.electrical-spreadsheet')).toHaveClass('calc-spreadsheet--compact');
      expect(document.querySelector('.electrical-spreadsheet')?.textContent).toContain('Расчётный ток, А');
    });
    const stored = JSON.parse(
      localStorage.getItem(ELECTRICAL_GUEST_TABLE_VIEW_STORAGE_KEY) ?? '{}',
    );
    expect(stored).toEqual({
      version: 1,
      fontSize: 'compact',
      tableLabelFormat: 'full',
      settingsLabelFormat: 'full',
    });
  });

  it('сохраняет resize колонки прямо из заголовка таблицы электрорасчёта', async () => {
    const { getElectricalPage } = await import('@/api/calculations');
    (getElectricalPage as ReturnType<typeof vi.fn>).mockResolvedValue(
      makeElectricalPage([makeObject()], [
        {
          id: 'c-1',
          object_id: 'o-1',
          cable_type: 'self_regulating',
          cable_mark: 'ТЛТ-30',
          variant_number: 1,
          results: {
            selected_cable: 'ТЛТ-30',
            winding_pitch: 0,
            num_circuits: 1,
            cable_length: 11,
            total_power: 600,
            current: 2.7,
            voltage: 220,
          },
        },
      ]),
    );
    useProjectStore.getState().setCurrentProject(mockProject);
    renderPage();

    await waitFor(() => {
      expect(screen.getByText('Труба-1')).toBeInTheDocument();
    });
    const handle = screen.getByRole('button', { name: 'Изменить ширину: Расчётный ток, А' });
    await act(async () => {
      fireEvent(handle, new MouseEvent('pointerdown', { clientX: 100, bubbles: true }));
      window.dispatchEvent(new MouseEvent('pointermove', { clientX: 160, bubbles: true }));
      window.dispatchEvent(new MouseEvent('pointerup', { clientX: 160, bubbles: true }));
    });

    await waitFor(() => {
      const stored = JSON.parse(
        localStorage.getItem(ELECTRICAL_GUEST_TABLE_COLUMN_STORAGE_KEY) ?? '{}',
      );
      expect(stored.columns.current.widthPct).toBeGreaterThan(8);
    });
  });

  it('отправляет backend-фильтр по числовой колонке электрорасчёта', async () => {
    const { getElectricalPage } = await import('@/api/calculations');
    const user = (await import('@testing-library/user-event')).default.setup();
    (getElectricalPage as ReturnType<typeof vi.fn>).mockResolvedValue(
      makeElectricalPage([makeObject()], [
        {
          id: 'c-1',
          object_id: 'o-1',
          cable_type: 'self_regulating',
          cable_mark: 'ТЛТ-30',
          variant_number: 1,
          results: {
            selected_cable: 'ТЛТ-30',
            winding_pitch: 0,
            num_circuits: 1,
            cable_length: 11,
            total_power: 600,
            current: 2.7,
            voltage: 220,
          },
        },
      ]),
    );
    useProjectStore.getState().setCurrentProject(mockProject);
    renderPage();

    await waitFor(() => {
      expect(screen.getByText('Труба-1')).toBeInTheDocument();
    });
    await user.click(screen.getByRole('button', { name: 'Фильтр Расчётный ток, А' }));
    await user.type(await screen.findByLabelText('Минимум: Расчётный ток, А'), '2');
    await user.click(screen.getByRole('button', { name: 'Применить' }));

    await waitFor(() => {
      expect(getElectricalPage).toHaveBeenLastCalledWith(expect.objectContaining({
        filters: [expect.objectContaining({ key: 'current', op: 'range', min: 2 })],
      }));
    });
    expect(screen.getByRole('button', { name: 'Сбросить фильтры таблицы' })).toBeEnabled();
  });

  it('отправляет backend-сортировку по току', async () => {
    const { getElectricalPage } = await import('@/api/calculations');
    const user = (await import('@testing-library/user-event')).default.setup();
    (getElectricalPage as ReturnType<typeof vi.fn>).mockResolvedValue(makeElectricalPage([makeObject()]));
    useProjectStore.getState().setCurrentProject(mockProject);
    renderPage();

    await waitFor(() => {
      expect(screen.getByText('Труба-1')).toBeInTheDocument();
    });
    await user.click(screen.getByRole('columnheader', { name: /Ток, А/ }));

    await waitFor(() => {
      expect(getElectricalPage).toHaveBeenLastCalledWith(expect.objectContaining({
        sort: { key: 'current', dir: 'asc' },
      }));
    });
  });

  it('монтирует Select/InputNumber только для активной строки таблицы', async () => {
    const { getElectricalPage } = await import('@/api/calculations');
    const objects = [
      makeObject({ id: 'o-1', params: { name: 'Труба-1' } }),
      makeObject({ id: 'o-2', sort_order: 1, params: { name: 'Труба-2' } }),
    ];
    (getElectricalPage as ReturnType<typeof vi.fn>).mockResolvedValue(
      makeElectricalPage(objects, [
        {
          id: 'c-1',
          object_id: 'o-1',
          cable_type: 'self_regulating',
          cable_mark: 'ТЛТ-30',
          variant_number: 1,
          results: {
            selected_cable: 'ТЛТ-30',
            winding_pitch: 0,
            num_circuits: 1,
            cable_length: 11,
            total_power: 600,
            current: 2.7,
            voltage: 220,
          },
        },
        {
          id: 'c-2',
          object_id: 'o-2',
          cable_type: 'self_regulating',
          cable_mark: 'ТЛТ-40',
          variant_number: 1,
          results: {
            selected_cable: 'ТЛТ-40',
            winding_pitch: 120,
            num_circuits: 2,
            cable_length: 12,
            total_power: 700,
            current: 3.2,
            voltage: 220,
          },
        },
      ]),
    );
    useProjectStore.getState().setCurrentProject(mockProject);
    renderPage();

    await waitFor(() => {
      expect(screen.getByText('Труба-1')).toBeInTheDocument();
    });
    expect(document.querySelectorAll('.electrical-spreadsheet .ant-select-selector')).toHaveLength(0);
    expect(document.querySelectorAll('.electrical-spreadsheet input[role="spinbutton"]')).toHaveLength(0);

    fireEvent.click(screen.getByText('Труба-1').closest('tr') as HTMLTableRowElement);
    await waitFor(() => {
      expect(document.querySelectorAll('.electrical-spreadsheet .ant-select-selector')).toHaveLength(2);
    });
    expect(document.querySelectorAll('.electrical-spreadsheet input[role="spinbutton"]')).toHaveLength(1);

    fireEvent.click(screen.getByText('Труба-2').closest('tr') as HTMLTableRowElement);
    await waitFor(() => {
      expect(document.querySelectorAll('.electrical-spreadsheet .ant-select-selector')).toHaveLength(2);
    });
    expect(document.querySelectorAll('.electrical-spreadsheet input[role="spinbutton"]')).toHaveLength(1);
  });

  it('изменение шага навива пересчитывает текущий объект с выбранной маркой', async () => {
    const { getElectricalPage, selectCableManual } = await import('@/api/calculations');
    (getElectricalPage as ReturnType<typeof vi.fn>).mockResolvedValue(
      makeElectricalPage([makeObject()], [
        {
        id: 'c-1',
        object_id: 'o-1',
        cable_type: 'self_regulating',
        cable_mark: 'ТЛТ-30',
        variant_number: 1,
        results: {
          selected_cable: 'ТЛТ-30',
          winding_pitch: 0,
          num_circuits: 1,
          cable_length: 11,
          total_power: 600,
          current: 2.7,
          voltage: 220,
        },
      },
      ]),
    );
    (selectCableManual as ReturnType<typeof vi.fn>).mockResolvedValue({
      id: 'c-1',
      object_id: 'o-1',
      cable_type: 'self_regulating',
      cable_mark: 'ТЛТ-30',
      variant_number: 1,
      results: { winding_pitch: 80, num_circuits: 1 },
    });
    useProjectStore.getState().setCurrentProject(mockProject);
    renderPage();

    await waitFor(() => {
      expect(screen.getAllByText('ТЛТ-30').length).toBeGreaterThan(0);
    });
    fireEvent.click(screen.getByText('Труба-1').closest('tr') as HTMLTableRowElement);
    await waitFor(() => {
      expect(document.querySelector('input[role="spinbutton"][value="0"]')).toBeTruthy();
    });
    const pitchInput = document.querySelector('input[role="spinbutton"][value="0"]');
    expect(pitchInput).toBeTruthy();
    fireEvent.change(pitchInput as HTMLInputElement, { target: { value: '80' } });
    fireEvent.blur(pitchInput as HTMLInputElement);

    await waitFor(() => {
      expect(selectCableManual).toHaveBeenCalledWith(
        'o-1',
        'ТЛТ-30',
        'builtin',
        1,
        'self_regulating',
        expect.objectContaining({ windingPitchMm: 80, numberOfThreads: 1 }),
      );
    });
  });

  it('ставит batch в очередь с выбранным типом ТТН/ТТВ/ТТХ и его параметрами', async () => {
    const { enqueueElectricalBatchJob, getElectricalPage } = await import('@/api/calculations');
    (getElectricalPage as ReturnType<typeof vi.fn>).mockResolvedValue(makeElectricalPage([makeObject()]));
    (enqueueElectricalBatchJob as ReturnType<typeof vi.fn>).mockResolvedValue({
      id: 'task-1',
      type: 'electrical_batch',
      status: 'enqueued',
      project_id: 'p-1',
      progress: { current: 0, total: null, phase: 'enqueued', percent: null },
      result: null,
      error_message: null,
      cancel_requested: false,
      created_at: '2026-01-01T00:00:00Z',
      started_at: null,
      finished_at: null,
      links: { status: '', result: '', cancel: '' },
    });
    useProjectStore.getState().setCurrentProject(mockProject);
    const user = (await import('@testing-library/user-event')).default.setup();
    renderPage();

    await waitFor(() => {
      expect(screen.getByText(/Тип кабеля/i)).toBeInTheDocument();
    });
    const selectors = document.querySelectorAll('.ant-select-selector');
    const cableTypeSelect = Array.from(selectors).find((el) =>
      el.textContent?.includes('Саморегулирующийся')
    );
    expect(cableTypeSelect).toBeTruthy();
    await user.click(cableTypeSelect as HTMLElement);
    await user.click(await screen.findByText('ТТН/ТТВ/ТТХ'));
    await user.click(screen.getByRole('button', { name: /Выполнить электрорасчёт СО1/i }));

    await waitFor(() => {
      expect(enqueueElectricalBatchJob).toHaveBeenCalledWith(
        'p-1',
        'builtin',
        1,
        'self_regulating_tt',
        expect.objectContaining({ aggressiveProduct: false }),
      );
    });
  });
});
