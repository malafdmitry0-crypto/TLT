/**
 * @module heatcalc/page-model
 * @owner heat
 * Orchestration bag for HeatCalcPage shell (hooks + derived state).
 * Workspace query/drafts/data lifecycle: useHeatCalcWorkspaceDataModel (HEAT1).
 * Grid/excel/selection interaction: useHeatCalcInteractionController (HEAT2).
 */
import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import { message as antdMessage } from 'antd';
import { useQueryClient } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';

import { areCommercialFeaturesEnabled } from '@/config/featureFlags';
import { useFocusableTableScrollRegions } from '@/hooks/useFocusableTableScrollRegions';
import { useHeatCalcBulkActions } from '@/pages/heatcalc/useHeatCalcBulkActions';
import { useHeatCalcColumnSettingsDialog } from '@/pages/heatcalc/useHeatCalcColumnSettingsDialog';
import { useHeatCalcContinueToElectrical } from '@/pages/heatcalc/useHeatCalcContinueToElectrical';
import {
  useHeatCalcExcelInteractionState,
} from '@/pages/heatcalc/useHeatCalcExcelInteractionModel';
import { useHeatCalcHeatLossJob } from '@/pages/heatcalc/useHeatCalcHeatLossJob';
import { useHeatCalcInteractionController } from '@/pages/heatcalc/useHeatCalcInteractionController';
import { useHeatCalcObjectEditor } from '@/pages/heatcalc/useHeatCalcObjectEditor';
import { useHeatCalcPreferences } from '@/pages/heatcalc/useHeatCalcPreferences';
import { useHeatCalcRouteActionsModel } from '@/pages/heatcalc/useHeatCalcRouteActionsModel';
import { useHeatCalcRouteShellEffects } from '@/pages/heatcalc/useHeatCalcRouteShellEffects';
import { useHeatCalcTableState } from '@/pages/heatcalc/useHeatCalcTableState';
import { useHeatCalcWizardFormShellModel } from '@/pages/heatcalc/useHeatCalcWizardFormShellModel';
import { useHeatCalcWorkspaceDataModel } from '@/pages/heatcalc/useHeatCalcWorkspaceDataModel';
import { buildHeatCalcLayoutPresentation } from '@/pages/heatcalc/heatCalcLayoutModel';
import { buildHeatCalcToolbarSavePresentation } from '@/pages/heatcalc/heatCalcToolbarSavePresentation';
import type { HeatCalcToolbarEditingMode } from '@/pages/heatcalc/HeatCalcToolbar';
import { useAuthStore } from '@/store/authStore';
import { useProjectStore } from '@/store/projectStore';
import { useWorkspaceHeaderStore } from '@/store/workspaceHeaderStore';
import type { ProjectObject } from '@/types/project';
import { getDefaultFieldInputSettings } from '@/utils/heatCalcFieldInputSettings';

type TableEditingMode = HeatCalcToolbarEditingMode;

