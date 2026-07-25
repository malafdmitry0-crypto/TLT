/* eslint-disable @typescript-eslint/no-unused-vars -- scenario split keeps shared preamble */
import { createEvent, fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import EditableTableCell, {
  areEditableTableCellPropsEqual,
  type EditableTableCellProps,
} from '@/components/heatcalc/EditableTableCell';
import type { HeatCalcFieldDefinition } from '@/domain/heatCalcFields';
import { resolvedBackgroundColor } from '@/__tests__/utils/resolvedBackgroundColor';
import '@/styles.css';
import '@/styles/calc-spreadsheet.css';

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

describe('EditableTableCell — cell chrome / dirty / error / excel flat', () => {
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
    // jsdom does not resolve var(--token) on background; cascade is resolved via stylesheets + tokens
    expect(resolvedBackgroundColor(display!)).toBe('rgb(243, 244, 246)');

    rerender(renderCell(false, true));
    const rowDirtyDisplay = container.querySelector<HTMLElement>('.editable-cell-display');
    // .row-dirty > … .editable-cell-display → transparent (row tint lives on <td>)
    expect(resolvedBackgroundColor(rowDirtyDisplay!)).toBe('transparent');

    rerender(renderCell(true, true));
    const dirtyDisplay = container.querySelector<HTMLElement>('.editable-cell-display');
    expect(resolvedBackgroundColor(dirtyDisplay!)).toBe('rgb(255, 241, 184)');
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
    expect(resolvedBackgroundColor(display)).toBe('rgb(255, 241, 240)');
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

});
