/**
 * @module electrical/workspace-presentation-map
 * @owner electrical
 * Maps orchestrated workspace pieces into presentation-assembly props.
 * Return type is inferred from the object literal so the generic assembly
 * keeps exact field types (do not annotate as Parameters<typeof assembly>).
 *
 * AF9-ELEC-CONTRACT-01: input is six consumer-owned groups instead of a flat
 * 58-field bag. Output presentation shape is unchanged.
 */
import type { Dispatch, RefObject, SetStateAction } from 'react';
import type { NavigateFunction } from 'react-router-dom';

import type { Project } from '@/types/project';
import type { ElectricalVariant } from '@/types/electricalVariant';
import type { ElectricalSystemView } from '@/pages/electrical/elecCalcSystemViewModel';
import type { useElecCalcCableMarkModalState } from '@/pages/electrical/useElecCalcCableMarkModalState';
import type { useElecCalcCableMarkPresentation } from '@/pages/electrical/useElecCalcCableMarkPresentation';
import type { useElecCalcCableSelectionMutationFlow } from '@/pages/electrical/useElecCalcCableSelectionMutationFlow';
import type { useElecCalcCableTypeOptions } from '@/pages/electrical/useElecCalcCableTypeOptions';
import type { useElecCalcCandidateWorkflowController } from '@/pages/electrical/useElecCalcCandidateWorkflowController';
import type { useElecCalcColumnPersistence } from '@/pages/electrical/useElecCalcColumnPersistence';
import type { useElecCalcColumnSettingsDraftState } from '@/pages/electrical/useElecCalcColumnSettingsDraftState';
import type { useElecCalcColumnViewModel } from '@/pages/electrical/useElecCalcColumnViewModel';
import type { useElecCalcMainTableController } from '@/pages/electrical/useElecCalcMainTableController';
import type { useElecCalcObjectActionModals } from '@/pages/electrical/useElecCalcObjectActionModals';
import type { useElecCalcParamsPanelState } from '@/pages/electrical/useElecCalcParamsPanelState';
import type { useElecCalcPreferenceSettings } from '@/pages/electrical/useElecCalcPreferenceSettings';
import type { useElecCalcRecalculationParams } from '@/pages/electrical/useElecCalcRecalculationParams';
import type { useElecCalcTableViewState } from '@/pages/electrical/useElecCalcTableViewState';
import type { useElecCalcWorkspaceDataPlane } from '@/pages/electrical/useElecCalcWorkspaceDataPlane';
import type { useElecCalcWorkspaceSummaryChrome } from '@/pages/electrical/useElecCalcWorkspaceSummaryChrome';

type DataPlane = ReturnType<typeof useElecCalcWorkspaceDataPlane>;
type CandidateWorkflow = ReturnType<typeof useElecCalcCandidateWorkflowController>;
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

/** Candidate folders, table and filters. */
export type WorkspacePresentationCandidate = {
  candidate: CandidateWorkflow['candidate'];
  candidateWorkflow: CandidateWorkflow;
  candidateTableViewState: TableView['candidateTableViewState'];
  candidateTableViewActive: TableView['candidateTableViewActive'];
  resetCandidateTableViewState: TableView['resetCandidateTableViewState'];
  setCandidateColumnFilter: TableView['setCandidateColumnFilter'];
  resetCandidateColumnFilter: TableView['resetCandidateColumnFilter'];
  setCandidateTableSort: TableView['setCandidateTableSort'];
  candidateColumnSettingsOpen: boolean;
  setCandidateColumnSettingsOpen: Dispatch<SetStateAction<boolean>>;
  updateCandidateTableColumnPreference:
    PreferenceSettings['updateCandidateTableColumnPreference'];
  visibleCandidateColumnMetas: ColumnViewModel['visibleCandidateColumnMetas'];
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
  paramsPanelVisible: boolean;
  toggleParamsPanel: ReturnType<typeof useElecCalcParamsPanelState>['toggleParamsPanel'];
};

/** Mark/sizing modals and object action openers. */
export type WorkspacePresentationModals = {
  cableMarkModal: ReturnType<typeof useElecCalcCableMarkModalState>;
  cableSizingModal: DataPlane['cableSizingModal'];
  cableMarkPresentation: ReturnType<typeof useElecCalcCableMarkPresentation>;
  objectActionModals: ReturnType<typeof useElecCalcObjectActionModals>;
};

/**
 * Consumer-owned groups for Electrical presentation input (AF9-ELEC-CONTRACT-01).
 */
export type WorkspacePresentationSource = {
  core: WorkspacePresentationCore;
  table: WorkspacePresentationTable;
  candidate: WorkspacePresentationCandidate;
  catalog: WorkspacePresentationCatalog;
  settings: WorkspacePresentationSettings;
  modals: WorkspacePresentationModals;
};

