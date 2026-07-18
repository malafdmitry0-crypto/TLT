import { describe, it, expect, vi, beforeEach } from 'vitest';
import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import TestMemoryRouter from '@/__tests__/utils/TestMemoryRouter';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { ReactNode } from 'react';
import ElecCalcPage from '@/pages/ElecCalcPage';
import { useAuthStore } from '@/store/authStore';
import { useCalculationVariantStore } from '@/store/calculationVariantStore';
import { useProjectStore } from '@/store/projectStore';
import type {
  CalculationTaskResponse,
  CalculationTaskStatus,
  ElectricalCalcSummary,
  ElectricalCandidate,
  ElectricalPageResponse,
} from '@/types/calculation';
import type { Project, ProjectObject } from '@/types/project';
import { getCalcJobRefetchInterval } from '@/utils/calcJobPolling';
import { ELECTRICAL_GUEST_TABLE_COLUMN_STORAGE_KEY } from '@/utils/electricalTableColumns';
import { ELECTRICAL_GUEST_CANDIDATE_TABLE_COLUMN_STORAGE_KEY } from '@/utils/electricalCandidateTableColumns';
import {
  ELECTRICAL_GUEST_TABLE_VIEW_STORAGE_KEY,
} from '@/utils/electricalTableViewSettings';
import {
  ELECTRICAL_TABLE_ENGINE_STORAGE_KEY,
} from '@/utils/electricalTableEngine';
import { electricalDataQueryKeys } from '@/api/electricalQueryKeys';

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
    enqueueBatch: vi.fn(),
    enqueueVariantBatch: vi.fn(),
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
        field('power_per_meter', 'number', ['range']),
        field('installed_power_per_meter', 'number', ['range']),
        field('current', 'number', ['range']),
        field('message'),
      ],
    }),
  };
});

const electricalVariantApiMocks = vi.hoisted(() => ({
  list: vi.fn().mockResolvedValue([
    {
      id: '11111111-1111-4111-8111-111111111111',
      project_id: 'p-1',
      name: 'ЭР1',
      sort_order: 0,
      is_active: true,
      copied_from_id: null,
      legacy_variant_number: 1,
      specification_state: 'not_generated',
      created_at: '2026-07-18T10:00:00Z',
      updated_at: '2026-07-18T10:00:00Z',
    },
    {
      id: '22222222-2222-4222-8222-222222222222',
      project_id: 'p-1',
      name: 'ЭР2',
      sort_order: 1,
      is_active: false,
      copied_from_id: null,
      legacy_variant_number: 2,
      specification_state: 'not_generated',
      created_at: '2026-07-18T10:00:00Z',
      updated_at: '2026-07-18T10:00:00Z',
    },
    {
      id: '33333333-3333-4333-8333-333333333333',
      project_id: 'p-1',
      name: 'ЭР3',
      sort_order: 2,
      is_active: false,
      copied_from_id: null,
      legacy_variant_number: 3,
      specification_state: 'not_generated',
      created_at: '2026-07-18T10:00:00Z',
      updated_at: '2026-07-18T10:00:00Z',
    },
    {
      id: '44444444-4444-4444-8444-444444444444',
      project_id: 'p-1',
      name: 'ЭР4',
      sort_order: 3,
      is_active: false,
      copied_from_id: null,
      legacy_variant_number: 4,
      specification_state: 'not_generated',
      created_at: '2026-07-18T10:00:00Z',
      updated_at: '2026-07-18T10:00:00Z',
    },
  ]),
  readiness: vi.fn(),
  initialize: vi.fn(),
  create: vi.fn(),
  copy: vi.fn(),
  rename: vi.fn(),
  activate: vi.fn(),
  remove: vi.fn(),
}));

const defaultElectricalVariantListImplementation =
  electricalVariantApiMocks.list.getMockImplementation();

vi.mock('@/api/electricalVariants', () => ({
  electricalVariantQueryKeys: {
    list: (projectId: string) => ['project', projectId, 'electrical-variants'] as const,
    readiness: (projectId: string) => ['project', projectId, 'electrical-readiness'] as const,
    detail: (projectId: string, variantId: string) =>
      ['project', projectId, 'electrical-variant', variantId] as const,
  },
  listElectricalVariants: electricalVariantApiMocks.list,
  getElectricalVariantReadiness: electricalVariantApiMocks.readiness,
  initializeElectricalVariants: electricalVariantApiMocks.initialize,
  createEmptyElectricalVariant: electricalVariantApiMocks.create,
  copyElectricalVariant: electricalVariantApiMocks.copy,
  renameElectricalVariant: electricalVariantApiMocks.rename,
  activateElectricalVariant: electricalVariantApiMocks.activate,
  deleteElectricalVariant: electricalVariantApiMocks.remove,
}));

const electricalGlideGridMock = vi.hoisted(() => ({
  props: null as null | {
    rows?: unknown[];
    infiniteLoading?: {
      loaded: number;
      total: number;
      hasNextPage: boolean;
    } | null;
    onLoadMore?: () => void;
    [key: string]: unknown;
  },
}));

vi.mock('@/components/electrical/ElectricalGlideGrid', async () => {
  const React = await vi.importActual<typeof import('react')>('react');
  return {
    default: (props: {
      rows?: unknown[];
      infiniteLoading?: {
        loaded: number;
        total: number;
        hasNextPage: boolean;
      } | null;
      onLoadMore?: () => void;
      [key: string]: unknown;
    }) => {
      electricalGlideGridMock.props = props;
      const infinite = props.infiniteLoading;
      return React.createElement(
        'div',
        { 'data-testid': 'electrical-glide-grid-mock' },
        infinite
          ? [
            React.createElement(
              'span',
              { key: 'label' },
              `infinite:${props.rows?.length ?? 0}:${infinite.loaded}:${infinite.total}:${infinite.hasNextPage}`,
            ),
            React.createElement(
              'button',
              {
                key: 'next',
                type: 'button',
                disabled: !infinite.hasNextPage,
                'aria-label': 'Догрузить строки',
                onClick: props.onLoadMore,
              },
              'load',
            ),
          ]
          : 'no-infinite',
      );
    },
  };
});

