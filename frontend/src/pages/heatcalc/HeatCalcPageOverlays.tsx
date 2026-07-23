/**
 * @module heatcalc/page-overlays
 * @owner heat
 * Excel context menu, column settings modal, unsaved-changes modals.
 */
import { lazy, Suspense, type ReactNode } from 'react';

import HeatCalcExcelContextMenu, {
  type HeatCalcExcelContextMenuState,
} from '@/components/heatcalc/HeatCalcExcelContextMenu';
import HeatCalcUnsavedChangesModals from '@/pages/heatcalc/HeatCalcUnsavedChangesModals';
import type { ProjectObject } from '@/types/project';
import type {
  ExcelCellPosition,
  ExcelSelectionRange,
} from '@/utils/heatCalcExcelMode';
import type { DraftRowsById, DraftRowState } from '@/utils/heatCalcInlineEdit';
import type { HeatCalcIndexedTableRow } from '@/utils/heatCalcTableFindability';
import type {
  HeatCalcColumnKey,
  HeatCalcTableColumnSettings,
  HeatCalcTableColumnScope,
} from '@/utils/heatCalcTableColumns';
import type {
  HeatCalcFormPlacement,
  HeatCalcTableLabelFormat,
  HeatCalcTableViewSettings,
} from '@/utils/heatCalcTableViewSettings';
import type {
  HeatCalcCalculationDetailMetric,
  HeatCalcCalculationDetailPreset,
  HeatCalcCalculationDetailsSettings,
} from '@/utils/heatCalcCalculationDetailsSettings';

const ColumnSettingsModal = lazy(() => import('@/components/heatcalc/ColumnSettingsModal'));

type SaveDraftRowsResult = {
  ok: boolean;
  saved: ProjectObject[];
};

/** Explicit modal state + events for Heat overlays (AF9-TYPE-HEAT-OVERLAYS-01). */
export type HeatCalcPageOverlaysProps = {
  excelModeEnabled: boolean;
  excelContextMenu: HeatCalcExcelContextMenuState;
  excelSelectionRange: ExcelSelectionRange | null;
  activeExcelCellPosition: ExcelCellPosition | null;
  selectedExcelRows: HeatCalcIndexedTableRow<ProjectObject>[];
  draftRowsById: DraftRowsById;
  isSavableDraftRow: (draftRow: DraftRowState | undefined) => boolean;
  closeExcelContextMenu: () => void;
  copyExcelSelection: () => unknown | Promise<unknown>;
  cutExcelSelection: () => unknown | Promise<unknown>;
  pasteExcelFromClipboard: () => unknown | Promise<unknown>;
  clearExcelSelection: () => unknown | Promise<unknown>;
  addExcelRowsBelowSelection: (count: number) => unknown | Promise<unknown>;
  removeSelectedObjects: () => unknown | Promise<unknown>;
  resetSelectedExcelRows: () => unknown | Promise<unknown>;
  columnSettingsDialog: {
    isOpen: boolean;
    activeType: HeatCalcTableColumnScope;
    draftColumnSettings: HeatCalcTableColumnSettings;
    draftViewSettings: HeatCalcTableViewSettings;
    draftCalculationDetailsSettings: HeatCalcCalculationDetailsSettings;
    setActiveType: (type: HeatCalcTableColumnScope) => void;
    apply: () => void;
    close: () => void;
    selectAllDraftColumns: (type: HeatCalcTableColumnScope) => void;
    resetDraftColumns: (type: HeatCalcTableColumnScope) => void;
    updateDraftColumn: (
      type: HeatCalcTableColumnScope,
      key: HeatCalcColumnKey,
      visible: boolean,
    ) => void;
    updateDraftColumnOrder: (
      type: HeatCalcTableColumnScope,
      key: HeatCalcColumnKey,
      order: number,
    ) => void;
    updateDraftColumnWidth: (
      type: HeatCalcTableColumnScope,
      key: HeatCalcColumnKey,
      widthPct: number,
    ) => void;
    resetDraftColumnWidth: (
      type: HeatCalcTableColumnScope,
      key: HeatCalcColumnKey,
    ) => void;
    reorderDraftColumn: (
      type: HeatCalcTableColumnScope,
      activeKey: HeatCalcColumnKey,
      overKey: HeatCalcColumnKey,
    ) => void;
    updateDraftTableLabelFormat: (format: HeatCalcTableLabelFormat) => void;
    updateDraftSettingsLabelFormat: (format: HeatCalcTableLabelFormat) => void;
    updateDraftFormPlacement: (placement: HeatCalcFormPlacement) => void;
    resetDraftLabelFormats: () => void;
    updateDraftCalculationDetailsPreset: (
      preset: HeatCalcCalculationDetailPreset,
    ) => void;
    updateDraftCalculationDetailMetrics: (
      metrics: HeatCalcCalculationDetailMetric[],
    ) => void;
    resetDraftCalculationDetails: () => void;
  };
  preferenceSavePending: boolean;
  pendingWizardObject: ProjectObject | null;
  inlineDraftSaving: boolean;
  discardDraftRows: (rowIds?: string[]) => void;
  saveDraftRows: (rowIds?: string[]) => Promise<SaveDraftRowsResult>;
  setPendingWizardObject: (object: ProjectObject | null) => void;
  forceOpenEditWizard: (object: ProjectObject) => void;
};

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
