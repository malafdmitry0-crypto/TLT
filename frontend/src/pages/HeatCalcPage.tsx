import QueryError from '@/components/common/QueryError';
import HeatCalcObjectsTableCard from '@/components/heatcalc/HeatCalcObjectsTableCard';
import HeatCalcAssumptionsPanel from '@/pages/heatcalc/HeatCalcAssumptionsPanel';
import HeatCalcSelectedRowErrorsOverlay from '@/pages/heatcalc/HeatCalcSelectedRowErrorsOverlay';
import HeatCalcWizardFormPanel from '@/pages/heatcalc/HeatCalcWizardFormPanel';
import HeatCalcEmptyProjectState from '@/pages/heatcalc/HeatCalcEmptyProjectState';
import { HeatCalcWorkspaceLayout } from '@/pages/heatcalc/HeatCalcWorkspaceLayout';
import { HeatCalcPageOverlays } from '@/pages/heatcalc/HeatCalcPageOverlays';
import {
  buildHeatCalcActionsBar,
  buildHeatCalcJobAlert,
  buildHeatCalcTypeBar,
} from '@/pages/heatcalc/HeatCalcPageToolbars';
import { useHeatCalcPageModel } from '@/pages/heatcalc/useHeatCalcPageModel';
import { CalculationWorkflowLockBoundary } from '@/components/workflow/CalculationWorkflowLockBoundary';
import { useProjectCalculationWorkflow } from '@/hooks/useProjectCalculationWorkflow';

