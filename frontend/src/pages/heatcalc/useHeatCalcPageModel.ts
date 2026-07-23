/**
 * @module heatcalc/page-model
 * @owner heat
 * Orchestration bag for HeatCalcPage shell (hooks + derived state).
 */
import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import {
  message as antdMessage,
} from 'antd';
import { useQueryClient } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';

import { areCommercialFeaturesEnabled } from '@/config/featureFlags';
import { useAuthStore } from '@/store/authStore';
import { useProjectStore } from '@/store/projectStore';
import { useWorkspaceHeaderStore } from '@/store/workspaceHeaderStore';
import { useFocusableTableScrollRegions } from '@/hooks/useFocusableTableScrollRegions';
import {
  useHeatCalcObjectEditor,
} from '@/pages/heatcalc/useHeatCalcObjectEditor';
import { useHeatCalcPreferences } from '@/pages/heatcalc/useHeatCalcPreferences';
import {
  useHeatCalcTableColumns,
} from '@/hooks/useHeatCalcTableColumns';
import type { ProjectObject } from '@/types/project';
import {
  createEmptyTableViewState,
  hasActiveTableViewState,
} from '@/utils/heatCalcTableFindability';
import {
  isSavableExcelDraftRow,
} from '@/utils/heatCalcExcelRows';
import {
  getDefaultFieldInputSettings,
} from '@/utils/heatCalcFieldInputSettings';
import {
  type HeatCalcToolbarEditingMode,
} from '@/pages/heatcalc/HeatCalcToolbar';
import {
  useHeatCalcTableState,
} from '@/pages/heatcalc/useHeatCalcTableState';
import { useHeatCalcColumnSettingsDialog } from '@/pages/heatcalc/useHeatCalcColumnSettingsDialog';
import { useHeatCalcInlineDraftModel } from '@/pages/heatcalc/useHeatCalcInlineDraftModel';
import { useHeatCalcGridModel } from '@/pages/heatcalc/useHeatCalcGridModel';
import { useHeatCalcBulkActions } from '@/pages/heatcalc/useHeatCalcBulkActions';
import { useHeatCalcHeatLossJob } from '@/pages/heatcalc/useHeatCalcHeatLossJob';
import { useHeatCalcResizeModel } from '@/pages/heatcalc/useHeatCalcResizeModel';
import { useHeatCalcDraftSaveModel } from '@/pages/heatcalc/useHeatCalcDraftSaveModel';
import {
  useHeatCalcExcelInteractionModel,
  useHeatCalcExcelInteractionState,
} from '@/pages/heatcalc/useHeatCalcExcelInteractionModel';
import { useHeatCalcNormalTableInteractionModel } from '@/pages/heatcalc/useHeatCalcNormalTableInteractionModel';
import { useHeatCalcWizardFormShellModel } from '@/pages/heatcalc/useHeatCalcWizardFormShellModel';
import {
  buildHeatCalcVisibleRowsModel,
  useHeatCalcObjectsDataModel,
} from '@/pages/heatcalc/useHeatCalcObjectsDataModel';
import { useHeatCalcPageEffectsModel } from '@/pages/heatcalc/useHeatCalcPageEffectsModel';
import { useHeatCalcRouteActionsModel } from '@/pages/heatcalc/useHeatCalcRouteActionsModel';
import { useHeatCalcRouteShellEffects } from '@/pages/heatcalc/useHeatCalcRouteShellEffects';
import { useHeatCalcObjectReorder } from '@/pages/heatcalc/useHeatCalcObjectReorder';
import { useHeatCalcContinueToElectrical } from '@/pages/heatcalc/useHeatCalcContinueToElectrical';
import { buildHeatCalcTableCounts } from '@/pages/heatcalc/heatCalcTableCountsModel';
import { buildHeatCalcToolbarSavePresentation } from '@/pages/heatcalc/heatCalcToolbarSavePresentation';
import { buildHeatCalcLayoutPresentation } from '@/pages/heatcalc/heatCalcLayoutModel';
import { useHeatCalcNormalGridDraftInvalidation } from '@/pages/heatcalc/useHeatCalcNormalGridDraftInvalidation';
import { filterVisibleRowsBySelectedKeys } from '@/pages/heatcalc/heatCalcVisibleSelectionModel';

type TableEditingMode = HeatCalcToolbarEditingMode;
const COMMERCIAL_FEATURES_DISABLED_TABLE_VIEW_STATE = createEmptyTableViewState();


