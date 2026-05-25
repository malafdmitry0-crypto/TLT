import React, { act } from 'react';
import { fireEvent, render, screen } from '@testing-library/react';
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
      void ref;
      normalGlideMock.props = props;
      return React.createElement('div', { 'data-testid': 'normal-glide-data-editor' });
    }),
    GridCellKind: {
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
        onSetColumnFilter={vi.fn()}
        onResetColumnFilter={vi.fn()}
        onSetSort={vi.fn()}
        onPageChange={vi.fn()}
      />,
    );

    expect(normalGlideMock.props?.rowMarkers).toBe('clickable-number');
    expect(normalGlideMock.props?.rowMarkerStartIndex).toBe(101);
    expect(normalGlideMock.props?.rowMarkerWidth).toBe(52);
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

    onCellClicked([0, 1], { preventDefault: vi.fn() });
    expect(onOpenEditWizard).toHaveBeenCalledWith(rows[1]);
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
        pagination={false}
        emptyContent={null}
        rowClassName={() => ''}
        getCellState={(record) => ({
          displayValue: String(record.params?.name ?? ''),
          editable: false,
        })}
        onOpenEditWizard={vi.fn()}
        onSelectedRowKeysChange={vi.fn()}
        onSetColumnFilter={onSetColumnFilter}
        onResetColumnFilter={vi.fn()}
        onSetSort={onSetSort}
        onPageChange={vi.fn()}
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

  it('draws persistent sort and filter controls in Glide headers', () => {
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
        pagination={false}
        emptyContent={null}
        rowClassName={() => ''}
        getCellState={(record) => ({
          displayValue: String(record.params?.name ?? ''),
          editable: false,
        })}
        onOpenEditWizard={vi.fn()}
        onSelectedRowKeysChange={vi.fn()}
        onSetColumnFilter={vi.fn()}
        onResetColumnFilter={vi.fn()}
        onSetSort={vi.fn()}
        onPageChange={vi.fn()}
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
    expect(ctx.fillRect).toHaveBeenCalled();
    expect(ctx.fill).toHaveBeenCalled();
    expect(ctx.stroke).toHaveBeenCalled();
  });
});
