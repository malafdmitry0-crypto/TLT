import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import EditableTableCell, {
  areEditableTableCellPropsEqual,
  type EditableTableCellProps,
} from '@/components/heatcalc/EditableTableCell';
import type { HeatCalcFieldDefinition } from '@/domain/heatCalcFields';
import '@/styles.css';

const numericField: HeatCalcFieldDefinition = {
  id: 'outer_diameter_mm',
  objectTypes: ['pipe'],
  tableColumnKeys: { pipe: 'pipe_outer_diameter' },
  label: 'Наружный диаметр',
  editor: 'number',
  unit: 'мм',
  min: 10.8,
  max: 3000,
  step: 1,
  required: true,
  inputUnit: 'mm',
};

describe('EditableTableCell', () => {
  it('marks enabled inactive editable cells in grey and lets dirty state win', () => {
    const renderCell = (dirty = false, rowDirty = false) => (
      <div className="calc-spreadsheet">
        <table>
          <tbody>
            <tr className={rowDirty ? 'row-dirty' : undefined}>
              <td className="editable-cell-host editable-cell-enabled">
                <EditableTableCell
                  active={false}
                  dirty={dirty}
                  field={numericField}
                  value={108}
                  onStartEdit={vi.fn()}
                  onCommit={() => null}
                  onCancel={vi.fn()}
                >
                  108
                </EditableTableCell>
              </td>
            </tr>
          </tbody>
        </table>
      </div>
    );

    const { container, rerender } = render(renderCell());
    const display = container.querySelector<HTMLElement>('.editable-cell-display');

    expect(display).not.toBeNull();
    expect(getComputedStyle(display!).backgroundColor).toBe('rgb(243, 244, 246)');

    rerender(renderCell(false, true));
    const rowDirtyDisplay = container.querySelector<HTMLElement>('.editable-cell-display');
    expect(getComputedStyle(rowDirtyDisplay!).backgroundColor).toBe('rgba(0, 0, 0, 0)');

    rerender(renderCell(true, true));
    const dirtyDisplay = container.querySelector<HTMLElement>('.editable-cell-display');
    expect(getComputedStyle(dirtyDisplay!).backgroundColor).toBe('rgb(255, 241, 184)');
  });

  it('renders inactive invalid cells in red and lets error state win over dirty', () => {
    const { container } = render(
      <div className="calc-spreadsheet">
        <table>
          <tbody>
            <tr className="row-dirty">
              <td className="editable-cell-host editable-cell-enabled">
                <EditableTableCell
                  active={false}
                  dirty
                  error="Минимальное значение — 10.8"
                  field={numericField}
                  value={5}
                  onStartEdit={vi.fn()}
                  onCommit={() => null}
                  onCancel={vi.fn()}
                >
                  5
                </EditableTableCell>
              </td>
            </tr>
          </tbody>
        </table>
      </div>,
    );

    const display = screen.getByRole('button', { name: '5' });

    expect(display).toHaveClass('dirty');
    expect(display).toHaveClass('error');
    expect(display).toHaveAttribute('aria-invalid', 'true');
    expect(display).toHaveAttribute('title', 'Минимальное значение — 10.8');
    expect(getComputedStyle(display).backgroundColor).toBe('rgb(255, 241, 240)');
    expect(container.querySelector('.editable-cell-display.error')).toBe(display);
  });

  it('renders inactive Excel-mode cells as flat grid cells without input-like chrome', () => {
    render(
      <div className="calc-spreadsheet calc-spreadsheet--excel-mode">
        <table>
          <tbody>
            <tr>
              <td className="editable-cell-host editable-cell-enabled">
                <EditableTableCell
                  active={false}
                  excelMode
                  field={numericField}
                  value={108}
                  onStartEdit={vi.fn()}
                  onCommit={() => null}
                  onCancel={vi.fn()}
                >
                  108
                </EditableTableCell>
              </td>
            </tr>
          </tbody>
        </table>
      </div>,
    );

    const display = screen.getByRole('button', { name: '108' });
    expect(getComputedStyle(display).boxShadow).toBe('none');
    expect(getComputedStyle(display).backgroundColor).toBe('rgba(0, 0, 0, 0)');
  });

  it('renders Excel range selection without per-cell shadow chrome', () => {
    render(
      <div className="calc-spreadsheet calc-spreadsheet--excel-mode">
        <table>
          <tbody>
            <tr>
              <td className="editable-cell-host editable-cell-enabled">
                <EditableTableCell
                  active={false}
                  excelMode
                  selected
                  selectionActive
                  field={numericField}
                  value={108}
                  onStartEdit={vi.fn()}
                  onCommit={() => null}
                  onCancel={vi.fn()}
                >
                  108
                </EditableTableCell>
              </td>
            </tr>
          </tbody>
        </table>
      </div>,
    );

    const display = screen.getByRole('button', { name: '108' });
    const style = getComputedStyle(display);
    expect(display).toHaveClass('selected');
    expect(display).toHaveClass('active-selection');
    expect(style.boxShadow).toBe('none');
    expect(style.userSelect).toBe('none');
  });

  it('shows active editor error state and message', () => {
    const { container } = render(
      <EditableTableCell
        active
        error="Минимальное значение — 10.8"
        field={numericField}
        value={5}
        onStartEdit={vi.fn()}
        onCommit={() => 'Минимальное значение — 10.8'}
        onCancel={vi.fn()}
      >
        5
      </EditableTableCell>,
    );

    expect(screen.getByText('Минимальное значение — 10.8')).toBeInTheDocument();
    expect(container.querySelector('.editable-cell-editor.error')).toBeInTheDocument();
  });

  it('renders numeric table editor without visible units or increment controls', () => {
    const { container } = render(
      <EditableTableCell
        active
        field={numericField}
        value={108}
        onStartEdit={vi.fn()}
        onCommit={() => null}
        onCancel={vi.fn()}
      >
        108
      </EditableTableCell>,
    );

    const input = screen.getByRole('spinbutton');
    fireEvent.keyDown(input, { key: 'ArrowUp' });

    expect(input).toHaveValue('108');
    expect(screen.queryByText('мм')).not.toBeInTheDocument();
    expect(container.querySelector('.ant-input-number-group-addon')).not.toBeInTheDocument();
    expect(container.querySelector('.ant-input-number-handler-wrap')).not.toBeInTheDocument();
  });

  it('constrains active numeric editor to the table cell width', () => {
    const { container } = render(
      <div className="calc-spreadsheet" style={{ width: 48 }}>
        <EditableTableCell
          active
          field={numericField}
          value={50}
          onStartEdit={vi.fn()}
          onCommit={() => null}
          onCancel={vi.fn()}
        >
          50
        </EditableTableCell>
      </div>,
    );

    const wrap = container.querySelector<HTMLElement>('.editable-cell-editor-wrap');
    const editor = container.querySelector<HTMLElement>('.editable-cell-editor.ant-input-number');

    expect(wrap).not.toBeNull();
    expect(editor).not.toBeNull();
    expect(getComputedStyle(wrap!).minWidth).toMatch(/^0(px)?$/);
    expect(getComputedStyle(wrap!).maxWidth).toBe('100%');
    expect(getComputedStyle(editor!).minWidth).toMatch(/^0(px)?$/);
    expect(getComputedStyle(editor!).maxWidth).toBe('100%');
  });

  it('skips rerender when only event callbacks change for the same Excel cell', () => {
    const baseProps: EditableTableCellProps = {
      rowId: 'row-1',
      columnKey: 'pipe_length',
      rowIndex: 10,
      columnIndex: 3,
      active: false,
      selected: false,
      selectionActive: false,
      excelMode: true,
      dirty: false,
      field: numericField,
      value: 25,
      children: '25',
      onStartEdit: vi.fn(),
      onCommit: vi.fn(() => null),
      onCancel: vi.fn(),
    };

    expect(areEditableTableCellPropsEqual(baseProps, {
      ...baseProps,
      onStartEdit: vi.fn(),
      onCommit: vi.fn(() => null),
      onCancel: vi.fn(),
    })).toBe(true);

    expect(areEditableTableCellPropsEqual(baseProps, {
      ...baseProps,
      value: 26,
      children: '26',
    })).toBe(false);
  });
});