export default function HeatCalcPage() {
  const m = useHeatCalcPageModel();
  const {
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
    isSideFormPlacement,
    sideResizeVisible,
    workspaceLayoutStyle,
    sideWorkspaceRef,
    isHeatLossJobActive,
    heatLossJobProgressLabel,
    selectedObject,
    calculationDetailsSettings,
    activeObjectScope,
    activeTypeTotalCount,
    tableColumns,
    currentTableViewActive,
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
    resetCurrentTableViewState,
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
    removeSelectedObjects,
    resetSelectedExcelRows,
    columnSettingsDialog,
    preferenceSavePending,
    pendingWizardObject,
    inlineDraftSaving,
    discardDraftRows,
    saveDraftRows,
    setPendingWizardObject,
    forceOpenEditWizard,
    workspaceLoadState,
  } = m;
  const { isCalculationLocked } = useProjectCalculationWorkflow(project?.id);
  if (!project) {
    return <HeatCalcEmptyProjectState />;
  }

  if (workspaceLoadState.isBlockingError && workspaceLoadState.error) {
    return (
      <div className="heatcalc-workspace-load-error" data-testid="heatcalc-workspace-query-error">
        <QueryError
          title="Не удалось загрузить объекты проекта"
          error={workspaceLoadState.error}
          onRetry={workspaceLoadState.retry}
          retrying={workspaceLoadState.isRetrying}
        />
      </div>
    );
  }

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

  const staleLoadAlert = workspaceLoadState.error && workspaceLoadState.hasUsableSnapshot ? (
    <div data-testid="heatcalc-workspace-stale-query-alert">
      <QueryError
        title="Не удалось обновить данные (показаны последние загруженные)"
        error={workspaceLoadState.error}
        onRetry={workspaceLoadState.retry}
        retrying={workspaceLoadState.isRetrying}
      />
    </div>
  ) : null;

  const toolbarProps = {
    activeObjectScope: m.activeObjectScope,
    pipeButtonCountText: m.pipeButtonCountText,
    tankButtonCountText: m.tankButtonCountText,
    allButtonCountText: m.allButtonCountText,
    formBlockVisible,
    formCaptionMode: m.formCaptionMode,
    formCaptionModeLabel: m.formCaptionModeLabel,
    handleObjectScopeChange: m.handleObjectScopeChange,
    handleFormBlockVisibilityChange: m.handleFormBlockVisibilityChange,
    handleContinueToElectrical: m.handleContinueToElectrical,
    continueToElectricalDisabled: m.continueToElectricalDisabled || Boolean(workspaceLoadState.error),
    continueToElectricalTooltip: m.continueToElectricalTooltip,
    toolbarSaveTooltip: m.toolbarSaveTooltip,
    toolbarSaveDisabled: m.toolbarSaveDisabled || Boolean(workspaceLoadState.error && !workspaceLoadState.hasUsableSnapshot),
    toolbarSaveLoading: m.toolbarSaveLoading,
    deleteTargetCount: m.deleteTargetCount,
    removeIsPending: m.remove.isPending,
    openAddWizard: m.openAddWizard,
    handleToolbarSave: m.handleToolbarSave,
    removeSelectedObjects: m.removeSelectedObjects,
    tableEditingMode: m.tableEditingMode,
    commercialFeaturesAvailable: m.commercialFeaturesAvailable,
    tableFindabilityAvailable: m.tableFindabilityAvailable,
    heatLossRecalcTooltip: m.heatLossRecalcTooltip,
    heatLossRecalcAriaLabel: m.heatLossRecalcAriaLabel,
    heatLossBatchPending: m.heatLossBatchPending,
    isHeatLossJobActive,
    heatLossScopedRecalcDisabled: m.heatLossScopedRecalcDisabled,
    heatLossRecalcAllTooltip: m.heatLossRecalcAllTooltip,
    heatLossRecalcDisabled: m.heatLossRecalcDisabled,
    activeHeatLossJobId: m.activeHeatLossJobId,
    cancelHeatLossJobPending: m.cancelHeatLossJobPending,
    currentTableViewActive: m.currentTableViewActive,
    draftControlsVisible: m.draftControlsVisible,
    dirtyDraftRowCount: m.dirtyDraftRowCount,
    saveTargetCount: m.saveTargetCount,
    inlineDraftSaving,
    draftDiscardLabel: m.draftDiscardLabel,
    selectedObjectCount: m.selectedObjectCount,
    addIsPending: m.add.isPending,
    handleTableEditingModeChange: m.handleTableEditingModeChange,
    recalcHeatLossScoped: m.recalcHeatLossScoped,
    recalcHeatLossAll: m.recalcHeatLossAll,
    cancelHeatLossJob: m.cancelHeatLossJob,
    openColumnSettings: m.columnSettingsDialog.open,
    resetCurrentTableViewState,
    discardDraftRows,
    saveTargetIds: m.saveTargetIds,
    duplicateSelectedObjects: m.duplicateSelectedObjects,
    openGroupUpdate: m.openGroupUpdate,
    projectId: project.id,
    projectName: project.name,
    projectObjectCount: m.projectObjectCount,
    role: m.role,
  };

  const tablePane = (
    <>
      {staleLoadAlert}
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
        activeTableViewState={effectiveActiveTableViewState}
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
        onRegisterNormalDraftInvalidator={registerNormalGridDraftInvalidator}
        onOpenEditWizard={openEditWizard}
        onResetCurrentTableViewState={resetCurrentTableViewState}
        onSelectedRowKeysChange={setSelectedRowKeys}
        onRowMoved={excelModeEnabled ? undefined : handleObjectsRowMoved}
        rowClassName={tableRowClassName}
      />
    </>
  );

  return (
    <CalculationWorkflowLockBoundary locked={isCalculationLocked}>
      <HeatCalcWorkspaceLayout
        formPlacement={formPlacement}
        isSideFormPlacement={isSideFormPlacement}
        sideResizeVisible={sideResizeVisible}
        workspaceLayoutStyle={workspaceLayoutStyle}
        sideWorkspaceRef={sideWorkspaceRef}
        typeBar={buildHeatCalcTypeBar(toolbarProps)}
        actionsBar={buildHeatCalcActionsBar(toolbarProps)}
        jobAlert={buildHeatCalcJobAlert(isHeatLossJobActive, heatLossJobProgressLabel)}
        formPanel={formPanel}
        tablePane={tablePane}
        errorsOverlay={<HeatCalcSelectedRowErrorsOverlay messages={selectedRowErrorMessages} />}
        onSideResizePointerDown={startSideFormResize}
        onSideResizeMouseDown={startSideFormMouseResize}
      />

      <HeatCalcPageOverlays
        groupUpdate={{
          open: m.groupUpdateOpen,
          objectType: activeObjectScope === 'tank' ? 'tank' : 'pipe',
          selectedCount: m.selectedObjectCount,
          applying: m.groupUpdateApplying,
          problems: m.groupUpdateProblems,
          errorMessage: m.groupUpdateError,
          onApply: m.applyGroupUpdate,
          onClose: m.closeGroupUpdate,
        }}
        excelModeEnabled={excelModeEnabled}
        excelContextMenu={excelContextMenu}
        excelSelectionRange={excelSelectionRange}
        activeExcelCellPosition={activeExcelCellPosition}
        selectedExcelRows={selectedExcelRows}
        draftRowsById={draftRowsById}
        isSavableDraftRow={isSavableDraftRow}
        closeExcelContextMenu={closeExcelContextMenu}
        copyExcelSelection={copyExcelSelection}
        cutExcelSelection={cutExcelSelection}
        pasteExcelFromClipboard={pasteExcelFromClipboard}
        clearExcelSelection={clearExcelSelection}
        addExcelRowsBelowSelection={addExcelRowsBelowSelection}
        removeSelectedObjects={removeSelectedObjects}
        resetSelectedExcelRows={resetSelectedExcelRows}
        columnSettingsDialog={columnSettingsDialog}
        preferenceSavePending={preferenceSavePending}
        pendingWizardObject={pendingWizardObject}
        inlineDraftSaving={inlineDraftSaving}
        discardDraftRows={discardDraftRows}
        saveDraftRows={saveDraftRows}
        setPendingWizardObject={setPendingWizardObject}
        forceOpenEditWizard={forceOpenEditWizard}
      />
    </CalculationWorkflowLockBoundary>
  );
}
