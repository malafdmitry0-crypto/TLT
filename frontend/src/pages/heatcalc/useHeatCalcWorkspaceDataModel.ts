/**
 * @module heatcalc/workspace-data-model
 * @owner heat
 * @depends objects data, inline drafts, draft save, reorder, table counts
 * @does-not electrical, InsulationLayersTable, formulas
 *
 * HEAT1: query / drafts / visible-rows / draft-save lifecycle boundary for Heat workspace.
 * Interaction (grid/excel/selection chrome): useHeatCalcInteractionController (HEAT2).
 */
import { useMemo } from 'react';
import type { QueryClient } from '@tanstack/react-query';

import type { HeatCalcExcelCellRef } from '@/hooks/useHeatCalcExcelSelection';
import type {
  Project,
  ProjectObject,
  ProjectObjectsPageCursor,
  ProjectObjectsQueryResponse,
} from '@/types/project';
import {
  createEmptyTableViewState,
  hasActiveTableViewState,
  type HeatCalcTableViewState,
} from '@/utils/heatCalcTableFindability';
import {
  isSavableExcelDraftRow,
} from '@/utils/heatCalcExcelRows';
import type { ExcelSelectionRange } from '@/utils/heatCalcExcelMode';
import type {
  HeatCalcObjectType,
  HeatCalcTableColumnScope,
  HeatCalcTableColumnSettings,
} from '@/utils/heatCalcTableColumns';
import type { HeatCalcTableViewSettings } from '@/utils/heatCalcTableViewSettings';
import type { HeatCalcToolbarEditingMode } from '@/pages/heatcalc/HeatCalcToolbar';
import {
  buildHeatCalcVisibleRowsModel,
  useHeatCalcObjectsDataModel,
} from '@/pages/heatcalc/useHeatCalcObjectsDataModel';
import { useHeatCalcInlineDraftModel } from '@/pages/heatcalc/useHeatCalcInlineDraftModel';
import { useHeatCalcNormalGridDraftInvalidation } from '@/pages/heatcalc/useHeatCalcNormalGridDraftInvalidation';
import { useHeatCalcObjectReorder } from '@/pages/heatcalc/useHeatCalcObjectReorder';
import { useHeatCalcDraftSaveModel } from '@/pages/heatcalc/useHeatCalcDraftSaveModel';
import { buildHeatCalcTableCounts } from '@/pages/heatcalc/heatCalcTableCountsModel';
import { filterVisibleRowsBySelectedKeys } from '@/pages/heatcalc/heatCalcVisibleSelectionModel';
import type {
  ActiveObjectScope,
  NormalLoadedRowsByType,
} from '@/pages/heatcalc/useHeatCalcTableState';

const FINDABILITY_DISABLED_TABLE_VIEW_STATE = createEmptyTableViewState();

export type HeatCalcWorkspaceModeInput = {
  commercialFeaturesAvailable: boolean;
  tableEditingMode: HeatCalcToolbarEditingMode;
  isAllObjectScope: boolean;
  tableFindabilityAvailable: boolean;
  activeTableViewState: HeatCalcTableViewState;
  allTableViewState: HeatCalcTableViewState;
};

/**
 * Pure mode + effective table-view flags for the workspace data pipeline.
 * Kept pure for focused characterization without mounting React Query hooks.
 */
export function buildHeatCalcWorkspaceModeModel({
  commercialFeaturesAvailable,
  tableEditingMode,
  isAllObjectScope,
  tableFindabilityAvailable,
  activeTableViewState,
  allTableViewState,
}: HeatCalcWorkspaceModeInput) {
  const effectiveActiveTableViewState = tableFindabilityAvailable
    ? activeTableViewState
    : FINDABILITY_DISABLED_TABLE_VIEW_STATE;
  const effectiveAllTableViewState = tableFindabilityAvailable
    ? allTableViewState
    : FINDABILITY_DISABLED_TABLE_VIEW_STATE;
  const excelModeEnabled = commercialFeaturesAvailable
    && tableEditingMode === 'excel'
    && !isAllObjectScope;
  const normalGlideEnabled = !excelModeEnabled;
  const tableCellEditingEnabled = excelModeEnabled;
  const currentTableViewActive = tableFindabilityAvailable
    && hasActiveTableViewState(effectiveActiveTableViewState);

  return {
    effectiveActiveTableViewState,
    effectiveAllTableViewState,
    excelModeEnabled,
    normalGlideEnabled,
    tableCellEditingEnabled,
    currentTableViewActive,
    isSavableDraftRow: isSavableExcelDraftRow,
  };
}

