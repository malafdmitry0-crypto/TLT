import {
  heatCalcNormalGlideRows as rows,
  normalGlideMock,
} from './HeatCalcNormalGlideGrid.test-harness';
import React, { act } from 'react';
import { render } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import HeatCalcNormalGlideGrid from '@/components/heatcalc/HeatCalcNormalGlideGrid';

describe('HeatCalcNormalGlideGrid — paint & theme', () => {
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

});
