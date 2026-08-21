import React, { act } from 'react';
import { render } from '@testing-library/react';
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


describe('HeatCalcNormalGlideGrid selection', () => {

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

});
