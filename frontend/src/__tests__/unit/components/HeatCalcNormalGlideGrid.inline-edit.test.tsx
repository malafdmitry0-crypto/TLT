import {
  heatCalcNormalGlideRows as rows,
  normalGlideMock,
} from './HeatCalcNormalGlideGrid.test-harness';
import React, { act } from 'react';
import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import HeatCalcNormalGlideGrid from '@/components/heatcalc/HeatCalcNormalGlideGrid';

describe('HeatCalcNormalGlideGrid — inline edit', () => {
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
