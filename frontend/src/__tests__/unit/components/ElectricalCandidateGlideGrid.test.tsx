import React, { act } from 'react';
import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import type { ElectricalCandidate } from '@/types/calculation';

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
    DataEditor: (props: Record<string, unknown>) => {
      glideMock.props = props;
      return React.createElement('div', { 'data-testid': 'electrical-candidate-glide-data-editor' });
    },
    GridCellKind: {
      Text: 'text',
    },
  };
});

import ElectricalCandidateGlideGrid from '@/components/electrical/ElectricalCandidateGlideGrid';

function candidate(overrides: Partial<ElectricalCandidate> & { id: string }): ElectricalCandidate {
  const { id, ...rest } = overrides;
  return {
    id,
    project_id: 'project-1',
    object_id: 'object-1',
    variant_number: 1,
    cable_type: 'self_regulating',
    cable_source: 'catalog',
    cable_mark: 'TLT-30',
    dedupe_key: `v1:${overrides.id}`,
    mode: 'auto',
    status: 'applicable',
    priority: 1,
    is_recommended: false,
    is_pinned: false,
    is_applied: false,
    reason_code: null,
    reason_message: null,
    engineer_comment: null,
    params: {},
    results: null,
    cable_snapshot: null,
    warnings: [],
    risk_flags: [],
    candidate_meta: {},
    created_at: '2026-01-01T00:00:00Z',
    updated_at: '2026-01-01T00:00:00Z',
    ...rest,
  };
}

describe('ElectricalCandidateGlideGrid', () => {
  const rows = [
    candidate({ id: 'cand-1', cable_mark: 'TLT-30', is_pinned: true }),
    candidate({ id: 'cand-2', cable_mark: 'TLT-40', status: 'error', reason_message: 'No cable' }),
  ];

  function renderGrid(overrides: Partial<React.ComponentProps<typeof ElectricalCandidateGlideGrid>> = {}) {
    const props: React.ComponentProps<typeof ElectricalCandidateGlideGrid> = {
      rows,
      gridColumns: [
        { key: 'marked', title: 'Пометка', label: 'Пометка', width: 72, align: 'center', sortable: true, filterable: true },
        { key: 'actions', title: 'Действия', label: 'Действия', width: 180 },
        { key: 'cable_mark', title: 'Марка', label: 'Марка', width: 180, sortable: true, filterable: true },
      ],
      tableScrollX: 640,
      tableScrollY: '360px',
      fontSizeKey: 'compact',
      loading: false,
      tableViewState: { filters: {} },
      emptyContent: null,
      rowClassName: (record) => (record.status === 'error' ? 'electrical-cable-sizing-table__row--error' : ''),
      getCellState: (record, columnKey) => ({
        displayValue: columnKey === 'marked'
          ? (record.is_pinned ? '1' : '0')
          : columnKey === 'actions'
            ? ''
            : String(record.cable_mark ?? ''),
        editable: false,
        dirty: record.id === 'cand-1' && columnKey === 'cable_mark',
        error: record.status === 'error' ? 'No cable' : undefined,
        actions: columnKey === 'actions'
          ? [
            { key: 'apply', label: 'Выбрать' },
            { key: 'folder', label: 'Папка' },
            { key: 'exclude', label: 'Искл.' },
          ]
          : undefined,
      }),
      onToggleMarked: vi.fn(),
      onCellAction: vi.fn(),
      getActionMenuItems: vi.fn(),
      onSetColumnFilter: vi.fn(),
      onResetColumnFilter: vi.fn(),
      onSetSort: vi.fn(),
      ...overrides,
    };
    render(<ElectricalCandidateGlideGrid {...props} />);
    return props;
  }

  it('renders candidate rows through Glide and keeps error/diff state in the model', () => {
    renderGrid();

    expect(screen.getByTestId('electrical-candidate-glide-data-editor')).toBeInTheDocument();
    expect(document.querySelector('.electrical-candidate-spreadsheet--glide')).toBeInTheDocument();
    expect(glideMock.props?.rowMarkers).toBe('none');
    expect(glideMock.props?.columns).toEqual([
      expect.objectContaining({ id: 'marked', title: 'Пометка' }),
      expect.objectContaining({ id: 'actions', title: 'Действия' }),
      expect.objectContaining({ id: 'cable_mark', title: 'Марка' }),
    ]);

    const getCellContent = glideMock.props?.getCellContent as ((cell: [number, number]) => unknown);
    expect(getCellContent([2, 0])).toMatchObject({
      kind: 'text',
      data: 'TLT-30',
      themeOverride: { bgCell: '#fff7d6' },
    });
    expect(getCellContent([2, 1])).toMatchObject({
      kind: 'text',
      data: 'TLT-40',
      themeOverride: { bgCell: '#fff1f0' },
    });
  });

  it('toggles candidate marks from the model row, not from AntD row DOM', () => {
    const onToggleMarked = vi.fn();
    renderGrid({ onToggleMarked });

    const onCellClicked = glideMock.props?.onCellClicked as (
      cell: [number, number],
      event: { preventDefault: () => void },
    ) => void;
    act(() => onCellClicked([0, 1], { preventDefault: vi.fn() }));

    expect(onToggleMarked).toHaveBeenCalledWith(rows[1], true);
  });

  it('forwards candidate cell actions and opens the folder menu action', () => {
    const onCellAction = vi.fn();
    const menuClick = vi.fn();
    const getActionMenuItems = vi.fn(() => [
      { key: 'favorite', label: 'Избранное', onClick: menuClick },
    ]);
    renderGrid({ onCellAction, getActionMenuItems });

    const onCellClicked = glideMock.props?.onCellClicked as (
      cell: [number, number],
      event: {
        preventDefault: () => void;
        bounds: { x: number; y: number; width: number; height: number };
        localEventX: number;
        localEventY: number;
      },
    ) => void;
    act(() => onCellClicked([1, 0], {
      preventDefault: vi.fn(),
      bounds: { x: 10, y: 20, width: 180, height: 28 },
      localEventX: 35,
      localEventY: 14,
    }));
    expect(onCellAction).toHaveBeenCalledWith(rows[0], 'actions', 'apply');

    act(() => onCellClicked([1, 0], {
      preventDefault: vi.fn(),
      bounds: { x: 10, y: 20, width: 180, height: 28 },
      localEventX: 100,
      localEventY: 14,
    }));
    expect(getActionMenuItems).toHaveBeenCalledWith(rows[0], 'actions', 'folder');
    fireEvent.click(screen.getByText('Избранное'));
    expect(menuClick).toHaveBeenCalled();
  });

  it('keeps candidate sort and filter controls wired to page state', async () => {
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

    act(() => onHeaderClicked(2, {
      localEventX: 12,
      bounds: { x: 20, y: 30, width: 180, height: 34 },
      preventDefault: vi.fn(),
    }));
    expect(onSetSort).toHaveBeenCalledWith('cable_mark', 'asc');

    act(() => onHeaderClicked(2, {
      localEventX: 170,
      bounds: { x: 20, y: 30, width: 180, height: 34 },
      preventDefault: vi.fn(),
    }));
    fireEvent.change(await screen.findByLabelText('Поиск: Марка'), {
      target: { value: 'TLT' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Применить' }));
    expect(onSetColumnFilter).toHaveBeenCalledWith('cable_mark', { kind: 'text', value: 'TLT' });
  });
});
