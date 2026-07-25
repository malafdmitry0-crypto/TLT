import {
  heatCalcNormalGlideRows as rows,
  normalGlideMock,
} from './HeatCalcNormalGlideGrid.test-harness';
import React, { act } from 'react';
import { render } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import HeatCalcNormalGlideGrid from '@/components/heatcalc/HeatCalcNormalGlideGrid';

describe('HeatCalcNormalGlideGrid — row selection', () => {
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

});