export function useHeatCalcPageModel() {
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const project = useProjectStore((s) => s.currentProject);
  const role = useAuthStore((s) => s.role);
  const registeredUserId = useAuthStore((s) => s.user?.id ?? null);
  const isRegisteredUser = role === 'employee' || role === 'admin';
  const [formBlockVisible, setFormBlockVisible] = useState(true);
  const tableState = useHeatCalcTableState({ projectId: project?.id });
  const {
    activeObjectScope, activeObjectQueryCursor, activeTableColumnScope, activeTableObjectType,
    activeTablePage, activeTableViewState, allTableViewState, cleanHiddenColumnStateForSettings,
    clearSelectedRows, handleNormalTableSortChange, isAllObjectScope, mergeNormalLoadedRows,
    normalLoadedRowsByType, rememberObjectQueryCursor, removeNormalLoadedRows, resetColumnFilter,
    resetCurrentTableViewState, resetNormalLoadMoreRequest, selectedRowKeys, selectObjectScope,
    setColumnFilter, setSelectedRowKeys, setTablePage, upsertNormalLoadedRow,
  } = tableState;
  const [tableEditingMode, setTableEditingMode] = useState<TableEditingMode>('normal');
  const commercialFeaturesAvailable = areCommercialFeaturesEnabled();
  const tableFindabilityAvailable = true;
  const closeColumnSettingsRef = useRef<(() => void) | null>(null);
  const closeColumnSettings = useCallback(() => {
    closeColumnSettingsRef.current?.();
  }, []);
  const preferences = useHeatCalcPreferences({
    isRegisteredUser,
    registeredUserId,
    onCloseSettingsModal: closeColumnSettings,
  });
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
  } = preferences;
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

  const workspace = useHeatCalcWorkspaceDataModel({
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
  });

  const {
    handleContinueToElectrical,
    continueToElectricalDisabled,
    continueToElectricalTooltip,
  } = useHeatCalcContinueToElectrical({
    projectId: project?.id,
    objects: workspace.allProjectObjects,
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
    excelModeEnabled: workspace.excelModeEnabled,
    projectObjectCount: workspace.projectObjectCount,
    draftRowsById: workspace.draftRowsById,
    setDraftRowsById: workspace.setDraftRowsById,
    setExcelLocalRows: workspace.setExcelLocalRows,
    onScopeChanged: clearSelectedRows,
    onDirtyEditBlocked: setPendingWizardObject,
  });

  const {
    wizardBaseObject,
    wizardFormObject,
    wizardDraftFieldErrors,
    handleWizardDraftValuesChange,
  } = useHeatCalcWizardFormShellModel({
    allProjectObjects: workspace.allProjectObjects,
    draftRowsById: workspace.draftRowsById,
    visibleTableObjects: workspace.visibleTableObjects,
    wizardState,
    applyWizardDraftValuesChange: workspace.applyWizardDraftValuesChange,
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
    activeTypeTotalCount: workspace.activeTypeTotalCount,
    allFilteredSortedTableRowCount: workspace.allFilteredSortedTableRows.length,
    clearSelectedRows,
    draftRowsById: workspace.draftRowsById,
    excelLocalRows: workspace.excelLocalRows,
    excelModeEnabled: workspace.excelModeEnabled,
    objectQueryFilteredCount: workspace.objectQueryResult?.counts.filtered,
    objectQueryPageSize: workspace.objectQueryResult?.page_info.page_size,
    openEditWizard,
    projectObjectCount: workspace.projectObjectCount,
    removeNormalLoadedRows,
    selectedExcelRows: workspace.selectedExcelRows,
    selectedVisibleRows: workspace.selectedVisibleRows,
    setActiveInlineCell: workspace.setActiveInlineCell,
    setDraftRowsById: workspace.setDraftRowsById,
    setExcelLocalRows: workspace.setExcelLocalRows,
    setExcelSelectionRange,
    setPendingTableFocusObject,
    setSelectedExcelCell,
    setTablePage,
    addObject: add.mutateAsync,
    removeObject: remove.mutate,
    notifySuccess: notifyBulkActionSuccess,
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
    saveTargetCount: workspace.saveTargetCount,
    hasWizard,
    selectedDirtyTarget: workspace.selectedDirtyTarget,
    inlineDraftSaving: workspace.inlineDraftSaving,
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
    dirtyDraftRowCount: workspace.dirtyDraftRowCount,
    projectId: project?.id,
    projectObjectCount: workspace.projectObjectCount,
    selectedRowId,
    selectedVisibleRows: workspace.selectedVisibleRows,
    submittingObject,
  });

  const interaction = useHeatCalcInteractionController({
    table: {
      activeObjectScope,
      activeTableColumnScope,
      activeTableObjectType,
      activeTablePage,
      changeNormalTablePage: tableState.changeNormalTablePage,
      cleanHiddenColumnState: tableState.cleanHiddenColumnState,
      isAllObjectScope,
      loadNextNormalPage: tableState.loadNextNormalPage,
      pruneSelectedRows: tableState.pruneSelectedRows,
      resetColumnFilter,
      selectObjectScope,
      selectedRowKeys,
      setColumnFilter,
    },
    excelInteractionState,
    workspace,
    editor: {
      clearLastSavedObject,
      lastSavedObject,
      selectedRowId: selectedRowId ?? null,
      syncWizardWithRecord,
      wizardBaseObject,
      wizardFormObject,
    },
    focus: {
      pendingTableFocusObject,
      setPendingTableFocusObject,
      setTableEditingMode,
      tableEditingMode,
    },
    resize: {
      applySideFormWidthPct,
      fieldInputSettings,
      persistTableColumnSettings,
      persistTableViewOnly,
      sideWorkspaceRef,
      tableColumnSettingsRef,
      tableFindabilityAvailable,
      tableViewSettingsRef,
      updateTableColumnSettingsDraft,
    },
    notifyInfo: antdMessage.info,
  });
  const { clearExcelSelectionState, ...tableInteraction } = interaction;

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
    activeTypeTotalCount: workspace.activeTypeTotalCount,
    allCount: workspace.projectObjectCount,
    clearExcelSelectionState,
    clearSelectedRows,
    clearWizard,
    closeExcelContextMenu: interaction.closeExcelContextMenu,
    currentTableViewActive: workspace.currentTableViewActive,
    commercialFeaturesAvailable,
    filteredTableCount: workspace.filteredTableCount,
    formBlockVisible,
    pipeCount: workspace.pipeCount,
    resetNewWizard,
    saveDraftRows: workspace.saveDraftRows,
    saveTargetCount: workspace.saveTargetCount,
    saveTargetIds: workspace.saveTargetIds,
    selectedObjectCount,
    selectObjectScope,
    setFormBlockVisible,
    setTableEditingMode,
    tankCount: workspace.tankCount,
    wizardStateType: wizardState?.type,
    notifyInfo: antdMessage.info,
  });

  const {
    isSideFormPlacement,
    sideResizeVisible,
    workspaceLayoutStyle,
  } = buildHeatCalcLayoutPresentation(
    workspace.formPlacement,
    formBlockVisible,
    workspace.sideFormWidthPct,
  );

  return {
    project,
    formBlockVisible,
    formPlacement: workspace.formPlacement,
    wizardState,
    newWizardRevision,
    closeWizard,
    handleWizardSubmit,
    submittingObject,
    excelModeEnabled: workspace.excelModeEnabled,
    wizardBaseObject,
    wizardFormObject,
    draftRowsById: workspace.draftRowsById,
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
    currentTableViewActive: workspace.currentTableViewActive,
    draftControlsVisible: workspace.draftControlsVisible,
    dirtyDraftRowCount: workspace.dirtyDraftRowCount,
    saveTargetCount: workspace.saveTargetCount,
    inlineDraftSaving: workspace.inlineDraftSaving,
    draftDiscardLabel: workspace.draftDiscardLabel,
    selectedObjectCount,
    add,
    handleTableEditingModeChange,
    recalcHeatLossScoped,
    recalcHeatLossAll,
    cancelHeatLossJob,
    columnSettingsDialog,
    resetCurrentTableViewState,
    discardDraftRows: workspace.discardDraftRows,
    saveTargetIds: workspace.saveTargetIds,
    duplicateSelectedObjects,
    role,
    projectObjectCount: workspace.projectObjectCount,
    isSideFormPlacement,
    sideResizeVisible,
    workspaceLayoutStyle,
    sideWorkspaceRef,
    heatLossJobProgressLabel,
    selectedObject,
    calculationDetailsSettings,
    activeTypeTotalCount: workspace.activeTypeTotalCount,
    visibleTableObjects: workspace.visibleTableObjects,
    excelSelectionRange,
    resolvedTableFontSize: workspace.resolvedTableFontSize,
    effectiveActiveTableViewState: workspace.effectiveActiveTableViewState,
    selectedRowKeys,
    selectedRowId,
    extendExcelInputRowsOnScroll: workspace.extendExcelInputRowsOnScroll,
    commitInlineCell: workspace.commitInlineCell,
    setColumnFilter,
    resetColumnFilter,
    handleNormalTableSortChange,
    registerNormalGridDraftInvalidator: workspace.registerNormalGridDraftInvalidator,
    openEditWizard,
    setSelectedRowKeys,
    handleObjectsRowMoved: workspace.handleObjectsRowMoved,
    activeExcelCellPosition: workspace.activeExcelCellPosition,
    selectedExcelRows: workspace.selectedExcelRows,
    isSavableDraftRow: workspace.isSavableDraftRow,
    preferenceSavePending,
    pendingWizardObject,
    saveDraftRows: workspace.saveDraftRows,
    setPendingWizardObject,
    forceOpenEditWizard,
    ...tableInteraction,
  };
}
