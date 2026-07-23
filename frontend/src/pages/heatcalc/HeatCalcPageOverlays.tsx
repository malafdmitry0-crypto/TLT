/**
 * @module heatcalc/page-overlays
 * @owner heat
 * Excel context menu, column settings modal, unsaved-changes modals.
 */
import { lazy, Suspense, type ReactNode } from 'react';

import HeatCalcExcelContextMenu from '@/components/heatcalc/HeatCalcExcelContextMenu';
import HeatCalcUnsavedChangesModals from '@/pages/heatcalc/HeatCalcUnsavedChangesModals';

const ColumnSettingsModal = lazy(() => import('@/components/heatcalc/ColumnSettingsModal'));

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type HeatCalcPageOverlaysProps = Record<string, any>;

export function HeatCalcPageOverlays(p: HeatCalcPageOverlaysProps): ReactNode {
  const {
    excelModeEnabled,
    excelContextMenu,
    excelSelectionRange,
    activeExcelCellPosition,
    selectedExcelRows,
    draftRowsById,
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
  } = p;

  return (
    <>
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
            onTableLabelFormatChange={columnSettingsDialog.updateDraftTableLabelFormat}
            onSettingsLabelFormatChange={columnSettingsDialog.updateDraftSettingsLabelFormat}
            onFormPlacementChange={columnSettingsDialog.updateDraftFormPlacement}
            onResetLabelFormats={columnSettingsDialog.resetDraftLabelFormats}
            onCalculationDetailsPresetChange={columnSettingsDialog.updateDraftCalculationDetailsPreset}
            onCalculationDetailMetricsChange={columnSettingsDialog.updateDraftCalculationDetailMetrics}
            onResetCalculationDetails={columnSettingsDialog.resetDraftCalculationDetails}
          />
        </Suspense>
      )}
      <HeatCalcUnsavedChangesModals
        pendingWizardObject={pendingWizardObject}
        inlineDraftSaving={inlineDraftSaving}
        discardDraftRows={discardDraftRows}
        saveDraftRows={saveDraftRows}
        setPendingWizardObject={setPendingWizardObject}
        forceOpenEditWizard={forceOpenEditWizard}
      />
    </>
  );
}
