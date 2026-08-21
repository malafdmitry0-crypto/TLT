import React, { act } from 'react';
import { render, screen } from '@testing-library/react';
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


describe('HeatCalcNormalGlideGrid headers-scroll — scroll-resize', () => {
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
