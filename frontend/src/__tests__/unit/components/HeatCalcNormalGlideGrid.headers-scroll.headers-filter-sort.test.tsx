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


describe('HeatCalcNormalGlideGrid headers-scroll — headers-filter-sort', () => {
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
});
