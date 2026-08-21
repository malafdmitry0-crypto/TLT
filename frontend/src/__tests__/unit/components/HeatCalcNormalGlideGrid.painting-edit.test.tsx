import React, { act } from 'react';
import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

const normalGlideMock = vi.hoisted(() => ({
  props: null as Record<string, unknown> | null,
  updateCells: vi.fn(),
}));

vi.mock('@glideapps/glide-data-grid', () => {
  class MockCompactSelection {
    private readonly values: number[];

    private constructor(values: number[]) {
      this.values = values;
    }

    static empty() {
      return new MockCompactSelection([]);
    }

    add(value: number) {
      return new MockCompactSelection([...this.values, value]);
    }

    toArray() {
      return this.values;
    }
  }

  return {
    CompactSelection: MockCompactSelection,
    DataEditor: React.forwardRef((props: Record<string, unknown>, ref) => {
      React.useImperativeHandle(ref, () => ({
        getBounds: () => ({ x: 10, y: 20, width: 180, height: 30 }),
        updateCells: normalGlideMock.updateCells,
      }));
      normalGlideMock.props = props;
      return React.createElement('div', { 'data-testid': 'normal-glide-data-editor' });
    }),
    GridCellKind: {
      Number: 'number',
      Text: 'text',
    },
  };
});

vi.mock('@/components/heatcalc/HeatCalcColumnFilterDropdown', () => ({
  default: (props: {
    title: string;
    onApply: (filter?: { kind: 'text'; value: string }) => void;
    onClose: () => void;
  }) => React.createElement(
    'button',
    {
      type: 'button',
      'data-testid': 'normal-glide-filter-apply',
      onClick: () => {
        props.onApply({ kind: 'text', value: 'Pipe' });
        props.onClose();
      },
    },
    props.title,
  ),
}));

import HeatCalcNormalGlideGrid from '@/components/heatcalc/HeatCalcNormalGlideGrid';
import { rows } from './HeatCalcNormalGlideGrid.test-harness';


