/**
 * Characterization for ELEC1 main-table controller surface.
 * Locks return keys and navigation total resolution; sub-hooks are stubbed so
 * this stays a thin composition contract rather than a full integration suite.
 */
import { renderHook } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import type { CableTypeKey } from '@/domain/electrical/elecCalcMainTableModel';

const {
  stableTableChange,
  stableStartCellEdit,
  stableCommitCell,
  stableCellAction,
  stableCellState,
  stableRowClassName,
  stableCopyValue,
  stableIsEditable,
  stableGetCellActions,
} = vi.hoisted(() => ({
  stableTableChange: vi.fn(),
  stableStartCellEdit: vi.fn(),
  stableCommitCell: vi.fn(() => null),
  stableCellAction: vi.fn(),
  stableCellState: vi.fn(() => ({ displayValue: '', editable: false })),
  stableRowClassName: vi.fn(() => 'row-class'),
  stableCopyValue: vi.fn(() => 'copy'),
  stableIsEditable: vi.fn(() => false),
  stableGetCellActions: vi.fn(),
}));

vi.mock('@/pages/electrical/useElecCalcAntTableHandlers', () => ({
  useElecCalcAntTableHandlers: () => ({
    handleElectricalTableChange: stableTableChange,
  }),
}));
vi.mock('@/pages/electrical/useElecCalcElectricalColumnRenderers', () => ({
  useElecCalcElectricalColumnRenderers: () => ({
    name: { align: 'left' },
  }),
}));
vi.mock('@/pages/electrical/useElecCalcElectricalColumns', () => ({
  useElecCalcElectricalColumns: () => [{ key: 'name', title: 'Name' }],
}));
vi.mock('@/pages/electrical/useElecCalcGlideColumnModel', () => ({
  useElecCalcGlideColumnModel: () => ({
    electricalGlideColumns: [{ id: 'name', title: 'Name', width: 100 }],
    candidateGlideColumnMetaByKey: new Map([['mark', { key: 'mark', align: 'left' }]]),
    electricalCandidateGlideColumns: [{ id: 'mark', title: 'Mark', width: 80 }],
  }),
}));
vi.mock('@/pages/electrical/useElecCalcElectricalColumnCopyValue', () => ({
  useElecCalcElectricalColumnCopyValue: () => stableCopyValue,
}));
vi.mock('@/pages/electrical/useElecCalcGlideLayoutCommit', () => ({
  useElecCalcGlideLayoutCommit: () => ({
    isElectricalLayoutCellEditable: stableIsEditable,
    handleElectricalGlideStartCellEdit: stableStartCellEdit,
    handleElectricalGlideCommitCell: stableCommitCell,
  }),
}));
vi.mock('@/pages/electrical/useElecCalcGlideActions', () => ({
  useElecCalcGlideActions: () => ({
    getElectricalGlideCellActions: stableGetCellActions,
    handleElectricalGlideCellAction: stableCellAction,
  }),
}));
vi.mock('@/pages/electrical/useElecCalcGlideCellState', () => ({
  useElecCalcGlideCellState: () => stableCellState,
}));
vi.mock('@/pages/electrical/useElecCalcSelectedRowsClipboardEffect', () => ({
  useElecCalcSelectedRowsClipboardEffect: vi.fn(),
}));
vi.mock('@/pages/electrical/useElecCalcTableDimensions', () => ({
  useElecCalcTableDimensions: () => ({
    electricalTableScrollX: 1400,
    electricalTableScrollY: 'max(320px, calc(100vh - 230px))',
  }),
}));
vi.mock('@/pages/electrical/useElecCalcRowClassName', () => ({
  useElecCalcRowClassName: () => stableRowClassName,
}));

import { useElecCalcTableNavigation } from '@/pages/electrical/useElecCalcTableNavigation';
import {
  useElecCalcMainTableController,
  type UseElecCalcMainTableControllerArgs,
} from '@/pages/electrical/useElecCalcMainTableController';

vi.mock('@/pages/electrical/useElecCalcTableNavigation', async () => {
  const actual = await vi.importActual<
    typeof import('@/pages/electrical/useElecCalcTableNavigation')
  >('@/pages/electrical/useElecCalcTableNavigation');
  return {
    useElecCalcTableNavigation: vi.fn(actual.useElecCalcTableNavigation),
  };
});

const MAIN_TABLE_RETURN_KEYS = [
  'candidateGlideColumnMetaByKey',
  'electricalCandidateGlideColumns',
  'electricalColumns',
  'electricalGlideColumns',
  'electricalInfiniteLoading',
  'electricalPagination',
  'electricalRowClassName',
  'electricalTableScrollX',
  'electricalTableScrollY',
  'getElectricalGlideCellState',
  'handleElectricalGlideCellAction',
  'handleElectricalGlideCommitCell',
  'handleElectricalGlideLoadMore',
  'handleElectricalGlidePageChange',
  'handleElectricalGlideStartCellEdit',
  'handleElectricalTableChange',
] as const;

