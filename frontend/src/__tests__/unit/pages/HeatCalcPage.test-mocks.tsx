/** Vitest module mocks for HeatCalc page tests (side-effect import only). */
import { vi } from 'vitest';
import React, { type ReactNode } from 'react';
import type { ProjectObject, ProjectObjectsQueryRequest } from '@/types/project';

type MockGridColumn = {
  key: string;
  title: string;
  label?: string;
  filterKind?: 'text' | 'numberRange' | 'enum';
  sortable?: boolean;
  filterable?: boolean;
};

type MockCellState = {
  displayValue: string;
  editable?: boolean;
  editor?: 'text' | 'number' | 'select';
  dirty?: boolean;
  error?: string | null;
  options?: unknown[];
  step?: number;
};

type MockTableViewState = {
  sort?: { columnKey: string; direction: 'asc' | 'desc' };
};

type MockNormalPagination = {
  current?: number;
  pageSize?: number;
  total?: number;
  hideOnSinglePage?: boolean;
};

type MockNormalGlideGridProps = {
  rows: ProjectObject[];
  gridColumns: MockGridColumn[];
  fontSizeKey: string;
  emptyContent: ReactNode;
  getCellState: (row: ProjectObject, columnKey: string, rowIndex: number) => MockCellState;
  onOpenEditWizard: (row: ProjectObject) => void;
  onStartCellEdit: (row: ProjectObject, columnKey: string) => void;
  onCommitCell: (row: ProjectObject, columnKey: string, value: string) => string | null;
  selectedRowKeys: string[];
  onSelectedRowKeysChange: (keys: string[]) => void;
  onSetSort: (columnKey: string, direction?: 'asc' | 'desc') => void;
  tableViewState: MockTableViewState;
  rowClassName: (row: ProjectObject) => string;
  onSetColumnFilter: (columnKey: string, filter: unknown) => void;
  pagination?: MockNormalPagination | false;
  onPageChange?: (page: number) => void;
};

type MockExcelGlideGridProps = {
  rows: ProjectObject[];
  gridColumns: MockGridColumn[];
  fontSizeKey: string;
  getCellState: (row: ProjectObject, columnKey: string, rowIndex: number) => MockCellState;
  onSetRangeSelection: (
    anchor: { rowId: string; columnKey: string },
    focus: { rowId: string; columnKey: string },
    active: { rowIndex: number; columnIndex: number },
  ) => void;
  onStartCellEdit: (row: ProjectObject, columnKey: string) => void;
  onCommitCell: (row: ProjectObject, columnKey: string, value: string) => string | null;
  rowClassName: (row: ProjectObject) => string;
};

// ── Моки API ─────────────────────────────────────────────────────────────────

