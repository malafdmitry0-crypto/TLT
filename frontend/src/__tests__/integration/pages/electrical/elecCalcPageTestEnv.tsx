// @ts-nocheck — integration split files share a wide import surface (AF9-TEST-SPLIT-01)
/**
 * AF9-TEST-SPLIT-01 — shared vi.mock environment for Electrical integration.
 */
import { vi } from 'vitest';
import React from 'react';

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
  listAssignments: vi.fn().mockImplementation(async (
    projectId: string,
    electricalVariantId: string,
  ) => ({
    project_id: projectId,
    electrical_variant_id: electricalVariantId,
    items: [],
    counts: {
      total: 0,
      filtered: 0,
      by_system: {
        unassigned: 0,
        self_regulating: 0,
        resistive: 0,
        skin: 0,
        mineral: 0,
      },
      by_state: { unassigned: 0, ready: 0, unsupported: 0, stale: 0, error: 0 },
    },
    page_info: {
      page: 1,
      page_size: 50,
      offset: 0,
      total_pages: 0,
      has_next_page: false,
      has_previous_page: false,
    },
  })),
  assignObjects: vi.fn(),
  unassignObjects: vi.fn(),
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
  electricalAssignmentQueryKeys: {
    root: (projectId: string, variantId: string) => [
      'project',
      projectId,
      'electrical-variant',
      variantId,
      'assignments',
    ] as const,
    list: (
      projectId: string,
      variantId: string,
      params: { view?: string; assignment_state?: string; page?: number; page_size?: number },
    ) => [
      'project',
      projectId,
      'electrical-variant',
      variantId,
      'assignments',
      params.view ?? 'all',
      params.assignment_state ?? 'all-states',
      params.page ?? 1,
      params.page_size ?? 50,
    ] as const,
  },
  listElectricalVariants: electricalVariantApiMocks.list,
  getElectricalVariantReadiness: electricalVariantApiMocks.readiness,
  initializeElectricalVariants: electricalVariantApiMocks.initialize,
  createEmptyElectricalVariant: electricalVariantApiMocks.create,
  createIdempotencyKey: vi.fn(() => 'test-idempotency-key'),
  copyElectricalVariant: electricalVariantApiMocks.copy,
  renameElectricalVariant: electricalVariantApiMocks.rename,
  activateElectricalVariant: electricalVariantApiMocks.activate,
  deleteElectricalVariant: electricalVariantApiMocks.remove,
  listElectricalVariantAssignments: electricalVariantApiMocks.listAssignments,
  assignElectricalVariantObjects: electricalVariantApiMocks.assignObjects,
  unassignElectricalVariantObjects: electricalVariantApiMocks.unassignObjects,
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

const electricalAssignmentPanelMock = vi.hoisted(() => ({
  initialSystemView: 'self_regulating' as string | null,
  props: null as null | {
    projectId: string;
    electricalVariant: { id: string; name: string; legacy_variant_number: number | null };
    canMutate: boolean;
    systemView?: string;
    onSystemViewChange?: (view: string) => void;
    selectedObjectIds?: string[];
    onAssignmentsChanged?: () => void;
  },
}));

vi.mock('@/pages/electrical/ElectricalAssignmentPanel', async () => {
  const React = await vi.importActual<typeof import('react')>('react');
  function MockElectricalAssignmentPanel(
    props: NonNullable<typeof electricalAssignmentPanelMock.props>,
  ) {
    electricalAssignmentPanelMock.props = props;
    const { onSystemViewChange, systemView } = props;
    React.useEffect(() => {
      const initialSystemView = electricalAssignmentPanelMock.initialSystemView;
      if (initialSystemView && systemView !== initialSystemView) {
        onSystemViewChange?.(initialSystemView);
      }
    }, [onSystemViewChange, systemView]);
    return React.createElement(
      'div',
      { 'data-testid': 'electrical-assignment-panel' },
      `Система обогрева · ${props.electricalVariant.name}`,
    );
  }

  return {
    default: MockElectricalAssignmentPanel,
  };
});

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


export {
  apiMocks,
  electricalVariantApiMocks,
  defaultElectricalVariantListImplementation,
  electricalGlideGridMock,
  electricalAssignmentPanelMock,
};
