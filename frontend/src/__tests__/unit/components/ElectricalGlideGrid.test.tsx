import React, { act } from 'react';
import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import type { ProjectObject } from '@/types/project';

const glideMock = vi.hoisted(() => ({
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

    add(value: number | [number, number]) {
      if (Array.isArray(value)) {
        const next = [...this.values];
        for (let index = value[0]; index < value[1]; index += 1) next.push(index);
        return new MockCompactSelection(next);
      }
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
      glideMock.props = props;
      return React.createElement('div', { 'data-testid': 'electrical-glide-data-editor' });
    }),
    GridCellKind: {
      Number: 'number',
      Text: 'text',
    },
  };
});

import ElectricalGlideGrid from '@/components/electrical/ElectricalGlideGrid';

describe('ElectricalGlideGrid', () => {
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

  function renderGrid(overrides: Partial<React.ComponentProps<typeof ElectricalGlideGrid>> = {}) {
    const props: React.ComponentProps<typeof ElectricalGlideGrid> = {
      rows,
      gridColumns: [
        { key: 'index', title: '№', width: 72 },
        { key: 'object_name', title: 'Name', label: 'Name', width: 180, sortable: true, filterable: true },
        { key: 'electrical_status', title: 'Status', width: 96, align: 'center' },
      ],
      tableScrollX: 640,
      tableScrollY: '360px',
      fontSizeKey: 'compact',
      activeRowId: null,
      selectedRowKeys: ['row-2'],
      tableViewState: { filters: {} },
      pagination: { current: 1, pageSize: 50, total: 2 },
      emptyContent: null,
      rowClassName: (record) => (record.id === 'row-1' ? 'row-invalid' : ''),
      getCellState: (record, columnKey) => ({
        displayValue: columnKey === 'electrical_status'
          ? 'Рассчитан'
          : String(record.params?.name ?? ''),
        editable: false,
      }),
      onOpenRow: vi.fn(),
      onSelectedRowKeysChange: vi.fn(),
      onSetColumnFilter: vi.fn(),
      onResetColumnFilter: vi.fn(),
      onSetSort: vi.fn(),
      onPageChange: vi.fn(),
      ...overrides,
    };
    render(<ElectricalGlideGrid {...props} />);
    return props;
  }

  it('renders electrical rows through the shared Glide engine and opens the row form on cell click', () => {
    const props = renderGrid();

    expect(screen.getByTestId('electrical-glide-data-editor')).toBeInTheDocument();
    expect(document.querySelector('.electrical-spreadsheet--glide')).toBeInTheDocument();
    expect(glideMock.props?.rowMarkers).toMatchObject({
      kind: 'checkbox-visible',
      checkboxStyle: 'square',
      width: 52,
    });
    expect(glideMock.props?.columns).toEqual([
      expect.objectContaining({ id: 'object_name', title: 'Name' }),
      expect.objectContaining({ id: 'electrical_status', title: 'Status' }),
    ]);

    const getCellContent = glideMock.props?.getCellContent as ((cell: [number, number]) => unknown);
    expect(getCellContent([0, 0])).toMatchObject({
      kind: 'text',
      data: 'Pipe 1',
      themeOverride: { bgCell: '#fff1f0' },
    });
    expect(getCellContent([1, 0])).toMatchObject({
      kind: 'text',
      data: 'Рассчитан',
      displayData: '',
    });

    const onCellClicked = glideMock.props?.onCellClicked as (
      cell: [number, number],
      event: { preventDefault: () => void },
    ) => void;
    onCellClicked([0, 1], { preventDefault: vi.fn() });
    expect(props.onOpenRow).toHaveBeenCalledWith(rows[1]);
  });

  it('keeps electrical sort and filter controls wired to the page model', async () => {
    const onSetSort = vi.fn();
    const onSetColumnFilter = vi.fn();
    renderGrid({ onSetSort, onSetColumnFilter });

    const onHeaderClicked = glideMock.props?.onHeaderClicked as (
      columnIndex: number,
      event: {
        localEventX: number;
        bounds: { x: number; y: number; width: number; height: number };
        preventDefault: () => void;
      },
    ) => void;

    act(() => onHeaderClicked(0, {
      localEventX: 12,
      bounds: { x: 20, y: 30, width: 180, height: 38 },
      preventDefault: vi.fn(),
    }));
    expect(onSetSort).toHaveBeenCalledWith('object_name', 'asc');

    act(() => onHeaderClicked(0, {
      localEventX: 170,
      bounds: { x: 20, y: 30, width: 180, height: 38 },
      preventDefault: vi.fn(),
    }));
    fireEvent.change(await screen.findByLabelText('Поиск: Name'), {
      target: { value: 'Pipe' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Применить' }));
    expect(onSetColumnFilter).toHaveBeenCalledWith('object_name', { kind: 'text', value: 'Pipe' });
  });

  it('forwards active cable mark cell actions to the page without rendering row DOM controls', () => {
    const onCellAction = vi.fn();
    const props = renderGrid({
      activeRowId: 'row-1',
      gridColumns: [
        { key: 'cable_mark', title: 'Марка', label: 'Марка', width: 180 },
      ],
      getCellState: () => ({
        displayValue: 'ТЛТ-30',
        editable: false,
        actions: [
          { key: 'choose', label: 'Выбор' },
          { key: 'size', label: 'Подбор' },
        ],
      }),
      onCellAction,
    });

    const onCellClicked = glideMock.props?.onCellClicked as (
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
    expect(props.onOpenRow).not.toHaveBeenCalled();
  });
});
