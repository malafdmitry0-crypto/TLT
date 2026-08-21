/**
 * Characterization for HEAT2 interaction controller surface.
 * Locks return keys; sub-hooks are stubbed so this stays a composition contract.
 */
import { renderHook } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

const {
  stableGlideCellState,
  stableNormalCellState,
  stableStartInlineEdit,
  stableClearExcelSelectionState,
  stableCloseExcelContextMenu,
  stableRowClassName,
} = vi.hoisted(() => ({
  stableGlideCellState: vi.fn(() => ({ displayValue: '', editable: false })),
  stableNormalCellState: vi.fn(() => ({ displayValue: '', editable: false })),
  stableStartInlineEdit: vi.fn(),
  stableClearExcelSelectionState: vi.fn(),
  stableCloseExcelContextMenu: vi.fn(),
  stableRowClassName: vi.fn(() => 'row-class'),
}));

vi.mock('@/pages/heatcalc/useHeatCalcResizeModel', () => ({
  useHeatCalcResizeModel: () => ({
    handleGlideColumnResize: vi.fn(),
    handleGlideColumnResizeEnd: vi.fn(),
    startColumnResize: vi.fn(),
    startSideFormMouseResize: vi.fn(),
    startSideFormResize: vi.fn(),
  }),
}));

vi.mock('@/pages/heatcalc/useHeatCalcGridModel', () => ({
  useHeatCalcGridModel: () => ({
    selectedRowErrorMessages: [] as string[],
    excelCellDisplayValue: () => '',
    glideGridColumns: [{ id: 'name', title: 'Name', width: 100 }],
    getGlideGridCellState: stableGlideCellState,
    getNormalGlideGridCellState: stableNormalCellState,
  }),
}));

vi.mock('@/pages/heatcalc/useHeatCalcExcelInteractionModel', () => ({
  useHeatCalcExcelInteractionState: () => ({
    selectedExcelCell: null,
    setSelectedExcelCell: vi.fn(),
    excelSelectionRange: null,
    setExcelSelectionRange: vi.fn(),
    excelContextMenu: null,
    setExcelContextMenu: vi.fn(),
    clearExcelSelectionForProject: vi.fn(),
  }),
  useHeatCalcExcelInteractionModel: () => ({
    excelContextMenu: null,
    selectedExcelPosition: null,
    clearExcelSelectionState: stableClearExcelSelectionState,
    selectExcelCellByPosition: vi.fn(),
    setExcelRangeSelection: vi.fn(),
    selectAllExcelCells: vi.fn(),
    beginExcelCellSelection: vi.fn(),
    extendExcelCellSelection: vi.fn(),
    beginExcelRowSelection: vi.fn(),
    extendExcelRowSelection: vi.fn(),
    beginExcelColumnSelection: vi.fn(),
    extendExcelColumnSelection: vi.fn(),
    openExcelCellContextMenu: vi.fn(),
    openExcelRowContextMenu: vi.fn(),
    openExcelRecordContextMenu: vi.fn(),
    closeExcelContextMenu: stableCloseExcelContextMenu,
    copyExcelSelection: vi.fn(),
    clearExcelSelection: vi.fn(),
    cutExcelSelection: vi.fn(),
    pasteExcelFromClipboard: vi.fn(),
    addExcelRowsBelowSelection: vi.fn(),
    resetSelectedExcelRows: vi.fn(),
    startInlineCellEdit: stableStartInlineEdit,
  }),
}));

vi.mock('@/pages/heatcalc/useHeatCalcPageEffectsModel', () => ({
  useHeatCalcPageEffectsModel: vi.fn(),
}));

vi.mock('@/hooks/useHeatCalcTableColumns', () => ({
  useHeatCalcTableColumns: () => ({
    tableColumns: [{ key: 'name', title: 'Name' }],
    tableScrollX: 1200,
    tableScrollY: 400,
  }),
}));

vi.mock('@/pages/heatcalc/useHeatCalcNormalTableInteractionModel', () => ({
  useHeatCalcNormalTableInteractionModel: () => ({
    handleNormalLoadMore: vi.fn(),
    handleNormalTablePageChange: vi.fn(),
    normalInfiniteLoading: false,
    normalTablePagination: false as const,
    tableRowClassName: stableRowClassName,
  }),
}));

import {
  useHeatCalcInteractionController,
  type UseHeatCalcInteractionControllerArgs,
} from '@/pages/heatcalc/useHeatCalcInteractionController';
import { useHeatCalcPageEffectsModel } from '@/pages/heatcalc/useHeatCalcPageEffectsModel';
import { createEmptyTableViewState } from '@/utils/heatCalcTableFindability';
import { getDefaultFieldInputSettings } from '@/utils/heatCalcFieldInputSettings';

const INTERACTION_RETURN_KEYS = [
  'handleGlideColumnResize',
  'handleGlideColumnResizeEnd',
  'startSideFormMouseResize',
  'startSideFormResize',
  'selectedRowErrorMessages',
  'glideGridColumns',
  'getGlideGridCellState',
  'getNormalGlideGridCellState',
  'excelContextMenu',
  'selectedExcelPosition',
  'clearExcelSelectionState',
  'setExcelRangeSelection',
  'openExcelRecordContextMenu',
  'closeExcelContextMenu',
  'copyExcelSelection',
  'clearExcelSelection',
  'cutExcelSelection',
  'pasteExcelFromClipboard',
  'addExcelRowsBelowSelection',
  'resetSelectedExcelRows',
  'startInlineCellEdit',
  'tableColumns',
  'tableScrollX',
  'tableScrollY',
  'handleNormalLoadMore',
  'handleNormalTablePageChange',
  'normalInfiniteLoading',
  'normalTablePagination',
  'tableRowClassName',
] as const;