vi.mock('@/api/projects', () => {
  const listObjects = vi.fn().mockResolvedValue([]);
  async function getObjectsSummary(projectId: string) {
    const all = await listObjects(projectId);
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
  const queryObjects = vi.fn(async (projectId: string, payload: ProjectObjectsQueryRequest) => {
    const all = await listObjects(projectId);
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
    const hasNextPage = page * pageSize < items.length;
    const lastItem = pageItems[pageItems.length - 1];
    return {
      items: pageItems,
      page_info: {
        page,
        page_size: pageSize,
        offset,
        total_pages: items.length ? Math.ceil(items.length / pageSize) : 0,
        has_next_page: hasNextPage,
        has_previous_page: page > 1,
        next_cursor: hasNextPage && lastItem
          ? {
            sort_order: lastItem.sort_order,
            id: lastItem.id,
            key: 'sort_order',
            value: lastItem.sort_order,
            value_is_null: false,
          }
          : null,
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
  };
});

vi.mock('@/api/calculations', () => ({
  cancelCalcTask: vi.fn(),
  enqueueElectricalBatchJob: vi.fn().mockResolvedValue({ id: 'task-1', status: 'queued' }),
  enqueueHeatLossBatchJob: vi.fn().mockResolvedValue({
    id: 'heat-task-1',
    type: 'heat_loss_batch',
    status: 'queued',
    project_id: 'proj-test-1',
    progress: { current: 0, total: null, phase: 'queued', percent: null },
    result: null,
    error_message: null,
    cancel_requested: false,
    created_at: '2026-01-01T00:00:00Z',
    started_at: null,
    finished_at: null,
    links: {
      status: '/api/v1/calc/jobs/heat-task-1',
      result: '/api/v1/calc/jobs/heat-task-1/result',
      cancel: '/api/v1/calc/jobs/heat-task-1/cancel',
    },
  }),
  getCalcTask: vi.fn().mockResolvedValue({
    id: 'heat-task-1',
    type: 'heat_loss_batch',
    status: 'running',
    project_id: 'proj-test-1',
    progress: { current: 1, total: 2, phase: 'calculate', percent: 50 },
    result: null,
    error_message: null,
    cancel_requested: false,
    created_at: '2026-01-01T00:00:00Z',
    started_at: null,
    finished_at: null,
    links: {
      status: '/api/v1/calc/jobs/heat-task-1',
      result: '/api/v1/calc/jobs/heat-task-1/result',
      cancel: '/api/v1/calc/jobs/heat-task-1/cancel',
    },
  }),
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

vi.mock('@/components/heatcalc/HeatCalcNormalGlideGrid', async () => {
  const React = await import('react');

  function nextSortDirection(tableViewState: { sort?: { columnKey: string; direction: 'asc' | 'desc' } }, columnKey: string) {
    if (tableViewState.sort?.columnKey !== columnKey) return 'asc';
    if (tableViewState.sort.direction === 'asc') return 'desc';
    return undefined;
  }

  function filterFromValue(column: MockGridColumn, value: string) {
    if (column.filterKind === 'numberRange') {
      const min = Number(value);
      return { kind: 'numberRange', min: Number.isFinite(min) ? min : undefined };
    }
    return { kind: 'text', value };
  }

  function MockColumnFilter({
    column,
    onApply,
  }: {
    column: MockGridColumn;
    onApply: (filter: unknown) => void;
  }) {
    const [value, setValue] = React.useState('');
    const label = column.label ?? column.title;
    const inputLabel = column.filterKind === 'numberRange' ? `Минимум: ${label}` : `Поиск: ${label}`;
    return React.createElement(
      'div',
      { className: 'heatcalc-normal-glide-filter-popup' },
      React.createElement('label', {}, inputLabel),
      React.createElement('input', {
        'aria-label': inputLabel,
        value,
        onChange: (event: React.ChangeEvent<HTMLInputElement>) => setValue(event.target.value),
      }),
      React.createElement(
        'button',
        { type: 'button', onClick: () => onApply(filterFromValue(column, value)) },
        'Применить',
      ),
    );
  }

  function MockHeatCalcNormalGlideGrid(props: MockNormalGlideGridProps) {
    const [filterColumn, setFilterColumn] = React.useState<MockGridColumn | null>(null);
    const [editingCell, setEditingCell] = React.useState<{
      row: ProjectObject;
      column: MockGridColumn;
      value: string;
      error?: string | null;
    } | null>(null);
    const columns = props.gridColumns.filter((column) => column.key !== 'index');

    if (!props.rows.length) {
      return React.createElement(
        'div',
        {
          className: `calc-spreadsheet calc-spreadsheet--${props.fontSizeKey} calc-spreadsheet--glide calc-spreadsheet--normal-glide`,
          'data-testid': 'normal-glide-grid',
        },
        React.createElement('div', { className: 'excel-virtual-empty' }, props.emptyContent),
      );
    }

    function stateFor(row: ProjectObject, column: MockGridColumn, rowIndex: number) {
      return props.getCellState(row, column.key, rowIndex);
    }

    function startEdit(row: ProjectObject, column: MockGridColumn, rowIndex: number) {
      const state = stateFor(row, column, rowIndex);
      if (!state.editable) {
        props.onOpenEditWizard(row);
        return;
      }
      props.onStartCellEdit(row, column.key);
      const value = state.editor === 'number'
        ? Number(state.displayValue).toFixed(1)
        : state.displayValue;
      setEditingCell({ row, column, value, error: state.error ?? null });
    }

    function commitEdit(nextValue?: string) {
      if (!editingCell) return;
      const value = nextValue ?? editingCell.value;
      const error = props.onCommitCell(editingCell.row, editingCell.column.key, value);
      if (error) {
        setEditingCell({ ...editingCell, value, error });
        return;
      }
      setEditingCell(null);
    }

    function toggleRow(row: ProjectObject, checked: boolean) {
      const current = new Set(props.selectedRowKeys);
      if (checked) current.add(row.id);
      else current.delete(row.id);
      props.onSelectedRowKeysChange(Array.from(current));
    }

    const pagination = props.pagination && typeof props.pagination === 'object'
      ? props.pagination
      : null;
    const currentPage = Number(pagination?.current ?? 1);
    const pageSize = Number(pagination?.pageSize ?? 50);
    const total = Number(pagination?.total ?? props.rows.length);
    const totalPages = pageSize > 0 ? Math.max(1, Math.ceil(total / pageSize)) : 1;
    const hideOnSinglePage = pagination?.hideOnSinglePage !== false;
    const showPagination = Boolean(pagination && props.onPageChange)
      && (!hideOnSinglePage || totalPages > 1);

    return React.createElement(
      'div',
      {
        className: `calc-spreadsheet calc-spreadsheet--${props.fontSizeKey} calc-spreadsheet--glide calc-spreadsheet--normal-glide`,
        'data-testid': 'normal-glide-grid',
      },
      React.createElement(
        'table',
        { 'aria-label': 'Glide таблица объектов' },
        React.createElement(
          'thead',
          {},
          React.createElement(
            'tr',
            {},
            React.createElement('th', {}, ''),
            columns.map((column) => React.createElement(
              'th',
              {
                key: column.key,
                role: 'columnheader',
                onClick: () => {
                  if (!column.sortable) return;
                  props.onSetSort(column.key, nextSortDirection(props.tableViewState, column.key));
                },
              },
              React.createElement('span', {}, column.title),
              column.filterable
                ? React.createElement(
                  'button',
                  {
                    type: 'button',
                    'aria-label': `Фильтр ${column.label ?? column.title}`,
                    onClick: (event: React.MouseEvent<HTMLButtonElement>) => {
                      event.stopPropagation();
                      setFilterColumn(column);
                    },
                  },
                  '',
                )
                : null,
            )),
          ),
        ),
        React.createElement(
          'tbody',
          {},
          props.rows.map((row, rowIndex) => {
            const rowClassName = props.rowClassName(row);
            return React.createElement(
              'tr',
              {
                key: row.id,
                className: rowClassName,
                'data-row-key': row.id,
                'data-testid': 'normal-glide-row',
                onClick: () => props.onOpenEditWizard(row),
              },
              React.createElement(
                'td',
                {},
                React.createElement('input', {
                  type: 'checkbox',
                  'aria-label': `Выбрать ${String(row.params?.name ?? row.id)}`,
                  checked: props.selectedRowKeys.includes(row.id),
                  onClick: (event: React.MouseEvent<HTMLInputElement>) => event.stopPropagation(),
                  onChange: (event: React.ChangeEvent<HTMLInputElement>) => toggleRow(row, event.target.checked),
                }),
              ),
              columns.map((column) => {
                const state = stateFor(row, column, rowIndex);
                const isEditing = editingCell?.row.id === row.id && editingCell.column.key === column.key;
                const tdClassName = [
                  state.editable ? 'editable-cell-host editable-cell-enabled' : null,
                  state.dirty ? 'dirty' : null,
                  state.error ? 'error' : null,
                ].filter(Boolean).join(' ');
                return React.createElement(
                  'td',
                  { key: column.key, className: tdClassName },
                  isEditing
                    ? React.createElement('input', {
                      className: ['editable-cell-editor', editingCell.error ? 'error' : null].filter(Boolean).join(' '),
                      title: editingCell.error ?? undefined,
                      value: editingCell.value,
                      onClick: (event: React.MouseEvent<HTMLInputElement>) => event.stopPropagation(),
                      onChange: (event: React.ChangeEvent<HTMLInputElement>) =>
                        setEditingCell({ ...editingCell, value: event.target.value, error: null }),
                      onKeyDown: (event: React.KeyboardEvent<HTMLInputElement>) => {
                        if (event.key !== 'Enter') return;
                        event.preventDefault();
                        event.stopPropagation();
                        commitEdit(event.currentTarget.value);
                      },
                    })
                    : state.editable
                      ? React.createElement(
                        'button',
                        {
                          type: 'button',
                          className: [
                            'editable-cell-display',
                            state.dirty ? 'dirty' : null,
                            state.error ? 'error' : null,
                          ].filter(Boolean).join(' '),
                          title: state.error ?? undefined,
                          onClick: (event: React.MouseEvent<HTMLButtonElement>) => {
                            event.stopPropagation();
                            startEdit(row, column, rowIndex);
                          },
                        },
                        state.displayValue,
                      )
                      : state.displayValue,
                );
              }),
            );
          }),
        ),
      ),
      showPagination
        ? React.createElement(
          'div',
          {
            'data-testid': 'normal-glide-pagination',
            'aria-label': `Страница ${currentPage} из ${totalPages}`,
          },
          React.createElement(
            'button',
            {
              type: 'button',
              'aria-label': 'Следующая страница',
              disabled: currentPage >= totalPages,
              onClick: () => props.onPageChange?.(currentPage + 1),
            },
            'Следующая страница',
          ),
          React.createElement(
            'span',
            { 'data-testid': 'normal-glide-current-page' },
            String(currentPage),
          ),
        )
        : null,
      filterColumn
        ? React.createElement(MockColumnFilter, {
          column: filterColumn,
          onApply: (filter: unknown) => {
            props.onSetColumnFilter(filterColumn.key, filter);
            setFilterColumn(null);
          },
        })
        : null,
    );
  }

  return { default: MockHeatCalcNormalGlideGrid };
});

vi.mock('@/components/heatcalc/HeatCalcGlideGrid', async () => {
  const React = await import('react');

  function MockHeatCalcGlideGrid(props: MockExcelGlideGridProps) {
    const [editingCell, setEditingCell] = React.useState<{
      row: ProjectObject;
      column: MockGridColumn;
      value: string;
      error?: string | null;
    } | null>(null);
    const [selectedCell, setSelectedCell] = React.useState<{
      rowId: string;
      columnKey: string;
    } | null>(null);
    const columns = props.gridColumns.filter((column) => column.key !== 'index');

    function stateFor(row: ProjectObject, column: MockGridColumn, rowIndex: number) {
      return props.getCellState(row, column.key, rowIndex);
    }

    function selectCell(row: ProjectObject, column: MockGridColumn, rowIndex: number, columnIndex: number) {
      const position = { rowId: row.id, columnKey: column.key };
      setSelectedCell(position);
      props.onSetRangeSelection(position, position, { rowIndex, columnIndex });
    }

    function startEdit(row: ProjectObject, column: MockGridColumn, rowIndex: number, columnIndex: number) {
      const state = stateFor(row, column, rowIndex);
      selectCell(row, column, rowIndex, columnIndex);
      if (!state.editable) return;
      props.onStartCellEdit(row, column.key);
      const value = state.editor === 'number'
        ? Number(state.displayValue).toFixed(1)
        : state.displayValue;
      setEditingCell({ row, column, value, error: state.error ?? null });
    }

    function commitEdit(nextValue?: string) {
      if (!editingCell) return;
      const value = nextValue ?? editingCell.value;
      const error = props.onCommitCell(editingCell.row, editingCell.column.key, value);
      if (error) {
        setEditingCell({ ...editingCell, value, error });
        return;
      }
      setEditingCell(null);
    }

    return React.createElement(
      'div',
      {
        className: `calc-spreadsheet calc-spreadsheet--${props.fontSizeKey} calc-spreadsheet--excel-mode calc-spreadsheet--glide`,
        'data-testid': 'excel-glide-grid',
      },
      React.createElement(
        'table',
        { 'aria-label': 'Glide Excel таблица объектов' },
        React.createElement(
          'thead',
          {},
          React.createElement('tr', {}, columns.map((column) =>
            React.createElement('th', { key: column.key, role: 'columnheader' }, column.title))),
        ),
        React.createElement(
          'tbody',
          {},
          props.rows.map((row, rowIndex) => React.createElement(
            'tr',
            {
              key: row.id,
              className: props.rowClassName(row),
              'data-row-key': row.id,
              'data-testid': 'excel-glide-row',
            },
            columns.map((column, columnIndex) => {
              const state = stateFor(row, column, rowIndex);
              const isEditing = editingCell?.row.id === row.id && editingCell.column.key === column.key;
              const isSelected = selectedCell?.rowId === row.id && selectedCell.columnKey === column.key;
              return React.createElement(
                'td',
                {
                  key: column.key,
                  'data-excel-selected': isSelected ? 'true' : undefined,
                },
                isEditing
                  ? React.createElement('input', {
                    className: ['editable-cell-editor', editingCell.error ? 'error' : null].filter(Boolean).join(' '),
                    title: editingCell.error ?? undefined,
                    value: editingCell.value,
                    onChange: (event: React.ChangeEvent<HTMLInputElement>) =>
                      setEditingCell({ ...editingCell, value: event.target.value, error: null }),
                    onKeyDown: (event: React.KeyboardEvent<HTMLInputElement>) => {
                      if (event.key !== 'Enter') return;
                      event.preventDefault();
                      commitEdit(event.currentTarget.value);
                    },
                  })
                  : state.editable
                    ? React.createElement(
                      'button',
                      {
                        type: 'button',
                        className: [
                          'editable-cell-display',
                          state.dirty ? 'dirty' : null,
                          state.error ? 'error' : null,
                          isSelected ? 'excel-cell-selected' : null,
                        ].filter(Boolean).join(' '),
                        title: state.error ?? undefined,
                        'aria-selected': isSelected || undefined,
                        onClick: () => selectCell(row, column, rowIndex, columnIndex),
                        onDoubleClick: () => startEdit(row, column, rowIndex, columnIndex),
                      },
                      state.displayValue,
                    )
                    : state.displayValue,
              );
            }),
          )),
        ),
      ),
    );
  }

  return { default: MockHeatCalcGlideGrid };
});

// ── Вспомогательные функции ───────────────────────────────────────────────────

