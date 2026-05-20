import { describe, it, expect, vi, beforeEach } from 'vitest';
import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import TestMemoryRouter from '@/__tests__/utils/TestMemoryRouter';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import ElecCalcPage from '@/pages/ElecCalcPage';
import { useAuthStore } from '@/store/authStore';
import { useCalculationVariantStore } from '@/store/calculationVariantStore';
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
          { value: 'unsupported', label: 'Не применимо' },
          { value: 'not_calculated', label: 'Не рассчитан' },
        ]),
        field('cable_mark'),
        field('winding_pitch_mm', 'number', ['range']),
        field('number_of_threads', 'number', ['range']),
        field('installed_cable_length', 'number', ['range']),
        field('order_cable_length', 'number', ['range']),
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
  applyElectricalCandidate: vi.fn(),
  batchCalcElectrical: vi.fn(),
  cancelCalcTask: vi.fn(),
  copyElectricalVariant: vi.fn(),
  createElectricalCandidate: vi.fn(),
  enqueueElectricalBatchJob: vi.fn(),
  listElectricalCandidates: vi.fn().mockResolvedValue([]),
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
  selectCableForVariants: vi.fn(),
  selectCableManual: vi.fn(),
  updateElectricalCandidate: vi.fn(),
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

vi.mock('@/api/preferences', () => ({
  getUserPreference: vi.fn().mockResolvedValue({ key: 'test', value: null, user_id: 'u-1' }),
  updateUserPreference: vi.fn(async (key: string, value: unknown) => ({
    key,
    value,
    user_id: 'u-1',
  })),
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
    version: over.version ?? 1,
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
      !calc.results.error_code &&
      !calc.results.category &&
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
        calculations.filter(
          (calc) =>
            typeof calc.results?.error_code === 'string' &&
            calc.results?.category !== 'unsupported',
        ).length,
      manual_cable_mark_count:
        summaryOverrides.manual_cable_mark_count ??
        calculations.filter((calc) => calc.cable_mark_source === 'manual').length,
      total_cable_length:
        summaryOverrides.total_cable_length ??
        calculated.reduce(
          (sum, calc) =>
            sum + Number(calc.results?.order_cable_length ?? 0),
          0,
        ),
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
  const otherTab = within(dialog).getByRole('tab', { name: 'Остальное' });
  await user.click(otherTab);
  await waitFor(() => {
    expect(otherTab).toHaveAttribute('aria-selected', 'true');
    expect(within(dialog).getByText('Размер текста таблицы')).toBeInTheDocument();
  });
}

describe('ElecCalcPage (integration)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    localStorage.clear();
    useAuthStore.getState().logout();
    useProjectStore.getState().setCurrentProject(null);
    useCalculationVariantStore.setState({ variantByProject: {} });
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

  it('при наличии объекта показывает кнопки пересчёта', async () => {
    const { getElectricalPage } = await import('@/api/calculations');
    (getElectricalPage as ReturnType<typeof vi.fn>).mockResolvedValue(makeElectricalPage([makeObject()]));
    useProjectStore.getState().setCurrentProject(mockProject);
    renderPage();
    await waitFor(() => {
      expect(screen.getByRole('button', { name: /Пересчитать выбранные \(0\)/i })).toBeInTheDocument();
      expect(screen.getByRole('button', { name: /Пересчитать все СО1/i })).toBeInTheDocument();
    });
  });

  it('показывает ошибку теплопотерь круглым icon-tag, а не текстовым badge', async () => {
    const { getElectricalPage } = await import('@/api/calculations');
    localStorage.setItem(ELECTRICAL_GUEST_TABLE_COLUMN_STORAGE_KEY, JSON.stringify({
      version: 1,
      visibleOrder: ['index', 'object_name', 'heat_loss_status', 'electrical_status'],
    }));
    (getElectricalPage as ReturnType<typeof vi.fn>).mockResolvedValue(
      makeElectricalPage([
        makeObject({
          params: { name: 'Резервуар с ошибкой теплопотерь' },
          is_valid: false,
          validation_errors: {
            category: 'validation',
            message: 'Не заполнена геометрия резервуара',
          },
        }),
      ]),
    );
    useProjectStore.getState().setCurrentProject(mockProject);

    renderPage();

    const row = await screen.findByRole('row', { name: /Резервуар с ошибкой теплопотерь/ });
    expect(within(row).getByLabelText('Ошибка')).toBeInTheDocument();
    expect(within(row).queryByText(/^Ошибка$/)).not.toBeInTheDocument();
  });

  it('при открытии вкладки не подставляет марку и не запускает электрорасчёт без явного действия', async () => {
    const {
      batchCalcElectrical,
      enqueueElectricalBatchJob,
      getElectricalPage,
      selectCableForVariants,
    } = await import('@/api/calculations');
    localStorage.setItem(ELECTRICAL_GUEST_TABLE_COLUMN_STORAGE_KEY, JSON.stringify({
      version: 1,
      visibleOrder: [
        'index',
        'object_name',
        'electrical_status',
        'cable_type',
        'cable_mark',
        'installed_cable_length',
        'total_power',
        'current',
      ],
    }));
    (getElectricalPage as ReturnType<typeof vi.fn>).mockResolvedValue(
      makeElectricalPage([makeObject({ params: { name: 'Труба без электрорасчёта' } })]),
    );
    useProjectStore.getState().setCurrentProject(mockProject);

    renderPage();

    const row = await screen.findByRole('row', { name: /Труба без электрорасчёта/ });
    expect(row).not.toHaveTextContent('Авто');
    expect(row).not.toHaveTextContent('Саморегулирующийся');
    expect(row).toHaveTextContent('—');
    expect(batchCalcElectrical).not.toHaveBeenCalled();
    expect(enqueueElectricalBatchJob).not.toHaveBeenCalled();
    expect(selectCableForVariants).not.toHaveBeenCalled();
  });

  it('для stale электрорасчёта не показывает старую марку и старые результаты как актуальные', async () => {
    const { getElectricalPage } = await import('@/api/calculations');
    localStorage.setItem(ELECTRICAL_GUEST_TABLE_COLUMN_STORAGE_KEY, JSON.stringify({
      version: 1,
      visibleOrder: [
        'index',
        'object_name',
        'electrical_status',
        'cable_mark',
        'winding_pitch_mm',
        'number_of_threads',
        'installed_cable_length',
        'order_cable_length',
        'total_power',
        'current',
      ],
    }));
    (getElectricalPage as ReturnType<typeof vi.fn>).mockResolvedValue(
      makeElectricalPage([makeObject({ params: { name: 'Труба со старым расчётом' } })], [
        {
          id: 'calc-stale',
          object_id: 'o-1',
          cable_type: 'self_regulating',
          cable_mark: 'ТЛТ-30',
          cable_mark_source: 'auto',
          variant_number: 1,
          results: {
            selected_cable: 'ТЛТ-30',
            category: 'stale',
            error_code: 'stale_electrical_calculation',
            message: 'Теплопотери объекта изменились. Пересчитайте электрорасчёт.',
            stale: true,
            winding_pitch: 0,
            num_circuits: 2,
            installed_cable_length: 10,
            order_cable_length: 11,
            total_power: 600,
            current: 2.7,
          },
        },
      ]),
    );
    useProjectStore.getState().setCurrentProject(mockProject);

    renderPage();

    const row = await screen.findByRole('row', { name: /Труба со старым расчётом/ });
    expect(screen.getByLabelText('Требуется пересчёт')).toBeInTheDocument();
    expect(row).not.toHaveTextContent('ТЛТ-30');
    expect(row).not.toHaveTextContent('600');
    expect(row).not.toHaveTextContent('2.7');
  });

  it('показывает сообщения ошибок в отдельной области, а не колонкой таблицы', async () => {
    const { getElectricalPage } = await import('@/api/calculations');
    const user = (await import('@testing-library/user-event')).default.setup();
    const firstObject = makeObject({
      id: 'o-error-1',
      params: { name: 'Резервуар со сферой 1' },
    });
    const secondObject = makeObject({
      id: 'o-error-2',
      params: { name: 'Резервуар со сферой 2' },
    });
    (getElectricalPage as ReturnType<typeof vi.fn>).mockResolvedValue(
      makeElectricalPage([firstObject, secondObject], [
        {
          id: 'c-error-1',
          object_id: firstObject.id,
          cable_type: 'self_regulating',
          cable_mark: null,
          variant_number: 1,
          results: {
            error_code: 'unsupported_layout',
            category: 'unsupported',
            message:
              'Электрорасчёт укладки кабеля для сферического резервуара не применим: формула укладки не определена.',
            hint:
              'Теплопотери доступны, но формула укладки кабеля для сферического резервуара не утверждена.',
            suggested_actions: [],
          },
        },
        {
          id: 'c-error-2',
          object_id: secondObject.id,
          cable_type: 'self_regulating',
          cable_mark: null,
          variant_number: 1,
          results: {
            error_code: 'POWER_TOO_HIGH',
            category: 'formula',
            message: 'Не найден кабель с мощностью ≥ 132.67 Вт/м с учётом навива и количества ниток',
            suggested_actions: ['TRY_OTHER_CABLE_TYPE'],
          },
        },
      ]),
    );
    useProjectStore.getState().setCurrentProject(mockProject);
    renderPage();

    const errorRegion = await screen.findByLabelText('Сообщения ошибок электрорасчёта');
    expect(screen.getByLabelText('Не применимо')).toBeInTheDocument();
    expect(errorRegion).toHaveTextContent('Ошибок: 1');
    expect(errorRegion).not.toHaveTextContent('Резервуар со сферой 1');
    expect(errorRegion).not.toHaveTextContent('геометрия укладки кабеля');
    expect(errorRegion).not.toHaveTextContent('CalculationError');
    expect(document.querySelector('.electrical-spreadsheet')?.textContent).not.toContain('Сообщение');

    await user.click(screen.getByText('Резервуар со сферой 2'));
    await waitFor(() => {
      expect(errorRegion).not.toHaveTextContent('Резервуар со сферой 2');
      expect(errorRegion).toHaveTextContent('Не найден кабель с мощностью');
      expect(errorRegion).toHaveTextContent('Мощность выше линейки');
      expect(errorRegion).toHaveTextContent('Попробовать другой тип кабеля');
      expect(errorRegion).not.toHaveTextContent('Попробовать 2 нитки');
      expect(errorRegion).not.toHaveTextContent('Попробовать 3 нитки');
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
      expect(screen.getByRole('button', { name: /Пересчитать выбранные \(0\)/i })).toBeInTheDocument();
    });
    await waitFor(() => {
      expect(screen.getByText('Труба-1')).toBeInTheDocument();
    });
    const rowCheckbox = document.querySelector('tbody .ant-checkbox-input') as HTMLInputElement;
    fireEvent.click(rowCheckbox);
    await user.click(screen.getByRole('button', { name: /Пересчитать выбранные \(1\)/i }));

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
          objectIds: ['o-1'],
          skipManual: true,
        }),
      );
    });
    const options = (enqueueElectricalBatchJob as ReturnType<typeof vi.fn>).mock.calls[0][4];
    expect(options.objectOverrides).toBeUndefined();
  });

  it('создаёт СО на основании текущего без запуска batch-пересчёта', async () => {
    const {
      copyElectricalVariant,
      enqueueElectricalBatchJob,
      getElectricalPage,
    } = await import('@/api/calculations');
    (getElectricalPage as ReturnType<typeof vi.fn>).mockResolvedValue(makeElectricalPage(
      [makeObject()],
      [
        {
          id: 'calc-1',
          object_id: 'o-1',
          cable_type: 'self_regulating',
          cable_type_source: 'auto',
          cable_mark: 'ТЛТ-25',
          cable_mark_source: 'auto',
          cable_snapshot: null,
          cable_snapshot_status: null,
          variant_number: 1,
          params: {},
          results: { selected_cable: 'ТЛТ-25', order_cable_length: 10 },
        },
      ],
      { total_objects: 2, electrical_calculations_total: 1 },
    ));
    (copyElectricalVariant as ReturnType<typeof vi.fn>).mockResolvedValue({
      project_id: 'p-1',
      source_variant_number: 1,
      target_variant_number: 2,
      copied_count: 1,
      project_objects_count: 2,
      deleted_target_count: 0,
      overwrite_applied: false,
      specification_regenerated: true,
    });
    useProjectStore.getState().setCurrentProject(mockProject);
    const user = (await import('@testing-library/user-event')).default.setup();
    renderPage();

    await user.click(await screen.findByRole('button', { name: /Создать на основании/i }));
    await user.click(await screen.findByText('Скопировать СО1 в СО2'));
    await user.click(await screen.findByRole('button', { name: 'Создать' }));

    await waitFor(() => {
      expect(copyElectricalVariant).toHaveBeenCalledWith({
        project_id: 'p-1',
        source_variant_number: 1,
        target_variant_number: 2,
        overwrite: false,
        regenerate_specification: true,
      });
    });
    expect(enqueueElectricalBatchJob).not.toHaveBeenCalled();
  });

  it('при занятом target просит подтверждение и повторяет copy с overwrite=true', async () => {
    const { copyElectricalVariant, getElectricalPage } = await import('@/api/calculations');
    const targetNotEmpty = Object.assign(new Error('СО2 уже содержит расчёты'), {
      status: 409,
      code: 'target_not_empty',
    });
    (getElectricalPage as ReturnType<typeof vi.fn>).mockResolvedValue(makeElectricalPage([makeObject()]));
    (copyElectricalVariant as ReturnType<typeof vi.fn>)
      .mockRejectedValueOnce(targetNotEmpty)
      .mockResolvedValueOnce({
        project_id: 'p-1',
        source_variant_number: 1,
        target_variant_number: 2,
        copied_count: 1,
        project_objects_count: 1,
        deleted_target_count: 1,
        overwrite_applied: true,
        specification_regenerated: true,
      });
    useProjectStore.getState().setCurrentProject(mockProject);
    const user = (await import('@testing-library/user-event')).default.setup();
    renderPage();

    await user.click(await screen.findByRole('button', { name: /Создать на основании/i }));
    await user.click(await screen.findByText('Скопировать СО1 в СО2'));
    await user.click(await screen.findByRole('button', { name: 'Создать' }));
    await user.click(await screen.findByRole('button', { name: 'Заменить' }));

    await waitFor(() => {
      expect(copyElectricalVariant).toHaveBeenCalledTimes(2);
    });
    expect((copyElectricalVariant as ReturnType<typeof vi.fn>).mock.calls[1][0]).toMatchObject({
      project_id: 'p-1',
      source_variant_number: 1,
      target_variant_number: 2,
      overwrite: true,
    });
  });

  it('селектор типа кабеля содержит ТТН/ТТВ/ТТХ, single_core, three_core как доступные', async () => {
    const { getElectricalPage } = await import('@/api/calculations');
    (getElectricalPage as ReturnType<typeof vi.fn>).mockResolvedValue(makeElectricalPage([makeObject()]));
    useProjectStore.getState().setCurrentProject(mockProject);
    const user = (await import('@testing-library/user-event')).default.setup();
    renderPage();
    await waitFor(() => {
      expect(screen.getByText(/Тип для пересчёта/i)).toBeInTheDocument();
      expect(screen.getByText('Труба-1')).toBeInTheDocument();
    });
    const rowCheckbox = document.querySelector('tbody .ant-checkbox-input') as HTMLInputElement;
    fireEvent.click(rowCheckbox);
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

  it('применяет выбранный сверху тип ко всем объектам при полном пересчёте', async () => {
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
      expect(screen.getByText(/Тип для пересчёта/i)).toBeInTheDocument();
      expect(screen.getByText('Труба-1')).toBeInTheDocument();
    });
    const selectors = document.querySelectorAll('.ant-select-selector');
    const cableTypeSelect = Array.from(selectors).find((el) =>
      el.textContent?.includes('Саморегулирующийся')
    );
    expect(cableTypeSelect).toBeTruthy();
    await user.click(cableTypeSelect as HTMLElement);
    await user.click(await screen.findByText('ТТН/ТТВ/ТТХ'));
    await user.type(await screen.findByLabelText('T3 поддержания'), '50');
    await user.click(screen.getByRole('button', { name: /Пересчитать все СО1/i }));
    await user.click(await screen.findByRole('button', { name: /Да, пересчитать все/i }));

    await waitFor(() => {
      expect(enqueueElectricalBatchJob).toHaveBeenCalledWith(
        'p-1',
        'builtin',
        1,
        'self_regulating_tt',
        expect.objectContaining({
          aggressiveProduct: false,
          maintainTemperature: 50,
          forceCableType: true,
          skipManual: true,
        }),
      );
    });
    const options = (enqueueElectricalBatchJob as ReturnType<typeof vi.fn>).mock.calls[0][4];
    expect(options.objectIds).toBeUndefined();
    expect(options.objectOverrides).toBeUndefined();
  });

  it('меняет тип кабеля только для выбранной строки и отправляет override по объекту', async () => {
    const { enqueueElectricalBatchJob, getElectricalPage } = await import('@/api/calculations');
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
          cable_mark: 'ТЛТ-20',
          variant_number: 1,
          results: { selected_cable: 'ТЛТ-20' },
        },
        {
          id: 'c-2',
          object_id: 'o-2',
          cable_type: 'three_core',
          cable_mark: 'Рез-3',
          variant_number: 1,
          results: { selected_cable: 'Рез-3' },
        },
      ]),
    );
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
    localStorage.setItem(ELECTRICAL_GUEST_TABLE_COLUMN_STORAGE_KEY, JSON.stringify({
      version: 1,
      visibleOrder: ['index', 'object_name', 'cable_type', 'cable_mark'],
      columns: { cable_type: { widthPct: 13 } },
    }));
    const user = (await import('@testing-library/user-event')).default.setup();
    renderPage();

    await waitFor(() => {
      expect(screen.getByText('Труба-1')).toBeInTheDocument();
      expect(screen.getByText('Труба-2')).toBeInTheDocument();
    });
    expect(screen.getByRole('row', { name: /Труба-1/ })).toHaveTextContent('Саморегулирующийся');
    expect(screen.getByRole('row', { name: /Труба-2/ })).toHaveTextContent('Трёхж. пост. мощн.');
    const firstRow = screen.getByRole('row', { name: /Труба-1/ });
    fireEvent.click(within(firstRow).getByRole('checkbox'));
    await waitFor(() => {
      expect(screen.getByRole('button', { name: /Пересчитать выбранные \(1\)/i })).toBeInTheDocument();
    });
    const selectors = document.querySelectorAll('.ant-select-selector');
    const cableTypeSelect = Array.from(selectors).find((el) =>
      el.textContent?.includes('Саморегулирующийся')
    );
    expect(cableTypeSelect).toBeTruthy();
    await user.click(cableTypeSelect as HTMLElement);
    await user.click(await screen.findByText('ТТН/ТТВ/ТТХ'));
    await user.type(await screen.findByLabelText('T3 поддержания'), '50');

    expect(screen.getAllByText('ТТН/ТТВ/ТТХ').length).toBeGreaterThan(0);
    expect(screen.getByRole('row', { name: /Труба-1/ })).toHaveTextContent('Саморегулирующийся');
    expect(screen.getByRole('row', { name: /Труба-2/ })).toHaveTextContent('Трёхж. пост. мощн.');
    await user.click(screen.getByRole('button', { name: /Пересчитать выбранные \(1\)/i }));

    await waitFor(() => {
      expect(enqueueElectricalBatchJob).toHaveBeenCalledWith(
        'p-1',
        'builtin',
        1,
        'self_regulating_tt',
        expect.objectContaining({
          maintainTemperature: 50,
          objectIds: ['o-1'],
          objectOverrides: [{ object_id: 'o-1', cable_type: 'self_regulating_tt' }],
          skipManual: true,
        }),
      );
    });
  });

  it('не показывает источник ручного выбора в колонке марки', async () => {
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
          cable_type: 'single_core',
          cable_mark: 'TT P1 62',
          cable_mark_source: 'manual',
          variant_number: 1,
          results: { selected_cable: 'TT P1 62' },
        },
        {
          id: 'c-2',
          object_id: 'o-2',
          cable_type: 'self_regulating',
          cable_mark: 'ТЛТ-30',
          cable_mark_source: 'auto',
          variant_number: 1,
          results: { selected_cable: 'ТЛТ-30' },
        },
      ]),
    );
    useProjectStore.getState().setCurrentProject(mockProject);
    localStorage.setItem(ELECTRICAL_GUEST_TABLE_COLUMN_STORAGE_KEY, JSON.stringify({
      version: 1,
      visibleOrder: ['index', 'object_name', 'cable_type', 'cable_mark'],
      columns: { cable_mark: { widthPct: 18 } },
    }));
    renderPage();

    await waitFor(() => {
      expect(screen.getByRole('row', { name: /Труба-1/ })).toHaveTextContent('TT P1 62');
      expect(screen.getByRole('row', { name: /Труба-1/ })).not.toHaveTextContent('ручн.');
      expect(screen.getByRole('row', { name: /Труба-2/ })).not.toHaveTextContent('ручн.');
    });
  });

  it('показывает в активной ячейке марки кнопки выбора и подбора', async () => {
    const {
      createElectricalCandidate,
      getElectricalPage,
      listElectricalCandidates,
    } = await import('@/api/calculations');
    const user = (await import('@testing-library/user-event')).default.setup();
    (listElectricalCandidates as ReturnType<typeof vi.fn>).mockResolvedValue([]);
    (createElectricalCandidate as ReturnType<typeof vi.fn>).mockResolvedValue({
      id: 'cand-1',
      project_id: 'p-1',
      object_id: 'o-1',
      variant_number: 1,
      cable_type: 'three_core',
      cable_source: 'builtin',
      cable_mark: 'ТТ Р3 x 0,5-0,6',
      mode: 'auto',
      status: 'applicable',
      priority: 0,
      is_recommended: true,
      is_pinned: false,
      is_applied: false,
      reason_code: null,
      reason_message: null,
      engineer_comment: null,
      params: {},
      results: { total_power: 1000, order_cable_length: 55 },
      cable_snapshot: null,
      warnings: [],
      risk_flags: [],
      candidate_meta: {},
      created_at: '2026-01-01T00:00:00Z',
      updated_at: '2026-01-01T00:00:00Z',
    });
    (getElectricalPage as ReturnType<typeof vi.fn>).mockResolvedValue(
      makeElectricalPage([makeObject({ params: { name: 'Труба-1' } })], [
        {
          id: 'c-1',
          object_id: 'o-1',
          cable_type: 'three_core',
          cable_mark: 'ТТ Р3 x 0,5-0,6',
          cable_mark_source: 'manual',
          cable_snapshot: {
            cable_mark: 'ТТ Р3 x 0,5-0,6',
            cable_type: 'three_core',
            actual_catalog_source: 'builtin',
            technical: {
              model: 'ТТ Р3 x 0,5-0,6',
              brand: 'ТТ Р3',
              resistance_ohm_km: 35,
              voltage: 220,
              min_temperature: -60,
              max_temperature: 130,
              conductor_section_mm2: 0.5,
              nominal_size_mm: '12,60 x 7,10',
            },
          },
          variant_number: 1,
          results: { selected_cable: 'ТТ Р3 x 0,5-0,6' },
        },
      ]),
    );
    useProjectStore.getState().setCurrentProject(mockProject);
    localStorage.setItem(ELECTRICAL_GUEST_TABLE_COLUMN_STORAGE_KEY, JSON.stringify({
      version: 1,
      visibleOrder: ['index', 'object_name', 'cable_mark'],
      columns: { cable_mark: { widthPct: 22 } },
    }));
    renderPage();

    const row = await screen.findByRole('row', { name: /Труба-1/ });
    fireEvent.click(row);

    expect(row).toHaveTextContent('ТТ Р3 x 0,5-0,6');
    expect(row).not.toHaveTextContent('ручн.');
    expect(within(row).getByRole('button', { name: 'Выбор' })).toBeEnabled();
    const sizingButton = within(row).getByRole('button', { name: 'Подбор' });
    expect(sizingButton).toBeEnabled();

    await user.click(sizingButton);
    const sizingDialog = await screen.findByRole('dialog', { name: /Подбор кабеля для/ });
    expect(sizingDialog).toBeInTheDocument();
    expect(within(sizingDialog).queryByRole('group', { name: 'Характеристики: кабель' })).not.toBeInTheDocument();
    const objectCharacteristics = within(sizingDialog).getByRole('group', { name: 'Характеристики: объект' });
    expect(objectCharacteristics).toHaveTextContent('Тип объекта:');
    expect(objectCharacteristics).toHaveTextContent('Труба');
    expect(objectCharacteristics).toHaveTextContent('Диаметр:');
    expect(objectCharacteristics).toHaveTextContent('Длина:');
    expect(
      (objectCharacteristics.querySelector('.cable-picker-characteristics-columns') as HTMLElement)
        .style
        .getPropertyValue('--cable-picker-characteristics-column-count'),
      ).toBe('4');
    expect(within(sizingDialog).getByRole('radio', { name: 'Авторасчёт' })).toBeChecked();
    await waitFor(() => {
      expect(listElectricalCandidates).toHaveBeenCalledWith('p-1', 'o-1', 1);
    });
    expect(createElectricalCandidate).not.toHaveBeenCalled();
    const autoButton = within(sizingDialog).getByRole('button', { name: 'Запустить авторасчёт' });
    expect(autoButton).toBeEnabled();
    expect(within(sizingDialog).getByText(/Вариантов пока нет/)).toBeInTheDocument();
    await user.click(autoButton);
    await waitFor(() => {
      expect(createElectricalCandidate).toHaveBeenCalledWith(expect.objectContaining({
        project_id: 'p-1',
        object_id: 'o-1',
        variant_number: 1,
        cable_type: 'three_core',
        mode: 'auto',
        cable_mark: null,
      }));
    });
    expect(within(sizingDialog).queryByRole('button', { name: 'Применить' })).not.toBeInTheDocument();
  });

  it('сохраняет ручные кабели по умолчанию при полном массовом пересчёте', async () => {
    const { enqueueElectricalBatchJob, getElectricalPage } = await import('@/api/calculations');
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
          cable_mark_source: 'manual',
          variant_number: 1,
          results: { selected_cable: 'ТЛТ-30' },
        },
      ]),
    );
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
      expect(screen.getByText('Труба-1')).toBeInTheDocument();
    });
    await user.click(screen.getByRole('button', { name: /Пересчитать все СО1/i }));
    expect(await screen.findByText(/Найдено ручных выборов: 1/i)).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: /Да, пересчитать все/i }));

    await waitFor(() => {
      expect(enqueueElectricalBatchJob).toHaveBeenCalledWith(
        'p-1',
        'builtin',
        1,
        'self_regulating',
        expect.objectContaining({
          forceCableType: true,
          skipManual: true,
        }),
      );
    });
  });

  it('перезаписывает ручные кабели в массовом пересчёте только после явного чекбокса', async () => {
    const { enqueueElectricalBatchJob, getElectricalPage } = await import('@/api/calculations');
    (getElectricalPage as ReturnType<typeof vi.fn>).mockResolvedValue(
      makeElectricalPage([makeObject()], [
        {
          id: 'c-1',
          object_id: 'o-1',
          cable_type: 'self_regulating',
          cable_mark: 'ТЛТ-30',
          cable_mark_source: 'manual',
          variant_number: 1,
          results: { selected_cable: 'ТЛТ-30' },
        },
      ]),
    );
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
      expect(screen.getByText('Труба-1')).toBeInTheDocument();
    });
    await user.click(screen.getByRole('button', { name: /Пересчитать все СО1/i }));
    await user.click(await screen.findByRole('checkbox', { name: /Перезаписать ручные выборы/i }));
    await user.click(screen.getByRole('button', { name: /Да, пересчитать все/i }));

    await waitFor(() => {
      expect(enqueueElectricalBatchJob).toHaveBeenCalledWith(
        'p-1',
        'builtin',
        1,
        'self_regulating',
        expect.objectContaining({
          forceCableType: true,
          skipManual: false,
        }),
      );
    });
  });

  it('предупреждает о ручном кабеле при пересчёте выбранных строк', async () => {
    const { enqueueElectricalBatchJob, getElectricalPage } = await import('@/api/calculations');
    (getElectricalPage as ReturnType<typeof vi.fn>).mockResolvedValue(
      makeElectricalPage([makeObject()], [
        {
          id: 'c-1',
          object_id: 'o-1',
          cable_type: 'self_regulating',
          cable_mark: 'ТЛТ-30',
          cable_mark_source: 'manual',
          variant_number: 1,
          results: { selected_cable: 'ТЛТ-30' },
        },
      ]),
    );
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
      expect(screen.getByText('Труба-1')).toBeInTheDocument();
    });
    const row = screen.getByRole('row', { name: /Труба-1/ });
    fireEvent.click(within(row).getByRole('checkbox'));
    await user.click(screen.getByRole('button', { name: /Пересчитать выбранные \(1\)/i }));
    expect(await screen.findByText(/Найдено ручных выборов: 1/i)).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: /^Пересчитать$/i }));

    await waitFor(() => {
      expect(enqueueElectricalBatchJob).toHaveBeenCalledWith(
        'p-1',
        'builtin',
        1,
        'self_regulating',
        expect.objectContaining({
          objectIds: ['o-1'],
          skipManual: true,
        }),
      );
    });
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
          installed_cable_length: 10,
          order_cable_length: 11,
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
            installed_cable_length: 10,
            order_cable_length: 11,
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

    await user.click(screen.getByRole('button', { name: 'Настройки' }));
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
            installed_cable_length: 10,
            order_cable_length: 11,
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

    await user.click(screen.getByRole('button', { name: 'Настройки' }));
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
    expect(stored).toMatchObject({
      version: 3,
      fontSize: 'compact',
      tableLabelFormat: 'full',
      settingsLabelFormat: 'full',
      calculationCableSource: 'builtin',
    });
  });

  it('не показывает настройку характеристик выбора марки и не выводит служебный источник', async () => {
    const { getElectricalPage } = await import('@/api/calculations');
    const user = (await import('@testing-library/user-event')).default.setup();
    (getElectricalPage as ReturnType<typeof vi.fn>).mockResolvedValue(makeElectricalPage([makeObject()]));
    useProjectStore.getState().setCurrentProject(mockProject);
    renderPage();

    await waitFor(() => {
      expect(screen.getByRole('button', { name: 'Настройки' })).toBeInTheDocument();
    });
    await user.click(screen.getByRole('button', { name: 'Настройки' }));
    const dialog = await screen.findByRole('dialog', { name: 'Настройки таблицы электрорасчёта' });
    expect(within(dialog).queryByRole('tab', { name: 'Выбор кабеля' })).not.toBeInTheDocument();
    expect(within(dialog).queryByText('Строка объекта')).not.toBeInTheDocument();
    expect(within(dialog).queryByRole('tab', { name: 'Строка кабеля' })).not.toBeInTheDocument();
    expect(within(dialog).queryByRole('list', { name: 'Поля строки объекта' })).not.toBeInTheDocument();
    expect(within(dialog).queryByRole('list', { name: 'Поля строки кабеля' })).not.toBeInTheDocument();
    await user.click(within(dialog).getByRole('button', { name: 'Сохранить' }));

    const row = await screen.findByRole('row', { name: /Труба-1/ });
    fireEvent.click(row);
    await user.click(within(row).getByRole('button', { name: 'Выбор' }));
    const pickerDialog = await screen.findByRole('dialog', { name: /Выбор марки кабеля/ });
    expect(within(pickerDialog).queryByRole('table', { name: 'Характеристики объекта и кабеля' })).not.toBeInTheDocument();
    const cableCharacteristics = within(pickerDialog).getByRole('group', { name: 'Характеристики: кабель' });
    expect(cableCharacteristics).not.toHaveTextContent('Источник');
    expect(cableCharacteristics).not.toHaveTextContent('Склад:');
    expect(cableCharacteristics).toHaveTextContent('Бренд:');
  });

  it('открывает окно выбора марки уже без отдельной верхней секции', async () => {
    const { getElectricalPage } = await import('@/api/calculations');
    const user = (await import('@testing-library/user-event')).default.setup();
    (getElectricalPage as ReturnType<typeof vi.fn>).mockResolvedValue(makeElectricalPage([makeObject()]));
    useProjectStore.getState().setCurrentProject(mockProject);
    renderPage();

    const row = await screen.findByRole('row', { name: /Труба-1/ });
    fireEvent.click(row);
    await user.click(within(row).getByRole('button', { name: 'Выбор' }));
    expect(await screen.findByRole('dialog', { name: /Выбор марки кабеля/ })).toBeInTheDocument();

    const modalRoot = document.querySelector('.electrical-cable-picker-dialog') as HTMLElement;
    expect(modalRoot.style.width).toBe('min(92vw, 1056px)');
    expect(document.querySelector('.electrical-cable-picker-drag-bar')).not.toBeInTheDocument();
    expect(document.querySelector('.electrical-cable-picker-window')).not.toBeInTheDocument();
  });

  it('показывает базу пересчёта внутри настроек электрорасчёта', async () => {
    const { getElectricalPage } = await import('@/api/calculations');
    const user = (await import('@testing-library/user-event')).default.setup();
    (getElectricalPage as ReturnType<typeof vi.fn>).mockResolvedValue(makeElectricalPage([makeObject()]));
    useProjectStore.getState().setCurrentProject(mockProject);
    renderPage();

    await waitFor(() => {
      expect(screen.getByRole('button', { name: 'Настройки' })).toBeInTheDocument();
    });
    expect(screen.queryByText('База для пересчёта:')).not.toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Настройки' }));
    const dialog = await screen.findByRole('dialog', { name: 'Настройки таблицы электрорасчёта' });
    expect(within(dialog).queryByText('База для пересчёта:')).not.toBeInTheDocument();
    await openElectricalTableSettingsOtherTab(user, dialog);

    expect(within(dialog).getByText('База для пересчёта:')).toBeInTheDocument();
    expect(within(dialog).getByLabelText('База для пересчёта')).toBeInTheDocument();
    expect(within(dialog).getByText('Встроенная')).toBeInTheDocument();
    expect(within(dialog).queryByText('Внешняя')).not.toBeInTheDocument();
  });

  it('открывает окно настроек выше и позволяет двигать его за заголовок', async () => {
    const { getElectricalPage } = await import('@/api/calculations');
    const user = (await import('@testing-library/user-event')).default.setup();
    (getElectricalPage as ReturnType<typeof vi.fn>).mockResolvedValue(makeElectricalPage([makeObject()]));
    useProjectStore.getState().setCurrentProject(mockProject);
    renderPage();

    await waitFor(() => {
      expect(screen.getByRole('button', { name: 'Настройки' })).toBeInTheDocument();
    });
    await user.click(screen.getByRole('button', { name: 'Настройки' }));
    const dialog = await screen.findByRole('dialog', { name: 'Настройки таблицы электрорасчёта' });
    const modal = document.querySelector('.electrical-column-settings-dialog') as HTMLElement;
    const modalWindow = document.querySelector('.electrical-column-settings-window') as HTMLElement;
    const title = within(dialog).getByText('Настройки таблицы электрорасчёта');

    expect(modal).toHaveStyle({ top: '24px' });
    expect(modalWindow.style.transform).toBe('translate(0px, 0px)');

    fireEvent.mouseDown(title, { button: 0, clientX: 100, clientY: 120 });
    fireEvent.mouseMove(document, { clientX: 132, clientY: 106 });
    fireEvent.mouseUp(document);

    await waitFor(() => {
      expect(modalWindow.style.transform).toBe('translate(32px, -14px)');
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
            installed_cable_length: 10,
            order_cable_length: 11,
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
            installed_cable_length: 10,
            order_cable_length: 11,
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

  it('оставляет поля таблицы электрорасчёта только для чтения', async () => {
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
            installed_cable_length: 10,
            order_cable_length: 11,
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
            installed_cable_length: 12,
            order_cable_length: 13.2,
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
    expect(document.querySelectorAll('.electrical-spreadsheet .ant-select-selector')).toHaveLength(0);
    expect(document.querySelectorAll('.electrical-spreadsheet input[role="spinbutton"]')).toHaveLength(0);
    fireEvent.click(
      within(screen.getByText('Труба-1').closest('tr') as HTMLTableRowElement).getByRole(
        'button',
        { name: 'Выбор' },
      ),
    );
    expect(await screen.findByText('Выбор марки кабеля')).toBeInTheDocument();
    expect(document.querySelectorAll('.ant-modal .ant-select-selector')).toHaveLength(2);
    fireEvent.click(screen.getByRole('button', { name: 'Отмена' }));

    fireEvent.click(screen.getByText('Труба-2').closest('tr') as HTMLTableRowElement);
    expect(document.querySelectorAll('.electrical-spreadsheet .ant-select-selector')).toHaveLength(0);
    expect(document.querySelectorAll('.electrical-spreadsheet input[role="spinbutton"]')).toHaveLength(0);
    expect(
      within(screen.getByText('Труба-2').closest('tr') as HTMLTableRowElement).getByRole(
        'button',
        { name: 'Выбор' },
      ),
    ).toBeEnabled();
  });

  it('не закрывает модалку выбора марки при ошибке ручного применения', async () => {
    const { getElectricalPage, listCables, selectCableForVariants } = await import('@/api/calculations');
    const user = (await import('@testing-library/user-event')).default.setup();
    (listCables as ReturnType<typeof vi.fn>).mockResolvedValue([
      {
        brand: 'ТЛТ',
        model: 'ТЛТ-30',
        source: 'builtin',
        cable_type: 'self_regulating',
        power_per_meter: 30,
        max_temperature: 65,
        min_temperature: -60,
        voltage: 220,
        stock_quantity_m: 1200,
        lead_time_days: 2,
        params: {
          max_pipe_temp: 160,
          protection: 'IP68',
        },
      },
    ]);
    (selectCableForVariants as ReturnType<typeof vi.fn>).mockRejectedValue(new Error('manual failed'));
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
            installed_cable_length: 10,
            order_cable_length: 11,
            total_power: 300,
            current: 1.4,
            voltage: 220,
          },
        },
      ]),
    );
    useProjectStore.getState().setCurrentProject(mockProject);
    renderPage();

    const row = await screen.findByRole('row', { name: /Труба-1/ });
    fireEvent.click(row);
    await user.click(within(row).getByRole('button', { name: 'Выбор' }));
    const dialog = await screen.findByRole('dialog', { name: /Выбор марки кабеля/ });
    await user.click(within(dialog).getByRole('button', { name: 'Применить' }));

    await waitFor(() => {
      expect(selectCableForVariants).toHaveBeenCalled();
    });
    expect(screen.getByRole('dialog', { name: /Выбор марки кабеля/ })).toBeInTheDocument();
    expect(within(dialog).getAllByText(/ТЛТ-30/).length).toBeGreaterThan(0);
  });

  it('не закрывает модалку выбора марки при ошибке автоподбора', async () => {
    const { getElectricalPage, selectCableForVariants } = await import('@/api/calculations');
    const user = (await import('@testing-library/user-event')).default.setup();
    (selectCableForVariants as ReturnType<typeof vi.fn>).mockRejectedValue(new Error('auto failed'));
    (getElectricalPage as ReturnType<typeof vi.fn>).mockResolvedValue(makeElectricalPage([makeObject()]));
    useProjectStore.getState().setCurrentProject(mockProject);
    renderPage();

    const row = await screen.findByRole('row', { name: /Труба-1/ });
    fireEvent.click(row);
    await user.click(within(row).getByRole('button', { name: 'Выбор' }));
    const dialog = await screen.findByRole('dialog', { name: /Выбор марки кабеля/ });
    await user.click(within(dialog).getByRole('button', { name: 'Применить' }));

    await waitFor(() => {
      expect(selectCableForVariants).toHaveBeenCalled();
    });
    expect(screen.getByRole('dialog', { name: /Выбор марки кабеля/ })).toBeInTheDocument();
    expect(within(dialog).getByText('Авто')).toBeInTheDocument();
  });

  it('закрывает модалку выбора марки после успешного применения', async () => {
    const { getElectricalPage, listCables, selectCableForVariants } = await import('@/api/calculations');
    const user = (await import('@testing-library/user-event')).default.setup();
    (listCables as ReturnType<typeof vi.fn>).mockResolvedValue([
      {
        brand: 'ТЛТ',
        model: 'ТЛТ-30',
        source: 'builtin',
        cable_type: 'self_regulating',
        power_per_meter: 30,
        max_temperature: 65,
        min_temperature: -60,
        voltage: 220,
        stock_quantity_m: 1200,
        lead_time_days: 2,
        params: {
          max_pipe_temp: 160,
          protection: 'IP68',
        },
      },
    ]);
    (selectCableForVariants as ReturnType<typeof vi.fn>).mockResolvedValue([{
      id: 'c-1',
      object_id: 'o-1',
      cable_type: 'self_regulating',
      cable_mark: 'ТЛТ-30',
      variant_number: 1,
      results: { selected_cable: 'ТЛТ-30' },
    }]);
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
            installed_cable_length: 10,
            order_cable_length: 11,
            total_power: 300,
            current: 1.4,
            voltage: 220,
          },
        },
      ]),
    );
    useProjectStore.getState().setCurrentProject(mockProject);
    renderPage();

    const row = await screen.findByRole('row', { name: /Труба-1/ });
    fireEvent.click(row);
    await user.click(within(row).getByRole('button', { name: 'Выбор' }));
    const dialog = await screen.findByRole('dialog', { name: /Выбор марки кабеля/ });
    await user.click(within(dialog).getByRole('button', { name: 'Применить' }));

    await waitFor(() => {
      expect(selectCableForVariants).toHaveBeenCalled();
      expect(screen.queryByRole('dialog', { name: /Выбор марки кабеля/ })).not.toBeInTheDocument();
    });
  });

  it('по умолчанию сохраняет выбор марки в открытое СО и позволяет отметить другие СО', async () => {
    const { getElectricalPage, listCables, selectCableForVariants } = await import('@/api/calculations');
    const user = (await import('@testing-library/user-event')).default.setup();
    (listCables as ReturnType<typeof vi.fn>).mockResolvedValue([
      {
        brand: 'ТЛТ',
        model: 'ТЛТ-30',
        source: 'builtin',
        cable_type: 'self_regulating',
        power_per_meter: 30,
        max_temperature: 65,
        min_temperature: -60,
        voltage: 220,
      },
    ]);
    (selectCableForVariants as ReturnType<typeof vi.fn>).mockResolvedValue([{
      id: 'c-1',
      object_id: 'o-1',
      cable_type: 'self_regulating',
      cable_mark: 'ТЛТ-30',
      variant_number: 2,
      results: { selected_cable: 'ТЛТ-30' },
    }]);
    (getElectricalPage as ReturnType<typeof vi.fn>).mockResolvedValue(
      makeElectricalPage([makeObject()], [
        {
          id: 'c-1',
          object_id: 'o-1',
          cable_type: 'self_regulating',
          cable_mark: 'ТЛТ-30',
          variant_number: 2,
          results: {
            selected_cable: 'ТЛТ-30',
            winding_pitch: 0,
            num_circuits: 1,
            installed_cable_length: 10,
            order_cable_length: 11,
            total_power: 300,
            current: 1.4,
            voltage: 220,
          },
        },
      ]),
    );
    useProjectStore.getState().setCurrentProject(mockProject);
    renderPage();

    await user.click(await screen.findByRole('button', { name: 'СО2' }));
    const row = await screen.findByRole('row', { name: /Труба-1/ });
    fireEvent.click(row);
    await user.click(within(row).getByRole('button', { name: 'Выбор' }));
    const dialog = await screen.findByRole('dialog', { name: /Выбор марки кабеля/ });

    expect(within(dialog).getByRole('checkbox', { name: 'СО1' })).not.toBeChecked();
    expect(within(dialog).getByRole('checkbox', { name: 'СО2' })).toBeChecked();
    await user.click(within(dialog).getByRole('checkbox', { name: 'СО4' }));
    await user.click(within(dialog).getByRole('button', { name: 'Применить' }));

    await waitFor(() => {
      expect(selectCableForVariants).toHaveBeenCalledTimes(1);
    });
    expect((selectCableForVariants as ReturnType<typeof vi.fn>).mock.calls[0][3])
      .toEqual([2, 4]);
  });

  it('показывает характеристики объекта и выбранного кабеля в модалке выбора марки', async () => {
    const { getElectricalPage, listCables } = await import('@/api/calculations');
    const user = (await import('@testing-library/user-event')).default.setup();
    (listCables as ReturnType<typeof vi.fn>).mockResolvedValue([
      {
        brand: 'ТЛТ',
        model: 'ТЛТ-30',
        source: 'builtin',
        cable_type: 'self_regulating',
        power_per_meter: 30,
        max_temperature: 65,
        min_temperature: -60,
        voltage: 220,
        stock_quantity_m: 1200,
        lead_time_days: 2,
        params: {
          max_pipe_temp: 160,
          protection: 'IP68',
        },
      },
    ]);
    (getElectricalPage as ReturnType<typeof vi.fn>).mockResolvedValue(
      makeElectricalPage([
        makeObject({
          params: {
            name: 'Труба-1',
            outer_diameter: 0.108,
            pipe_length: 50,
            placement: 'outdoor',
            ambient_temperature: -30,
            process_temperature: 80,
          },
          results: { heat_loss_per_meter: 100, total_heat_loss: 5000 },
        }),
      ], [
        {
          id: 'c-1',
          object_id: 'o-1',
          cable_type: 'self_regulating',
          cable_mark: 'ТЛТ-30',
          variant_number: 1,
          results: {
            selected_cable: 'ТЛТ-30',
            installed_cable_length: 50,
            order_cable_length: 55,
            total_power: 1500,
            current: 6.8,
            voltage: 220,
          },
        },
      ]),
    );
    useProjectStore.getState().setCurrentProject(mockProject);
    renderPage();

    const row = await screen.findByRole('row', { name: /Труба-1/ });
    fireEvent.click(row);
    await user.click(within(row).getByRole('button', { name: 'Выбор' }));
    const dialog = await screen.findByRole('dialog', { name: /Выбор марки кабеля/ });
    const objectCharacteristics = within(dialog).getByRole('group', { name: 'Характеристики: объект' });
    const cableCharacteristics = within(dialog).getByRole('group', { name: 'Характеристики: кабель' });

    expect(objectCharacteristics).toHaveTextContent('Диаметр:');
    expect(objectCharacteristics).toHaveTextContent('108 мм');
    expect(objectCharacteristics).toHaveTextContent('50,0 м');
    expect(objectCharacteristics).toHaveTextContent('100,00 Вт/м');
    expect(objectCharacteristics).toHaveTextContent('5,00 кВт');
    expect(cableCharacteristics).not.toHaveTextContent('Источник');
    expect(cableCharacteristics).not.toHaveTextContent('Встроенная');
    expect(cableCharacteristics).toHaveTextContent('Бренд:');
    expect(cableCharacteristics).toHaveTextContent('Марка:');
    expect(cableCharacteristics).not.toHaveTextContent('Цена/м:');
    expect(cableCharacteristics).not.toHaveTextContent('Склад:');
    expect(cableCharacteristics).not.toHaveTextContent('Остаток:');
    expect(cableCharacteristics).not.toHaveTextContent('Поставщик:');
    expect(cableCharacteristics).toHaveTextContent('Защита:');
    expect(cableCharacteristics).toHaveTextContent('IP68');
    expect(cableCharacteristics).toHaveTextContent('Макс. T трубы:');
    expect(cableCharacteristics).toHaveTextContent('160 °C');
    expect(cableCharacteristics).toHaveTextContent('30,00 Вт/м');
    expect(cableCharacteristics).toHaveTextContent('220 В');
    expect(cableCharacteristics).toHaveTextContent('-60 °C…65 °C');
  });

  it('показывает фиксированный список характеристик резервуара без трубных полей', async () => {
    const { getElectricalPage, listCables } = await import('@/api/calculations');
    const user = (await import('@testing-library/user-event')).default.setup();
    (listCables as ReturnType<typeof vi.fn>).mockResolvedValue([
      {
        brand: 'ТЛТ',
        model: 'ТЛТ-30',
        source: 'builtin',
        cable_type: 'self_regulating',
        power_per_meter: 30,
        max_temperature: 65,
        min_temperature: -60,
        voltage: 220,
      },
    ]);
    (getElectricalPage as ReturnType<typeof vi.fn>).mockResolvedValue(
      makeElectricalPage([
        makeObject({
          object_type: 'tank',
          params: {
            name: 'Резервуар-1',
            shape: 'cylindrical',
            diameter: 2,
            height: 3,
            placement: 'outdoor',
            ambient_temperature: -30,
            process_temperature: 80,
          },
          results: { heat_loss_per_m2: 45, total_heat_loss: 9000 },
        }),
      ], [
        {
          id: 'c-1',
          object_id: 'o-1',
          cable_type: 'self_regulating',
          cable_mark: 'ТЛТ-30',
          variant_number: 1,
          results: {
            selected_cable: 'ТЛТ-30',
            installed_cable_length: 50,
            order_cable_length: 55,
            total_power: 1500,
            current: 6.8,
            voltage: 220,
          },
        },
      ]),
    );
    useProjectStore.getState().setCurrentProject(mockProject);
    renderPage();

    const row = await screen.findByRole('row', { name: /Резервуар-1/ });
    fireEvent.click(row);
    await user.click(within(row).getByRole('button', { name: 'Выбор' }));
    const dialog = await screen.findByRole('dialog', { name: /Выбор марки кабеля/ });
    const objectCharacteristics = within(dialog).getByRole('group', { name: 'Характеристики: объект' });

    expect(objectCharacteristics).toHaveTextContent('Тип объекта:');
    expect(objectCharacteristics).toHaveTextContent('Резервуар');
    expect(objectCharacteristics).toHaveTextContent('Геометрия резервуара:');
    expect(objectCharacteristics).toHaveTextContent('цилиндр Ø 2 000 мм, H 3 000 мм');
    expect(objectCharacteristics).toHaveTextContent('45,00 Вт/м²');
    expect(objectCharacteristics).not.toHaveTextContent('Диаметр:');
    expect(objectCharacteristics).not.toHaveTextContent('Длина:');
  });

  it('показывает специфические поля выбранного типа кабеля', async () => {
    const { getElectricalPage } = await import('@/api/calculations');
    const user = (await import('@testing-library/user-event')).default.setup();
    (getElectricalPage as ReturnType<typeof vi.fn>).mockResolvedValue(
      makeElectricalPage([makeObject()], [
        {
          id: 'c-1',
          object_id: 'o-1',
          cable_type: 'self_regulating_tt',
          cable_mark: '30ТТВ2-СР',
          variant_number: 1,
          results: {
            selected_cable: '30ТТВ2-СР',
            installed_cable_length: 50,
            order_cable_length: 55,
            total_power: 1500,
            current: 6.8,
            voltage: 220,
          },
        },
      ]),
    );
    useProjectStore.getState().setCurrentProject(mockProject);
    renderPage();

    const row = await screen.findByRole('row', { name: /Труба-1/ });
    fireEvent.click(row);
    await user.click(within(row).getByRole('button', { name: 'Выбор' }));
    const dialog = await screen.findByRole('dialog', { name: /Выбор марки кабеля/ });
    const cableCharacteristics = within(dialog).getByRole('group', { name: 'Характеристики: кабель' });

    expect(cableCharacteristics).toHaveTextContent('Тип кабеля:');
    expect(cableCharacteristics).toHaveTextContent('ТТН/ТТВ/ТТХ');
    expect(cableCharacteristics).toHaveTextContent('Q1:');
    expect(cableCharacteristics).toHaveTextContent('-0,141 Вт/(м·°C)');
    expect(cableCharacteristics).toHaveTextContent('Q2:');
    expect(cableCharacteristics).toHaveTextContent('32,00 Вт/м');
    expect(cableCharacteristics).toHaveTextContent('Макс. T проп.:');
    expect(cableCharacteristics).toHaveTextContent('210 °C');
  });

  it('показывает лейбл внешнего кабеля только в смешанном источнике', async () => {
    const { getElectricalPage, listCables } = await import('@/api/calculations');
    const user = (await import('@testing-library/user-event')).default.setup();
    useAuthStore.getState().setEmployee(
      { id: 'u-1', email: 'employee@test.local', full_name: null, role: 'employee', is_active: true },
      { access: 'token' },
    );
    (getElectricalPage as ReturnType<typeof vi.fn>).mockResolvedValue(
      makeElectricalPage([makeObject()], [
        {
          id: 'c-1',
          object_id: 'o-1',
          cable_type: 'self_regulating',
          cable_mark: 'ВНШ-СР-18',
          variant_number: 1,
          results: {
            selected_cable: 'ВНШ-СР-18',
            winding_pitch: 0,
            num_circuits: 1,
            installed_cable_length: 10,
            order_cable_length: 11,
            total_power: 180,
            current: 0.8,
            voltage: 220,
          },
        },
      ]),
    );
    (listCables as ReturnType<typeof vi.fn>).mockImplementation((source: string) => {
      if (source === 'builtin') {
        return Promise.resolve([
          {
            brand: 'ТЛТ',
            model: 'ТЛТ-75',
            source: 'builtin',
            cable_type: 'self_regulating',
            power_per_meter: 75,
            max_temperature: 65,
            min_temperature: -60,
            voltage: 220,
          },
        ]);
      }
      if (source === 'extended') {
        return Promise.resolve([
          {
            brand: 'ВНШ-СР',
            model: 'ВНШ-СР-18',
            source: 'extended',
            cable_type: 'self_regulating',
            power_per_meter: 18,
            max_temperature: 90,
            min_temperature: -55,
            params: { voltage: 220 },
          },
        ]);
      }
      return Promise.resolve([
        {
          brand: 'ТЛТ',
          model: 'ТЛТ-75',
          source: 'builtin',
          cable_type: 'self_regulating',
          power_per_meter: 75,
          max_temperature: 65,
          min_temperature: -60,
          voltage: 220,
        },
        {
          brand: 'ТЛТ',
          model: 'ТЛТ-75',
          source: 'extended',
          cable_type: 'self_regulating',
          power_per_meter: 75,
          max_temperature: 65,
          min_temperature: -60,
          params: { voltage: 220 },
        },
        {
          brand: 'ВНШ-СР',
          model: 'ВНШ-СР-18',
          source: 'extended',
          cable_type: 'self_regulating',
          power_per_meter: 18,
          max_temperature: 90,
          min_temperature: -55,
          params: { voltage: 220 },
        },
      ]);
    });

    useProjectStore.getState().setCurrentProject(mockProject);
    const firstRender = renderPage();

    await waitFor(() => {
      expect(screen.getByText('Труба-1')).toBeInTheDocument();
    });
    await user.click(screen.getByRole('button', { name: 'Настройки' }));
    const externalSourceDialog = await screen.findByRole('dialog', { name: 'Настройки таблицы электрорасчёта' });
    await openElectricalTableSettingsOtherTab(user, externalSourceDialog);
    await user.click(within(externalSourceDialog).getByText('Внешняя'));
    await user.click(within(externalSourceDialog).getByRole('button', { name: 'Сохранить' }));
    await waitFor(() => {
      expect(screen.queryByRole('dialog', { name: 'Настройки таблицы электрорасчёта' })).not.toBeInTheDocument();
    });
    const row = screen.getAllByText('Труба-1')[0].closest('tr') as HTMLTableRowElement;
    fireEvent.click(row);
    await user.click(within(row).getByRole('button', { name: 'Выбор' }));

    expect(await screen.findByText('Выбор марки кабеля')).toBeInTheDocument();
    await waitFor(() => {
      expect(screen.getAllByText(/ВНШ-СР-18/).length).toBeGreaterThan(0);
    });
    expect(screen.queryByText('внеш.')).not.toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Отмена' }));
    await waitFor(() => {
      expect(screen.queryByRole('dialog', { name: /Выбор марки кабеля/ })).not.toBeInTheDocument();
    });

    firstRender.unmount();
    useProjectStore.getState().setCurrentProject(mockProject);
    renderPage();
    await waitFor(() => {
      expect(screen.getByText('Труба-1')).toBeInTheDocument();
    });
    await user.click(screen.getByRole('button', { name: 'Настройки' }));
    const allSourceDialog = await screen.findByRole('dialog', { name: 'Настройки таблицы электрорасчёта' });
    await openElectricalTableSettingsOtherTab(user, allSourceDialog);
    await user.click(within(allSourceDialog).getByText('Все'));
    await user.click(within(allSourceDialog).getByRole('button', { name: 'Сохранить' }));
    await waitFor(() => {
      expect(screen.queryByRole('dialog', { name: 'Настройки таблицы электрорасчёта' })).not.toBeInTheDocument();
    });
    const nextRow = screen.getAllByText('Труба-1')[0].closest('tr') as HTMLTableRowElement;
    fireEvent.click(nextRow);
    await user.click(within(nextRow).getByRole('button', { name: 'Выбор' }));

    expect(await screen.findByText('внеш.')).toBeInTheDocument();
  });

  it('не пересчитывает объект из inline-полей таблицы', async () => {
    const { getElectricalPage, selectCableForVariants } = await import('@/api/calculations');
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
          installed_cable_length: 10,
          order_cable_length: 11,
          total_power: 600,
          current: 2.7,
          voltage: 220,
        },
      },
      ]),
    );
    (selectCableForVariants as ReturnType<typeof vi.fn>).mockResolvedValue([{
      id: 'c-1',
      object_id: 'o-1',
      cable_type: 'self_regulating',
      cable_mark: 'ТЛТ-30',
      variant_number: 1,
      results: { winding_pitch: 80, num_circuits: 1 },
    }]);
    useProjectStore.getState().setCurrentProject(mockProject);
    renderPage();

    await waitFor(() => {
      expect(screen.getAllByText('ТЛТ-30').length).toBeGreaterThan(0);
    });
    fireEvent.click(screen.getByText('Труба-1').closest('tr') as HTMLTableRowElement);
    expect(document.querySelector('.electrical-spreadsheet input[role="spinbutton"]')).toBeNull();
    expect(document.querySelector('.electrical-spreadsheet .ant-select-selector')).toBeNull();
    expect(selectCableForVariants).not.toHaveBeenCalled();
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
      expect(screen.getByText(/Тип для пересчёта/i)).toBeInTheDocument();
      expect(screen.getByText('Труба-1')).toBeInTheDocument();
    });
    const rowCheckbox = document.querySelector('tbody .ant-checkbox-input') as HTMLInputElement;
    fireEvent.click(rowCheckbox);
    await waitFor(() => {
      expect(screen.getByText(/Тип для пересчёта/i)).toBeInTheDocument();
    });
    const selectors = document.querySelectorAll('.ant-select-selector');
    const cableTypeSelect = Array.from(selectors).find((el) =>
      el.textContent?.includes('Саморегулирующийся')
    );
    expect(cableTypeSelect).toBeTruthy();
    await user.click(cableTypeSelect as HTMLElement);
    await user.click(await screen.findByText('ТТН/ТТВ/ТТХ'));
    await user.type(await screen.findByLabelText('T3 поддержания'), '50');
    await user.click(screen.getByRole('button', { name: /Пересчитать все СО1/i }));
    await user.click(await screen.findByRole('button', { name: /Да, пересчитать все/i }));

    await waitFor(() => {
      expect(enqueueElectricalBatchJob).toHaveBeenCalledWith(
        'p-1',
        'builtin',
        1,
        'self_regulating_tt',
        expect.objectContaining({
          aggressiveProduct: false,
          maintainTemperature: 50,
          forceCableType: true,
          skipManual: true,
        }),
      );
    });
    const options = (enqueueElectricalBatchJob as ReturnType<typeof vi.fn>).mock.calls[0][4];
    expect(options.objectOverrides).toBeUndefined();
  });
});
