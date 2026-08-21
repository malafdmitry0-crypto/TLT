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
import type { HeatCalcTableViewState } from '@/utils/heatCalcTableFindability';
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
import {
  buildHeatCalcWorkspaceModeModel,
  type HeatCalcWorkspaceModeInput,
} from '@/pages/heatcalc/heatCalcWorkspaceModeModel';

export type { HeatCalcWorkspaceModeInput };
export { buildHeatCalcWorkspaceModeModel };

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
  const mode = buildHeatCalcWorkspaceModeModel({
    commercialFeaturesAvailable,
    tableEditingMode,
    isAllObjectScope,
    tableFindabilityAvailable,
    activeTableViewState,
    allTableViewState,
  });
  const {
    effectiveActiveTableViewState,
    effectiveAllTableViewState,
    excelModeEnabled,
    normalGlideEnabled,
    tableCellEditingEnabled,
    currentTableViewActive,
    isSavableDraftRow,
  } = mode;

  const objects = useHeatCalcObjectsDataModel({
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

  const formPlacement = objects.normalizedTableView.formPlacement;
  const sideFormWidthPct = objects.normalizedTableView.sideFormWidthPct;

  const drafts = useHeatCalcInlineDraftModel({
    projectId: project?.id,
    excelModeEnabled,
    allProjectObjects: objects.allProjectObjects,
    activeObjectType: activeTableObjectType,
    projectObjectCount: objects.projectObjectCount,
    tableViewState: effectiveActiveTableViewState,
    tableValueAccessors: objects.tableValueAccessors,
    selectedExcelCell,
    excelSelectionRange,
    editableExcelColumnKeys: objects.editableExcelColumnKeys,
    onProjectReset: clearExcelSelectionForProject,
  });

  const { registerNormalGridDraftInvalidator } = useHeatCalcNormalGridDraftInvalidation(
    drafts.draftRowsById,
    excelModeEnabled,
  );

  const visible = useMemo(
    () => buildHeatCalcVisibleRowsModel({
      activeTableObjectType,
      excelBaseRows: drafts.excelBaseRows,
      excelModeEnabled,
      excelRows: drafts.excelRows,
      excelTableRows: drafts.excelTableRows,
      isAllObjectScope,
      normalLoadedRowsByType,
      objectQueryResult: objects.objectQueryResult,
      visibleAllTableRows: objects.visibleAllTableRows,
    }),
    [
      activeTableObjectType,
      drafts.excelBaseRows,
      drafts.excelRows,
      drafts.excelTableRows,
      excelModeEnabled,
      isAllObjectScope,
      normalLoadedRowsByType,
      objects.objectQueryResult,
      objects.visibleAllTableRows,
    ],
  );

  const { handleObjectsRowMoved } = useHeatCalcObjectReorder({
    projectId: project?.id,
    excelModeEnabled,
    visibleTableObjects: visible.visibleTableObjects,
    queryClient,
  });

  const selectedVisibleRows = useMemo(
    () => filterVisibleRowsBySelectedKeys(visible.visibleTableRows, selectedRowKeys),
    [selectedRowKeys, visible.visibleTableRows],
  );

  const counts = buildHeatCalcTableCounts({
    isAllObjectScope,
    projectObjectCount: objects.projectObjectCount,
    totalCount: objects.totalCount,
    activeTableObjectType,
    objectQueryCounts: objects.objectQueryResult?.counts,
    excelModeEnabled,
    allFilteredSortedTableRowsLength: objects.allFilteredSortedTableRows.length,
    visibleTableObjectsLength: visible.visibleTableObjects.length,
    baseVisibleTableObjectsLength: visible.baseVisibleTableObjects.length,
  });

  const draftSave = useHeatCalcDraftSaveModel({
    allProjectObjects: objects.allProjectObjects,
    allProjectObjectsQueryKey: objects.allProjectObjectsQueryKey,
    draftRowsById: drafts.draftRowsById,
    isSavableDraftRow,
    objectQueryKey: objects.objectQueryKey,
    project,
    projectObjectCount: objects.projectObjectCount,
    queryClient,
    selectedRowKeys,
    setDraftRowsById: drafts.setDraftRowsById,
    setExcelLocalRows: drafts.setExcelLocalRows,
    tableCellEditingEnabled,
    upsertNormalLoadedRow,
    visibleTableObjects: visible.visibleTableObjects,
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
    allFilteredSortedTableRows: objects.allFilteredSortedTableRows,
    allProjectObjects: objects.allProjectObjects,
    allProjectObjectsQueryKey: objects.allProjectObjectsQueryKey,
    columnRenderers: objects.columnRenderers,
    editableExcelColumnKeys: objects.editableExcelColumnKeys,
    enumOptionsByColumn: objects.enumOptionsByColumn,
    fieldCapabilityByKey: objects.fieldCapabilityByKey,
    objectQueryFetching: objects.objectQueryFetching,
    objectQueryKey: objects.objectQueryKey,
    objectQueryResult: objects.objectQueryResult,
    pipeCount: objects.pipeCount,
    projectObjectCount: objects.projectObjectCount,
    resolvedTableFontSize: objects.resolvedTableFontSize,
    sourceColumnMetas: objects.sourceColumnMetas,
    tableValueAccessors: objects.tableValueAccessors,
    tankCount: objects.tankCount,
    totalCount: objects.totalCount,
    visibleAllTableRows: objects.visibleAllTableRows,
    visibleTableColumnKeys: objects.visibleTableColumnKeys,
    workspaceLoadState: objects.workspaceLoadState,
    // drafts / excel local rows
    activeInlineCell: drafts.activeInlineCell,
    setActiveInlineCell: drafts.setActiveInlineCell,
    draftRowsById: drafts.draftRowsById,
    setDraftRowsById: drafts.setDraftRowsById,
    excelLocalRows: drafts.excelLocalRows,
    setExcelLocalRows: drafts.setExcelLocalRows,
    appendExcelLocalRows: drafts.appendExcelLocalRows,
    extendExcelInputRowsOnScroll: drafts.extendExcelInputRowsOnScroll,
    discardDraftRows: drafts.discardDraftRows,
    commitInlineCell: drafts.commitInlineCell,
    applyWizardDraftValuesChange: drafts.handleWizardDraftValuesChange,
    excelBaseRows: drafts.excelBaseRows,
    excelRows: drafts.excelRows,
    excelTableRows: drafts.excelTableRows,
    excelRowIds: drafts.excelRowIds,
    activeExcelCellPosition: drafts.activeExcelCellPosition,
    selectedExcelRows: drafts.selectedExcelRows,
    registerNormalGridDraftInvalidator,
    // visible rows + selection projection
    baseVisibleTableObjects: visible.baseVisibleTableObjects,
    visibleTableObjects: visible.visibleTableObjects,
    visibleTableRows: visible.visibleTableRows,
    visibleSourceIndexById: visible.visibleSourceIndexById,
    selectedVisibleRows,
    handleObjectsRowMoved,
    activeTypeTotalCount: counts.activeTypeTotalCount,
    filteredTableCount: counts.filteredTableCount,
    // draft save surface
    dirtyDraftRowCount: draftSave.dirtyDraftRowCount,
    draftControlsVisible: draftSave.draftControlsVisible,
    draftDiscardLabel: draftSave.draftDiscardLabel,
    inlineDraftSaving: draftSave.inlineDraftSaving,
    saveDraftRows: draftSave.saveDraftRows,
    saveTargetCount: draftSave.saveTargetCount,
    saveTargetIds: draftSave.saveTargetIds,
    selectedDirtyTarget: draftSave.selectedDirtyTarget,
  };
}
