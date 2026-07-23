/**
 * @module heatcalc/interaction-controller
 * @owner heat
 * @depends grid model, excel interaction, table columns, normal table interaction,
 *   resize, page selection effects
 * @does-not electrical, InsulationLayersTable, formulas, query/draft save lifecycle
 *
 * HEAT2: grid / excel / selection interaction boundary for Heat workspace.
 * Page model keeps orchestration (data, editor, bulk, toolbar, route chrome).
 */
import type {
  Dispatch,
  RefObject,
  SetStateAction,
} from 'react';

import type { HeatCalcTableColumnRenderSpec } from '@/hooks/useHeatCalcTableColumns';
import { useHeatCalcTableColumns } from '@/hooks/useHeatCalcTableColumns';
import type { HeatCalcExcelCellRef } from '@/hooks/useHeatCalcExcelSelection';
import type {
  ObjectQueryFieldCapability,
  ProjectObject,
  ProjectObjectsQueryResponse,
} from '@/types/project';
import type { ExcelCellPosition } from '@/utils/heatCalcExcelMode';
import type { ExcelLocalProjectObject } from '@/utils/heatCalcExcelRows';
import type { HeatCalcFieldInputSettings } from '@/utils/heatCalcFieldInputSettings';
import type {
  DraftRowsById,
  DraftRowState,
} from '@/utils/heatCalcInlineEdit';
import type {
  HeatCalcColumnKey,
  HeatCalcObjectType,
  HeatCalcResolvedColumnMeta,
  HeatCalcTableColumnScope,
  HeatCalcTableColumnSettings,
} from '@/utils/heatCalcTableColumns';
import type {
  HeatCalcColumnFilter,
  HeatCalcIndexedTableRow,
  HeatCalcTableViewState,
} from '@/utils/heatCalcTableFindability';
import type {
  HeatCalcFormPlacement,
  HeatCalcTableViewSettings,
} from '@/utils/heatCalcTableViewSettings';
import {
  useHeatCalcExcelInteractionModel,
  useHeatCalcExcelInteractionState,
} from '@/pages/heatcalc/useHeatCalcExcelInteractionModel';
import { useHeatCalcGridModel } from '@/pages/heatcalc/useHeatCalcGridModel';
import { useHeatCalcNormalTableInteractionModel } from '@/pages/heatcalc/useHeatCalcNormalTableInteractionModel';
import {
  useHeatCalcPageEffectsModel,
  type HeatCalcPageTableEditingMode,
} from '@/pages/heatcalc/useHeatCalcPageEffectsModel';
import { useHeatCalcResizeModel } from '@/pages/heatcalc/useHeatCalcResizeModel';
import type { ActiveObjectScope } from '@/pages/heatcalc/useHeatCalcTableState';

/** Excel selection primitives owned by the page (fed into HEAT1 data model). */
export type HeatCalcExcelInteractionState = ReturnType<
  typeof useHeatCalcExcelInteractionState
>;

/** Workspace slice required by grid/excel/normal interaction (HEAT1 outputs). */
export type HeatCalcInteractionWorkspaceSlice = {
  activeExcelCellPosition: ExcelCellPosition | null;
  activeInlineCell: HeatCalcExcelCellRef;
  appendExcelLocalRows: (
    count: number,
    insertAfterObjectId?: string | null,
  ) => ExcelLocalProjectObject[];
  columnRenderers: Record<HeatCalcColumnKey, HeatCalcTableColumnRenderSpec>;
  commitInlineCell: (record: ProjectObject, columnKey: string, value: unknown) => string | null;
  currentTableViewActive: boolean;
  dirtyDraftRowCount: number;
  draftRowsById: DraftRowsById;
  editableExcelColumnKeys: string[];
  effectiveActiveTableViewState: HeatCalcTableViewState;
  enumOptionsByColumn: Record<HeatCalcColumnKey, { label: string; value: string }[]>;
  excelLocalRows: ExcelLocalProjectObject[];
  excelModeEnabled: boolean;
  excelRowIds: string[];
  fieldCapabilityByKey: Map<string, ObjectQueryFieldCapability>;
  filteredTableCount: number;
  formPlacement: HeatCalcFormPlacement;
  isSavableDraftRow: (draftRow: DraftRowState | undefined) => boolean;
  normalGlideEnabled: boolean;
  objectQueryFetching: boolean;
  objectQueryResult: ProjectObjectsQueryResponse | undefined;
  selectedExcelRows: HeatCalcIndexedTableRow<ProjectObject>[];
  setActiveInlineCell: Dispatch<SetStateAction<HeatCalcExcelCellRef>>;
  setDraftRowsById: Dispatch<SetStateAction<DraftRowsById>>;
  setExcelLocalRows: Dispatch<SetStateAction<ExcelLocalProjectObject[]>>;
  sourceColumnMetas: HeatCalcResolvedColumnMeta[];
  tableCellEditingEnabled: boolean;
  visibleSourceIndexById: Map<string, number>;
  visibleTableColumnKeys: HeatCalcColumnKey[];
  visibleTableObjects: ProjectObject[];
  visibleTableRows: HeatCalcIndexedTableRow<ProjectObject>[];
};

