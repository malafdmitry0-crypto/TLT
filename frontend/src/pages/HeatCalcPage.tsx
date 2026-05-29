import {
  lazy,
  Suspense,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
} from 'react';
import {
  Alert,
  Space,
  message as antdMessage,
} from 'antd';
import { FireOutlined } from '@ant-design/icons';
import { useQueryClient } from '@tanstack/react-query';

import EmptyProjectState from '@/components/common/EmptyProjectState';
import HeatCalcExcelContextMenu from '@/components/heatcalc/HeatCalcExcelContextMenu';
import HeatCalcObjectsTableCard from '@/components/heatcalc/HeatCalcObjectsTableCard';
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
  hasActiveTableViewState,
} from '@/utils/heatCalcTableFindability';
import {
  isSavableExcelDraftRow,
} from '@/utils/heatCalcExcelRows';
import {
  HeatCalcActionsToolbar,
  HeatCalcTypeToolbar,
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
import HeatCalcAssumptionsPanel from '@/pages/heatcalc/HeatCalcAssumptionsPanel';
import HeatCalcSelectedRowErrorsOverlay from '@/pages/heatcalc/HeatCalcSelectedRowErrorsOverlay';
import { useHeatCalcResizeModel } from '@/pages/heatcalc/useHeatCalcResizeModel';
import { useHeatCalcDraftSaveModel } from '@/pages/heatcalc/useHeatCalcDraftSaveModel';
import HeatCalcUnsavedChangesModals from '@/pages/heatcalc/HeatCalcUnsavedChangesModals';
import {
  useHeatCalcExcelInteractionModel,
  useHeatCalcExcelInteractionState,
} from '@/pages/heatcalc/useHeatCalcExcelInteractionModel';
import { useHeatCalcNormalTableInteractionModel } from '@/pages/heatcalc/useHeatCalcNormalTableInteractionModel';
import {
  preloadHeatCalcObjectWizard,
} from '@/pages/heatcalc/HeatCalcWizardFormPanel';
import HeatCalcWizardFormPanel from '@/pages/heatcalc/HeatCalcWizardFormPanel';
import { useHeatCalcWizardFormShellModel } from '@/pages/heatcalc/useHeatCalcWizardFormShellModel';
import {
  buildHeatCalcVisibleRowsModel,
  useHeatCalcObjectsDataModel,
} from '@/pages/heatcalc/useHeatCalcObjectsDataModel';
import { useHeatCalcPageEffectsModel } from '@/pages/heatcalc/useHeatCalcPageEffectsModel';
import { useHeatCalcRouteActionsModel } from '@/pages/heatcalc/useHeatCalcRouteActionsModel';

const ColumnSettingsModal = lazy(() => import('@/components/heatcalc/ColumnSettingsModal'));

type TableEditingMode = HeatCalcToolbarEditingMode;

function PipeTypeIcon() {
  return (
    <svg className="object-type-svg" viewBox="0 0 16 16" aria-hidden="true" focusable="false">
      <path d="M2.5 6h11v4h-11z" />
      <path d="M1.5 5v6M14.5 5v6" />
      <path d="M5 4.5v7M11 4.5v7" />
    </svg>
  );
}

function TankTypeIcon() {
  return (
    <svg className="object-type-svg" viewBox="0 0 16 16" aria-hidden="true" focusable="false">
      <path d="M4 4.5c0-1 8-1 8 0v7c0 1-8 1-8 0z" />
      <path d="M4 4.5c0 1 8 1 8 0" />
      <path d="M4 11.5c0 1 8 1 8 0" />
    </svg>
  );
}

export default function HeatCalcPage() {
  const queryClient = useQueryClient();
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
  const resetInlineDraftActiveCellRef = useRef<(() => void) | null>(null);
  const handleInlineEditingDisabled = useCallback(() => {
    resetInlineDraftActiveCellRef.current?.();
  }, []);
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
    fieldInputSettings,
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
    onInlineEditingDisabled: handleInlineEditingDisabled,
    onCloseSettingsModal: closeColumnSettings,
  });
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

  useEffect(() => {
    setWorkspaceHeaderContext(null);
  }, [setWorkspaceHeaderContext]);

  useEffect(() => {
    if (!project) return undefined;
    const win = window as Window & {
      requestIdleCallback?: (callback: () => void, options?: { timeout?: number }) => number;
      cancelIdleCallback?: (handle: number) => void;
    };
    const preload = () => {
      preloadHeatCalcObjectWizard();
    };
    if (win.requestIdleCallback) {
      const handle = win.requestIdleCallback(preload, { timeout: 2_000 });
      return () => win.cancelIdleCallback?.(handle);
    }
    const handle = window.setTimeout(preload, 0);
    return () => window.clearTimeout(handle);
  }, [project]);

  const excelModeEnabled = tableEditingMode === 'excel' && !isAllObjectScope;
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
    activeTableViewState,
    allTableViewState,
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
    tableViewState: activeTableViewState,
    tableValueAccessors,
    selectedExcelCell,
    excelSelectionRange,
    editableExcelColumnKeys,
    onProjectReset: clearExcelSelectionForProject,
  });

  useEffect(() => {
    resetInlineDraftActiveCellRef.current = () => setActiveInlineCell(null);
    return () => {
      if (resetInlineDraftActiveCellRef.current) {
        resetInlineDraftActiveCellRef.current = null;
      }
    };
  }, [setActiveInlineCell]);

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
    () => visibleTableRows.filter(({ record }) => selectedRowKeys.includes(record.id)),
    [selectedRowKeys, visibleTableRows],
  );
  const currentTableViewActive = hasActiveTableViewState(activeTableViewState);
  const activeTypeTotalCount = isAllObjectScope
    ? projectObjectCount
    : objectQueryResult?.counts.by_type[activeTableObjectType] ?? totalCount;
  const filteredTableCount = isAllObjectScope
    ? allFilteredSortedTableRows.length
    : excelModeEnabled
      ? visibleTableObjects.length
      : objectQueryResult?.counts.filtered ?? baseVisibleTableObjects.length;
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
  const inlineEditingEnabled = normalizedTableView.inlineEditingEnabled;
  const tableCellEditingEnabled = inlineEditingEnabled || excelModeEnabled;
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
    fieldInputSettings,
    dirtyDraftRowCount,
    cleanHiddenColumnStateForSettings,
    persistTableSettings,
  });

  useEffect(() => {
    closeColumnSettingsRef.current = columnSettingsDialog.close;
    return () => {
      if (closeColumnSettingsRef.current === columnSettingsDialog.close) {
        closeColumnSettingsRef.current = null;
      }
    };
  }, [columnSettingsDialog.close]);

  const toolbarSaveDisabled = saveTargetCount === 0 && !hasWizard;
  const toolbarSaveLoading = inlineDraftSaving || submittingObject;
  const toolbarSaveTooltip = saveTargetCount > 0
    ? selectedDirtyTarget
      ? `Сохранить выбранные строки (${saveTargetCount})`
      : `Сохранить несохранённые строки (${saveTargetCount})`
    : hasWizard
      ? 'Сохранить объект'
      : 'Нет изменений для сохранения';
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
    activeTableViewState,
    activeInlineCell,
    activeExcelCellPosition,
    beginExcelCellSelection,
    beginExcelColumnSelection,
    beginExcelRowSelection,
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
    tableCellEditingEnabled,
    visibleTableObjectsLength: visibleTableObjects.length,
    visibleTableRows,
  });

  function renderTypeBar() {
    return (
      <HeatCalcTypeToolbar
        activeObjectScope={activeObjectScope}
        pipeButtonCountText={pipeButtonCountText}
        tankButtonCountText={tankButtonCountText}
        allButtonCountText={allButtonCountText}
        pipeIcon={<PipeTypeIcon />}
        tankIcon={<TankTypeIcon />}
        formBlockVisible={formBlockVisible}
        formCaptionMode={formCaptionMode}
        formCaptionModeLabel={formCaptionModeLabel}
        onObjectScopeChange={handleObjectScopeChange}
        onFormBlockVisibilityChange={handleFormBlockVisibilityChange}
      />
    );
  }

  function renderActionsBar() {
    return (
      <HeatCalcActionsToolbar
        formActions={{
          visible: formBlockVisible,
          saveTooltip: toolbarSaveTooltip,
          saveDisabled: toolbarSaveDisabled,
          saveLoading: toolbarSaveLoading,
          deleteTargetCount,
          deleteLoading: remove.isPending,
          onAdd: openAddWizard,
          onSave: handleToolbarSave,
          onDeleteSelected: removeSelectedObjects,
        }}
        tableActions={{
          editingMode: tableEditingMode,
          recalcTooltip: heatLossRecalcTooltip,
          recalcAriaLabel: heatLossRecalcAriaLabel,
          recalcLoading: heatLossBatchPending || isHeatLossJobActive,
          recalcDisabled: heatLossScopedRecalcDisabled || heatLossBatchPending,
          recalcAllTooltip: heatLossRecalcAllTooltip,
          recalcAllDisabled: heatLossRecalcDisabled || heatLossBatchPending,
          jobActive: isHeatLossJobActive,
          jobId: activeHeatLossJobId,
          cancelJobLoading: cancelHeatLossJobPending,
          currentTableViewActive,
          draftControlsVisible,
          dirtyDraftRowCount,
          saveTargetCount,
          inlineDraftSaving,
          draftDiscardLabel,
          selectedObjectCount,
          duplicateLoading: add.isPending,
          onEditingModeChange: handleTableEditingModeChange,
          onRecalcScoped: recalcHeatLossScoped,
          onRecalcAll: recalcHeatLossAll,
          onCancelJob: cancelHeatLossJob,
          onOpenSettings: columnSettingsDialog.open,
          onResetCurrentTableView: resetCurrentTableViewState,
          onDiscardDrafts: () => discardDraftRows(saveTargetIds),
          onDuplicateSelected: duplicateSelectedObjects,
        }}
        importExport={{
          projectId: project!.id,
          projectName: project!.name,
          existingObjectCount: projectObjectCount,
          canExport: role === 'employee',
        }}
      />
    );
  }

  function renderHeatLossJobAlert() {
    if (!isHeatLossJobActive) return null;
    return (
      <Alert
        type="info"
        showIcon
        className="heatcalc-job-alert"
        message={`Пересчёт теплопотерь выполняется · ${heatLossJobProgressLabel}`}
      />
    );
  }

  const isSideFormPlacement = formPlacement === 'left' || formPlacement === 'right';
  const sideResizeVisible = isSideFormPlacement && formBlockVisible;
  const workspaceLayoutStyle = isSideFormPlacement
    ? ({ '--heatcalc-side-form-width': `${sideFormWidthPct}%` } as CSSProperties)
    : undefined;

  function renderSideResizeHandle() {
    if (!sideResizeVisible) return null;
    return (
      <div
        className="heatcalc-side-resize-handle"
        role="separator"
        aria-label="Изменить ширину областей"
        aria-orientation="vertical"
        tabIndex={0}
        onPointerDown={startSideFormResize}
        onMouseDown={startSideFormMouseResize}
      />
    );
  }

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

  const formPanel = (
    <HeatCalcWizardFormPanel
      formBlockVisible={formBlockVisible}
      formPlacement={formPlacement}
      wizardState={wizardState}
      newWizardRevision={newWizardRevision}
      closeWizard={closeWizard}
      handleWizardSubmit={handleWizardSubmit}
      submittingObject={submittingObject}
      excelModeEnabled={excelModeEnabled}
      wizardBaseObject={wizardBaseObject}
      wizardFormObject={wizardFormObject}
      draftRowsById={draftRowsById}
      wizardDraftFieldErrors={wizardDraftFieldErrors}
      fieldInputSettings={fieldInputSettings}
      formSectionWeights={tableViewSettings.formSectionWeights}
      onFormSectionWeightsChange={applyFormSectionWeights}
      onFormSectionWeightsCommit={commitFormSectionWeights}
      onDraftValuesChange={handleWizardDraftValuesChange}
    />
  );

  if (!project) {
    return (
      <EmptyProjectState
        icon={<FireOutlined style={{ marginRight: 8, color: '#e06c1e' }} />}
        title="Расчёт теплопотерь"
        description="Шаг 1 из 4. Добавьте объекты (трубопроводы, резервуары) вручную или импортом из Excel / CSV — система автоматически рассчитает тепловые потери."
      />
    );
  }

  return (
    <>
      <div className="heatcalc-workspace-shell">
        <HeatCalcSelectedRowErrorsOverlay messages={selectedRowErrorMessages} />
        <Space direction="vertical" size={5} style={{ width: '100%' }}>
          {!isSideFormPlacement && renderTypeBar()}

          {formPlacement === 'top' && formPanel}

          {!isSideFormPlacement && renderActionsBar()}
          {!isSideFormPlacement && renderHeatLossJobAlert()}

          <div
            ref={sideWorkspaceRef}
            className={`heatcalc-workspace-layout heatcalc-workspace-layout--${formPlacement}`}
            style={workspaceLayoutStyle}
          >
            {formPlacement === 'left' && formPanel}
            {formPlacement === 'left' && renderSideResizeHandle()}
            <div className="heatcalc-table-pane">
              {isSideFormPlacement && renderTypeBar()}
              {isSideFormPlacement && renderActionsBar()}
              {isSideFormPlacement && renderHeatLossJobAlert()}
              <HeatCalcAssumptionsPanel
                selectedObject={selectedObject}
                calculationDetailsSettings={calculationDetailsSettings}
              />

              <HeatCalcObjectsTableCard
                activeObjectScope={activeObjectScope}
                activeTypeTotalCount={activeTypeTotalCount}
                columns={tableColumns}
                currentTableViewActive={currentTableViewActive}
                dataSource={visibleTableObjects}
                excelModeEnabled={excelModeEnabled}
                excelSelectionRange={excelSelectionRange}
                fontSizeKey={resolvedTableFontSize.key}
                glideColumns={glideGridColumns}
                normalInfiniteLoading={normalInfiniteLoading}
                normalPagination={normalTablePagination}
                activeTableViewState={activeTableViewState}
                selectedExcelPosition={selectedExcelPosition}
                selectedExcelRowIndex={selectedExcelPosition?.rowIndex ?? null}
                selectedRowKeys={selectedRowKeys}
                tableScrollX={tableScrollX}
                tableScrollY={tableScrollY}
                activeRowId={selectedRowId ?? null}
                onExcelRowSecondaryAction={openExcelRecordContextMenu}
                onExcelReachScrollEnd={extendExcelInputRowsOnScroll}
                onExcelSetRangeSelection={setExcelRangeSelection}
                onGlideCellCommit={commitInlineCell}
                onGlideCellState={getGlideGridCellState}
                onGlideCellStartEdit={startInlineCellEdit}
                onGlideColumnResize={handleGlideColumnResize}
                onGlideColumnResizeEnd={handleGlideColumnResizeEnd}
                onNormalGlideCellState={getNormalGlideGridCellState}
                onNormalSetColumnFilter={setColumnFilter}
                onNormalResetColumnFilter={resetColumnFilter}
                onNormalSetSort={handleNormalTableSortChange}
                onNormalLoadMore={handleNormalLoadMore}
                onNormalPageChange={handleNormalTablePageChange}
                onOpenEditWizard={openEditWizard}
                onResetCurrentTableViewState={resetCurrentTableViewState}
                onSelectedRowKeysChange={setSelectedRowKeys}
                rowClassName={tableRowClassName}
              />
            </div>
            {formPlacement === 'right' && renderSideResizeHandle()}
            {formPlacement === 'right' && formPanel}
          </div>
          {formPlacement === 'bottom' && formPanel}
        </Space>
      </div>

      <HeatCalcExcelContextMenu
        excelModeEnabled={excelModeEnabled}
        contextMenu={excelContextMenu}
        selectionRange={excelSelectionRange}
        activeCell={activeExcelCellPosition}
        selectedRows={selectedExcelRows}
        draftRowsById={draftRowsById}
        isSavableDraftRow={isSavableDraftRow}
        closeContextMenu={closeExcelContextMenu}
        copySelection={copyExcelSelection}
        cutSelection={cutExcelSelection}
        pasteFromClipboard={pasteExcelFromClipboard}
        clearSelection={clearExcelSelection}
        addRowsBelowSelection={addExcelRowsBelowSelection}
        removeSelectedRows={removeSelectedObjects}
        resetSelectedRows={resetSelectedExcelRows}
      />

      {columnSettingsDialog.isOpen && (
        <Suspense fallback={null}>
          <ColumnSettingsModal
            open={columnSettingsDialog.isOpen}
            activeType={columnSettingsDialog.activeType}
            draftColumnSettings={columnSettingsDialog.draftColumnSettings}
            draftViewSettings={columnSettingsDialog.draftViewSettings}
            draftCalculationDetailsSettings={columnSettingsDialog.draftCalculationDetailsSettings}
            draftFieldInputSettings={columnSettingsDialog.draftFieldInputSettings}
            confirmLoading={preferenceSavePending}
            onTypeChange={columnSettingsDialog.setActiveType}
            onOk={columnSettingsDialog.apply}
            onCancel={columnSettingsDialog.close}
            onSelectAllColumns={columnSettingsDialog.selectAllDraftColumns}
            onResetColumns={columnSettingsDialog.resetDraftColumns}
            onVisibleChange={columnSettingsDialog.updateDraftColumn}
            onOrderChange={columnSettingsDialog.updateDraftColumnOrder}
            onWidthChange={columnSettingsDialog.updateDraftColumnWidth}
            onResetWidth={columnSettingsDialog.resetDraftColumnWidth}
            onColumnReorder={columnSettingsDialog.reorderDraftColumn}
            onFontSizeChange={columnSettingsDialog.updateDraftTableFontSize}
            onTableLabelFormatChange={columnSettingsDialog.updateDraftTableLabelFormat}
            onSettingsLabelFormatChange={columnSettingsDialog.updateDraftSettingsLabelFormat}
            onFormPlacementChange={columnSettingsDialog.updateDraftFormPlacement}
            onInlineEditingEnabledChange={columnSettingsDialog.updateDraftInlineEditingEnabled}
            onResetFontSize={columnSettingsDialog.resetDraftTableFontSize}
            onResetLabelFormats={columnSettingsDialog.resetDraftLabelFormats}
            onCalculationDetailsPresetChange={columnSettingsDialog.updateDraftCalculationDetailsPreset}
            onCalculationDetailMetricsChange={columnSettingsDialog.updateDraftCalculationDetailMetrics}
            onResetCalculationDetails={columnSettingsDialog.resetDraftCalculationDetails}
            onFieldStepChange={columnSettingsDialog.updateDraftFieldStep}
            onResetFieldStep={columnSettingsDialog.resetDraftFieldStep}
          />
        </Suspense>
      )}
      <HeatCalcUnsavedChangesModals
        pendingInlineDisableOpen={columnSettingsDialog.pendingInlineDisableSettings != null}
        pendingWizardObject={pendingWizardObject}
        inlineDraftSaving={inlineDraftSaving}
        cancelPendingInlineDisable={columnSettingsDialog.cancelPendingInlineDisable}
        discardPendingInlineDisable={columnSettingsDialog.discardPendingInlineDisable}
        savePendingInlineDisable={columnSettingsDialog.savePendingInlineDisable}
        discardDraftRows={discardDraftRows}
        saveDraftRows={saveDraftRows}
        setPendingWizardObject={setPendingWizardObject}
        forceOpenEditWizard={forceOpenEditWizard}
      />
    </>
  );
}
