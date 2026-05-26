import { describe, expect, it, vi } from 'vitest';
import { renderHook } from '@testing-library/react';

import {
  buildExcelSelectionLookup,
  isExcelCellSelectedByLookup,
  useHeatCalcTableColumns,
} from '@/hooks/useHeatCalcTableColumns';
import { createExcelSelectionRange } from '@/utils/heatCalcExcelMode';
import { getDefaultFieldInputSettings } from '@/utils/heatCalcFieldInputSettings';
import type { HeatCalcResolvedColumnMeta } from '@/utils/heatCalcTableColumns';

const tableMeta = {
  key: 'name',
  field: 'name',
  labels: { short: 'Name', full: 'Name', compact: 'Name' },
  label: 'Name',
  title: 'Name',
  group: 'General',
  width: 120,
  widthPct: 12,
  defaultWidthPct: 12,
  minWidthPx: 48,
  visible: true,
  sortable: true,
  filterable: true,
} satisfies HeatCalcResolvedColumnMeta;

function renderColumnsWithState(activeTableViewState: Parameters<typeof useHeatCalcTableColumns>[0]['activeTableViewState']) {
  return renderHook(() => useHeatCalcTableColumns({
    activeTableColumnScope: 'pipe',
    activeTableObjectType: 'pipe',
    activeTableViewState,
    activeInlineCell: null,
    activeExcelCellPosition: null,
    beginExcelCellSelection: vi.fn(),
    beginExcelColumnSelection: vi.fn(),
    beginExcelRowSelection: vi.fn(),
    columnRenderers: {
      name: {
        copyValue: () => '',
        render: () => null,
      },
    },
    commitInlineCell: vi.fn(),
    draftRowsById: {},
    enumOptionsByColumn: {},
    excelCellDisplayValue: () => '',
    editableExcelColumnKeys: ['name'],
    excelModeEnabled: false,
    excelRowIds: [],
    excelSelectionRange: null,
    extendExcelCellSelection: vi.fn(),
    extendExcelColumnSelection: vi.fn(),
    extendExcelRowSelection: vi.fn(),
    fieldCapabilityByKey: new Map(),
    fieldInputSettings: getDefaultFieldInputSettings(),
    formPlacement: 'top',
    isAllObjectScope: false,
    isSavableDraftRow: () => false,
    openExcelCellContextMenu: vi.fn(),
    openExcelRowContextMenu: vi.fn(),
    resetColumnFilter: vi.fn(),
    selectAllExcelCells: vi.fn(),
    selectExcelCellByPosition: vi.fn(),
    selectedExcelPosition: null,
    setActiveInlineCell: vi.fn(),
    setColumnFilter: vi.fn(),
    sourceColumnMetas: [tableMeta],
    startColumnResize: vi.fn(),
    startInlineCellEdit: vi.fn(),
    tableCellEditingEnabled: false,
    visibleTableObjectsLength: 0,
    visibleTableRows: [],
  }));
}

describe('useHeatCalcTableColumns selection lookup', () => {
  it('checks selected Excel cells through precomputed indexes without per-cell indexOf', () => {
    const rowIds = ['r0', 'r1', 'r2', 'r3'];
    const columnKeys = ['c0', 'c1', 'c2', 'c3'];
    const indexOfSpy = vi.spyOn(Array.prototype, 'indexOf');
    const lookup = buildExcelSelectionLookup(
      createExcelSelectionRange(
        { rowId: 'r1', columnKey: 'c1' },
        { rowId: 'r2', columnKey: 'c2' },
      ),
      rowIds,
      columnKeys,
    );

    const selected = isExcelCellSelectedByLookup(lookup, 'r2', 'c2');
    const outside = isExcelCellSelectedByLookup(lookup, 'r3', 'c2');
    const missing = isExcelCellSelectedByLookup(lookup, 'missing', 'c2');
    const indexOfCallCount = indexOfSpy.mock.calls.length;
    indexOfSpy.mockRestore();

    expect(selected).toBe(true);
    expect(outside).toBe(false);
    expect(missing).toBe(false);
    expect(indexOfCallCount).toBe(0);
  });

  it('marks Ant table header action cells only for active sort and filter state', () => {
    const { result } = renderColumnsWithState({
      filters: { name: { kind: 'text', value: 'Pipe' } },
      sort: { columnKey: 'name', direction: 'asc' },
    });

    const headerProps = result.current.tableColumns[0].onHeaderCell?.(tableMeta);

    expect(headerProps?.className).toContain('heatcalc-table-header-actions-cell');
    expect(headerProps?.className).toContain('heatcalc-table-header-actions-cell--sort-active');
    expect(headerProps?.className).toContain('heatcalc-table-header-actions-cell--filter-active');
  });
});