vi.mock('@/components/electrical/ElectricalCandidateGlideGrid', async () => {
  const React = await vi.importActual<typeof import('react')>('react');

  function textFromNode(node: unknown): string {
    if (node == null || typeof node === 'boolean') return '';
    if (typeof node === 'string' || typeof node === 'number') return String(node);
    if (Array.isArray(node)) return node.map(textFromNode).join(' ');
    if (typeof node === 'object' && 'props' in node) {
      const props = (node as { props?: { children?: unknown; label?: unknown; title?: unknown } }).props;
      return textFromNode(props?.label ?? props?.title ?? props?.children);
    }
    return '';
  }

  function MockElectricalCandidateGlideGrid(props: {
      rows: ElectricalCandidate[];
      gridColumns: Array<{ key: string; title: string; label?: string; width: number; filterable?: boolean; sortable?: boolean }>;
      tableViewState: { sort?: { columnKey: string; direction: 'asc' | 'desc' } };
      emptyContent: ReactNode;
      rowClassName: (candidate: ElectricalCandidate) => string;
      getCellState: (candidate: ElectricalCandidate, columnKey: string, rowIndex: number) => {
        displayValue: string;
        dirty?: boolean;
        actions?: Array<{ key: string; label: string; disabled?: boolean }>;
      };
      onToggleMarked: (candidate: ElectricalCandidate, checked: boolean) => void;
      onCellAction: (candidate: ElectricalCandidate, columnKey: string, actionKey: string) => void;
      getActionMenuItems?: (
        candidate: ElectricalCandidate,
        columnKey: string,
        actionKey: string,
      ) => Array<{ key?: string; type?: string; label?: unknown; disabled?: boolean; onClick?: () => void }> | null | undefined;
      onSetColumnFilter: (columnKey: string, filter?: { kind: 'text'; value: string }) => void;
      onSetSort: (columnKey: string, direction?: 'asc' | 'desc') => void;
      onColumnResizeEnd?: (columnKey: string, widthPx: number) => void;
    }) {
      const [filterColumnKey, setFilterColumnKey] = React.useState<string | null>(null);
      const [filterValue, setFilterValue] = React.useState('');
      const [menuItems, setMenuItems] = React.useState<Array<{
        key?: string;
        type?: string;
        label?: unknown;
        disabled?: boolean;
        onClick?: () => void;
      }> | null>(null);
      const visibleColumns = props.gridColumns;

      return React.createElement(
        'div',
        { className: 'electrical-cable-sizing-table electrical-candidate-spreadsheet--glide' },
        [
          React.createElement(
            'table',
            { key: 'table' },
            [
              React.createElement(
                'thead',
                { key: 'thead' },
                React.createElement(
                  'tr',
                  {},
                  visibleColumns.map((column) => React.createElement(
                    'th',
                    {
                      key: column.key,
                      onClick: () => {
                        if (!column.sortable) return;
                        props.onSetSort(
                          column.key,
                          props.tableViewState.sort?.columnKey === column.key
                            && props.tableViewState.sort.direction === 'asc'
                            ? 'desc'
                            : 'asc',
                        );
                      },
                    },
                    [
                      React.createElement('span', { key: 'title' }, column.title),
                      column.filterable && React.createElement(
                        'button',
                        {
                          key: 'filter',
                          type: 'button',
                          onClick: (event: { stopPropagation: () => void }) => {
                            event.stopPropagation();
                            setFilterColumnKey(column.key);
                          },
                        },
                        `Фильтр ${column.label ?? column.title}`,
                      ),
                      column.key === 'cable_mark' && React.createElement(
                        'button',
                        {
                          key: 'resize',
                          type: 'button',
                          'aria-label': `Изменить ширину: ${column.label ?? column.title}`,
                          onPointerDown: (event: { stopPropagation: () => void }) => {
                            event.stopPropagation();
                            props.onColumnResizeEnd?.(column.key, column.width + 50);
                          },
                        },
                        'resize',
                      ),
                    ],
                  )),
                ),
              ),
              React.createElement(
                'tbody',
                { key: 'tbody' },
                props.rows.map((candidate, rowIndex) => React.createElement(
                  'tr',
                  {
                    key: candidate.id,
                    'data-testid': `candidate-row-${candidate.id}`,
                    className: props.rowClassName(candidate),
                  },
                  visibleColumns.map((column) => {
                    const state = props.getCellState(candidate, column.key, rowIndex);
                    if (column.key === 'marked') {
                      return React.createElement(
                        'td',
                        { key: column.key },
                        React.createElement('input', {
                          type: 'checkbox',
                          'data-testid': `candidate-mark-${candidate.id}`,
                          checked: state.displayValue === '1',
                          onChange: (event: { target: { checked: boolean } }) =>
                            props.onToggleMarked(candidate, event.target.checked),
                        }),
                      );
                    }
                    if (column.key === 'actions') {
                      return React.createElement(
                        'td',
                        { key: column.key },
                        [
                          React.createElement('button', {
                            key: 'apply',
                            type: 'button',
                            'data-testid': `candidate-apply-${candidate.id}`,
                            'aria-pressed': candidate.is_applied,
                            disabled: state.actions?.find((action) => action.key === 'apply')?.disabled,
                            onClick: () => props.onCellAction(candidate, column.key, 'apply'),
                          }, `${candidate.is_applied ? 'Уже выбран' : 'Выбрать'} кандидат ${candidate.cable_mark ?? candidate.id}`),
                          React.createElement('button', {
                            key: 'folder',
                            type: 'button',
                            'data-testid': `candidate-folder-${candidate.id}`,
                            onClick: () => {
                              setMenuItems(props.getActionMenuItems?.(candidate, column.key, 'folder') ?? null);
                            },
                          }, `Добавить кандидат ${candidate.cable_mark ?? candidate.id} в папку`),
                          React.createElement('button', {
                            key: 'exclude',
                            type: 'button',
                            'data-testid': `candidate-exclude-${candidate.id}`,
                            disabled: state.actions?.find((action) => action.key === 'exclude')?.disabled,
                            onClick: () => props.onCellAction(candidate, column.key, 'exclude'),
                          }, candidate.status === 'excluded' ? 'Вернуть вариант' : 'Исключить вариант'),
                        ],
                      );
                    }
                    return React.createElement(
                      'td',
                      {
                        key: column.key,
                        className: state.dirty ? 'electrical-candidate-cell--diff' : undefined,
                        'data-testid': state.dirty ? `candidate-diff-${candidate.id}-${column.key}` : undefined,
                      },
                      column.key === 'cable_mark' && candidate.is_pinned
                        ? [state.displayValue, React.createElement('span', { key: 'pinned' }, 'избр.')]
                        : state.displayValue,
                    );
                  }),
                )),
              ),
            ],
          ),
          props.rows.length === 0 && React.createElement(
            'div',
            { key: 'empty' },
            props.emptyContent,
          ),
          filterColumnKey && React.createElement(
            'div',
            { key: 'filter-popup' },
            [
              React.createElement('label', { key: 'label' }, [
                `Поиск: ${visibleColumns.find((column) => column.key === filterColumnKey)?.label ?? filterColumnKey}`,
                React.createElement('input', {
                  key: 'input',
                  'aria-label': `Поиск: ${visibleColumns.find((column) => column.key === filterColumnKey)?.label ?? filterColumnKey}`,
                  value: filterValue,
                  onChange: (event: { target: { value: string } }) => setFilterValue(event.target.value),
                }),
              ]),
              React.createElement('button', {
                key: 'apply',
                type: 'button',
                onClick: () => {
                  props.onSetColumnFilter(filterColumnKey, { kind: 'text', value: filterValue });
                  setFilterColumnKey(null);
                },
              }, 'Применить'),
            ],
          ),
          menuItems && React.createElement(
            'div',
            { key: 'menu', role: 'menu' },
            menuItems
              .filter((item) => item?.type !== 'divider')
              .map((item) => React.createElement('button', {
                key: item.key,
                type: 'button',
                role: 'menuitem',
                disabled: item.disabled,
                onClick: () => {
                  item.onClick?.();
                  setMenuItems(null);
                },
              }, textFromNode(item.label))),
          ),
        ],
      );
  }

  return {
    default: MockElectricalCandidateGlideGrid,
  };
});

vi.mock('@/api/projects', () => ({
  deleteObject: vi.fn(),
}));