export type HeatCalcInteractionTableSlice = {
  activeObjectScope: ActiveObjectScope;
  activeTableColumnScope: HeatCalcTableColumnScope;
  activeTableObjectType: HeatCalcObjectType;
  activeTablePage: number;
  changeNormalTablePage: (
    page: number,
    result: ProjectObjectsQueryResponse | undefined,
  ) => void;
  cleanHiddenColumnState: (visibleColumnKeys: HeatCalcColumnKey[]) => void;
  isAllObjectScope: boolean;
  loadNextNormalPage: (
    result: ProjectObjectsQueryResponse | undefined,
    options: { excelModeEnabled: boolean; objectQueryFetching: boolean },
  ) => void;
  pruneSelectedRows: (visibleObjects: ProjectObject[]) => void;
  resetColumnFilter: (columnKey: string) => void;
  selectObjectScope: (scope: ActiveObjectScope) => void;
  selectedRowKeys: string[];
  setColumnFilter: (columnKey: string, filter?: HeatCalcColumnFilter) => void;
};

export type HeatCalcInteractionEditorSlice = {
  clearLastSavedObject: () => void;
  lastSavedObject: ProjectObject | null;
  selectedRowId: string | null;
  syncWizardWithRecord: (record: ProjectObject) => void;
  wizardBaseObject: ProjectObject | null;
  wizardFormObject: ProjectObject | null;
};

export type HeatCalcInteractionFocusSlice = {
  pendingTableFocusObject: ProjectObject | null;
  setPendingTableFocusObject: (object: ProjectObject | null) => void;
  setTableEditingMode: (mode: HeatCalcPageTableEditingMode) => void;
  tableEditingMode: HeatCalcPageTableEditingMode;
};

export type HeatCalcInteractionResizeSlice = {
  applySideFormWidthPct: (widthPct: number) => HeatCalcTableViewSettings;
  fieldInputSettings: HeatCalcFieldInputSettings;
  persistTableColumnSettings: (
    settings: HeatCalcTableColumnSettings,
    options?: { closeModal?: boolean; showMessage?: boolean },
  ) => void;
  persistTableViewOnly: (viewSettings: HeatCalcTableViewSettings) => void;
  sideWorkspaceRef: RefObject<HTMLDivElement | null>;
  tableColumnSettingsRef: { current: HeatCalcTableColumnSettings };
  tableFindabilityAvailable: boolean;
  tableViewSettingsRef: { current: HeatCalcTableViewSettings };
  updateTableColumnSettingsDraft: (
    updater: (settings: HeatCalcTableColumnSettings) => HeatCalcTableColumnSettings,
  ) => void;
};

export type UseHeatCalcInteractionControllerArgs = {
  table: HeatCalcInteractionTableSlice;
  excelInteractionState: HeatCalcExcelInteractionState;
  workspace: HeatCalcInteractionWorkspaceSlice;
  editor: HeatCalcInteractionEditorSlice;
  focus: HeatCalcInteractionFocusSlice;
  resize: HeatCalcInteractionResizeSlice;
  notifyInfo?: (message: string) => void;
};

/**
 * Composes grid cell state, excel selection/clipboard, Ant columns, normal-table
 * nav/row class, column/side resize, and selection lifecycle effects.
 */