describe('HeatCalcNormalGlideGrid painting-edit', () => {

  it('paints the active form row separately from checkbox row selection', () => {
    render(
      <HeatCalcNormalGlideGrid
        rows={rows}
        gridColumns={[{ key: 'name', title: 'Name', width: 180 }]}
        tableScrollX={640}
        tableScrollY="360px"
        fontSizeKey="compact"
        activeRowId="row-2"
        selectedRowKeys={['row-1']}
        tableViewState={{ filters: {} }}
        infiniteLoading={null}
        pagination={false}
        emptyContent={null}
        rowClassName={(record) => (record.id === 'row-1' ? 'row-invalid' : '')}
        getCellState={(record) => ({
          displayValue: String(record.params?.name ?? ''),
          editable: false,
        })}
        onOpenEditWizard={vi.fn()}
        onSelectedRowKeysChange={vi.fn()}
        onStartCellEdit={vi.fn()}
        onCommitCell={vi.fn(() => null)}
        onSetColumnFilter={vi.fn()}
        onResetColumnFilter={vi.fn()}
        onSetSort={vi.fn()}
        onPageChange={vi.fn()}
        onLoadMore={vi.fn()}
      />,
    );

    const getRowThemeOverride = normalGlideMock.props?.getRowThemeOverride as (rowIndex: number) => unknown;
    expect(getRowThemeOverride(0)).toMatchObject({ bgCell: '#fff1f0' });
    expect(getRowThemeOverride(1)).toMatchObject({
      bgCell: '#d6e9f5',
      accentColor: '#1a5276',
    });
    expect(normalGlideMock.props?.gridSelection).toMatchObject({
      rows: expect.objectContaining({ toArray: expect.any(Function) }),
    });
    expect((normalGlideMock.props?.gridSelection as { rows: { toArray: () => number[] } }).rows.toArray()).toEqual([0]);
  });

  it('keeps an active error row red and only adds the active accent', () => {
    render(
      <HeatCalcNormalGlideGrid
        rows={rows}
        gridColumns={[{ key: 'name', title: 'Name', width: 180 }]}
        tableScrollX={640}
        tableScrollY="360px"
        fontSizeKey="compact"
        activeRowId="row-2"
        selectedRowKeys={[]}
        tableViewState={{ filters: {} }}
        infiniteLoading={null}
        pagination={false}
        emptyContent={null}
        rowClassName={(record) => (record.id === 'row-2' ? 'row-invalid row-selected' : '')}
        getCellState={(record) => ({
          displayValue: String(record.params?.name ?? ''),
          editable: false,
        })}
        onOpenEditWizard={vi.fn()}
        onSelectedRowKeysChange={vi.fn()}
        onStartCellEdit={vi.fn()}
        onCommitCell={vi.fn(() => null)}
        onSetColumnFilter={vi.fn()}
        onResetColumnFilter={vi.fn()}
        onSetSort={vi.fn()}
        onPageChange={vi.fn()}
        onLoadMore={vi.fn()}
      />,
    );

    const getRowThemeOverride = normalGlideMock.props?.getRowThemeOverride as (rowIndex: number) => unknown;
    expect(getRowThemeOverride(1)).toMatchObject({
      bgCell: '#fff1f0',
      accentColor: '#1a5276',
    });
  });

  it('draws a lightweight border for the active normal row', () => {
    render(
      <HeatCalcNormalGlideGrid
        rows={rows}
        gridColumns={[{ key: 'name', title: 'Name', width: 180 }]}
        tableScrollX={640}
        tableScrollY="360px"
        fontSizeKey="compact"
        activeRowId="row-2"
        selectedRowKeys={[]}
        tableViewState={{ filters: {} }}
        infiniteLoading={null}
        pagination={false}
        emptyContent={null}
        rowClassName={() => ''}
        getCellState={(record) => ({
          displayValue: String(record.params?.name ?? ''),
          editable: false,
        })}
        onOpenEditWizard={vi.fn()}
        onSelectedRowKeysChange={vi.fn()}
        onStartCellEdit={vi.fn()}
        onCommitCell={vi.fn(() => null)}
        onSetColumnFilter={vi.fn()}
        onResetColumnFilter={vi.fn()}
        onSetSort={vi.fn()}
        onPageChange={vi.fn()}
        onLoadMore={vi.fn()}
      />,
    );

    const drawCell = normalGlideMock.props?.drawCell as (
      args: {
        ctx: Record<string, unknown>;
        cell: { kind: 'text'; data: string };
        col: number;
        row: number;
        rect: { x: number; y: number; width: number; height: number };
      },
      drawContent: () => void,
    ) => void;
    const ctx = {
      save: vi.fn(),
      restore: vi.fn(),
      beginPath: vi.fn(),
      moveTo: vi.fn(),
      lineTo: vi.fn(),
      stroke: vi.fn(),
      set strokeStyle(_value: string) {},
      set lineWidth(_value: number) {},
    };
    const drawContent = vi.fn();

    drawCell({
      ctx,
      cell: { kind: 'text', data: 'Pipe 2' },
      col: 0,
      row: 1,
      rect: { x: 20, y: 60, width: 180, height: 30 },
    }, drawContent);

    expect(drawContent).toHaveBeenCalled();
    expect(ctx.beginPath).toHaveBeenCalled();
    expect(ctx.moveTo).toHaveBeenCalledWith(20.5, 60.5);
    expect(ctx.lineTo).toHaveBeenCalledWith(199.5, 60.5);
    expect(ctx.stroke).toHaveBeenCalled();
  });

  it('draws active cell actions and routes action clicks without DOM buttons per row', () => {
    const onCellAction = vi.fn();
    const onOpenEditWizard = vi.fn();
    render(
      <HeatCalcNormalGlideGrid
        rows={rows}
        gridColumns={[{ key: 'cable_mark', title: 'Cable mark', width: 180 }]}
        tableScrollX={640}
        tableScrollY="360px"
        fontSizeKey="compact"
        activeRowId="row-1"
        selectedRowKeys={[]}
        tableViewState={{ filters: {} }}
        infiniteLoading={null}
        pagination={false}
        emptyContent={null}
        rowClassName={() => ''}
        getCellState={() => ({
          displayValue: 'TLT-30',
          editable: false,
          actions: [
            { key: 'choose', label: 'Выбор' },
            { key: 'size', label: 'Подбор' },
          ],
        })}
        onOpenEditWizard={onOpenEditWizard}
        onSelectedRowKeysChange={vi.fn()}
        onStartCellEdit={vi.fn()}
        onCommitCell={vi.fn(() => null)}
        onSetColumnFilter={vi.fn()}
        onResetColumnFilter={vi.fn()}
        onSetSort={vi.fn()}
        onPageChange={vi.fn()}
        onLoadMore={vi.fn()}
        onCellAction={onCellAction}
      />,
    );

    const getCellContent = normalGlideMock.props?.getCellContent as ((cell: [number, number]) => unknown);
    const actionCell = getCellContent([0, 0]);
    const drawCell = normalGlideMock.props?.drawCell as (
      args: {
        ctx: Record<string, unknown>;
        cell: typeof actionCell;
        col: number;
        row: number;
        rect: { x: number; y: number; width: number; height: number };
      },
      drawContent: () => void,
    ) => void;
    const ctx = {
      save: vi.fn(),
      restore: vi.fn(),
      beginPath: vi.fn(),
      moveTo: vi.fn(),
      lineTo: vi.fn(),
      stroke: vi.fn(),
      fillRect: vi.fn(),
      strokeRect: vi.fn(),
      fillText: vi.fn(),
      set strokeStyle(_value: string) {},
      set fillStyle(_value: string) {},
      set lineWidth(_value: number) {},
      set textAlign(_value: string) {},
      set textBaseline(_value: string) {},
      set font(_value: string) {},
    };

    drawCell({
      ctx,
      cell: actionCell,
      col: 0,
      row: 0,
      rect: { x: 10, y: 20, width: 180, height: 30 },
    }, vi.fn());

    expect(ctx.fillText).toHaveBeenCalledWith('Выбор', expect.any(Number), expect.any(Number));
    expect(ctx.fillText).toHaveBeenCalledWith('Подбор', expect.any(Number), expect.any(Number));

    const onCellClicked = normalGlideMock.props?.onCellClicked as (
      cell: [number, number],
      event: {
        preventDefault: () => void;
        bounds: { x: number; y: number; width: number; height: number };
        localEventX: number;
        localEventY: number;
      },
    ) => void;
    act(() => onCellClicked([0, 0], {
      preventDefault: vi.fn(),
      bounds: { x: 10, y: 20, width: 180, height: 30 },
      localEventX: 82,
      localEventY: 15,
    }));

    expect(onCellAction).toHaveBeenCalledWith(rows[0], 'cable_mark', 'choose');
    expect(onOpenEditWizard).not.toHaveBeenCalled();

    act(() => onCellClicked([0, 0], {
      preventDefault: vi.fn(),
      bounds: { x: 72, y: 20, width: 180, height: 30 },
      localEventX: 140,
      localEventY: 15,
    }));

    expect(onCellAction).toHaveBeenLastCalledWith(rows[0], 'cable_mark', 'size');
  });

  it('opens a normal-mode inline editor when the cell state is editable', () => {
    const onOpenEditWizard = vi.fn();
    const onStartCellEdit = vi.fn();
    const onCommitCell = vi.fn(() => null);
    render(
      <HeatCalcNormalGlideGrid
        rows={rows}
        gridColumns={[{ key: 'name', title: 'Name', width: 180 }]}
        tableScrollX={640}
        tableScrollY="360px"
        fontSizeKey="compact"
        selectedRowKeys={[]}
        tableViewState={{ filters: {} }}
        infiniteLoading={null}
        pagination={false}
        emptyContent={null}
        rowClassName={() => ''}
        getCellState={(record) => ({
          displayValue: String(record.params?.name ?? ''),
          editable: true,
          editor: 'text',
        })}
        onOpenEditWizard={onOpenEditWizard}
        onSelectedRowKeysChange={vi.fn()}
        onStartCellEdit={onStartCellEdit}
        onCommitCell={onCommitCell}
        onSetColumnFilter={vi.fn()}
        onResetColumnFilter={vi.fn()}
        onSetSort={vi.fn()}
        onPageChange={vi.fn()}
        onLoadMore={vi.fn()}
      />,
    );

    const getCellContent = normalGlideMock.props?.getCellContent as ((cell: [number, number]) => unknown);
    expect(getCellContent([0, 0])).toMatchObject({ readonly: false });

    const onCellClicked = normalGlideMock.props?.onCellClicked as (
      cell: [number, number],
      event: { preventDefault: () => void },
    ) => void;
    act(() => onCellClicked([0, 0], { preventDefault: vi.fn() }));

    expect(onOpenEditWizard).toHaveBeenCalledWith(rows[0]);
    expect(onStartCellEdit).toHaveBeenCalledWith(rows[0], 'name');
    expect((normalGlideMock.props?.gridSelection as { current?: { cell: [number, number] } }).current?.cell).toEqual([0, 0]);

    const editor = screen.getByTestId('heatcalc-normal-glide-cell-editor');
    fireEvent.change(editor, { target: { value: 'Pipe edited' } });
    fireEvent.keyDown(editor, { key: 'Enter' });

    expect(onCommitCell).toHaveBeenCalledWith(rows[0], 'name', 'Pipe edited');
  });

});