vi.mock('@/api/calculations', () => ({
  addElectricalCandidateToFolder: vi.fn(),
  applyElectricalCandidate: vi.fn(),
  batchCalcElectrical: vi.fn(),
  cancelCalcTask: vi.fn(),
  copyElectricalVariant: vi.fn(),
  createElectricalCandidate: vi.fn(),
  createElectricalCandidateFolder: vi.fn(),
  deleteElectricalCandidateFolder: vi.fn(),
  enqueueElectricalBatchJob: apiMocks.enqueueBatch,
  enqueueElectricalVariantBatchJob: (
    projectId: string,
    electricalVariantId: string,
    cableSource: string,
    cableType: string,
    options: Record<string, unknown>,
  ) => {
    apiMocks.enqueueVariantBatch(
      projectId,
      electricalVariantId,
      cableSource,
      cableType,
      options,
    );
    // Existing calculation-detail assertions remain focused on their numeric
    // adapter payload while the raw UUID call is asserted separately below.
    return apiMocks.enqueueBatch(projectId, cableSource, 1, cableType, options);
  },
  listElectricalCandidateFolders: vi.fn().mockResolvedValue([]),
  listElectricalCandidates: vi.fn().mockResolvedValue([]),
  getCalcTask: vi.fn().mockResolvedValue({
    id: 'task-1',
    type: 'electrical_batch',
    status: 'running',
    project_id: 'p-1',
    electrical_variant_id: '11111111-1111-4111-8111-111111111111',
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
  removeElectricalCandidateFromFolder: vi.fn(),
  unapplyElectricalCandidate: vi.fn(),
  updateElectricalCandidateFolder: vi.fn(),
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

function makeCalcTask(
  id: string,
  electricalVariantId: string,
  status: CalculationTaskStatus,
  overrides: Partial<CalculationTaskResponse> = {},
): CalculationTaskResponse {
  return {
    id,
    type: 'electrical_batch',
    status,
    project_id: 'p-1',
    electrical_variant_id: electricalVariantId,
    progress: { current: 0, total: 1, phase: status, percent: 0 },
    result: null,
    error_message: null,
    cancel_requested: false,
    created_at: '2026-01-01T00:00:00Z',
    started_at: null,
    finished_at: null,
    links: { status: '', result: '', cancel: '' },
    ...overrides,
  };
}

function renderPage(
  state?: { activeJobId?: string },
  queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } }),
) {
  const view = render(
    <QueryClientProvider client={queryClient}>
      <TestMemoryRouter initialEntries={[{ pathname: '/workspace/elec-calc', state }]}>
        <ElecCalcPage />
      </TestMemoryRouter>
    </QueryClientProvider>
  );
  return { ...view, queryClient };
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
    electricalVariantApiMocks.list.mockReset();
    electricalVariantApiMocks.list.mockImplementation(
      defaultElectricalVariantListImplementation!,
    );
    electricalVariantApiMocks.readiness.mockReset();
    electricalVariantApiMocks.initialize.mockReset();
    electricalVariantApiMocks.create.mockReset();
    electricalVariantApiMocks.copy.mockReset();
    electricalVariantApiMocks.rename.mockReset();
    electricalVariantApiMocks.activate.mockReset();
    electricalVariantApiMocks.remove.mockReset();
    vi.unstubAllEnvs();
    vi.stubEnv('VITE_COMMERCIAL_FEATURES_ENABLED', 'true');
    electricalGlideGridMock.props = null;
    localStorage.clear();
    // Main table uses AntD DOM here; candidate table is mocked through its Glide props.
    localStorage.setItem(ELECTRICAL_TABLE_ENGINE_STORAGE_KEY, 'table');
    useAuthStore.getState().logout();
    useAuthStore.getState().setGuest('sid');
    useProjectStore.getState().setCurrentProject(null);
    useCalculationVariantStore.setState({
      selectedVariantIdByProject: {},
      variantByProject: {},
    });
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

  it('продолжает polling исходного ЭР после переключения и инвалидирует только его UUID', async () => {
    const { getCalcTask, getElectricalPage } = await import('@/api/calculations');
    const getCalcTaskMock = getCalcTask as ReturnType<typeof vi.fn>;
    (getElectricalPage as ReturnType<typeof vi.fn>).mockResolvedValue(makeElectricalPage([]));
    getCalcTaskMock
      .mockResolvedValueOnce(makeCalcTask(
        'task-er-1',
        '11111111-1111-4111-8111-111111111111',
        'running',
      ))
      .mockResolvedValueOnce(makeCalcTask(
        'task-er-1',
        '11111111-1111-4111-8111-111111111111',
        'succeeded',
        {
          finished_at: '2026-01-01T00:00:02Z',
          result: {
            scope: 'all',
            calculated: 1,
            skipped: 0,
            heat_loss_failed: 0,
            errors: [],
            results: [],
          },
        },
      ));
    useProjectStore.getState().setCurrentProject(mockProject);
    const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    const invalidate = vi.spyOn(queryClient, 'invalidateQueries');
    const user = (await import('@testing-library/user-event')).default.setup();
    renderPage({ activeJobId: 'task-er-1' }, queryClient);

    await waitFor(() => {
      expect(getCalcTaskMock).toHaveBeenCalledTimes(1);
    });
    await user.click(screen.getByRole('tab', { name: 'ЭР2' }));
    expect(screen.getByRole('tab', { name: 'ЭР2' })).toHaveAttribute('aria-selected', 'true');

    await waitFor(() => {
      expect(getCalcTaskMock).toHaveBeenCalledTimes(2);
    }, { timeout: 4_000 });
    await waitFor(() => {
      expect(invalidate).toHaveBeenCalledWith({
        queryKey: electricalDataQueryKeys.variant(
          'p-1',
          '11111111-1111-4111-8111-111111111111',
        ),
      });
    });
    expect(invalidate).not.toHaveBeenCalledWith({
      queryKey: electricalDataQueryKeys.variant(
        'p-1',
        '22222222-2222-4222-8222-222222222222',
      ),
    });
  });

  it('использует редкий polling для очереди и фоновой вкладки', () => {
    expect(getCalcJobRefetchInterval('queued', false)).toBe(2000);
    expect(getCalcJobRefetchInterval('enqueued', false)).toBe(2000);
    expect(getCalcJobRefetchInterval('running', false)).toBe(1000);
    expect(getCalcJobRefetchInterval('running', true)).toBe(15000);
    expect(getCalcJobRefetchInterval('succeeded', false)).toBe(false);
  });

  it('строит именованные вкладки ЭР из lifecycle API', async () => {
    const { getElectricalPage } = await import('@/api/calculations');
    (getElectricalPage as ReturnType<typeof vi.fn>).mockResolvedValue(makeElectricalPage([]));
    useProjectStore.getState().setCurrentProject(mockProject);
    renderPage();
    await waitFor(() => {
      expect(screen.getByRole('tab', { name: /ЭР1.*активный ЭР/i })).toBeInTheDocument();
    });
    expect(screen.getByRole('tab', { name: 'ЭР4' })).toBeInTheDocument();
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

    await user.click(screen.getByRole('tab', { name: 'ЭР2' }));

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
      expect(screen.getByRole('button', { name: /Пересчитать все · ЭР1/i })).toBeInTheDocument();
    });
  });

  it('сохраняет таблицы и настройки, но блокирует project-write действия для чужого employee', async () => {
    const user = (await import('@testing-library/user-event')).default.setup();
    const {
      createElectricalCandidate,
      getElectricalPage,
      selectCableForVariants,
    } = await import('@/api/calculations');
    (getElectricalPage as ReturnType<typeof vi.fn>).mockResolvedValue(
      makeElectricalPage([makeObject()]),
    );
    useAuthStore.getState().setEmployee({
      id: 'viewer-1',
      email: 'viewer@example.test',
      full_name: null,
      role: 'employee',
      is_active: true,
    }, { access: 'token' });
    useProjectStore.getState().setCurrentProject({
      ...mockProject,
      user_id: 'owner-2',
      session_id: null,
    });

    renderPage();

    expect(await screen.findByText('Режим просмотра')).toBeInTheDocument();
    expect(await screen.findByText('Труба-1')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Пересчитать выбранные \(0\)/i })).toBeDisabled();
    expect(screen.getByRole('button', { name: /Пересчитать все · ЭР1/i })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Настройки' })).not.toBeDisabled();
    expect(screen.getByRole('combobox', { name: 'Тип кабеля' })).toBeDisabled();
    expect(screen.getByLabelText('Напряжение питания')).toBeDisabled();

    await user.click(screen.getByRole('checkbox', { name: 'Показать блок заполнения параметров' }));
    expect(screen.getByRole('combobox', { name: 'Тип кабеля для пересчёта' })).toBeDisabled();
    expect(screen.getByLabelText('Напряжение питания')).toBeDisabled();

    await user.click(screen.getByText('Труба-1'));
    expect(await screen.findByRole('button', { name: 'Выбор' })).toBeDisabled();
    const sizing = screen.getByRole('button', { name: 'Подбор' });
    expect(sizing).not.toBeDisabled();
    await user.click(sizing);

    expect(await screen.findByRole('dialog', { name: /Подбор кабеля для Труба-1/ }))
      .toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Запустить авторасчёт' })).toBeDisabled();
    expect(screen.getByLabelText('Комментарий к выбранному кандидату')).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Настройки таблицы' })).not.toBeDisabled();

    expect(apiMocks.enqueueVariantBatch).not.toHaveBeenCalled();
    expect(selectCableForVariants).not.toHaveBeenCalled();
    expect(createElectricalCandidate).not.toHaveBeenCalled();
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

  it('в Glide-режиме догружает следующую cursor-порцию в бесконечный список', async () => {
    const { getElectricalPage } = await import('@/api/calculations');
    const objects = Array.from({ length: 80 }, (_, index) =>
      makeObject({
        id: `o-${index + 1}`,
        sort_order: index,
        params: { name: `Труба-${index + 1}` },
      })
    );
    (getElectricalPage as ReturnType<typeof vi.fn>)
      .mockResolvedValueOnce(
        makeElectricalPage(
          objects.slice(0, 50),
          [],
          { total_objects: 80, valid_objects: 80, invalid_objects: 0 },
          {
            total_pages: 2,
            has_next_page: true,
            next_cursor: { id: 'o-50', sort_order: 49 },
          },
        ),
      )
      .mockResolvedValueOnce(
        makeElectricalPage(
          objects.slice(50),
          [],
          { total_objects: 80, valid_objects: 80, invalid_objects: 0 },
          {
            page: 2,
            offset: 50,
            total_pages: 2,
            has_previous_page: true,
            has_next_page: false,
          },
        ),
      );
    localStorage.setItem(ELECTRICAL_TABLE_ENGINE_STORAGE_KEY, 'glide');
    useProjectStore.getState().setCurrentProject(mockProject);
    renderPage();

    await screen.findByTestId('electrical-glide-grid-mock');
    await waitFor(() => {
      expect(electricalGlideGridMock.props?.infiniteLoading).toMatchObject({
        loaded: 50,
        total: 80,
        hasNextPage: true,
      });
      expect(electricalGlideGridMock.props?.rows).toHaveLength(50);
    });

    fireEvent.click(screen.getByRole('button', { name: 'Догрузить строки' }));

    await waitFor(() => {
      expect(getElectricalPage).toHaveBeenCalledWith(expect.objectContaining({
        page: 2,
        page_size: 50,
        after_sort_order: 49,
        after_id: 'o-50',
      }));
    });
    await waitFor(() => {
      expect(electricalGlideGridMock.props?.infiniteLoading).toMatchObject({
        loaded: 80,
        total: 80,
        hasNextPage: false,
      });
      expect(electricalGlideGridMock.props?.rows).toHaveLength(80);
    });
  });

  it('ставит batch ТЛТ в очередь с electrical params, а не пустым набором', async () => {
    const { enqueueElectricalBatchJob, getElectricalPage } = await import('@/api/calculations');
    (getElectricalPage as ReturnType<typeof vi.fn>).mockResolvedValue(makeElectricalPage([makeObject()]));
    (enqueueElectricalBatchJob as ReturnType<typeof vi.fn>).mockResolvedValue({
      id: 'task-1',
      type: 'electrical_batch',
      status: 'enqueued',
      project_id: 'p-1',
      electrical_variant_id: '11111111-1111-4111-8111-111111111111',
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
    expect(apiMocks.enqueueVariantBatch).toHaveBeenCalledWith(
      'p-1',
      '11111111-1111-4111-8111-111111111111',
      'builtin',
      'self_regulating',
      expect.any(Object),
    );
    const options = (enqueueElectricalBatchJob as ReturnType<typeof vi.fn>).mock.calls[0][4];
    expect(options.objectOverrides).toBeUndefined();
  });

  it('копирует выбранный ЭР по UUID без запуска batch-пересчёта', async () => {
    const {
      enqueueElectricalBatchJob,
      getElectricalPage,
      listElectricalCandidateFolders,
      listElectricalCandidates,
      selectCableForVariants,
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
    const fifthVariant = {
      id: '55555555-5555-4555-8555-555555555555',
      project_id: 'p-1',
      name: 'Копия ЭР1',
      sort_order: 4,
      is_active: false,
      copied_from_id: '11111111-1111-4111-8111-111111111111',
      legacy_variant_number: null,
      specification_state: 'not_generated',
      created_at: '2026-07-18T10:00:00Z',
      updated_at: '2026-07-18T10:00:00Z',
    };
    const defaultList = electricalVariantApiMocks.list.getMockImplementation();
    const initialVariants = await defaultList!();
    let copyCreated = false;
    electricalVariantApiMocks.list.mockImplementation(async () =>
      copyCreated ? [...initialVariants, fifthVariant] : initialVariants);
    electricalVariantApiMocks.copy.mockImplementation(async () => {
      copyCreated = true;
      return fifthVariant;
    });
    useProjectStore.getState().setCurrentProject(mockProject);
    const user = (await import('@testing-library/user-event')).default.setup();
    renderPage();

    const copyButton = await screen.findByRole('button', {
      name: /Создать копию выбранного ЭР «ЭР1»/i,
    });
    const pageCallsBeforeCopy = (getElectricalPage as ReturnType<typeof vi.fn>).mock.calls.length;
    const capabilityCallsBeforeCopy = apiMocks.electricalCapabilities.mock.calls.length;
    const candidateCallsBeforeCopy = (listElectricalCandidates as ReturnType<typeof vi.fn>)
      .mock.calls.length;
    const folderCallsBeforeCopy = (listElectricalCandidateFolders as ReturnType<typeof vi.fn>)
      .mock.calls.length;

    await user.click(copyButton);

    await waitFor(() => {
      expect(electricalVariantApiMocks.copy).toHaveBeenCalledWith(
        'p-1',
        '11111111-1111-4111-8111-111111111111',
        {},
        expect.any(String),
      );
    });
    expect(await screen.findByText(/«Копия ЭР1»: расчётные действия временно недоступны/))
      .toBeInTheDocument();
    expect(screen.getByRole('tab', { name: 'Копия ЭР1' })).toHaveAttribute(
      'aria-selected',
      'true',
    );
    expect(document.querySelector('#electrical-variant-workspace')).toBeNull();
    expect((getElectricalPage as ReturnType<typeof vi.fn>).mock.calls).toHaveLength(
      pageCallsBeforeCopy,
    );
    expect(apiMocks.electricalCapabilities).toHaveBeenCalledTimes(capabilityCallsBeforeCopy);
    expect(listElectricalCandidates).toHaveBeenCalledTimes(candidateCallsBeforeCopy);
    expect(listElectricalCandidateFolders).toHaveBeenCalledTimes(folderCallsBeforeCopy);
    expect(selectCableForVariants).not.toHaveBeenCalled();
    expect(enqueueElectricalBatchJob).not.toHaveBeenCalled();
  });

  it('показывает lifecycle error и не повторяет copy с новой семантикой', async () => {
    const { getElectricalPage } = await import('@/api/calculations');
    (getElectricalPage as ReturnType<typeof vi.fn>).mockResolvedValue(makeElectricalPage([makeObject()]));
    electricalVariantApiMocks.copy.mockRejectedValueOnce(
      new Error('Копирование требует UUID cutover'),
    );
    useProjectStore.getState().setCurrentProject(mockProject);
    const user = (await import('@testing-library/user-event')).default.setup();
    renderPage();

    await user.click(await screen.findByRole('button', {
      name: /Создать копию выбранного ЭР «ЭР1»/i,
    }));

    expect(await screen.findByText('Копирование требует UUID cutover')).toBeInTheDocument();
    expect(electricalVariantApiMocks.copy).toHaveBeenCalledTimes(1);
  });

  it('при выключенных commercial features оставляет только саморегулирующийся ТЛТ', async () => {
    vi.stubEnv('VITE_COMMERCIAL_FEATURES_ENABLED', 'false');
    const { enqueueElectricalBatchJob, getElectricalPage } = await import('@/api/calculations');
    const { getCablesTt, getResistiveCables } = await import('@/api/references');
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
    expect(screen.queryByText('ТТН/ТТВ/ТТХ')).not.toBeInTheDocument();
    expect(getCablesTt).not.toHaveBeenCalled();
    expect(getResistiveCables).not.toHaveBeenCalled();

    await user.click(screen.getByRole('button', { name: /Пересчитать все · ЭР1/i }));
    await user.click(await screen.findByRole('button', { name: /Да, пересчитать все/i }));

    await waitFor(() => {
      expect(enqueueElectricalBatchJob).toHaveBeenCalledWith(
        'p-1',
        'builtin',
        1,
        'self_regulating',
        expect.objectContaining({
          forceCableType: true,
          objectOverrides: undefined,
          selectionMode: undefined,
          skipManual: true,
        }),
      );
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
    await user.click(screen.getByRole('button', { name: /Пересчитать все · ЭР1/i }));
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
      action: 'created',
      candidate: {
        id: 'cand-1',
        project_id: 'p-1',
        object_id: 'o-1',
        variant_number: 1,
        cable_type: 'three_core',
        cable_source: 'builtin',
        cable_mark: 'ТТ Р3 x 0,5-0,6',
        dedupe_key: 'v1:test',
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
      },
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
    // findAllByText: таблица кандидатов рендерится асинхронно — под нагрузкой
    // полного прогона getAllByText успевал отработать до её появления (flaky).
    expect((await within(sizingDialog).findAllByText('Пометка')).length).toBeGreaterThan(0);
    expect(within(sizingDialog).getAllByText('Действия').length).toBeGreaterThan(0);
    expect(within(sizingDialog).queryByRole('columnheader', { name: 'Статус' })).not.toBeInTheDocument();
    expect(within(sizingDialog).getAllByText('T3, °C').length).toBeGreaterThan(0);
    expect(within(sizingDialog).getAllByText('T проп., °C').length).toBeGreaterThan(0);
    expect(within(sizingDialog).getAllByText('Агр.').length).toBeGreaterThan(0);
    expect(within(sizingDialog).getAllByText('Мощность, Вт').length).toBeGreaterThan(0);
    expect(within(sizingDialog).getAllByText('Ток, А').length).toBeGreaterThan(0);
    expect(within(sizingDialog).getAllByText('U расч., В').length).toBeGreaterThan(0);
    await waitFor(() => {
      expect(listElectricalCandidates).toHaveBeenCalledWith(
        'p-1',
        'o-1',
        1,
        '11111111-1111-4111-8111-111111111111',
      );
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
        electrical_variant_id: '11111111-1111-4111-8111-111111111111',
        cable_type: 'three_core',
        mode: 'auto',
        cable_mark: null,
      }));
    });
    expect(within(sizingDialog).queryByRole('button', { name: 'Применить' })).not.toBeInTheDocument();
  });

  it('показывает «Вариант обновлён» при повторном идентичном авторасчёте', async () => {
    const {
      createElectricalCandidate,
      getElectricalPage,
      listElectricalCandidates,
    } = await import('@/api/calculations');
    const user = (await import('@testing-library/user-event')).default.setup();
    const candidate = {
      id: 'cand-1',
      project_id: 'p-1',
      object_id: 'o-1',
      variant_number: 1,
      cable_type: 'self_regulating',
      cable_source: 'builtin',
      cable_mark: 'ТЛТ-10',
      dedupe_key: 'v1:same',
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
    };
    (listElectricalCandidates as ReturnType<typeof vi.fn>).mockResolvedValue([candidate]);
    (createElectricalCandidate as ReturnType<typeof vi.fn>).mockResolvedValue({
      action: 'updated',
      candidate,
    });
    (getElectricalPage as ReturnType<typeof vi.fn>).mockResolvedValue(
      makeElectricalPage([makeObject({ params: { name: 'Труба-1' } })]),
    );
    useProjectStore.getState().setCurrentProject(mockProject);
    renderPage();

    const row = await screen.findByRole('row', { name: /Труба-1/ });
    await user.click(row);
    await user.click(within(row).getByRole('button', { name: 'Подбор' }));
    const sizingDialog = await screen.findByRole('dialog', { name: /Подбор кабеля для/ });
    await user.click(within(sizingDialog).getByRole('button', { name: 'Запустить авторасчёт' }));
    expect(await screen.findByText('Вариант обновлён')).toBeInTheDocument();
  });

  it('показывает две строки для одной марки с разным числом ниток', async () => {
    const { getElectricalPage, listElectricalCandidates } = await import('@/api/calculations');
    const user = (await import('@testing-library/user-event')).default.setup();
    const base = {
      project_id: 'p-1',
      object_id: 'o-1',
      variant_number: 1,
      cable_type: 'self_regulating',
      cable_source: 'builtin',
      cable_mark: 'ТЛТ-75',
      mode: 'manual',
      status: 'applicable',
      priority: 0,
      is_recommended: false,
      is_pinned: false,
      is_applied: false,
      reason_code: null,
      reason_message: null,
      engineer_comment: null,
      params: {},
      results: { num_circuits: 1 },
      cable_snapshot: null,
      warnings: [],
      risk_flags: [],
      candidate_meta: {},
      created_at: '2026-01-01T00:00:00Z',
      updated_at: '2026-01-01T00:00:00Z',
    };
    (listElectricalCandidates as ReturnType<typeof vi.fn>).mockResolvedValue([
      { ...base, id: 'cand-1', dedupe_key: 'v1:one', results: { num_circuits: 1 } },
      { ...base, id: 'cand-2', dedupe_key: 'v1:two', results: { num_circuits: 2 } },
    ]);
    (getElectricalPage as ReturnType<typeof vi.fn>).mockResolvedValue(
      makeElectricalPage([makeObject({ params: { name: 'Труба-1' } })]),
    );
    useProjectStore.getState().setCurrentProject(mockProject);
    renderPage();

    const row = await screen.findByRole('row', { name: /Труба-1/ });
    await user.click(row);
    await user.click(within(row).getByRole('button', { name: 'Подбор' }));
    const sizingDialog = await screen.findByRole('dialog', { name: /Подбор кабеля для/ });
    expect(within(sizingDialog).getAllByText('ТЛТ-75').length).toBe(2);
  });

  it('показывает TT-поля, которые различают визуально похожие варианты', async () => {
    const { getElectricalPage, listElectricalCandidates } = await import('@/api/calculations');
    const user = (await import('@testing-library/user-event')).default.setup();
    const base = {
      project_id: 'p-1',
      object_id: 'o-1',
      variant_number: 1,
      cable_type: 'self_regulating_tt',
      cable_source: 'builtin',
      cable_mark: '10ТТН2-СР',
      mode: 'manual',
      status: 'applicable',
      priority: 0,
      is_recommended: false,
      is_pinned: false,
      is_applied: false,
      reason_code: null,
      reason_message: null,
      engineer_comment: null,
      results: { num_circuits: 1, winding_pitch: 0, voltage: 220 },
      cable_snapshot: null,
      warnings: [],
      risk_flags: [],
      candidate_meta: {},
      created_at: '2026-01-01T00:00:00Z',
      updated_at: '2026-01-01T00:00:00Z',
    };
    (listElectricalCandidates as ReturnType<typeof vi.fn>).mockResolvedValue([
      {
        ...base,
        id: 'tt-fallback',
        dedupe_key: 'v1:tt-fallback',
        params: { process_temperature: 0.6, aggressive_product: false },
      },
      {
        ...base,
        id: 'tt-maintain',
        dedupe_key: 'v1:tt-maintain',
        params: { process_temperature: 0.6, maintain_temperature: -2, aggressive_product: false },
      },
      {
        ...base,
        id: 'tt-vapor-aggressive',
        dedupe_key: 'v1:tt-vapor-aggressive',
        params: {
          process_temperature: 0.6,
          maintain_temperature: -2,
          vapor_temperature: -4,
          aggressive_product: true,
        },
      },
    ]);
    (getElectricalPage as ReturnType<typeof vi.fn>).mockResolvedValue(
      makeElectricalPage([makeObject({ params: { name: 'Труба-1' } })]),
    );
    useProjectStore.getState().setCurrentProject(mockProject);
    renderPage();

    const row = await screen.findByRole('row', { name: /Труба-1/ });
    await user.click(row);
    await user.click(within(row).getByRole('button', { name: 'Подбор' }));
    const sizingDialog = await screen.findByRole('dialog', { name: /Подбор кабеля для/ });

    expect(within(sizingDialog).getAllByText('T3, °C').length).toBeGreaterThan(0);
    expect(within(sizingDialog).getAllByText('T проп., °C').length).toBeGreaterThan(0);
    expect(within(sizingDialog).getAllByText('Агр.').length).toBeGreaterThan(0);
    expect(within(sizingDialog).getByTestId('candidate-row-tt-fallback')).toHaveTextContent('0,6');
    expect(within(sizingDialog).getByTestId('candidate-row-tt-maintain')).toHaveTextContent('-2');
    expect(within(sizingDialog).getByTestId('candidate-row-tt-vapor-aggressive')).toHaveTextContent('-4');
    expect(within(sizingDialog).getByTestId('candidate-row-tt-vapor-aggressive')).toHaveTextContent('Да');
  });

  it('показывает выбранный кабель, пометки и компактные действия кандидатов', async () => {
    const {
      applyElectricalCandidate,
      getElectricalPage,
      listElectricalCandidates,
      updateElectricalCandidate,
    } = await import('@/api/calculations');
    const user = (await import('@testing-library/user-event')).default.setup();
    const baseCandidate = {
      project_id: 'p-1',
      object_id: 'o-1',
      variant_number: 1,
      cable_source: 'builtin',
      dedupe_key: 'v1:base',
      priority: 0,
      is_pinned: false,
      reason_code: null,
      reason_message: null,
      engineer_comment: null,
      params: {},
      cable_snapshot: null,
      warnings: [],
      risk_flags: [],
      candidate_meta: {},
      created_at: '2026-01-01T00:00:00Z',
      updated_at: '2026-01-01T00:00:00Z',
    };
    const makeCandidate = (candidate: Partial<ElectricalCandidate> & { id: string }): ElectricalCandidate => ({
      ...baseCandidate,
      dedupe_key: `v1:${candidate.id}`,
      ...candidate,
    } as ElectricalCandidate);
    let candidates: ElectricalCandidate[] = [
      makeCandidate({
        id: 'cand-applied',
        cable_type: 'self_regulating',
        cable_mark: 'ТЛТ-10',
        mode: 'manual',
        status: 'applicable',
        is_recommended: true,
        is_applied: true,
        results: {
          total_power: 1000,
          order_cable_length: 55,
          current: 4.55,
        },
      }),
      makeCandidate({
        id: 'cand-next',
        cable_type: 'self_regulating',
        cable_mark: 'ТЛТ-20',
        mode: 'auto',
        status: 'applicable',
        is_recommended: false,
        is_applied: false,
        results: {
          total_power: 1200,
          order_cable_length: 60,
          current: 5.45,
        },
      }),
      makeCandidate({
        id: 'cand-duplicate',
        cable_type: 'self_regulating',
        cable_mark: 'ТЛТ-20',
        mode: 'manual',
        status: 'applicable',
        is_recommended: false,
        is_applied: false,
        results: {
          total_power: 1300,
          order_cable_length: 62,
          current: 5.91,
        },
      }),
      makeCandidate({
        id: 'cand-error',
        cable_type: 'self_regulating',
        cable_mark: 'ТЛТ-5',
        mode: 'manual',
        status: 'error',
        reason_message: 'Кабель не обеспечивает требуемую мощность',
        is_recommended: false,
        is_applied: false,
        results: null,
      }),
    ];
    (listElectricalCandidates as ReturnType<typeof vi.fn>).mockImplementation(async () => candidates);
    (applyElectricalCandidate as ReturnType<typeof vi.fn>).mockImplementation(async (candidateId: string) => ({
      candidate: (() => {
        const selected = candidates.find((candidate) => candidate.id === candidateId)!;
        candidates = candidates.map((candidate) => ({
          ...candidate,
          is_applied: candidate.id === candidateId,
        }));
        return { ...selected, is_applied: true };
      })(),
      calculation: (() => {
        const selected = candidates.find((candidate) => candidate.id === candidateId)!;
        return {
          id: 'c-1',
          object_id: 'o-1',
          cable_type: selected.cable_type,
          cable_mark: selected.cable_mark,
          cable_mark_source: 'manual',
          variant_number: 1,
          results: {
            selected_cable: selected.cable_mark,
          },
        };
      })(),
    }));
    (updateElectricalCandidate as ReturnType<typeof vi.fn>).mockImplementation(
      async (candidateId: string, patch: Record<string, unknown>) => {
        candidates = candidates.map((candidate) => (
          candidate.id === candidateId
            ? { ...candidate, ...patch }
            : candidate
        ));
        return candidates.find((candidate) => candidate.id === candidateId);
      },
    );
    (getElectricalPage as ReturnType<typeof vi.fn>).mockResolvedValue(
      makeElectricalPage([makeObject({ params: { name: 'Труба-1' } })], [
        {
          id: 'c-1',
          object_id: 'o-1',
          cable_type: 'self_regulating',
          cable_mark: 'ТЛТ-10',
          cable_mark_source: 'manual',
          variant_number: 1,
          results: {
            selected_cable: 'ТЛТ-10',
            total_power: 1000,
            order_cable_length: 55,
            current: 4.55,
          },
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
    await user.click(within(row).getByRole('button', { name: 'Подбор' }));
    const sizingDialog = await screen.findByRole('dialog', { name: /Подбор кабеля для/ });

    expect(within(sizingDialog).getByText('Выбранный кабель:')).toBeInTheDocument();
    expect(within(sizingDialog).getAllByText('ТЛТ-10').length).toBeGreaterThan(0);
    expect(within(sizingDialog).getAllByText('Ручной').length).toBeGreaterThan(0);
    expect(within(sizingDialog).queryByText('Статус кабеля')).not.toBeInTheDocument();
    expect(within(sizingDialog).queryByText('снимок')).not.toBeInTheDocument();
    expect(within(sizingDialog).queryByRole('columnheader', { name: 'Статус' })).not.toBeInTheDocument();
    expect(within(sizingDialog).queryByText('Готов')).not.toBeInTheDocument();
    expect(within(sizingDialog).queryByLabelText('Готов')).not.toBeInTheDocument();
    expect((await within(sizingDialog).findAllByText('Пометка')).length).toBeGreaterThan(0);
    expect(within(sizingDialog).getByRole('button', { name: /Все/ })).toBeInTheDocument();
    expect(within(sizingDialog).getByRole('button', { name: /Избранное/ })).toBeInTheDocument();
    expect(within(sizingDialog).getByTestId('candidate-row-cand-applied')).not.toHaveClass(
      'electrical-cable-sizing-table__row--error',
    );
    expect(within(sizingDialog).getByTestId('candidate-row-cand-next')).not.toHaveClass(
      'electrical-cable-sizing-table__row--error',
    );
    expect(within(sizingDialog).getByTestId('candidate-row-cand-error')).toHaveClass(
      'electrical-cable-sizing-table__row--error',
    );

    const markerCheckbox = within(sizingDialog).getByTestId('candidate-mark-cand-next');
    expect(markerCheckbox).toBeEnabled();
    expect(markerCheckbox).not.toBeChecked();
    await user.click(markerCheckbox);
    expect(markerCheckbox).toBeChecked();
    expect(applyElectricalCandidate).not.toHaveBeenCalled();
    expect(within(sizingDialog).getAllByText('ТЛТ-10').length).toBeGreaterThan(0);
    await user.click(within(sizingDialog).getByTestId('candidate-mark-cand-applied'));
    expect(within(sizingDialog).getByTestId('candidate-compare-bar')).toHaveTextContent('Сравнение: 2 вариантов');
    expect(within(sizingDialog).getByTestId('candidate-compare-bar')).toHaveTextContent(
      'Отличий в видимых колонках:',
    );
    expect(within(sizingDialog).getByTestId('candidate-row-cand-applied')).toHaveClass(
      'electrical-cable-sizing-table__row--compared',
    );
    expect(within(sizingDialog).getByTestId('candidate-diff-cand-applied-cable_mark')).toHaveClass(
      'electrical-candidate-cell--diff',
    );
    expect(within(sizingDialog).getByTestId('candidate-diff-cand-next-cable_mark')).toHaveClass(
      'electrical-candidate-cell--diff',
    );
    await user.click(within(sizingDialog).getByRole('button', { name: 'Сбросить сравнение' }));
    expect(within(sizingDialog).queryByTestId('candidate-compare-bar')).not.toBeInTheDocument();
    expect(within(sizingDialog).queryByTestId('candidate-diff-cand-applied-cable_mark')).not.toBeInTheDocument();
    expect(within(sizingDialog).getByTestId('candidate-apply-cand-applied')).toBeEnabled();
    expect(within(sizingDialog).getByTestId('candidate-apply-cand-applied')).toHaveAttribute('aria-pressed', 'true');
    expect(within(sizingDialog).getByTestId('candidate-apply-cand-applied')).toHaveAccessibleName(
      'Уже выбран кандидат ТЛТ-10',
    );
    expect(within(sizingDialog).getByTestId('candidate-apply-cand-next')).toBeEnabled();
    expect(within(sizingDialog).getByTestId('candidate-apply-cand-next')).toHaveAttribute('aria-pressed', 'false');
    expect(within(sizingDialog).getByTestId('candidate-apply-cand-duplicate')).toBeEnabled();
    expect(within(sizingDialog).getByTestId('candidate-apply-cand-duplicate')).toHaveAttribute('aria-pressed', 'false');

    await user.click(within(sizingDialog).getByTestId('candidate-apply-cand-duplicate'));
    expect(applyElectricalCandidate).toHaveBeenCalledWith('cand-duplicate');
    await waitFor(() => {
      expect(candidates.filter((candidate) => candidate.is_applied).map((candidate) => candidate.id)).toEqual([
        'cand-duplicate',
      ]);
    });
    await waitFor(() => {
      expect(within(sizingDialog).getByTestId('candidate-apply-cand-duplicate')).toHaveAttribute('aria-pressed', 'true');
    });
    expect(within(sizingDialog).getByTestId('candidate-apply-cand-applied')).toBeEnabled();
    expect(within(sizingDialog).getByTestId('candidate-apply-cand-applied')).toHaveAttribute('aria-pressed', 'false');
    expect(within(sizingDialog).getByTestId('candidate-apply-cand-next')).toBeEnabled();
    expect(within(sizingDialog).getByTestId('candidate-apply-cand-next')).toHaveAttribute('aria-pressed', 'false');

    expect(within(sizingDialog).queryByTestId('candidate-favorite-cand-next')).not.toBeInTheDocument();
    await user.click(within(sizingDialog).getByTestId('candidate-folder-cand-next'));
    await user.click(await screen.findByRole('menuitem', { name: 'Избранное' }));
    expect(updateElectricalCandidate).toHaveBeenCalledWith(
      'cand-next',
      expect.objectContaining({ is_pinned: true }),
    );
    expect(candidates.filter((candidate) => candidate.is_applied).map((candidate) => candidate.id)).toEqual([
      'cand-duplicate',
    ]);
    await waitFor(() => {
      expect(within(sizingDialog).getByText('избр.')).toBeInTheDocument();
    });

    await user.click(within(sizingDialog).getByRole('button', { name: /Избранное/ }));
    await waitFor(() => {
      expect(within(sizingDialog).getByTestId('candidate-row-cand-next')).toBeInTheDocument();
    });
    expect(within(sizingDialog).queryByTestId('candidate-row-cand-applied')).not.toBeInTheDocument();
    await user.click(within(sizingDialog).getByRole('button', { name: /Все/ }));

    await user.click(within(sizingDialog).getByTestId('candidate-exclude-cand-next'));
    expect(updateElectricalCandidate).toHaveBeenCalledWith(
      'cand-next',
      expect.objectContaining({ status: 'excluded' }),
    );
    expect(applyElectricalCandidate).toHaveBeenCalledTimes(1);
  });

  it('создаёт пользовательскую папку и фильтрует варианты по связям папки', async () => {
    const {
      addElectricalCandidateToFolder,
      createElectricalCandidateFolder,
      getElectricalPage,
      listElectricalCandidateFolders,
      listElectricalCandidates,
    } = await import('@/api/calculations');
    const user = (await import('@testing-library/user-event')).default.setup();
    const candidates: ElectricalCandidate[] = [
      {
        id: 'cand-1',
        project_id: 'p-1',
        object_id: 'o-1',
        variant_number: 1,
        cable_type: 'self_regulating',
        cable_source: 'builtin',
        cable_mark: 'ТЛТ-10',
        dedupe_key: 'v1:cand-1',
        mode: 'manual',
        status: 'applicable',
        priority: 0,
        is_recommended: false,
        is_pinned: false,
        is_applied: false,
        reason_code: null,
        reason_message: null,
        engineer_comment: null,
        params: {},
        results: { num_circuits: 1 },
        cable_snapshot: null,
        warnings: [],
        risk_flags: [],
        candidate_meta: {},
        created_at: '2026-01-01T00:00:00Z',
        updated_at: '2026-01-01T00:00:00Z',
      },
      {
        id: 'cand-2',
        project_id: 'p-1',
        object_id: 'o-1',
        variant_number: 1,
        cable_type: 'self_regulating',
        cable_source: 'builtin',
        cable_mark: 'ТЛТ-20',
        dedupe_key: 'v1:cand-2',
        mode: 'manual',
        status: 'applicable',
        priority: 0,
        is_recommended: false,
        is_pinned: false,
        is_applied: false,
        reason_code: null,
        reason_message: null,
        engineer_comment: null,
        params: {},
        results: { num_circuits: 1 },
        cable_snapshot: null,
        warnings: [],
        risk_flags: [],
        candidate_meta: {},
        created_at: '2026-01-01T00:00:00Z',
        updated_at: '2026-01-01T00:00:00Z',
      },
    ];
    let folders = [] as Array<{
      id: string;
      project_id: string;
      object_id: string;
      variant_number: number;
      name: string;
      color: string | null;
      sort_order: number;
      candidate_ids: string[];
      created_at: string;
      updated_at: string;
    }>;
    (listElectricalCandidates as ReturnType<typeof vi.fn>).mockResolvedValue(candidates);
    (listElectricalCandidateFolders as ReturnType<typeof vi.fn>).mockImplementation(async () => folders);
    (createElectricalCandidateFolder as ReturnType<typeof vi.fn>).mockImplementation(async (payload) => {
      const folder = {
        id: 'folder-1',
        project_id: payload.project_id,
        object_id: payload.object_id,
        variant_number: payload.variant_number,
        name: payload.name,
        color: null,
        sort_order: 10,
        candidate_ids: [],
        created_at: '2026-01-01T00:00:00Z',
        updated_at: '2026-01-01T00:00:00Z',
      };
      folders = [folder];
      return folder;
    });
    (addElectricalCandidateToFolder as ReturnType<typeof vi.fn>).mockImplementation(
      async (folderId: string, candidateId: string) => {
        folders = folders.map((folder) => folder.id === folderId
          ? { ...folder, candidate_ids: [...new Set([...folder.candidate_ids, candidateId])] }
          : folder);
        return folders.find((folder) => folder.id === folderId);
      },
    );
    (getElectricalPage as ReturnType<typeof vi.fn>).mockResolvedValue(
      makeElectricalPage([makeObject({ params: { name: 'Труба-1' } })]),
    );
    useProjectStore.getState().setCurrentProject(mockProject);
    renderPage();

    const row = await screen.findByRole('row', { name: /Труба-1/ });
    await user.click(row);
    await user.click(within(row).getByRole('button', { name: 'Подбор' }));
    const sizingDialog = await screen.findByRole('dialog', { name: /Подбор кабеля для/ });

    await user.click(within(sizingDialog).getByRole('button', { name: /Папка/ }));
    const folderNameInput = await screen.findByLabelText('Название папки вариантов');
    const folderDialog = folderNameInput.closest('[role="dialog"]') as HTMLElement | null;
    expect(folderDialog).not.toBeNull();
    if (!folderDialog) throw new Error('Folder modal did not open');
    await user.type(folderNameInput, 'Согласовать');
    await user.click(within(folderDialog).getByRole('button', { name: 'Создать' }));
    await waitFor(() => {
      expect(createElectricalCandidateFolder).toHaveBeenCalledWith(expect.objectContaining({
        name: 'Согласовать',
        object_id: 'o-1',
        variant_number: 1,
        electrical_variant_id: '11111111-1111-4111-8111-111111111111',
      }));
    });

    await user.click(within(sizingDialog).getByRole('button', { name: /Все/ }));
    await user.click(within(sizingDialog).getByTestId('candidate-folder-cand-1'));
    await user.click(await screen.findByRole('menuitem', { name: 'Согласовать' }));
    await waitFor(() => {
      expect(addElectricalCandidateToFolder).toHaveBeenCalledWith('folder-1', 'cand-1');
    });

    await user.click(within(sizingDialog).getByRole('button', { name: /^Согласовать\s+1$/ }));
    await waitFor(() => {
      expect(within(sizingDialog).getByTestId('candidate-row-cand-1')).toBeInTheDocument();
    });
    expect(within(sizingDialog).queryByTestId('candidate-row-cand-2')).not.toBeInTheDocument();
  });

  it('позволяет настроить таблицу кандидатов отдельно от основной таблицы', async () => {
    const { getElectricalPage, listElectricalCandidates } = await import('@/api/calculations');
    const user = (await import('@testing-library/user-event')).default.setup();
    (listElectricalCandidates as ReturnType<typeof vi.fn>).mockResolvedValue([
      {
        id: 'cand-1',
        project_id: 'p-1',
        object_id: 'o-1',
        variant_number: 1,
        cable_type: 'self_regulating',
        cable_source: 'builtin',
        cable_mark: 'ТЛТ-10',
        dedupe_key: 'v1:cand-1',
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
        results: {
          total_power: 1000,
          order_cable_length: 55,
          current: 4.55,
          voltage: 220,
        },
        cable_snapshot: null,
        warnings: [],
        risk_flags: [],
        candidate_meta: {},
        created_at: '2026-01-01T00:00:00Z',
        updated_at: '2026-01-01T00:00:00Z',
      },
    ]);
    (getElectricalPage as ReturnType<typeof vi.fn>).mockResolvedValue(
      makeElectricalPage([makeObject({ params: { name: 'Труба-1' } })], [
        {
          id: 'c-1',
          object_id: 'o-1',
          cable_type: 'self_regulating',
          cable_mark: 'ТЛТ-10',
          variant_number: 1,
          results: {
            selected_cable: 'ТЛТ-10',
            current: 4.55,
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
    const row = await screen.findByRole('row', { name: /Труба-1/ });
    await user.click(row);
    await user.click(within(row).getByRole('button', { name: 'Подбор' }));
    const sizingDialog = await screen.findByRole('dialog', { name: /Подбор кабеля для/ });

    expect(within(sizingDialog).getAllByText('Ток, А').length).toBeGreaterThan(0);
    await user.click(within(sizingDialog).getByRole('button', { name: 'Настройки таблицы' }));
    const settingsTitle = await screen.findByText('Настройки таблицы подбора кабеля');
    const settingsDialog = settingsTitle.closest('.ant-modal-content');
    expect(settingsDialog).toBeInstanceOf(HTMLElement);
    const settingsScope = within(settingsDialog as HTMLElement);
    expect(settingsScope.queryByText('Шаг')).not.toBeInTheDocument();
    expect(settingsScope.getByRole('checkbox', { name: /Показать Действия/i }))
      .toBeDisabled();
    expect(settingsScope.getByRole('checkbox', { name: /Показать Марка кабеля/i }))
      .toBeDisabled();

    await user.click(settingsScope.getByRole('checkbox', { name: /Показать Расчётный ток/i }));
    await user.click(settingsScope.getByRole('button', { name: 'Сохранить' }));

    await waitFor(() => {
      expect(within(sizingDialog).queryByText('Ток, А')).not.toBeInTheDocument();
    });
    expect(document.querySelector('.electrical-spreadsheet')?.textContent).toContain('Ток, А');

    const stored = JSON.parse(
      localStorage.getItem(ELECTRICAL_GUEST_CANDIDATE_TABLE_COLUMN_STORAGE_KEY) ?? '{}',
    );
    expect(stored.visibleOrder).not.toContain('current');
    expect(localStorage.getItem(ELECTRICAL_GUEST_TABLE_COLUMN_STORAGE_KEY)).toBeNull();
  });

  it('фильтрует, сортирует и меняет ширину колонок таблицы кандидатов', async () => {
    const { getElectricalPage, listElectricalCandidates } = await import('@/api/calculations');
    const user = (await import('@testing-library/user-event')).default.setup();
    const baseCandidate = {
      project_id: 'p-1',
      object_id: 'o-1',
      variant_number: 1,
      cable_source: 'builtin',
      priority: 0,
      is_pinned: false,
      is_applied: false,
      reason_code: null,
      reason_message: null,
      engineer_comment: null,
      params: {},
      cable_snapshot: null,
      warnings: [],
      risk_flags: [],
      candidate_meta: {},
      created_at: '2026-01-01T00:00:00Z',
      updated_at: '2026-01-01T00:00:00Z',
    };
    const makeCandidate = (candidate: Partial<ElectricalCandidate> & { id: string }): ElectricalCandidate => ({
      ...baseCandidate,
      dedupe_key: `v1:${candidate.id}`,
      mode: 'auto',
      status: 'applicable',
      is_recommended: false,
      ...candidate,
    } as ElectricalCandidate);
    (listElectricalCandidates as ReturnType<typeof vi.fn>).mockResolvedValue([
      makeCandidate({
        id: 'cand-mid',
        cable_type: 'single_core',
        cable_mark: 'СНТО-10/220',
        results: { current: 3.5, order_cable_length: 11.4 },
      }),
      makeCandidate({
        id: 'cand-low',
        cable_type: 'self_regulating',
        cable_mark: 'ТЛТ-10',
        results: { current: 1.2, order_cable_length: 13.2 },
      }),
      makeCandidate({
        id: 'cand-high',
        cable_type: 'three_core',
        cable_mark: 'КМСО-1,0-15',
        is_applied: true,
        results: { current: 8.4, order_cable_length: 9.5 },
      }),
    ]);
    (getElectricalPage as ReturnType<typeof vi.fn>).mockResolvedValue(
      makeElectricalPage([makeObject({ params: { name: 'Труба-1' } })]),
    );
    localStorage.setItem(ELECTRICAL_GUEST_CANDIDATE_TABLE_COLUMN_STORAGE_KEY, JSON.stringify({
      version: 1,
      visibleOrder: ['marked', 'actions', 'mode', 'cable_mark', 'current', 'order_cable_length'],
      columns: {
        cable_mark: { widthPct: 19 },
        current: { widthPct: 10 },
      },
    }));
    useProjectStore.getState().setCurrentProject(mockProject);
    renderPage();

    const row = await screen.findByRole('row', { name: /Труба-1/ });
    await user.click(row);
    await user.click(within(row).getByRole('button', { name: 'Подбор' }));
    const sizingDialog = await screen.findByRole('dialog', { name: /Подбор кабеля для/ });
    const rowIds = () =>
      Array.from(sizingDialog.querySelectorAll('tr[data-testid^="candidate-row-"]'))
        .map((candidateRow) => candidateRow.getAttribute('data-testid'));

    expect(rowIds()).toEqual([
      'candidate-row-cand-high',
      'candidate-row-cand-mid',
      'candidate-row-cand-low',
    ]);

    await user.click(within(sizingDialog).getByRole('columnheader', { name: /Ток, А/ }));
    await waitFor(() => {
      expect(rowIds()).toEqual([
        'candidate-row-cand-high',
        'candidate-row-cand-low',
        'candidate-row-cand-mid',
      ]);
    });

    await user.click(within(sizingDialog).getByRole('button', { name: 'Фильтр Марка кабеля' }));
    await user.type(await screen.findByLabelText('Поиск: Марка кабеля'), 'КМСО');
    await user.click(screen.getByRole('button', { name: 'Применить' }));

    await waitFor(() => {
      expect(rowIds()).toEqual(['candidate-row-cand-high']);
    });
    expect(within(sizingDialog).getByRole('button', { name: 'Сбросить фильтры таблицы кандидатов' }))
      .toBeEnabled();

    await user.click(within(sizingDialog).getByRole('button', { name: 'Сбросить фильтры таблицы кандидатов' }));
    await waitFor(() => {
      expect(rowIds()).toEqual([
        'candidate-row-cand-high',
        'candidate-row-cand-mid',
        'candidate-row-cand-low',
      ]);
    });

    const resizeHandle = within(sizingDialog).getByRole('button', {
      name: 'Изменить ширину: Марка кабеля',
    });
    await act(async () => {
      fireEvent(resizeHandle, new MouseEvent('pointerdown', { clientX: 100, bubbles: true }));
      window.dispatchEvent(new MouseEvent('pointermove', { clientX: 150, bubbles: true }));
      window.dispatchEvent(new MouseEvent('pointerup', { clientX: 150, bubbles: true }));
    });

    await waitFor(() => {
      const stored = JSON.parse(
        localStorage.getItem(ELECTRICAL_GUEST_CANDIDATE_TABLE_COLUMN_STORAGE_KEY) ?? '{}',
      );
      expect(stored.columns.cable_mark.widthPct).toBeGreaterThan(19);
    });
    expect(localStorage.getItem(ELECTRICAL_GUEST_TABLE_COLUMN_STORAGE_KEY)).toBeNull();
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
    await user.click(screen.getByRole('button', { name: /Пересчитать все · ЭР1/i }));
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
    await user.click(screen.getByRole('button', { name: /Пересчитать все · ЭР1/i }));
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
            power_per_meter: 30,
            installed_power_per_meter: 30,
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
      expect(document.querySelector('.electrical-spreadsheet')?.textContent).toContain('P каб., Вт/м');
      expect(document.querySelector('.electrical-spreadsheet')?.textContent).toContain('30,00');
    });

    await user.click(screen.getByRole('button', { name: 'Настройки' }));
    expect(
      await screen.findByRole('checkbox', { name: /Показать Удельная мощность выбранного кабеля, Вт\/м/i }),
    ).toBeInTheDocument();
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
      fontSize: 'compact',
      tableLabelFormat: 'full',
      settingsLabelFormat: 'full',
      calculationCableSource: 'builtin',
    });
    expect(stored).not.toHaveProperty('cablePickerObjectFields');
    expect(stored).not.toHaveProperty('cablePickerCableFields');
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

  it('делает шаг навива и количество ниток редактируемыми в Glide-таблице SC-04', async () => {
    const { getElectricalPage, selectCableForVariants } = await import('@/api/calculations');
    localStorage.setItem(ELECTRICAL_TABLE_ENGINE_STORAGE_KEY, 'glide');
    (getElectricalPage as ReturnType<typeof vi.fn>).mockReset();
    (selectCableForVariants as ReturnType<typeof vi.fn>).mockReset();
    const object = makeObject({
      id: 'o-1',
      params: { name: 'Труба-1', outer_diameter: 0.108 },
    });
    const calc: ElectricalCalcSummary = {
      id: 'c-1',
      object_id: 'o-1',
      cable_type: 'self_regulating',
      cable_mark: 'ТЛТ-30',
      cable_mark_source: 'auto',
      variant_number: 1,
      params: {},
      results: {
        selected_cable: 'ТЛТ-30',
        winding_pitch: 0,
        num_circuits: 1,
        number_of_threads_source: 'auto',
        installed_cable_length: 10,
        order_cable_length: 11,
        total_power: 600,
        current: 2.7,
        voltage: 220,
      },
    };
    (getElectricalPage as ReturnType<typeof vi.fn>).mockResolvedValue(makeElectricalPage([object], [calc]));
    (selectCableForVariants as ReturnType<typeof vi.fn>).mockResolvedValue([
      {
        ...calc,
        results: { ...calc.results, winding_pitch: 400, num_circuits: 2, number_of_threads_source: 'manual' },
      },
    ]);
    useProjectStore.getState().setCurrentProject(mockProject);
    renderPage();

    await waitFor(() => {
      expect(electricalGlideGridMock.props?.getCellState).toBeTypeOf('function');
    });
    const getCellState = (record: ProjectObject, columnKey: string, rowIndex: number) => {
      const fn = electricalGlideGridMock.props!.getCellState as (
        item: ProjectObject,
        key: string,
        index: number,
      ) => { editable: boolean; editor?: string; displayValue: string };
      return fn(record, columnKey, rowIndex);
    };

    await waitFor(() => {
      expect(getCellState(object, 'winding_pitch_mm', 0)).toMatchObject({
        editable: true,
        editor: 'number',
        displayValue: '0',
      });
      expect(getCellState(object, 'number_of_threads', 0)).toMatchObject({
        editable: true,
        editor: 'number',
        displayValue: '1',
      });
    });
    const onCommitCell = electricalGlideGridMock.props!.onCommitCell as (
      record: ProjectObject,
      columnKey: string,
      value: unknown,
    ) => string | null;

    expect(onCommitCell(object, 'winding_pitch_mm', '100')).toBe(
      'Шаг навива должен быть больше наружного диаметра трубы',
    );
    expect(selectCableForVariants).not.toHaveBeenCalled();

    expect(onCommitCell(object, 'winding_pitch_mm', '200')).toBe(
      'Коэффициент навива 1.969 превышает максимум 1.4 для D=108 мм',
    );
    expect(selectCableForVariants).not.toHaveBeenCalled();

    expect(onCommitCell(object, 'winding_pitch_mm', '400')).toBeNull();
    await waitFor(() => {
      expect(selectCableForVariants).toHaveBeenLastCalledWith(
        'o-1',
        null,
        'builtin',
        [1],
        'self_regulating',
        expect.objectContaining({
          windingPitchMm: 400,
          numberOfThreads: null,
        }),
        { 1: '11111111-1111-4111-8111-111111111111' },
      );
    });
    (selectCableForVariants as ReturnType<typeof vi.fn>).mockClear();
    expect(onCommitCell(object, 'number_of_threads', '2')).toBeNull();
    await waitFor(() => {
      expect(selectCableForVariants).toHaveBeenLastCalledWith(
        'o-1',
        null,
        'builtin',
        [1],
        'self_regulating',
        expect.objectContaining({
          numberOfThreads: 2,
        }),
        { 1: '11111111-1111-4111-8111-111111111111' },
      );
    });
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

    await user.click(await screen.findByRole('tab', { name: 'ЭР2' }));
    const row = await screen.findByRole('row', { name: /Труба-1/ });
    fireEvent.click(row);
    await user.click(within(row).getByRole('button', { name: 'Выбор' }));
    const dialog = await screen.findByRole('dialog', { name: /Выбор марки кабеля/ });

    expect(within(dialog).getByRole('checkbox', { name: 'ЭР1' })).not.toBeChecked();
    expect(within(dialog).getByRole('checkbox', { name: 'ЭР2' })).toBeChecked();
    await user.click(within(dialog).getByRole('checkbox', { name: 'ЭР4' }));
    await user.click(within(dialog).getByRole('button', { name: 'Применить' }));

    await waitFor(() => {
      expect(selectCableForVariants).toHaveBeenCalledTimes(1);
    });
    expect((selectCableForVariants as ReturnType<typeof vi.fn>).mock.calls[0][3])
      .toEqual([2, 4]);
    expect((selectCableForVariants as ReturnType<typeof vi.fn>).mock.calls[0][6])
      .toEqual({
        2: '22222222-2222-4222-8222-222222222222',
        4: '44444444-4444-4444-8444-444444444444',
      });
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

    const employeeProject = { ...mockProject, user_id: 'u-1', session_id: null };
    useProjectStore.getState().setCurrentProject(employeeProject);
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
    useProjectStore.getState().setCurrentProject(employeeProject);
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
    await user.click(screen.getByRole('button', { name: /Пересчитать все · ЭР1/i }));
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