export type UseHeatCalcWorkspaceDataModelOptions = {
  project: Project | null | undefined;
  queryClient: QueryClient;
  commercialFeaturesAvailable: boolean;
  tableEditingMode: HeatCalcToolbarEditingMode;
  tableFindabilityAvailable: boolean;
  activeObjectQueryCursor: ProjectObjectsPageCursor | null;
  activeObjectScope: ActiveObjectScope;
  activeTableColumnScope: HeatCalcTableColumnScope;
  activeTableObjectType: HeatCalcObjectType;
  activeTablePage: number;
  activeTableViewState: HeatCalcTableViewState;
  allTableViewState: HeatCalcTableViewState;
  isAllObjectScope: boolean;
  normalLoadedRowsByType: NormalLoadedRowsByType;
  selectedRowKeys: string[];
  tableColumnSettings: HeatCalcTableColumnSettings;
  tableViewSettings: HeatCalcTableViewSettings;
  selectedExcelCell: HeatCalcExcelCellRef;
  excelSelectionRange: ExcelSelectionRange | null;
  clearExcelSelectionForProject: () => void;
  mergeNormalLoadedRows: (
    result: ProjectObjectsQueryResponse | undefined,
    options: { excelModeEnabled: boolean },
  ) => void;
  rememberObjectQueryCursor: (result: ProjectObjectsQueryResponse | undefined) => void;
  resetNormalLoadMoreRequest: () => void;
  upsertNormalLoadedRow: (savedObject: ProjectObject) => void;
};