function baseArgs(
  overrides: Partial<UseHeatCalcInteractionControllerArgs> = {},
): UseHeatCalcInteractionControllerArgs {
  const emptyView = createEmptyTableViewState();
  return {
    table: {
      activeObjectScope: 'pipe',
      activeTableColumnScope: 'pipe',
      activeTableObjectType: 'pipe',
      activeTablePage: 1,
      changeNormalTablePage: vi.fn(),
      cleanHiddenColumnState: vi.fn(),
      isAllObjectScope: false,
      loadNextNormalPage: vi.fn(),
      pruneSelectedRows: vi.fn(),
      resetColumnFilter: vi.fn(),
      selectObjectScope: vi.fn(),
      selectedRowKeys: [],
      setColumnFilter: vi.fn(),
    },
    excelInteractionState: {
      selectedExcelCell: null,
      setSelectedExcelCell: vi.fn(),
      excelSelectionRange: null,
      setExcelSelectionRange: vi.fn(),
      excelContextMenu: null,
      setExcelContextMenu: vi.fn(),
      clearExcelSelectionForProject: vi.fn(),
    },
    workspace: {
      activeExcelCellPosition: null,
      activeInlineCell: null,
      appendExcelLocalRows: vi.fn(() => []),
      columnRenderers: {} as UseHeatCalcInteractionControllerArgs['workspace']['columnRenderers'],
      commitInlineCell: vi.fn(() => null),
      currentTableViewActive: false,
      dirtyDraftRowCount: 0,
      draftRowsById: {},
      editableExcelColumnKeys: [],
      effectiveActiveTableViewState: emptyView,
      enumOptionsByColumn: {} as UseHeatCalcInteractionControllerArgs['workspace']['enumOptionsByColumn'],
      excelLocalRows: [],
      excelModeEnabled: false,
      excelRowIds: [],
      fieldCapabilityByKey: new Map(),
      filteredTableCount: 0,
      formPlacement: 'right',
      isSavableDraftRow: () => false,
      normalGlideEnabled: true,
      objectQueryFetching: false,
      objectQueryResult: undefined,
      selectedExcelRows: [],
      setActiveInlineCell: vi.fn(),
      setDraftRowsById: vi.fn(),
      setExcelLocalRows: vi.fn(),
      sourceColumnMetas: [],
      tableCellEditingEnabled: false,
      visibleSourceIndexById: new Map(),
      visibleTableColumnKeys: [],
      visibleTableObjects: [],
      visibleTableRows: [],
    },
    editor: {
      clearLastSavedObject: vi.fn(),
      lastSavedObject: null,
      selectedRowId: null,
      syncWizardWithRecord: vi.fn(),
      wizardBaseObject: null,
      wizardFormObject: null,
    },
    focus: {
      pendingTableFocusObject: null,
      setPendingTableFocusObject: vi.fn(),
      setTableEditingMode: vi.fn(),
      tableEditingMode: 'normal',
    },
    resize: {
      applySideFormWidthPct: vi.fn((s) => s),
      fieldInputSettings: getDefaultFieldInputSettings(),
      persistTableColumnSettings: vi.fn(),
      persistTableViewOnly: vi.fn(),
      sideWorkspaceRef: { current: null },
      tableColumnSettingsRef: { current: { pipe: {}, tank: {}, all: {} } as never },
      tableFindabilityAvailable: true,
      tableViewSettingsRef: { current: { formPlacement: 'right', sideFormWidthPct: 30 } as never },
      updateTableColumnSettingsDraft: vi.fn(),
    },
    ...overrides,
  };
}

describe('useHeatCalcInteractionController', () => {
  it('exposes a stable grid/excel/selection surface', () => {
    const { result } = renderHook(() => useHeatCalcInteractionController(baseArgs()));
    expect(Object.keys(result.current).sort()).toEqual([...INTERACTION_RETURN_KEYS].sort());
    expect(result.current.tableColumns).toEqual([{ key: 'name', title: 'Name' }]);
    expect(result.current.glideGridColumns).toEqual([{ id: 'name', title: 'Name', width: 100 }]);
    expect(result.current.clearExcelSelectionState).toBe(stableClearExcelSelectionState);
    expect(result.current.closeExcelContextMenu).toBe(stableCloseExcelContextMenu);
    expect(result.current.getGlideGridCellState).toBe(stableGlideCellState);
    expect(result.current.tableRowClassName).toBe(stableRowClassName);
  });

  it('wires selection lifecycle effects with clearExcelSelectionState', () => {
    renderHook(() => useHeatCalcInteractionController(baseArgs()));
    expect(useHeatCalcPageEffectsModel).toHaveBeenCalledWith(
      expect.objectContaining({
        clearExcelSelectionState: stableClearExcelSelectionState,
        tableEditingMode: 'normal',
      }),
    );
  });
});
