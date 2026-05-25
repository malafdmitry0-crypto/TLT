import React from 'react';
import { render } from '@testing-library/react';
import type { ColumnType } from 'antd/es/table';
import { describe, expect, it, vi } from 'vitest';

import type { ProjectObject } from '@/types/project';

const glideMock = vi.hoisted(() => ({
  props: null as Record<string, unknown> | null,
}));

vi.mock('@glideapps/glide-data-grid', () => ({
  CompactSelection: {
    empty: () => ({ toArray: () => [] }),
  },
  DataEditor: React.forwardRef((props: Record<string, unknown>) => {
    glideMock.props = props;
    return React.createElement('div', { 'data-testid': 'glide-data-editor' });
  }),
  GridCellKind: {
    Number: 'number',
    Text: 'text',
  },
}));

import HeatCalcGlideGrid from '@/components/heatcalc/HeatCalcGlideGrid';

describe('HeatCalcGlideGrid model adapter', () => {
  const row = {
    id: 'row-1',
    object_type: 'pipe',
    params: {},
    sort_order: 1,
    created_at: '2026-01-01T00:00:00Z',
  } as ProjectObject;

  it('reads cells from the model adapter without invoking AntD column render', () => {
    const antdRender = vi.fn(() => {
      throw new Error('Glide must not depend on AntD column.render');
    });
    const getCellState = vi.fn(() => ({
      displayValue: 'Pipe 108',
      editable: true,
      dirty: true,
      align: 'right' as const,
      editor: 'number' as const,
    }));

    render(
      <HeatCalcGlideGrid
        rows={[row]}
        columns={[{ key: 'name', render: antdRender }] as ColumnType<ProjectObject>[]}
        gridColumns={[{ key: 'name', title: 'Name', width: 180 }]}
        tableScrollX={640}
        tableScrollY="360px"
        fontSizeKey="compact"
        selectedRowIndex={0}
        selectedPosition={{ rowIndex: 0, columnIndex: 0 }}
        selectionRange={{
          anchor: { rowId: 'row-1', columnKey: 'name' },
          focus: { rowId: 'row-1', columnKey: 'name' },
        }}
        emptyContent={null}
        rowClassName={() => ''}
        getCellState={getCellState}
        onRowSecondaryAction={vi.fn()}
        onSetRangeSelection={vi.fn()}
        onStartCellEdit={vi.fn()}
        onCommitCell={vi.fn()}
      />,
    );

    const getCellContent = glideMock.props?.getCellContent as ((cell: [number, number]) => unknown);
    expect(getCellContent([0, 0])).toMatchObject({
      kind: 'text',
      readonly: false,
      data: 'Pipe 108',
      displayData: 'Pipe 108',
      copyData: 'Pipe 108',
      contentAlign: 'right',
      themeOverride: { bgCell: '#fffbe6' },
    });
    expect(getCellState).toHaveBeenCalledWith(row, 'name', 0);
    expect(antdRender).not.toHaveBeenCalled();
  });

  it('keeps invalid rows red even when cells are dirty', () => {
    render(
      <HeatCalcGlideGrid
        rows={[row]}
        columns={[{ key: 'name' }] as ColumnType<ProjectObject>[]}
        gridColumns={[{ key: 'name', title: 'Name', width: 180 }]}
        tableScrollX={640}
        tableScrollY="360px"
        fontSizeKey="compact"
        selectedRowIndex={0}
        selectedPosition={{ rowIndex: 0, columnIndex: 0 }}
        selectionRange={{
          anchor: { rowId: 'row-1', columnKey: 'name' },
          focus: { rowId: 'row-1', columnKey: 'name' },
        }}
        emptyContent={null}
        rowClassName={() => 'row-invalid row-excel-dirty'}
        getCellState={() => ({
          displayValue: 'Pipe invalid',
          editable: true,
          dirty: true,
        })}
        onRowSecondaryAction={vi.fn()}
        onSetRangeSelection={vi.fn()}
        onStartCellEdit={vi.fn()}
        onCommitCell={vi.fn()}
      />,
    );

    const getCellContent = glideMock.props?.getCellContent as ((cell: [number, number]) => unknown);
    const getRowThemeOverride = glideMock.props?.getRowThemeOverride as ((rowIndex: number) => unknown);
    expect(getCellContent([0, 0])).toMatchObject({
      themeOverride: { bgCell: '#fff1f0' },
    });
    expect(getRowThemeOverride(0)).toEqual({ bgCell: '#fff1f0' });
  });
});
