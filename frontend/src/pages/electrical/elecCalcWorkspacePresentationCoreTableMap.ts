/**
 * @module electrical/workspace-presentation-core-table-map
 * @owner electrical
 * Core + table + catalog-control + main-settings slice of presentation mapping.
 */
import type { Dispatch, RefObject, SetStateAction } from 'react';
import type { NavigateFunction } from 'react-router-dom';

import type { Project } from '@/types/project';
import type { ElectricalVariant } from '@/types/electricalVariant';
import type { ElectricalSystemView } from '@/pages/electrical/elecCalcSystemViewModel';
import type { useElecCalcCableSelectionMutationFlow } from '@/pages/electrical/useElecCalcCableSelectionMutationFlow';
import type { useElecCalcCableTypeOptions } from '@/pages/electrical/useElecCalcCableTypeOptions';
import type { useElecCalcColumnPersistence } from '@/pages/electrical/useElecCalcColumnPersistence';
import type { useElecCalcColumnSettingsDraftState } from '@/pages/electrical/useElecCalcColumnSettingsDraftState';
import type { useElecCalcColumnViewModel } from '@/pages/electrical/useElecCalcColumnViewModel';
import type { useElecCalcMainTableController } from '@/pages/electrical/useElecCalcMainTableController';
import type { useElecCalcPreferenceSettings } from '@/pages/electrical/useElecCalcPreferenceSettings';
import type { useElecCalcRecalculationParams } from '@/pages/electrical/useElecCalcRecalculationParams';
import type { useElecCalcTableViewState } from '@/pages/electrical/useElecCalcTableViewState';
import type { useElecCalcWorkspaceDataPlane } from '@/pages/electrical/useElecCalcWorkspaceDataPlane';
import type { useElecCalcWorkspaceSummaryChrome } from '@/pages/electrical/useElecCalcWorkspaceSummaryChrome';

type DataPlane = ReturnType<typeof useElecCalcWorkspaceDataPlane>;
type ColumnViewModel = ReturnType<typeof useElecCalcColumnViewModel>;
type PreferenceSettings = ReturnType<typeof useElecCalcPreferenceSettings>;
type RecalculationParams = ReturnType<typeof useElecCalcRecalculationParams>;
type TableView = ReturnType<typeof useElecCalcTableViewState>;

/** Core workspace identity and data plane. */
export type WorkspacePresentationCore = {
  data: DataPlane;
  project: Project | null;
  canMutate: boolean;
  projectId: string;
  electricalVariant: ElectricalVariant;
  onAssignmentsChanged?: () => void;
  activateRowId: DataPlane['activateRowId'];
  navigate: NavigateFunction;
  commercialFeaturesAvailable: boolean;
  isEmployee: boolean;
};

/** Main electrical results table. */
export type WorkspacePresentationTable = {
  summary: ReturnType<typeof useElecCalcWorkspaceSummaryChrome>;
  mainTable: ReturnType<typeof useElecCalcMainTableController>;
  electricalGlideEnabled: boolean;
  electricalVariantName: string;
  currentTableViewActive: TableView['currentTableViewActive'];
  tableDragging: boolean;
  setTableDragging: Dispatch<SetStateAction<boolean>>;
  tableScrollRegionsRef: RefObject<HTMLDivElement>;
  tableViewState: TableView['tableViewState'];
  setColumnFilter: TableView['setColumnFilter'];
  resetColumnFilter: TableView['resetColumnFilter'];
  setElectricalTableSort: TableView['setElectricalTableSort'];
  resetCurrentTableViewState: TableView['resetCurrentTableViewState'];
  resolvedTableFontSize: ColumnViewModel['resolvedTableFontSize'];
  normalizedTableViewSettings: ColumnViewModel['normalizedTableViewSettings'];
  systemView: ElectricalSystemView;
  setSystemView: Dispatch<SetStateAction<ElectricalSystemView>>;
};

