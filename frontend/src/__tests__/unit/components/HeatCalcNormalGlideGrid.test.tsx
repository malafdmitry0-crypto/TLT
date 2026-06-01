import React, { act } from 'react';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import type { ProjectObject } from '@/types/project';

const normalGlideMock = vi.hoisted(() => ({
  props: null as Record<string, unknown> | null,
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

vi.mock('@/pages/heatcalc/HeatCalcColumnFilterDropdown', () => ({
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

describe('HeatCalcNormalGlideGrid', () => {
  const rows = [
    {
      id: 'row-1',
      project_id: 'project-1',
      object_type: 'pipe',
      params: { name: 'Pipe 1' },
      results: null,
      is_valid: true,
      validation_errors: null,
      sort_order: 1,
      version: 1,
      created_at: '2026-01-01T00:00:00Z',
      updated_at: '2026-01-01T00:00:00Z',
    },
    {
      id: 'row-2',
      project_id: 'project-1',
      object_type: 'pipe',
      params: { name: 'Pipe 2' },
      results: null,
      is_valid: true,
      validation_errors: null,
      sort_order: 2,
      version: 1,
      created_at: '2026-01-01T00:00:00Z',
      updated_at: '2026-01-01T00:00:00Z',
    },
  ] as ProjectObject[];

  it('renders normal table cells from the model adapter and opens the row form on cell click', () => {
    const onOpenEditWizard = vi.fn();
    render(
      <HeatCalcNormalGlideGrid
        rows={rows}
        gridColumns={[
          { key: 'index', title: '№', width: 72 },
          { key: 'name', title: 'Name', width: 180, sortable: true, filterable: true },
        ]}
        tableScrollX={640}
        tableScrollY="360px"
        fontSizeKey="compact"
        selectedRowKeys={['row-2']}
        tableViewState={{
          filters: { name: { kind: 'text', value: 'Pipe' } },
          sort: { columnKey: 'name', direction: 'asc' },
        }}
        infiniteLoading={{
          loaded: 100,
          total: 200,
          hasNextPage: true,
        }}
        pagination={{ current: 3, pageSize: 50, total: 200 }}
        emptyContent={null}
        rowClassName={(record) => (record.id === 'row-1' ? 'row-invalid row-dirty' : '')}
        getCellState={(record) => ({
          displayValue: String(record.params?.name ?? ''),
          editable: false,
          dirty: record.id === 'row-1',
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
      />,
    );

    expect(normalGlideMock.props?.rowMarkers).toMatchObject({
      kind: 'checkbox-visible',
      checkboxStyle: 'square',
      startIndex: 1,
      width: 52,
    });
    expect(normalGlideMock.props?.rowSelectionMode).toBe('multi');
    expect(normalGlideMock.props?.columns).toEqual([
      expect.objectContaining({ id: 'name', title: 'Name', hasMenu: false, style: 'highlight' }),
    ]);
    expect(normalGlideMock.props?.drawHeader).toEqual(expect.any(Function));
    const getCellContent = normalGlideMock.props?.getCellContent as ((cell: [number, number]) => unknown);
    const onCellClicked = normalGlideMock.props?.onCellClicked as (
      cell: [number, number],
      event: { preventDefault: () => void },
    ) => void;
    expect(getCellContent([0, 0])).toMatchObject({
      kind: 'text',
      readonly: true,
      data: 'Pipe 1',
      themeOverride: { bgCell: '#fff1f0' },
    });

    act(() => onCellClicked([0, 1], { preventDefault: vi.fn() }));
    expect(onOpenEditWizard).toHaveBeenCalledWith(rows[1]);
    expect(screen.queryByText(/Страница/)).not.toBeInTheDocument();
  });

  it('reuses the model cell state between content and custom draw callbacks', () => {
    const getCellState = vi.fn((record: ProjectObject) => ({
      displayValue: String(record.params?.name ?? ''),
      editable: false,
    }));
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
        getCellState={getCellState}
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

    const getCellContent = normalGlideMock.props?.getCellContent as ((cell: [number, number]) => unknown);
    const drawCell = normalGlideMock.props?.drawCell as (
      args: {
        ctx: Record<string, unknown>;
        cell: unknown;
        col: number;
        row: number;
        rect: { x: number; y: number; width: number; height: number };
      },
      drawContent: () => void,
    ) => void;
    const cell = getCellContent([0, 0]);
    drawCell({
      ctx: {},
      cell,
      col: 0,
      row: 0,
      rect: { x: 10, y: 20, width: 180, height: 30 },
    }, vi.fn());

    expect(getCellState).toHaveBeenCalledTimes(1);
  });

  it('stretches columns to fill the container when requested', async () => {
    const originalGetBoundingClientRect = HTMLElement.prototype.getBoundingClientRect;
    HTMLElement.prototype.getBoundingClientRect = function getBoundingClientRect() {
      const className = String((this as HTMLElement).className ?? '');
      if (className.includes('calc-spreadsheet--normal-glide')) {
        return {
          x: 0,
          y: 0,
          top: 0,
          left: 0,
          right: 1000,
          bottom: 360,
          width: 1000,
          height: 360,
          toJSON: () => ({}),
        };
      }
      return originalGetBoundingClientRect.call(this);
    };
    class MockResizeObserver {
      private readonly callback: ResizeObserverCallback;

      constructor(callback: ResizeObserverCallback) {
        this.callback = callback;
      }

      observe() {
        this.callback([], this as unknown as ResizeObserver);
      }

      disconnect() {}
    }
    vi.stubGlobal('ResizeObserver', MockResizeObserver);

    try {
      render(
        <HeatCalcNormalGlideGrid
          rows={rows}
          gridColumns={[
            { key: 'index', title: '№', width: 72 },
            { key: 'name', title: 'Name', width: 180 },
            { key: 'status', title: 'Status', width: 100 },
          ]}
          tableScrollX={352}
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
          fillAvailableWidth
        />,
      );

      await waitFor(() => expect(normalGlideMock.props?.width).toBe(1000));
      const renderedColumns = normalGlideMock.props?.columns as Array<{ width: number }>;
      expect(renderedColumns.reduce((sum, column) => sum + column.width, 0)).toBe(948);
    } finally {
      HTMLElement.prototype.getBoundingClientRect = originalGetBoundingClientRect;
      vi.unstubAllGlobals();
    }
  });

  it('uses table font-size settings in the Glide canvas theme and row metrics', () => {
    render(
      <HeatCalcNormalGlideGrid
        rows={rows}
        gridColumns={[{ key: 'name', title: 'Name', width: 180 }]}
        tableScrollX={640}
        tableScrollY="360px"
        fontSizeKey="large"
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

    expect(normalGlideMock.props?.rowHeight).toBe(36);
    expect(normalGlideMock.props?.headerHeight).toBe(44);
    expect(normalGlideMock.props?.theme).toMatchObject({
      baseFontStyle: '13px inherit',
      headerFontStyle: '600 13px inherit',
    });
  });

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

  it('keeps Glide keyboard/focus selection local without changing checkbox selection semantics', () => {
    const onOpenEditWizard = vi.fn();
    const onSelectedRowKeysChange = vi.fn();
    render(
      <HeatCalcNormalGlideGrid
        rows={rows}
        gridColumns={[{ key: 'name', title: 'Name', width: 180 }]}
        tableScrollX={640}
        tableScrollY="360px"
        fontSizeKey="compact"
        activeRowId="row-1"
        selectedRowKeys={['row-1']}
        tableViewState={{ filters: {} }}
        infiniteLoading={null}
        pagination={false}
        emptyContent={null}
        rowClassName={() => ''}
        getCellState={(record) => ({
          displayValue: String(record.params?.name ?? ''),
          editable: false,
        })}
        onOpenEditWizard={onOpenEditWizard}
        onSelectedRowKeysChange={onSelectedRowKeysChange}
        onStartCellEdit={vi.fn()}
        onCommitCell={vi.fn(() => null)}
        onSetColumnFilter={vi.fn()}
        onResetColumnFilter={vi.fn()}
        onSetSort={vi.fn()}
        onPageChange={vi.fn()}
        onLoadMore={vi.fn()}
      />,
    );

    const onGridSelectionChange = normalGlideMock.props?.onGridSelectionChange as (selection: {
      current?: { cell: [number, number] };
      rows: { toArray: () => number[] };
    }) => void;
    act(() => onGridSelectionChange({
      current: { cell: [0, 1] },
      rows: { toArray: () => [0] },
    }));

    expect(onSelectedRowKeysChange).toHaveBeenCalledWith(['row-1']);
    expect(onOpenEditWizard).not.toHaveBeenCalled();
    expect((normalGlideMock.props?.gridSelection as { current?: { cell: [number, number] } }).current?.cell).toEqual([0, 1]);
  });

  it('does not clear checkbox selection on current-cell focus changes', () => {
    const onOpenEditWizard = vi.fn();
    const onSelectedRowKeysChange = vi.fn();
    render(
      <HeatCalcNormalGlideGrid
        rows={rows}
        gridColumns={[{ key: 'name', title: 'Name', width: 180 }]}
        tableScrollX={640}
        tableScrollY="360px"
        fontSizeKey="compact"
        activeRowId="row-1"
        selectedRowKeys={['row-1']}
        tableViewState={{ filters: {} }}
        infiniteLoading={null}
        pagination={false}
        emptyContent={null}
        rowClassName={() => ''}
        getCellState={(record) => ({
          displayValue: String(record.params?.name ?? ''),
          editable: false,
        })}
        onOpenEditWizard={onOpenEditWizard}
        onSelectedRowKeysChange={onSelectedRowKeysChange}
        onStartCellEdit={vi.fn()}
        onCommitCell={vi.fn(() => null)}
        onSetColumnFilter={vi.fn()}
        onResetColumnFilter={vi.fn()}
        onSetSort={vi.fn()}
        onPageChange={vi.fn()}
        onLoadMore={vi.fn()}
      />,
    );

    const onGridSelectionChange = normalGlideMock.props?.onGridSelectionChange as (selection: {
      current?: { cell: [number, number] };
      rows: { toArray: () => number[] };
    }) => void;
    act(() => onGridSelectionChange({
      current: { cell: [0, 1] },
      rows: { toArray: () => [] },
    }));

    expect(onSelectedRowKeysChange).not.toHaveBeenCalled();
    expect(onOpenEditWizard).not.toHaveBeenCalled();
  });

  it('lets Glide row marker clicks drive checkbox selection without replacing it from click handler', () => {
    const onOpenEditWizard = vi.fn();
    const onSelectedRowKeysChange = vi.fn();
    render(
      <HeatCalcNormalGlideGrid
        rows={rows}
        gridColumns={[{ key: 'name', title: 'Name', width: 180 }]}
        tableScrollX={640}
        tableScrollY="360px"
        fontSizeKey="compact"
        selectedRowKeys={['row-1']}
        tableViewState={{ filters: {} }}
        infiniteLoading={null}
        pagination={false}
        emptyContent={null}
        rowClassName={() => ''}
        getCellState={(record) => ({
          displayValue: String(record.params?.name ?? ''),
          editable: false,
        })}
        onOpenEditWizard={onOpenEditWizard}
        onSelectedRowKeysChange={onSelectedRowKeysChange}
        onStartCellEdit={vi.fn()}
        onCommitCell={vi.fn(() => null)}
        onSetColumnFilter={vi.fn()}
        onResetColumnFilter={vi.fn()}
        onSetSort={vi.fn()}
        onPageChange={vi.fn()}
        onLoadMore={vi.fn()}
      />,
    );

    const onCellClicked = normalGlideMock.props?.onCellClicked as (
      cell: [number, number],
      event: { preventDefault: () => void; ctrlKey?: boolean; metaKey?: boolean; shiftKey?: boolean },
    ) => void;
    const preventDefault = vi.fn();
    act(() => onCellClicked([-1, 1], { preventDefault }));

    expect(preventDefault).toHaveBeenCalled();
    expect(onSelectedRowKeysChange).not.toHaveBeenCalled();
    expect(onOpenEditWizard).not.toHaveBeenCalled();
  });

  it('maps successive Glide checkbox selections to multiple selected row keys', () => {
    const onOpenEditWizard = vi.fn();
    const onSelectedRowKeysChange = vi.fn();
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
          editable: false,
        })}
        onOpenEditWizard={onOpenEditWizard}
        onSelectedRowKeysChange={onSelectedRowKeysChange}
        onStartCellEdit={vi.fn()}
        onCommitCell={vi.fn(() => null)}
        onSetColumnFilter={vi.fn()}
        onResetColumnFilter={vi.fn()}
        onSetSort={vi.fn()}
        onPageChange={vi.fn()}
        onLoadMore={vi.fn()}
      />,
    );

    const onGridSelectionChange = normalGlideMock.props?.onGridSelectionChange as (selection: {
      current?: { cell: [number, number] };
      rows: { toArray: () => number[] };
    }) => void;
    act(() => onGridSelectionChange({
      rows: { toArray: () => [0] },
    }));
    act(() => onGridSelectionChange({
      rows: { toArray: () => [0, 1] },
    }));

    expect(onSelectedRowKeysChange).toHaveBeenNthCalledWith(1, ['row-1']);
    expect(onSelectedRowKeysChange).toHaveBeenNthCalledWith(2, ['row-1', 'row-2']);
    expect(onOpenEditWizard).not.toHaveBeenCalled();
  });

  it('maps Glide checkbox deselection to removing only that row key', () => {
    const onSelectedRowKeysChange = vi.fn();
    render(
      <HeatCalcNormalGlideGrid
        rows={rows}
        gridColumns={[{ key: 'name', title: 'Name', width: 180 }]}
        tableScrollX={640}
        tableScrollY="360px"
        fontSizeKey="compact"
        selectedRowKeys={['row-1', 'row-2']}
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
        onSelectedRowKeysChange={onSelectedRowKeysChange}
        onStartCellEdit={vi.fn()}
        onCommitCell={vi.fn(() => null)}
        onSetColumnFilter={vi.fn()}
        onResetColumnFilter={vi.fn()}
        onSetSort={vi.fn()}
        onPageChange={vi.fn()}
        onLoadMore={vi.fn()}
      />,
    );

    const onGridSelectionChange = normalGlideMock.props?.onGridSelectionChange as (selection: {
      current?: { cell: [number, number] };
      rows: { toArray: () => number[] };
    }) => void;
    act(() => onGridSelectionChange({
      rows: { toArray: () => [1] },
    }));

    expect(onSelectedRowKeysChange).toHaveBeenCalledWith(['row-2']);
  });

  it('toggles disjoint rows with Ctrl/Cmd-click without opening the form', () => {
    const onOpenEditWizard = vi.fn();
    const onSelectedRowKeysChange = vi.fn();
    render(
      <HeatCalcNormalGlideGrid
        rows={rows}
        gridColumns={[{ key: 'name', title: 'Name', width: 180 }]}
        tableScrollX={640}
        tableScrollY="360px"
        fontSizeKey="compact"
        selectedRowKeys={['row-1']}
        tableViewState={{ filters: {} }}
        infiniteLoading={null}
        pagination={false}
        emptyContent={null}
        rowClassName={() => ''}
        getCellState={(record) => ({
          displayValue: String(record.params?.name ?? ''),
          editable: false,
        })}
        onOpenEditWizard={onOpenEditWizard}
        onSelectedRowKeysChange={onSelectedRowKeysChange}
        onStartCellEdit={vi.fn()}
        onCommitCell={vi.fn(() => null)}
        onSetColumnFilter={vi.fn()}
        onResetColumnFilter={vi.fn()}
        onSetSort={vi.fn()}
        onPageChange={vi.fn()}
        onLoadMore={vi.fn()}
      />,
    );

    const onCellClicked = normalGlideMock.props?.onCellClicked as (
      cell: [number, number],
      event: { preventDefault: () => void; ctrlKey?: boolean; metaKey?: boolean; shiftKey?: boolean },
    ) => void;
    act(() => onCellClicked([0, 1], { preventDefault: vi.fn(), ctrlKey: true }));

    expect(onSelectedRowKeysChange).toHaveBeenCalledWith(['row-1', 'row-2']);
    expect(onOpenEditWizard).not.toHaveBeenCalled();
  });

  it('adds a Shift-click range from the row-selection anchor on data cells', () => {
    const onSelectedRowKeysChange = vi.fn();
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
          editable: false,
        })}
        onOpenEditWizard={vi.fn()}
        onSelectedRowKeysChange={onSelectedRowKeysChange}
        onStartCellEdit={vi.fn()}
        onCommitCell={vi.fn(() => null)}
        onSetColumnFilter={vi.fn()}
        onResetColumnFilter={vi.fn()}
        onSetSort={vi.fn()}
        onPageChange={vi.fn()}
        onLoadMore={vi.fn()}
      />,
    );

    const onCellClicked = normalGlideMock.props?.onCellClicked as (
      cell: [number, number],
      event: { preventDefault: () => void; ctrlKey?: boolean; metaKey?: boolean; shiftKey?: boolean },
    ) => void;
    act(() => onCellClicked([0, 0], { preventDefault: vi.fn(), ctrlKey: true }));
    act(() => onCellClicked([0, 1], { preventDefault: vi.fn(), shiftKey: true }));

    expect(onSelectedRowKeysChange).toHaveBeenNthCalledWith(1, ['row-1']);
    expect(onSelectedRowKeysChange).toHaveBeenNthCalledWith(2, ['row-1', 'row-2']);
  });

  it('does not resync the form when Glide focus stays on the already active row', () => {
    const onOpenEditWizard = vi.fn();
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
        onOpenEditWizard={onOpenEditWizard}
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

    const onGridSelectionChange = normalGlideMock.props?.onGridSelectionChange as (selection: {
      current?: { cell: [number, number] };
      rows: { toArray: () => number[] };
    }) => void;
    act(() => onGridSelectionChange({
      current: { cell: [0, 1] },
      rows: { toArray: () => [] },
    }));

    expect(onOpenEditWizard).not.toHaveBeenCalled();
  });

  it('wires Glide header sorting and filter popup to the shared table-view model', async () => {
    const onSetSort = vi.fn();
    const onSetColumnFilter = vi.fn();
    render(
      <HeatCalcNormalGlideGrid
        rows={rows}
        gridColumns={[{
          key: 'name',
          title: 'Name',
          label: 'Name label',
          width: 180,
          sortable: true,
          filterable: true,
          filterKind: 'text',
        }]}
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
          editable: false,
        })}
        onOpenEditWizard={vi.fn()}
        onSelectedRowKeysChange={vi.fn()}
        onStartCellEdit={vi.fn()}
        onCommitCell={vi.fn(() => null)}
        onSetColumnFilter={onSetColumnFilter}
        onResetColumnFilter={vi.fn()}
        onSetSort={onSetSort}
        onPageChange={vi.fn()}
        onLoadMore={vi.fn()}
      />,
    );

    const onHeaderClicked = normalGlideMock.props?.onHeaderClicked as (
      columnIndex: number,
      event: { localEventX: number; bounds: { x: number; y: number; width: number; height: number }; preventDefault: () => void },
    ) => void;
    act(() => onHeaderClicked(0, {
      localEventX: 12,
      bounds: { x: 20, y: 30, width: 180, height: 38 },
      preventDefault: vi.fn(),
    }));
    expect(onSetSort).toHaveBeenCalledWith('name', 'asc');

    act(() => onHeaderClicked(0, {
      localEventX: 170,
      bounds: { x: 20, y: 30, width: 180, height: 38 },
      preventDefault: vi.fn(),
    }));
    fireEvent.click(await screen.findByTestId('normal-glide-filter-apply'));
    expect(onSetColumnFilter).toHaveBeenCalledWith('name', { kind: 'text', value: 'Pipe' });
  });

  it('renders heat-loss status as a colored canvas badge without visible text', () => {
    render(
      <HeatCalcNormalGlideGrid
        rows={rows}
        gridColumns={[{ key: 'heat_loss_status', title: 'Status', width: 96 }]}
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
          displayValue: record.id === 'row-1' ? 'Рассчитан' : 'Ошибка',
          editable: false,
          align: 'center',
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

    const getCellContent = normalGlideMock.props?.getCellContent as ((cell: [number, number]) => unknown);
    const statusCell = getCellContent([0, 0]);
    expect(statusCell).toMatchObject({
      kind: 'text',
      data: 'Рассчитан',
      displayData: '',
      copyData: 'Рассчитан',
      contentAlign: 'center',
    });

    const drawCell = normalGlideMock.props?.drawCell as (
      args: {
        ctx: Record<string, unknown>;
        cell: typeof statusCell;
        col: number;
        row: number;
        rect: { x: number; y: number; width: number; height: number };
      },
      drawContent: () => void,
    ) => void;
    const drawContent = vi.fn();
    const ctx = {
      save: vi.fn(),
      restore: vi.fn(),
      beginPath: vi.fn(),
      arc: vi.fn(),
      fill: vi.fn(),
      stroke: vi.fn(),
      moveTo: vi.fn(),
      lineTo: vi.fn(),
      set fillStyle(_value: string) {},
      set strokeStyle(_value: string) {},
      set lineWidth(_value: number) {},
      set lineCap(_value: string) {},
      set lineJoin(_value: string) {},
    };

    drawCell({
      ctx,
      cell: statusCell,
      col: 0,
      row: 0,
      rect: { x: 10, y: 20, width: 96, height: 30 },
    }, drawContent);

    expect(drawContent).toHaveBeenCalled();
    expect(ctx.arc).toHaveBeenCalledWith(58, 35, 8, 0, Math.PI * 2);
    expect(ctx.moveTo).toHaveBeenCalled();
    expect(ctx.lineTo).toHaveBeenCalled();
    expect(ctx.stroke).toHaveBeenCalled();
  });

  it('draws Glide header controls on hover and active table view state only', () => {
    render(
      <HeatCalcNormalGlideGrid
        rows={rows}
        gridColumns={[{
          key: 'name',
          title: 'Name',
          width: 180,
          sortable: true,
          filterable: true,
          filterKind: 'text',
        }]}
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

    const drawHeader = normalGlideMock.props?.drawHeader as (
      args: {
        ctx: Record<string, unknown>;
        columnIndex: number;
        theme: { bgHeader: string };
        rect: { x: number; y: number; width: number; height: number };
      },
      drawContent: () => void,
    ) => void;
    const onItemHovered = normalGlideMock.props?.onItemHovered as (args: {
      kind: 'header' | 'cell';
      location: [number, number];
    }) => void;
    const drawContent = vi.fn();
    const ctx = {
      save: vi.fn(),
      restore: vi.fn(),
      fillRect: vi.fn(),
      beginPath: vi.fn(),
      moveTo: vi.fn(),
      lineTo: vi.fn(),
      closePath: vi.fn(),
      fill: vi.fn(),
      stroke: vi.fn(),
      set fillStyle(_value: string) {},
      set strokeStyle(_value: string) {},
      set lineWidth(_value: number) {},
    };

    drawHeader({
      ctx,
      columnIndex: 0,
      theme: { bgHeader: '#f3f6f4' },
      rect: { x: 10, y: 20, width: 180, height: 38 },
    }, drawContent);

    expect(drawContent).toHaveBeenCalled();
    expect(ctx.fillRect).not.toHaveBeenCalled();

    act(() => onItemHovered({ kind: 'header', location: [0, -1] }));
    const drawHeaderAfterHover = normalGlideMock.props?.drawHeader as typeof drawHeader;
    drawHeaderAfterHover({
      ctx,
      columnIndex: 0,
      theme: { bgHeader: '#f3f6f4' },
      rect: { x: 10, y: 20, width: 180, height: 38 },
    }, drawContent);

    expect(ctx.fillRect).toHaveBeenCalled();
    expect(ctx.fill).toHaveBeenCalled();
    expect(ctx.stroke).toHaveBeenCalled();
  });

  it('keeps active Glide sort and filter controls visible without header hover', () => {
    render(
      <HeatCalcNormalGlideGrid
        rows={rows}
        gridColumns={[{
          key: 'name',
          title: 'Name',
          width: 180,
          sortable: true,
          filterable: true,
          filterKind: 'text',
        }]}
        tableScrollX={640}
        tableScrollY="360px"
        fontSizeKey="compact"
        selectedRowKeys={[]}
        tableViewState={{
          filters: { name: { kind: 'text', value: 'Pipe' } },
          sort: { columnKey: 'name', direction: 'desc' },
        }}
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

    const drawHeader = normalGlideMock.props?.drawHeader as (
      args: {
        ctx: Record<string, unknown>;
        columnIndex: number;
        theme: { bgHeader: string };
        rect: { x: number; y: number; width: number; height: number };
      },
      drawContent: () => void,
    ) => void;
    const ctx = {
      save: vi.fn(),
      restore: vi.fn(),
      fillRect: vi.fn(),
      beginPath: vi.fn(),
      moveTo: vi.fn(),
      lineTo: vi.fn(),
      closePath: vi.fn(),
      fill: vi.fn(),
      stroke: vi.fn(),
      set fillStyle(_value: string) {},
      set strokeStyle(_value: string) {},
      set lineWidth(_value: number) {},
    };

    drawHeader({
      ctx,
      columnIndex: 0,
      theme: { bgHeader: '#f3f6f4' },
      rect: { x: 10, y: 20, width: 180, height: 38 },
    }, vi.fn());

    expect(ctx.fillRect).toHaveBeenCalled();
    expect(ctx.fill).toHaveBeenCalled();
    expect(ctx.stroke).toHaveBeenCalled();
  });

  it('loads more rows near the bottom instead of rendering pagination controls', () => {
    const onLoadMore = vi.fn();
    render(
      <HeatCalcNormalGlideGrid
        rows={rows}
        gridColumns={[{ key: 'name', title: 'Name', width: 180 }]}
        tableScrollX={640}
        tableScrollY="360px"
        fontSizeKey="compact"
        selectedRowKeys={[]}
        tableViewState={{ filters: {} }}
        infiniteLoading={{
          loaded: 100,
          total: 125,
          hasNextPage: true,
        }}
        pagination={{ current: 2, pageSize: 50, total: 125 }}
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
        onLoadMore={onLoadMore}
      />,
    );

    expect(screen.queryByRole('list')).not.toBeInTheDocument();
    expect(screen.queryByText(/Страница/)).not.toBeInTheDocument();
    const onVisibleRegionChanged = normalGlideMock.props?.onVisibleRegionChanged as (
      range: { x: number; y: number; width: number; height: number },
    ) => void;
    act(() => onVisibleRegionChanged({ x: 0, y: 1, width: 1, height: 1 }));
    expect(onLoadMore).toHaveBeenCalledTimes(1);
  });

  it('maps Glide resize callbacks to visible column keys and clamps minimum width', () => {
    const onColumnResize = vi.fn();
    const onColumnResizeEnd = vi.fn();
    render(
      <HeatCalcNormalGlideGrid
        rows={rows}
        gridColumns={[
          { key: 'index', title: '№', width: 72 },
          { key: 'name', title: 'Name', width: 180, minWidthPx: 140 },
          { key: 'placement', title: 'Placement', width: 160, resizable: false },
        ]}
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
          editable: false,
        })}
        onOpenEditWizard={vi.fn()}
        onSelectedRowKeysChange={vi.fn()}
        onStartCellEdit={vi.fn()}
        onCommitCell={vi.fn(() => null)}
        onSetColumnFilter={vi.fn()}
        onResetColumnFilter={vi.fn()}
        onSetSort={vi.fn()}
        onColumnResize={onColumnResize}
        onColumnResizeEnd={onColumnResizeEnd}
        onPageChange={vi.fn()}
        onLoadMore={vi.fn()}
      />,
    );

    const onResize = normalGlideMock.props?.onColumnResize as (
      column: unknown,
      widthPx: number,
      columnIndex: number,
    ) => void;
    const onResizeEnd = normalGlideMock.props?.onColumnResizeEnd as (
      column: unknown,
      widthPx: number,
      columnIndex: number,
    ) => void;

    expect(normalGlideMock.props?.columns).toEqual([
      expect.objectContaining({ id: 'name' }),
      expect.objectContaining({ id: 'placement' }),
    ]);
    expect(normalGlideMock.props?.minColumnWidth).toBe(48);
    expect(normalGlideMock.props?.maxColumnWidth).toBe(600);
    onResize({}, 90, 0);
    onResize({}, 240, 1);
    onResizeEnd({}, 220, 0);

    expect(onColumnResize).toHaveBeenCalledOnce();
    expect(onColumnResize).toHaveBeenCalledWith('name', 140);
    expect(onColumnResizeEnd).toHaveBeenCalledWith('name', 220);
  });
});
