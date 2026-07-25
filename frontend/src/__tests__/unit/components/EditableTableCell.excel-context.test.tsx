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

describe('EditableTableCell — rerender / context menu', () => {
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

  it('forwards excel secondary-pointer open as HeatCalcContextMenuTrigger without cast path', () => {
    const onContextMenu = vi.fn();
    render(
      <EditableTableCell
        active={false}
        excelMode
        field={numericField}
        value={108}
        onContextMenu={onContextMenu}
        onStartEdit={vi.fn()}
        onCommit={() => null}
        onCancel={vi.fn()}
      >
        108
      </EditableTableCell>,
    );

    const display = screen.getByRole('button', { name: '108' });
    const focusSpy = vi.spyOn(display, 'focus');
    // jsdom pointer events omit button/coords; define the HeatCalcContextMenuTrigger surface.
    const pointerDown = createEvent.pointerDown(display);
    Object.defineProperties(pointerDown, {
      button: { configurable: true, value: 2 },
      clientX: { configurable: true, value: 42 },
      clientY: { configurable: true, value: 84 },
    });
    fireEvent(display, pointerDown);

    expect(focusSpy).toHaveBeenCalledWith({ preventScroll: true });
    expect(pointerDown.defaultPrevented).toBe(true);
    expect(onContextMenu).toHaveBeenCalledTimes(1);
    const trigger = onContextMenu.mock.calls[0]?.[0];
    expect(trigger).toMatchObject({ clientX: 42, clientY: 84 });
    expect(typeof trigger.preventDefault).toBe('function');
    expect(typeof trigger.stopPropagation).toBe('function');
  });

  it('does not open context menu outside excel mode', () => {
    const onContextMenu = vi.fn();
    render(
      <EditableTableCell
        active={false}
        field={numericField}
        value={108}
        onContextMenu={onContextMenu}
        onStartEdit={vi.fn()}
        onCommit={() => null}
        onCancel={vi.fn()}
      >
        108
      </EditableTableCell>,
    );

    const display = screen.getByRole('button', { name: '108' });
    const pointerDown = createEvent.pointerDown(display, {
      clientX: 10,
      clientY: 20,
    });
    Object.defineProperty(pointerDown, 'button', { configurable: true, value: 2 });
    fireEvent(display, pointerDown);
    fireEvent.contextMenu(display, { clientX: 10, clientY: 20 });

    expect(onContextMenu).not.toHaveBeenCalled();
  });

});
