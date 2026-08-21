/** HeatCalcNormalGlideGrid mock for page tests. */
import { vi } from 'vitest';
import type { ProjectObject } from '@/types/project';
import type { MockGridColumn, MockNormalGlideGridProps } from './HeatCalcPage.test-mocks.types';

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