export function useHeatCalcWorkspaceDataModel({
  project,
  queryClient,
  commercialFeaturesAvailable,
  tableEditingMode,
  tableFindabilityAvailable,
  activeObjectQueryCursor,
  activeObjectScope,
  activeTableColumnScope,
  activeTableObjectType,
  activeTablePage,
  activeTableViewState,
  allTableViewState,
  isAllObjectScope,
  normalLoadedRowsByType,
  selectedRowKeys,
  tableColumnSettings,
  tableViewSettings,
  selectedExcelCell,
  excelSelectionRange,
  clearExcelSelectionForProject,
  mergeNormalLoadedRows,
  rememberObjectQueryCursor,
  resetNormalLoadMoreRequest,
  upsertNormalLoadedRow,
}: UseHeatCalcWorkspaceDataModelOptions) {
  const {
    effectiveActiveTableViewState,
    effectiveAllTableViewState,
    excelModeEnabled,
    normalGlideEnabled,
    tableCellEditingEnabled,
    currentTableViewActive,
    isSavableDraftRow,
  } = buildHeatCalcWorkspaceModeModel({
    commercialFeaturesAvailable,
    tableEditingMode,
    isAllObjectScope,
    tableFindabilityAvailable,
    activeTableViewState,
    allTableViewState,
  });

  const {
    allFilteredSortedTableRows,
    allProjectObjects,
    allProjectObjectsQueryKey,
    columnRenderers,
    editableExcelColumnKeys,
    enumOptionsByColumn,
    fieldCapabilityByKey,
    objectQueryFetching,
    objectQueryKey,
    objectQueryResult,
    pipeCount,
    projectObjectCount,
    resolvedTableFontSize,
    sourceColumnMetas,
    tableValueAccessors,
    tankCount,
    totalCount,
    normalizedTableView,
    visibleAllTableRows,
    visibleTableColumnKeys,
  } = useHeatCalcObjectsDataModel({
    activeObjectQueryCursor,
    activeObjectScope,
    activeTableColumnScope,
    activeTableObjectType,
    activeTablePage,
    activeTableViewState: effectiveActiveTableViewState,
    allTableViewState: effectiveAllTableViewState,
    tableFindabilityEnabled: tableFindabilityAvailable,
    excelModeEnabled,
    isAllObjectScope,
    project,
    queryClient,
    tableColumnSettings,
    tableViewSettings,
    mergeNormalLoadedRows,
    rememberObjectQueryCursor,
    resetNormalLoadMoreRequest,
  });

  const formPlacement = normalizedTableView.formPlacement;
  const sideFormWidthPct = normalizedTableView.sideFormWidthPct;

  const {
    activeInlineCell,
    setActiveInlineCell,
    draftRowsById,
    setDraftRowsById,
    excelLocalRows,
    setExcelLocalRows,
    appendExcelLocalRows,
    extendExcelInputRowsOnScroll,
    discardDraftRows,
    commitInlineCell,
    handleWizardDraftValuesChange: applyWizardDraftValuesChange,
    excelBaseRows,
    excelRows,
    excelTableRows,
    excelRowIds,
    activeExcelCellPosition,
    selectedExcelRows,
  } = useHeatCalcInlineDraftModel({
    projectId: project?.id,
    excelModeEnabled,
    allProjectObjects,
    activeObjectType: activeTableObjectType,
    projectObjectCount,
    tableViewState: effectiveActiveTableViewState,
    tableValueAccessors,
    selectedExcelCell,
    excelSelectionRange,
    editableExcelColumnKeys,
    onProjectReset: clearExcelSelectionForProject,
  });

  const { registerNormalGridDraftInvalidator } = useHeatCalcNormalGridDraftInvalidation(
    draftRowsById,
    excelModeEnabled,
  );

  const {
    baseVisibleTableObjects,
    visibleTableObjects,
    visibleTableRows,
    visibleSourceIndexById,
  } = useMemo(
    () => buildHeatCalcVisibleRowsModel({
      activeTableObjectType,
      excelBaseRows,
      excelModeEnabled,
      excelRows,
      excelTableRows,
      isAllObjectScope,
      normalLoadedRowsByType,
      objectQueryResult,
      visibleAllTableRows,
    }),
    [
      activeTableObjectType,
      excelBaseRows,
      excelModeEnabled,
      excelRows,
      excelTableRows,
      isAllObjectScope,
      normalLoadedRowsByType,
      objectQueryResult,
      visibleAllTableRows,
    ],
  );

  const { handleObjectsRowMoved } = useHeatCalcObjectReorder({
    projectId: project?.id,
    excelModeEnabled,
    visibleTableObjects,
    queryClient,
  });

  const selectedVisibleRows = useMemo(
    () => filterVisibleRowsBySelectedKeys(visibleTableRows, selectedRowKeys),
    [selectedRowKeys, visibleTableRows],
  );

  const { activeTypeTotalCount, filteredTableCount } = buildHeatCalcTableCounts({
    isAllObjectScope,
    projectObjectCount,
    totalCount,
    activeTableObjectType,
    objectQueryCounts: objectQueryResult?.counts,
    excelModeEnabled,
    allFilteredSortedTableRowsLength: allFilteredSortedTableRows.length,
    visibleTableObjectsLength: visibleTableObjects.length,
    baseVisibleTableObjectsLength: baseVisibleTableObjects.length,
  });

  const {
    dirtyDraftRowCount,
    draftControlsVisible,
    draftDiscardLabel,
    inlineDraftSaving,
    saveDraftRows,
    saveTargetCount,
    saveTargetIds,
    selectedDirtyTarget,
  } = useHeatCalcDraftSaveModel({
    allProjectObjects,
    allProjectObjectsQueryKey,
    draftRowsById,
    isSavableDraftRow,
    objectQueryKey,
    project,
    projectObjectCount,
    queryClient,
    selectedRowKeys,
    setDraftRowsById,
    setExcelLocalRows,
    tableCellEditingEnabled,
    upsertNormalLoadedRow,
    visibleTableObjects,
  });

  return {
    // mode / view
    effectiveActiveTableViewState,
    effectiveAllTableViewState,
    excelModeEnabled,
    normalGlideEnabled,
    tableCellEditingEnabled,
    currentTableViewActive,
    isSavableDraftRow,
    formPlacement,
    sideFormWidthPct,
    // objects query projection
    allFilteredSortedTableRows,
    allProjectObjects,
    allProjectObjectsQueryKey,
    columnRenderers,
    editableExcelColumnKeys,
    enumOptionsByColumn,
    fieldCapabilityByKey,
    objectQueryFetching,
    objectQueryKey,
    objectQueryResult,
    pipeCount,
    projectObjectCount,
    resolvedTableFontSize,
    sourceColumnMetas,
    tableValueAccessors,
    tankCount,
    totalCount,
    visibleAllTableRows,
    visibleTableColumnKeys,
    // drafts / excel local rows
    activeInlineCell,
    setActiveInlineCell,
    draftRowsById,
    setDraftRowsById,
    excelLocalRows,
    setExcelLocalRows,
    appendExcelLocalRows,
    extendExcelInputRowsOnScroll,
    discardDraftRows,
    commitInlineCell,
    applyWizardDraftValuesChange,
    excelBaseRows,
    excelRows,
    excelTableRows,
    excelRowIds,
    activeExcelCellPosition,
    selectedExcelRows,
    registerNormalGridDraftInvalidator,
    // visible rows + selection projection
    baseVisibleTableObjects,
    visibleTableObjects,
    visibleTableRows,
    visibleSourceIndexById,
    selectedVisibleRows,
    handleObjectsRowMoved,
    activeTypeTotalCount,
    filteredTableCount,
    // draft save surface
    dirtyDraftRowCount,
    draftControlsVisible,
    draftDiscardLabel,
    inlineDraftSaving,
    saveDraftRows,
    saveTargetCount,
    saveTargetIds,
    selectedDirtyTarget,
  };
}