function baseArgs(
  overrides: Partial<UseElecCalcMainTableControllerArgs> = {},
): UseElecCalcMainTableControllerArgs {
  return {
    activeRowId: null,
    activateRowId: vi.fn(),
    canMutate: true,
    calcByObjectId: {},
    candidateEnumOptionsByColumn: {},
    effectiveSource: 'builtin',
    electricalDisplayOffset: 0,
    electricalGlideEnabled: true,
    electricalLayoutMutate: vi.fn(),
    enumOptionsByColumn: {},
    fieldCapabilityByKey: new Map(),
    filteredCount: 12,
    getCalculatedCableTypeForObject: vi.fn(() => null),
    getObjectActionDisabledReason: vi.fn(() => null),
    getObjectCalculationDisabledReason: vi.fn(() => null),
    getSavedCableTypeForObject: vi.fn((): CableTypeKey => 'self_regulating'),
    hasNextPage: true,
    isCableMarkPending: false,
    isElectricalPageFetching: false,
    loadNextElectricalGlidePage: vi.fn(),
    nextElectricalPageCursor: { sort_order: 10, id: 'o-10' },
    objects: [
      {
        id: 'o-1',
        project_id: 'p-1',
        object_type: 'pipe',
        sort_order: 1,
        version: 1,
        params: {},
        results: {},
        is_valid: true,
        validation_errors: null,
        created_at: '2026-01-01T00:00:00.000Z',
        updated_at: '2026-01-01T00:00:00.000Z',
      },
    ],
    openCableMarkModal: vi.fn(),
    openCableSizingModal: vi.fn(),
    pageSummary: {
      total_objects: 42,
    } as UseElecCalcMainTableControllerArgs['pageSummary'],
    projectSelected: true,
    recalc: {
      aggressiveProduct: false,
      connectionType: 'line_1ph',
      heatingHeight: null,
      layingStep: null,
      maintainTemperature: null,
      supplyVoltage: null,
      vaporTemperature: null,
      windingCoefficient: null,
    },
    selectedRowKeys: [],
    setColumnFilter: vi.fn(),
    setTablePage: vi.fn(),
    setTablePageSize: vi.fn(),
    setTableViewState: vi.fn(),
    startColumnResize: vi.fn(),
    resetColumnFilter: vi.fn(),
    tablePage: 1,
    tablePageSize: 50,
    tableViewState: {
      filters: {},
      sort: undefined,
    },
    visibleCandidateColumnMetas: [],
    visibleElectricalColumnMetas: [],
    ...overrides,
  };
}

describe('useElecCalcMainTableController', () => {
  it('exposes a stable main-table return surface', () => {
    const { result } = renderHook(() => useElecCalcMainTableController(baseArgs()));

    expect(Object.keys(result.current).sort()).toEqual([...MAIN_TABLE_RETURN_KEYS].sort());
    expect(typeof result.current.handleElectricalTableChange).toBe('function');
    expect(typeof result.current.handleElectricalGlidePageChange).toBe('function');
    expect(typeof result.current.handleElectricalGlideLoadMore).toBe('function');
    expect(typeof result.current.handleElectricalGlideCommitCell).toBe('function');
    expect(typeof result.current.getElectricalGlideCellState).toBe('function');
    expect(typeof result.current.electricalRowClassName).toBe('function');
    expect(result.current.electricalColumns).toEqual([{ key: 'name', title: 'Name' }]);
    expect(result.current.electricalTableScrollX).toBe(1400);
  });

  it('resolves navigation totalObjects from pageSummary.total_objects', () => {
    renderHook(() => useElecCalcMainTableController(baseArgs({
      pageSummary: { total_objects: 42 } as UseElecCalcMainTableControllerArgs['pageSummary'],
      objects: baseArgs().objects,
      filteredCount: 12,
    })));

    expect(useElecCalcTableNavigation).toHaveBeenCalledWith(
      expect.objectContaining({
        totalObjects: 42,
        filteredCount: 12,
        loadedObjectsCount: 1,
        electricalGlideEnabled: true,
      }),
    );
  });

  it('falls back navigation totalObjects to loaded objects length', () => {
    renderHook(() => useElecCalcMainTableController(baseArgs({
      pageSummary: undefined,
    })));

    expect(useElecCalcTableNavigation).toHaveBeenCalledWith(
      expect.objectContaining({
        totalObjects: 1,
        loadedObjectsCount: 1,
      }),
    );
  });

  it('keeps identity-sensitive handlers stable when args identity is stable', () => {
    const args = baseArgs();
    const { result, rerender } = renderHook(
      (props: UseElecCalcMainTableControllerArgs) => useElecCalcMainTableController(props),
      { initialProps: args },
    );

    const first = {
      page: result.current.handleElectricalGlidePageChange,
      loadMore: result.current.handleElectricalGlideLoadMore,
      rowClass: result.current.electricalRowClassName,
      cellState: result.current.getElectricalGlideCellState,
    };

    rerender(args);

    expect(result.current.handleElectricalGlidePageChange).toBe(first.page);
    expect(result.current.handleElectricalGlideLoadMore).toBe(first.loadMore);
    expect(result.current.electricalRowClassName).toBe(first.rowClass);
    expect(result.current.getElectricalGlideCellState).toBe(first.cellState);
  });
});