/** Catalog options and recalculation params. */
export type WorkspacePresentationCatalog = {
  cableTypeOptionsState: ReturnType<typeof useElecCalcCableTypeOptions>;
  cableSelection: ReturnType<typeof useElecCalcCableSelectionMutationFlow>;
  recalc: RecalculationParams['values'];
  setRecalc: RecalculationParams['setters'];
  overwriteManualChoices: boolean;
  setOverwriteManualChoices: Dispatch<SetStateAction<boolean>>;
};

/** Column/view settings draft and preferences. */
export type WorkspacePresentationSettings = {
  columnDraft: ReturnType<typeof useElecCalcColumnSettingsDraftState>;
  columnPersistence: ReturnType<typeof useElecCalcColumnPersistence>;
  columnSettingsOpen: boolean;
  setColumnSettingsOpen: Dispatch<SetStateAction<boolean>>;
  updateTableColumnPreference: PreferenceSettings['updateTableColumnPreference'];
  updateTableSettingsPreference: PreferenceSettings['updateTableSettingsPreference'];
};

export type CoreTablePresentationSource = {
  core: WorkspacePresentationCore;
  table: WorkspacePresentationTable;
  catalog: WorkspacePresentationCatalog;
  settings: WorkspacePresentationSettings;
};

/** Core/table/catalog/settings fields for presentation assembly. */
export function mapCoreTableToPresentation(source: CoreTablePresentationSource) {
  const { core, table, catalog, settings } = source;
  return {
    ...core.data.presentationBindings,
    project: core.project,
    canMutate: core.canMutate,
    projectId: core.projectId,
    electricalVariant: core.electricalVariant,
    onAssignmentsChanged: core.onAssignmentsChanged,
    activateRowId: core.activateRowId,
    activeElectricalErrorGuidance: table.summary.activeElectricalErrorGuidance,
    activeElectricalErrorItem: table.summary.activeElectricalErrorItem,
    applyElectricalGlideColumnDraftWidth:
      settings.columnPersistence.applyElectricalGlideColumnDraftWidth,
    cableTypeOptions: catalog.cableTypeOptionsState.cableTypeOptions,
    calculatedCount: table.summary.calculatedCount,
    commitElectricalGlideColumnWidth:
      settings.columnPersistence.commitElectricalGlideColumnWidth,
    currentTableViewActive: table.currentTableViewActive,
    electricalColumns: table.mainTable.electricalColumns,
    electricalGlideColumns: table.mainTable.electricalGlideColumns,
    electricalGlideEnabled: table.electricalGlideEnabled,
    electricalInfiniteLoading: table.mainTable.electricalInfiniteLoading,
    electricalPagination: table.mainTable.electricalPagination,
    electricalRowClassName: table.mainTable.electricalRowClassName,
    electricalTableScrollX: table.mainTable.electricalTableScrollX,
    electricalTableScrollY: table.mainTable.electricalTableScrollY,
    electricalVariantName: table.electricalVariantName,
    failedCount: table.summary.failedCount,
    getElectricalGlideCellState: table.mainTable.getElectricalGlideCellState,
    handleCableTypeControlChange:
      catalog.cableTypeOptionsState.handleCableTypeControlChange,
    handleElectricalGlideCellAction: table.mainTable.handleElectricalGlideCellAction,
    handleElectricalGlideCommitCell: table.mainTable.handleElectricalGlideCommitCell,
    handleElectricalGlideLoadMore: table.mainTable.handleElectricalGlideLoadMore,
    handleElectricalGlidePageChange: table.mainTable.handleElectricalGlidePageChange,
    handleElectricalGlideStartCellEdit: table.mainTable.handleElectricalGlideStartCellEdit,
    handleElectricalTableChange: table.mainTable.handleElectricalTableChange,
    isJobActive: table.summary.isJobActive,
    jobProgressLabel: table.summary.jobProgressLabel,
    manualCableCount: table.summary.manualCableCount,
    navigate: core.navigate,
    onCancelJob: table.summary.onCancelJob,
    onRecalculateAll: table.summary.onRecalculateAll,
    onRecalculateObjectIds: table.summary.onRecalculateObjectIds,
    onRecalculateSelected: table.summary.onRecalculateSelected,
    openColumnSettings: settings.columnDraft.openColumnSettings,
    overwriteManualChoices: catalog.overwriteManualChoices,
    recalc: catalog.recalc,
    renderManualOverwriteControl: table.summary.renderManualOverwriteControl,
    resetColumnFilter: table.resetColumnFilter,
    resetCurrentTableViewState: table.resetCurrentTableViewState,
    resolvedTableFontSize: table.resolvedTableFontSize,
    selectedHeatLossFailedCount: table.summary.selectedHeatLossFailedCount,
    selectedManualCableCount: table.summary.selectedManualCableCount,
    selectedRecalcCountLabel: table.summary.selectedRecalcCountLabel,
    selectedRecalcDisabled: table.summary.selectedRecalcDisabled,
    selectedRecalcTooltip: table.summary.selectedRecalcTooltip,
    selectedValidObjectsCount: table.summary.selectedValidObjectsCount,
    setColumnFilter: table.setColumnFilter,
    setElectricalTableSort: table.setElectricalTableSort,
    setOverwriteManualChoices: catalog.setOverwriteManualChoices,
    setRecalc: catalog.setRecalc,
    setSystemView: table.setSystemView,
    systemSummaries: table.summary.systemSummaries,
    systemView: table.systemView,
    tableDragging: table.tableDragging,
    tableScrollRegionsRef: table.tableScrollRegionsRef,
    tableViewState: table.tableViewState,
    totalCableLength: table.summary.totalCableLength,
    totalCurrent: table.summary.totalCurrent,
    totalObjects: table.summary.totalObjects,
    validObjectsCount: table.summary.validObjectsCount,
    getObjectActionDisabledReason: core.data.getObjectActionDisabledReason,
    commercialFeaturesAvailable: core.commercialFeaturesAvailable,
    isEmployee: core.isEmployee,
    draftTableViewSettings: settings.columnDraft.draftTableViewSettings,
    cableSourceOptions: catalog.cableTypeOptionsState.cableSourceOptions,
    updateDraftCalculationCableSource:
      settings.columnDraft.updateDraftCalculationCableSource,
    setTableDragging: table.setTableDragging,
    isCableMarkPending: catalog.cableSelection.isCableMarkPending,
    applyCableMarkModal: catalog.cableSelection.applyCableMarkModal,
    cableTypeOptionsForObject: catalog.cableTypeOptionsState.cableTypeOptionsForObject,
    normalizedTableViewSettings: table.normalizedTableViewSettings,
    columnSettingsOpen: settings.columnSettingsOpen,
    setColumnSettingsOpen: settings.setColumnSettingsOpen,
    draftTableColumnSettings: settings.columnDraft.draftTableColumnSettings,
    updateTableColumnPreference: settings.updateTableColumnPreference,
    updateTableSettingsPreference: settings.updateTableSettingsPreference,
    applyColumnSettings: settings.columnDraft.applyColumnSettings,
    selectAllDraftColumns: settings.columnDraft.selectAllDraftColumns,
    resetDraftColumns: settings.columnDraft.resetDraftColumns,
    updateDraftColumn: settings.columnDraft.updateDraftColumn,
    updateDraftColumnOrder: settings.columnDraft.updateDraftColumnOrder,
    reorderDraftColumn: settings.columnDraft.reorderDraftColumn,
    updateDraftColumnWidth: settings.columnDraft.updateDraftColumnWidth,
    resetDraftColumnWidth: settings.columnDraft.resetDraftColumnWidth,
    updateDraftTableFontSize: settings.columnDraft.updateDraftTableFontSize,
    updateDraftTableLabelFormat: settings.columnDraft.updateDraftTableLabelFormat,
    updateDraftSettingsLabelFormat:
      settings.columnDraft.updateDraftSettingsLabelFormat,
    resetDraftTableFontSize: settings.columnDraft.resetDraftTableFontSize,
    resetDraftLabelFormats: settings.columnDraft.resetDraftLabelFormats,
  };
}