export function useHeatCalcPageModel() {
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const project = useProjectStore((s) => s.currentProject);
  const role = useAuthStore((s) => s.role);
  const registeredUserId = useAuthStore((s) => s.user?.id ?? null);
  const isRegisteredUser = role === 'employee' || role === 'admin';
  const [formBlockVisible, setFormBlockVisible] = useState(true);
  const {
    activeObjectScope,
    activeObjectQueryCursor,
    activeTableColumnScope,
    activeTableObjectType,
    activeTablePage,
    activeTableViewState,
    allTableViewState,
    changeNormalTablePage,
    cleanHiddenColumnState,
    cleanHiddenColumnStateForSettings,
    clearSelectedRows,
    handleNormalTableSortChange,
    isAllObjectScope,
    loadNextNormalPage,
    mergeNormalLoadedRows,
    normalLoadedRowsByType,
    pruneSelectedRows,
    rememberObjectQueryCursor,
    removeNormalLoadedRows,
    resetColumnFilter,
    resetCurrentTableViewState,
    resetNormalLoadMoreRequest,
    selectedRowKeys,
    selectObjectScope,
    setColumnFilter,
    setSelectedRowKeys,
    setTablePage,
    upsertNormalLoadedRow,
  } = useHeatCalcTableState({ projectId: project?.id });
  const [tableEditingMode, setTableEditingMode] = useState<TableEditingMode>('normal');
  const commercialFeaturesAvailable = areCommercialFeaturesEnabled();
  const tableFindabilityAvailable = true;
  const closeColumnSettingsRef = useRef<(() => void) | null>(null);
  const closeColumnSettings = useCallback(() => {
    closeColumnSettingsRef.current?.();
  }, []);
  const {
    tableColumnSettings,
    tableColumnSettingsRef,
    tableViewSettings,
    tableViewSettingsRef,
    calculationDetailsSettings,
    preferenceSavePending,
    persistTableColumnSettings,
    persistTableSettings,
    persistTableViewOnly,
    updateTableColumnSettingsDraft,
    applySideFormWidthPct,
    applyFormSectionWeights,
    commitFormSectionWeights,
  } = useHeatCalcPreferences({
    isRegisteredUser,
    registeredUserId,
    onCloseSettingsModal: closeColumnSettings,
  });
  const fieldInputSettings = useMemo(() => getDefaultFieldInputSettings(), []);
  const sideWorkspaceRef = useRef<HTMLDivElement | null>(null);
  useFocusableTableScrollRegions(sideWorkspaceRef, 'Таблица расчёта теплопотерь', Boolean(project));
  const excelInteractionState = useHeatCalcExcelInteractionState();
  const {
    selectedExcelCell,
    setSelectedExcelCell,
    excelSelectionRange,
    setExcelSelectionRange,
    clearExcelSelectionForProject,
  } = excelInteractionState;
  const [pendingWizardObject, setPendingWizardObject] = useState<ProjectObject | null>(null);
  const [pendingTableFocusObject, setPendingTableFocusObject] = useState<ProjectObject | null>(null);
  const setWorkspaceHeaderContext = useWorkspaceHeaderStore((s) => s.setContext);

  useHeatCalcRouteShellEffects({
    projectPresent: Boolean(project),
    setWorkspaceHeaderContext,
  });

  const effectiveActiveTableViewState = tableFindabilityAvailable
    ? activeTableViewState
    : COMMERCIAL_FEATURES_DISABLED_TABLE_VIEW_STATE;
  const effectiveAllTableViewState = tableFindabilityAvailable
    ? allTableViewState
    : COMMERCIAL_FEATURES_DISABLED_TABLE_VIEW_STATE;
  const excelModeEnabled = commercialFeaturesAvailable && tableEditingMode === 'excel' && !isAllObjectScope;
  const normalGlideEnabled = !excelModeEnabled;

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

  const {
    handleContinueToElectrical,
    continueToElectricalDisabled,
    continueToElectricalTooltip,
  } = useHeatCalcContinueToElectrical({
    projectId: project?.id,
    objects: allProjectObjects,
    navigate,
  });

  const {
    add,
    remove,
    wizardState,
    newWizardRevision,
    lastSavedObject,
    resetNewWizard,
    clearWizard,
    closeWizard,
    openAddWizard,
    openEditWizard,
    forceOpenEditWizard,
    handleWizardSubmit,
    syncWizardWithRecord,
    clearLastSavedObject,
    selectedRowId,
    selectedObject,
    formCaptionMode,
    formCaptionModeLabel,
    hasWizard,
    submittingObject,
  } = useHeatCalcObjectEditor({
    projectId: project?.id,
    activeObjectScope,
    activeTableObjectType,
    formBlockVisible,
    excelModeEnabled,
    projectObjectCount,
    draftRowsById,
    setDraftRowsById,
    setExcelLocalRows,
    onScopeChanged: clearSelectedRows,
    onDirtyEditBlocked: setPendingWizardObject,
  });

  const {
    wizardBaseObject,
    wizardFormObject,
    wizardDraftFieldErrors,
    handleWizardDraftValuesChange,
  } = useHeatCalcWizardFormShellModel({
    allProjectObjects,
    draftRowsById,
    visibleTableObjects,
    wizardState,
    applyWizardDraftValuesChange,
  });
  const selectedVisibleRows = useMemo(
    () => filterVisibleRowsBySelectedKeys(visibleTableRows, selectedRowKeys),
    [selectedRowKeys, visibleTableRows],
  );
  const currentTableViewActive = tableFindabilityAvailable && hasActiveTableViewState(effectiveActiveTableViewState);
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
  const notifyBulkActionSuccess = useCallback((message: string) => {
    void antdMessage.success(message);
  }, []);
  const {
    selectedObjectCount,
    deleteTargetCount,
    duplicateSelectedObjects,
    removeSelectedObjects,
  } = useHeatCalcBulkActions({
    activeObjectScope,
    activeTypeTotalCount,
    allFilteredSortedTableRowCount: allFilteredSortedTableRows.length,
    clearSelectedRows,
    draftRowsById,
    excelLocalRows,
    excelModeEnabled,
    objectQueryFilteredCount: objectQueryResult?.counts.filtered,
    objectQueryPageSize: objectQueryResult?.page_info.page_size,
    openEditWizard,
    projectObjectCount,
    removeNormalLoadedRows,
    selectedExcelRows,
    selectedVisibleRows,
    setActiveInlineCell,
    setDraftRowsById,
    setExcelLocalRows,
    setExcelSelectionRange,
    setPendingTableFocusObject,
    setSelectedExcelCell,
    setTablePage,
    addObject: add.mutateAsync,
    removeObject: remove.mutate,
    notifySuccess: notifyBulkActionSuccess,
  });
  const tableCellEditingEnabled = excelModeEnabled;
  const isSavableDraftRow = isSavableExcelDraftRow;
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
  const columnSettingsDialog = useHeatCalcColumnSettingsDialog({
    activeTableColumnScope,
    tableColumnSettings,
    tableViewSettings,
    calculationDetailsSettings,
    cleanHiddenColumnStateForSettings,
    persistTableSettings,
  });

  useEffect(() => {
    if (!commercialFeaturesAvailable && tableEditingMode === 'excel') {
      setTableEditingMode('normal');
    }
  }, [commercialFeaturesAvailable, tableEditingMode]);

  useEffect(() => {
    closeColumnSettingsRef.current = columnSettingsDialog.close;
    return () => {
      if (closeColumnSettingsRef.current === columnSettingsDialog.close) {
        closeColumnSettingsRef.current = null;
      }
    };
  }, [columnSettingsDialog.close]);

  const {
    toolbarSaveDisabled,
    toolbarSaveLoading,
    toolbarSaveTooltip,
  } = buildHeatCalcToolbarSavePresentation({
    saveTargetCount,
    hasWizard,
    selectedDirtyTarget,
    inlineDraftSaving,
    submittingObject,
  });
  const {
    activeHeatLossJobId,
    isHeatLossJobActive,
    heatLossJobProgressLabel,
    heatLossRecalcDisabled,
    heatLossScopedRecalcDisabled,
    heatLossRecalcTooltip,
    heatLossRecalcAriaLabel,
    heatLossRecalcAllTooltip,
    heatLossBatchPending,
    cancelHeatLossJobPending,
    recalcScoped: recalcHeatLossScoped,
    recalcAll: recalcHeatLossAll,
    cancelJob: cancelHeatLossJob,
  } = useHeatCalcHeatLossJob({
    dirtyDraftRowCount,
    projectId: project?.id,
    projectObjectCount,
    selectedRowId,
    selectedVisibleRows,
    submittingObject,
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
    selectedRowId: selectedRowId ?? null,
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
    notifyInfo: antdMessage.info,
  });

  const {
    allButtonCountText,
    handleFormBlockVisibilityChange,
    handleObjectScopeChange,
    handleTableEditingModeChange,
    handleToolbarSave,
    pipeButtonCountText,
    tankButtonCountText,
  } = useHeatCalcRouteActionsModel({
    activeObjectScope,
    activeTableObjectType,
    activeTypeTotalCount,
    allCount: projectObjectCount,
    clearExcelSelectionState,
    clearSelectedRows,
    clearWizard,
    closeExcelContextMenu,
    currentTableViewActive,
    commercialFeaturesAvailable,
    filteredTableCount,
    formBlockVisible,
    pipeCount,
    resetNewWizard,
    saveDraftRows,
    saveTargetCount,
    saveTargetIds,
    selectedObjectCount,
    selectObjectScope,
    setFormBlockVisible,
    setTableEditingMode,
    tankCount,
    wizardStateType: wizardState?.type,
    notifyInfo: antdMessage.info,
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
    excelSelectionRange,
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
    isSideFormPlacement,
    sideResizeVisible,
    workspaceLayoutStyle,
  } = buildHeatCalcLayoutPresentation(formPlacement, formBlockVisible, sideFormWidthPct);

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
    selectedRowId: selectedRowId ?? null,
    selectedRowKeys,
    sourceColumnMetas,
    visibleTableObjectsLength: visibleTableObjects.length,
    visibleTableRows,
  });

  return {
    project,
    formBlockVisible,
    formPlacement,
    wizardState,
    newWizardRevision,
    closeWizard,
    handleWizardSubmit,
    submittingObject,
    excelModeEnabled,
    wizardBaseObject,
    wizardFormObject,
    draftRowsById,
    wizardDraftFieldErrors,
    fieldInputSettings,
    tableViewSettings,
    applyFormSectionWeights,
    commitFormSectionWeights,
    handleWizardDraftValuesChange,
    activeObjectScope,
    pipeButtonCountText,
    tankButtonCountText,
    allButtonCountText,
    formCaptionMode,
    formCaptionModeLabel,
    handleObjectScopeChange,
    handleFormBlockVisibilityChange,
    handleContinueToElectrical,
    continueToElectricalDisabled,
    continueToElectricalTooltip,
    toolbarSaveTooltip,
    toolbarSaveDisabled,
    toolbarSaveLoading,
    deleteTargetCount,
    remove,
    openAddWizard,
    handleToolbarSave,
    removeSelectedObjects,
    tableEditingMode,
    commercialFeaturesAvailable,
    tableFindabilityAvailable,
    heatLossRecalcTooltip,
    heatLossRecalcAriaLabel,
    heatLossBatchPending,
    isHeatLossJobActive,
    heatLossScopedRecalcDisabled,
    heatLossRecalcAllTooltip,
    heatLossRecalcDisabled,
    activeHeatLossJobId,
    cancelHeatLossJobPending,
    currentTableViewActive,
    draftControlsVisible,
    dirtyDraftRowCount,
    saveTargetCount,
    inlineDraftSaving,
    draftDiscardLabel,
    selectedObjectCount,
    add,
    handleTableEditingModeChange,
    recalcHeatLossScoped,
    recalcHeatLossAll,
    cancelHeatLossJob,
    columnSettingsDialog,
    resetCurrentTableViewState,
    discardDraftRows,
    saveTargetIds,
    duplicateSelectedObjects,
    role,
    projectObjectCount,
    isSideFormPlacement,
    sideResizeVisible,
    workspaceLayoutStyle,
    sideWorkspaceRef,
    heatLossJobProgressLabel,
    selectedObject,
    calculationDetailsSettings,
    activeTypeTotalCount,
    tableColumns,
    visibleTableObjects,
    excelSelectionRange,
    resolvedTableFontSize,
    glideGridColumns,
    normalInfiniteLoading,
    normalTablePagination,
    effectiveActiveTableViewState,
    selectedExcelPosition,
    selectedRowKeys,
    tableScrollX,
    tableScrollY,
    selectedRowId,
    openExcelRecordContextMenu,
    extendExcelInputRowsOnScroll,
    setExcelRangeSelection,
    commitInlineCell,
    getGlideGridCellState,
    startInlineCellEdit,
    handleGlideColumnResize,
    handleGlideColumnResizeEnd,
    getNormalGlideGridCellState,
    setColumnFilter,
    resetColumnFilter,
    handleNormalTableSortChange,
    handleNormalLoadMore,
    handleNormalTablePageChange,
    registerNormalGridDraftInvalidator,
    openEditWizard,
    setSelectedRowKeys,
    handleObjectsRowMoved,
    tableRowClassName,
    selectedRowErrorMessages,
    startSideFormResize,
    startSideFormMouseResize,
    excelContextMenu,
    activeExcelCellPosition,
    selectedExcelRows,
    isSavableDraftRow,
    closeExcelContextMenu,
    copyExcelSelection,
    cutExcelSelection,
    pasteExcelFromClipboard,
    clearExcelSelection,
    addExcelRowsBelowSelection,
    resetSelectedExcelRows,
    preferenceSavePending,
    pendingWizardObject,
    saveDraftRows,
    setPendingWizardObject,
    forceOpenEditWizard,
  };
}
