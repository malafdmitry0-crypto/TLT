/**
 * Electrical integration — Glide / Assignment panel component mocks.
 * Side-effect import only from elecCalcPageTestEnv barrel. 0 tests.
 */
import { vi } from 'vitest';
import type { ReactNode } from 'react';
import type { ElectricalCandidate } from '@/types/calculation';

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

export {
  electricalGlideGridMock,
  electricalAssignmentPanelMock,
};
