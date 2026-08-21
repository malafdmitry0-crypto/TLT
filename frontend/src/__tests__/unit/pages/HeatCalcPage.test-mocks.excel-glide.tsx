/** HeatCalcGlideGrid (excel mode) mock for page tests. */
import { vi } from 'vitest';
import type { ProjectObject } from '@/types/project';
import type { MockExcelGlideGridProps, MockGridColumn } from './HeatCalcPage.test-mocks.types';

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