export function useHeatCalcInteractionController(
  args: UseHeatCalcInteractionControllerArgs,
) {
  const { table, excelInteractionState, workspace, editor, focus, resize, notifyInfo } = args;
  const {
    activeObjectScope,
    activeTableColumnScope,
    activeTableObjectType,
    activeTablePage,
    changeNormalTablePage,
    cleanHiddenColumnState,
    isAllObjectScope,
    loadNextNormalPage,
    pruneSelectedRows,
    resetColumnFilter,
    selectObjectScope,
    selectedRowKeys,
    setColumnFilter,
  } = table;
  const {
    activeExcelCellPosition,
    activeInlineCell,
    appendExcelLocalRows,
    columnRenderers,
    commitInlineCell,
    currentTableViewActive,
    dirtyDraftRowCount,
    draftRowsById,
    editableExcelColumnKeys,
    effectiveActiveTableViewState,
    enumOptionsByColumn,
    excelLocalRows,
    excelModeEnabled,
    excelRowIds,
    fieldCapabilityByKey,
    filteredTableCount,
    formPlacement,
    isSavableDraftRow,
    normalGlideEnabled,
    objectQueryFetching,
    objectQueryResult,
    selectedExcelRows,
    setActiveInlineCell,
    setDraftRowsById,
    setExcelLocalRows,
    sourceColumnMetas,
    tableCellEditingEnabled,
    visibleSourceIndexById,
    visibleTableColumnKeys,
    visibleTableObjects,
    visibleTableRows,
  } = workspace;
  const {
    clearLastSavedObject,
    lastSavedObject,
    selectedRowId,
    syncWizardWithRecord,
    wizardBaseObject,
    wizardFormObject,
  } = editor;
  const {
    pendingTableFocusObject,
    setPendingTableFocusObject,
    setTableEditingMode,
    tableEditingMode,
  } = focus;
  const {
    applySideFormWidthPct,
    fieldInputSettings,
    persistTableColumnSettings,
    persistTableViewOnly,
    sideWorkspaceRef,
    tableColumnSettingsRef,
    tableFindabilityAvailable,
    tableViewSettingsRef,
    updateTableColumnSettingsDraft,
  } = resize;

  const {
    handleGlideColumnResize,
    handleGlideColumnResizeEnd,
    startColumnResize,
    startSideFormMouseResize,
    startSideFormResize,
  } = useHeatCalcResizeModel({
    activeTableColumnScope,
    applySideFormWidthPct,
    formPlacement,
    persistTableColumnSettings,
    persistTableViewOnly,
    sideWorkspaceRef,
    tableColumnSettingsRef,
    tableViewSettingsRef,
    updateTableColumnSettingsDraft,
  });

  const {
    selectedRowErrorMessages,
    excelCellDisplayValue,
    glideGridColumns,
    getGlideGridCellState,
    getNormalGlideGridCellState,
  } = useHeatCalcGridModel({
    activeTableObjectType,
    sourceColumnMetas,
    fieldCapabilityByKey,
    enumOptionsByColumn,
    columnRenderers,
    draftRowsById,
    editableExcelColumnKeys,
    excelModeEnabled,
    fieldInputSettings,
    isAllObjectScope,
    isSavableDraftRow,
    tableFindabilityEnabled: tableFindabilityAvailable,
    tableCellEditingEnabled,
    visibleTableRows,
    visibleSourceIndexById,
    wizardBaseObject,
    wizardFormObject,
  });

  const {
    excelContextMenu,
    selectedExcelPosition,
    clearExcelSelectionState,
    selectExcelCellByPosition,
    setExcelRangeSelection,
    selectAllExcelCells,
    beginExcelCellSelection,
    extendExcelCellSelection,
    beginExcelRowSelection,
    extendExcelRowSelection,
    beginExcelColumnSelection,
    extendExcelColumnSelection,
    openExcelCellContextMenu,
    openExcelRowContextMenu,
    openExcelRecordContextMenu,
    closeExcelContextMenu,
    copyExcelSelection,
    clearExcelSelection,
    cutExcelSelection,
    pasteExcelFromClipboard,
    addExcelRowsBelowSelection,
    resetSelectedExcelRows,
    startInlineCellEdit,
  } = useHeatCalcExcelInteractionModel({
    ...excelInteractionState,
    activeExcelCellPosition,
    appendExcelLocalRows,
    draftRowsById,
    editableExcelColumnKeys,
    excelCellDisplayValue,
    excelLocalRows,
    excelModeEnabled,
    excelRowIds,
    selectedExcelRows,
    selectedRowId,
    setActiveInlineCell,
    setDraftRowsById,
    setExcelLocalRows,
    sourceColumnMetas,
    syncWizardWithRecord,
    tableCellEditingEnabled,
    visibleTableObjects,
  });

  useHeatCalcPageEffectsModel({
    activeObjectScope,
    activeTableObjectType,
    clearExcelSelectionState,
    clearLastSavedObject,
    cleanHiddenColumnState,
    currentTableViewActive,
    dirtyDraftRowCount,
    isAllObjectScope,
    lastSavedObject,
    pendingTableFocusObject,
    pruneSelectedRows,
    selectObjectScope,
    setPendingTableFocusObject,
    setTableEditingMode,
    tableCellEditingEnabled,
    tableEditingMode,
    visibleTableColumnKeys,
    visibleTableObjects,
    notifyInfo,
  });

  const { tableColumns, tableScrollX, tableScrollY } = useHeatCalcTableColumns({
    activeTableColumnScope,
    activeTableObjectType,
    activeTableViewState: effectiveActiveTableViewState,
    activeInlineCell,
    activeExcelCellPosition,
    beginExcelCellSelection,
    beginExcelColumnSelection,
    beginExcelRowSelection,
    buildTableColumns: excelModeEnabled,
    columnRenderers,
    commitInlineCell,
    draftRowsById,
    enumOptionsByColumn,
    excelCellDisplayValue,
    editableExcelColumnKeys,
    excelModeEnabled,
    excelRowIds,
    excelSelectionRange: excelInteractionState.excelSelectionRange,
    extendExcelCellSelection,
    extendExcelColumnSelection,
    extendExcelRowSelection,
    fieldCapabilityByKey,
    fieldInputSettings,
    formPlacement,
    isAllObjectScope,
    isSavableDraftRow,
    openExcelCellContextMenu,
    openExcelRowContextMenu,
    resetColumnFilter,
    selectAllExcelCells,
    selectExcelCellByPosition,
    selectedExcelPosition,
    setActiveInlineCell,
    setColumnFilter,
    sourceColumnMetas,
    startColumnResize,
    startInlineCellEdit,
    tableFindabilityEnabled: tableFindabilityAvailable,
    tableCellEditingEnabled,
    visibleTableObjectsLength: visibleTableObjects.length,
    visibleTableRows,
  });

  const {
    handleNormalLoadMore,
    handleNormalTablePageChange,
    normalInfiniteLoading,
    normalTablePagination,
    tableRowClassName,
  } = useHeatCalcNormalTableInteractionModel({
    activeTablePage,
    changeNormalTablePage,
    columnRenderers,
    draftRowsById,
    excelModeEnabled,
    filteredTableCount,
    isAllObjectScope,
    isSavableDraftRow,
    loadNextNormalPage,
    normalGlideEnabled,
    objectQueryFetching,
    objectQueryResult,
    selectedRowId,
    selectedRowKeys,
    sourceColumnMetas,
    visibleTableObjectsLength: visibleTableObjects.length,
    visibleTableRows,
  });

  return {
    handleGlideColumnResize,
    handleGlideColumnResizeEnd,
    startSideFormMouseResize,
    startSideFormResize,
    selectedRowErrorMessages,
    glideGridColumns,
    getGlideGridCellState,
    getNormalGlideGridCellState,
    excelContextMenu,
    selectedExcelPosition,
    clearExcelSelectionState,
    setExcelRangeSelection,
    openExcelRecordContextMenu,
    closeExcelContextMenu,
    copyExcelSelection,
    clearExcelSelection,
    cutExcelSelection,
    pasteExcelFromClipboard,
    addExcelRowsBelowSelection,
    resetSelectedExcelRows,
    startInlineCellEdit,
    tableColumns,
    tableScrollX,
    tableScrollY,
    handleNormalLoadMore,
    handleNormalTablePageChange,
    normalInfiniteLoading,
    normalTablePagination,
    tableRowClassName,
  };
}
