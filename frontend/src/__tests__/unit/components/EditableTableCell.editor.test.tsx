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

describe('EditableTableCell — active numeric editor', () => {
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

    const input = screen.getByLabelText('Редактирование числа');

    expect(input).toHaveValue('108');
    expect(screen.queryByText('мм')).not.toBeInTheDocument();
    expect(container.querySelector('.ant-input-number-group-addon')).not.toBeInTheDocument();
    expect(container.querySelector('.ant-input-number-handler-wrap')).not.toBeInTheDocument();
    expect(container.querySelector('.tlt-number-field__unit')).not.toBeInTheDocument();
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
    const editor = container.querySelector<HTMLElement>('.editable-cell-editor.tlt-number-field');

    expect(wrap).not.toBeNull();
    expect(editor).not.toBeNull();
    expect(getComputedStyle(wrap!).minWidth).toMatch(/^0(px)?$/);
    expect(getComputedStyle(wrap!).maxWidth).toBe('100%');
    expect(getComputedStyle(editor!).minWidth).toMatch(/^0(px)?$/);
    expect(getComputedStyle(editor!).maxWidth).toBe('100%');
  });

});