/** Maps orchestrated workspace pieces into presentation-assembly props. */
export function mapWorkspaceToPresentation(source: WorkspacePresentationSource) {
  const { core, table, candidate, catalog, settings, modals } = source;
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
    cableTypeControlLabel: table.summary.cableTypeControlLabel,
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
    onRecalculateSelected: table.summary.onRecalculateSelected,
    openColumnSettings: settings.columnDraft.openColumnSettings,
    overwriteManualChoices: catalog.overwriteManualChoices,
    paramsPanelVisible: settings.paramsPanelVisible,
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
    systemView: table.systemView,
    tableDragging: table.tableDragging,
    tableScrollRegionsRef: table.tableScrollRegionsRef,
    tableViewState: table.tableViewState,
    toggleParamsPanel: settings.toggleParamsPanel,
    totalCableLength: table.summary.totalCableLength,
    totalCurrent: table.summary.totalCurrent,
    totalObjects: table.summary.totalObjects,
    validObjectsCount: table.summary.validObjectsCount,
    // presentation-only inputs
    cableMarkModalObject: modals.cableMarkModal.object,
    cableSizingModalObject: modals.cableSizingModal.object,
    cableTypeOptionsForObject: catalog.cableTypeOptionsState.cableTypeOptionsForObject,
    getObjectActionDisabledReason: core.data.getObjectActionDisabledReason,
    visibleCandidateColumnMetas: candidate.visibleCandidateColumnMetas,
    commercialFeaturesAvailable: core.commercialFeaturesAvailable,
    isEmployee: core.isEmployee,
    draftTableViewSettings: settings.columnDraft.draftTableViewSettings,
    cableSourceOptions: catalog.cableTypeOptionsState.cableSourceOptions,
    updateDraftCalculationCableSource:
      settings.columnDraft.updateDraftCalculationCableSource,
    deleteCandidateFolderMut: candidate.candidate.deleteCandidateFolderMut,
    activeCandidateFolderKey: candidate.candidate.activeCandidateFolderKey,
    activeCustomCandidateFolder: candidate.candidate.activeCustomCandidateFolder,
    setTableDragging: table.setTableDragging,
    cableMarkModalSelectedCable: modals.cableMarkModal.selectedCable,
    cableMarkModalCableType: modals.cableMarkModal.cableType,
    isCableMarkPending: catalog.cableSelection.isCableMarkPending,
    cableMarkModalValue: modals.cableMarkModal.value,
    cableMarkModalOptions: modals.cableMarkModal.options,
    cableMarkModalTargetVariants: modals.cableMarkModal.targetVariants,
    cableMarkModalTargetVariantOptions: modals.cableMarkModal.targetVariantOptions,
    changeCableMarkModalCableType: modals.cableMarkModal.changeCableType,
    setCableMarkModalValue: modals.cableMarkModal.setValue,
    setCableMarkModalTargetVariantsFromValues:
      modals.cableMarkModal.setTargetVariantsFromValues,
    applyCableMarkModal: catalog.cableSelection.applyCableMarkModal,
    closeCableMarkModal: modals.cableMarkModal.close,
    cableSizingModal: modals.cableSizingModal,
    candidate: candidate.candidate,
    cableSizingModalSelectedCable:
      modals.cableMarkPresentation.cableSizingModalSelectedCable,
    electricalCandidateGlideColumns:
      candidate.candidateWorkflow.electricalCandidateGlideColumns,
    candidateTableViewState: candidate.candidateTableViewState,
    candidateTableViewActive: candidate.candidateTableViewActive,
    closeCableSizingModal: modals.objectActionModals.closeCableSizingModal,
    openCandidateColumnSettings: settings.columnDraft.openCandidateColumnSettings,
    resetCandidateTableViewState: candidate.resetCandidateTableViewState,
    getElectricalCandidateGlideCellState:
      candidate.candidateWorkflow.getElectricalCandidateGlideCellState,
    handleElectricalCandidateGlideCellAction:
      candidate.candidateWorkflow.handleElectricalCandidateGlideCellAction,
    getElectricalCandidateGlideActionMenuItems:
      candidate.candidateWorkflow.getElectricalCandidateGlideActionMenuItems,
    setCandidateColumnFilter: candidate.setCandidateColumnFilter,
    resetCandidateColumnFilter: candidate.resetCandidateColumnFilter,
    setCandidateTableSort: candidate.setCandidateTableSort,
    applyElectricalCandidateGlideColumnDraftWidth:
      settings.columnPersistence.applyElectricalCandidateGlideColumnDraftWidth,
    commitElectricalCandidateGlideColumnWidth:
      settings.columnPersistence.commitElectricalCandidateGlideColumnWidth,
    candidateFolderModalOpen: candidate.candidate.candidateFolderModalOpen,
    candidateFolderModalMode: candidate.candidate.candidateFolderModalMode,
    createCandidateFolderMut: candidate.candidate.createCandidateFolderMut,
    updateCandidateFolderMut: candidate.candidate.updateCandidateFolderMut,
    candidateFolderName: candidate.candidate.candidateFolderName,
    submitCandidateFolderModal: candidate.candidate.submitCandidateFolderModal,
    closeCandidateFolderModal: candidate.candidate.closeCandidateFolderModal,
    setCandidateFolderName: candidate.candidate.setCandidateFolderName,
    candidateColumnSettingsOpen: candidate.candidateColumnSettingsOpen,
    setCandidateColumnSettingsOpen: candidate.setCandidateColumnSettingsOpen,
    draftCandidateTableColumnSettings:
      settings.columnDraft.draftCandidateTableColumnSettings,
    normalizedTableViewSettings: table.normalizedTableViewSettings,
    updateCandidateTableColumnPreference:
      candidate.updateCandidateTableColumnPreference,
    applyCandidateColumnSettings: settings.columnDraft.applyCandidateColumnSettings,
    selectAllDraftCandidateColumns: settings.columnDraft.selectAllDraftCandidateColumns,
    resetDraftCandidateColumns: settings.columnDraft.resetDraftCandidateColumns,
    updateDraftCandidateColumn: settings.columnDraft.updateDraftCandidateColumn,
    updateDraftCandidateColumnOrder:
      settings.columnDraft.updateDraftCandidateColumnOrder,
    reorderDraftCandidateColumn: settings.columnDraft.reorderDraftCandidateColumn,
    updateDraftCandidateColumnWidth:
      settings.columnDraft.updateDraftCandidateColumnWidth,
    resetDraftCandidateColumnWidth:
      settings.columnDraft.resetDraftCandidateColumnWidth,
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
