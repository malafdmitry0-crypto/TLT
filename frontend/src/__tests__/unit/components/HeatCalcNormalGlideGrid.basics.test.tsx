import {
  heatCalcNormalGlideRows as rows,
  normalGlideMock,
} from './HeatCalcNormalGlideGrid.test-harness';
import React, { act } from 'react';
import { render, screen, waitFor } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import type { ProjectObject } from '@/types/project';
import HeatCalcNormalGlideGrid from '@/components/heatcalc/HeatCalcNormalGlideGrid';

describe('HeatCalcNormalGlideGrid — basics (open form / adapter / layout)', () => {
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

  it('registers an imperative draft invalidator for targeted row redraws', () => {
    normalGlideMock.updateCells.mockClear();
    let invalidateRows: ((rowIds?: readonly string[] | null) => void) | null = null;
    const onRegisterDraftInvalidator = vi.fn((next: (rowIds?: readonly string[] | null) => void) => {
      invalidateRows = next;
      return vi.fn();
    });
    render(
      <HeatCalcNormalGlideGrid
        rows={rows}
        gridColumns={[
          { key: 'index', title: '№', width: 72 },
          { key: 'name', title: 'Name', width: 180 },
          { key: 'heat_loss_status', title: 'Status', width: 90 },
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
        onPageChange={vi.fn()}
        onLoadMore={vi.fn()}
        onRegisterDraftInvalidator={onRegisterDraftInvalidator}
      />,
    );

    expect(onRegisterDraftInvalidator).toHaveBeenCalledTimes(1);
    act(() => invalidateRows?.(['row-2', 'missing']));

    expect(normalGlideMock.updateCells).toHaveBeenCalledWith([
      { cell: [0, 1] },
      { cell: [1, 1] },
    ]);
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

});
