/**
 * @module electrical/workspace-presentation-map
 * @owner electrical
 * Maps orchestrated workspace pieces into presentation-assembly props.
 * Return type is inferred from the object literal so the generic assembly
 * keeps exact field types (do not annotate as Parameters<typeof assembly>).
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

export type WorkspacePresentationSource = {
  data: DataPlane;
  project: Project | null;
  canMutate: boolean;
  projectId: string;
  electricalVariant: ElectricalVariant;
  onAssignmentsChanged?: () => void;
  activateRowId: DataPlane['activateRowId'];
  summary: ReturnType<typeof useElecCalcWorkspaceSummaryChrome>;
  columnPersistence: ReturnType<typeof useElecCalcColumnPersistence>;
  cableTypeOptionsState: ReturnType<typeof useElecCalcCableTypeOptions>;
  mainTable: ReturnType<typeof useElecCalcMainTableController>;
  electricalGlideEnabled: boolean;
  electricalVariantName: string;
  navigate: NavigateFunction;
  columnDraft: ReturnType<typeof useElecCalcColumnSettingsDraftState>;
  overwriteManualChoices: boolean;
  paramsPanelVisible: boolean;
  recalc: RecalculationParams['values'];
  setRecalc: RecalculationParams['setters'];
  resetColumnFilter: TableView['resetColumnFilter'];
  resetCurrentTableViewState: TableView['resetCurrentTableViewState'];
  resolvedTableFontSize: ColumnViewModel['resolvedTableFontSize'];
  setColumnFilter: TableView['setColumnFilter'];
  setElectricalTableSort: TableView['setElectricalTableSort'];
  setOverwriteManualChoices: Dispatch<SetStateAction<boolean>>;
  setSystemView: Dispatch<SetStateAction<ElectricalSystemView>>;
  systemView: ElectricalSystemView;
  tableDragging: boolean;
  setTableDragging: Dispatch<SetStateAction<boolean>>;
  tableScrollRegionsRef: RefObject<HTMLDivElement>;
  tableViewState: TableView['tableViewState'];
  toggleParamsPanel: ReturnType<typeof useElecCalcParamsPanelState>['toggleParamsPanel'];
  cableMarkModal: ReturnType<typeof useElecCalcCableMarkModalState>;
  cableSizingModal: DataPlane['cableSizingModal'];
  candidate: CandidateWorkflow['candidate'];
  cableMarkPresentation: ReturnType<typeof useElecCalcCableMarkPresentation>;
  candidateWorkflow: CandidateWorkflow;
  candidateTableViewState: TableView['candidateTableViewState'];
  candidateTableViewActive: TableView['candidateTableViewActive'];
  objectActionModals: ReturnType<typeof useElecCalcObjectActionModals>;
  resetCandidateTableViewState: TableView['resetCandidateTableViewState'];
  setCandidateColumnFilter: TableView['setCandidateColumnFilter'];
  resetCandidateColumnFilter: TableView['resetCandidateColumnFilter'];
  setCandidateTableSort: TableView['setCandidateTableSort'];
  candidateColumnSettingsOpen: boolean;
  setCandidateColumnSettingsOpen: Dispatch<SetStateAction<boolean>>;
  normalizedTableViewSettings: ColumnViewModel['normalizedTableViewSettings'];
  updateCandidateTableColumnPreference:
    PreferenceSettings['updateCandidateTableColumnPreference'];
  columnSettingsOpen: boolean;
  setColumnSettingsOpen: Dispatch<SetStateAction<boolean>>;
  updateTableColumnPreference: PreferenceSettings['updateTableColumnPreference'];
  updateTableSettingsPreference: PreferenceSettings['updateTableSettingsPreference'];
  currentTableViewActive: TableView['currentTableViewActive'];
  cableSelection: ReturnType<typeof useElecCalcCableSelectionMutationFlow>;
  commercialFeaturesAvailable: boolean;
  isEmployee: boolean;
  visibleCandidateColumnMetas: ColumnViewModel['visibleCandidateColumnMetas'];
};

/** Maps orchestrated workspace pieces into presentation-assembly props. */
export function mapWorkspaceToPresentation(p: WorkspacePresentationSource) {
  return {
    ...p.data.presentationBindings,
    project: p.project,
    canMutate: p.canMutate,
    projectId: p.projectId,
    electricalVariant: p.electricalVariant,
    onAssignmentsChanged: p.onAssignmentsChanged,
    activateRowId: p.activateRowId,
    activeElectricalErrorGuidance: p.summary.activeElectricalErrorGuidance,
    activeElectricalErrorItem: p.summary.activeElectricalErrorItem,
    applyElectricalGlideColumnDraftWidth: p.columnPersistence.applyElectricalGlideColumnDraftWidth,
    cableTypeControlLabel: p.summary.cableTypeControlLabel,
    cableTypeOptions: p.cableTypeOptionsState.cableTypeOptions,
    calculatedCount: p.summary.calculatedCount,
    commitElectricalGlideColumnWidth: p.columnPersistence.commitElectricalGlideColumnWidth,
    currentTableViewActive: p.currentTableViewActive,
    electricalColumns: p.mainTable.electricalColumns,
    electricalGlideColumns: p.mainTable.electricalGlideColumns,
    electricalGlideEnabled: p.electricalGlideEnabled,
    electricalInfiniteLoading: p.mainTable.electricalInfiniteLoading,
    electricalPagination: p.mainTable.electricalPagination,
    electricalRowClassName: p.mainTable.electricalRowClassName,
    electricalTableScrollX: p.mainTable.electricalTableScrollX,
    electricalTableScrollY: p.mainTable.electricalTableScrollY,
    electricalVariantName: p.electricalVariantName,
    failedCount: p.summary.failedCount,
    getElectricalGlideCellState: p.mainTable.getElectricalGlideCellState,
    handleCableTypeControlChange: p.cableTypeOptionsState.handleCableTypeControlChange,
    handleElectricalGlideCellAction: p.mainTable.handleElectricalGlideCellAction,
    handleElectricalGlideCommitCell: p.mainTable.handleElectricalGlideCommitCell,
    handleElectricalGlideLoadMore: p.mainTable.handleElectricalGlideLoadMore,
    handleElectricalGlidePageChange: p.mainTable.handleElectricalGlidePageChange,
    handleElectricalGlideStartCellEdit: p.mainTable.handleElectricalGlideStartCellEdit,
    handleElectricalTableChange: p.mainTable.handleElectricalTableChange,
    isJobActive: p.summary.isJobActive,
    jobProgressLabel: p.summary.jobProgressLabel,
    manualCableCount: p.summary.manualCableCount,
    navigate: p.navigate,
    onCancelJob: p.summary.onCancelJob,
    onRecalculateAll: p.summary.onRecalculateAll,
    onRecalculateSelected: p.summary.onRecalculateSelected,
    openColumnSettings: p.columnDraft.openColumnSettings,
    overwriteManualChoices: p.overwriteManualChoices,
    paramsPanelVisible: p.paramsPanelVisible,
    recalc: p.recalc,
    renderManualOverwriteControl: p.summary.renderManualOverwriteControl,
    resetColumnFilter: p.resetColumnFilter,
    resetCurrentTableViewState: p.resetCurrentTableViewState,
    resolvedTableFontSize: p.resolvedTableFontSize,
    selectedHeatLossFailedCount: p.summary.selectedHeatLossFailedCount,
    selectedManualCableCount: p.summary.selectedManualCableCount,
    selectedRecalcCountLabel: p.summary.selectedRecalcCountLabel,
    selectedRecalcDisabled: p.summary.selectedRecalcDisabled,
    selectedRecalcTooltip: p.summary.selectedRecalcTooltip,
    selectedValidObjectsCount: p.summary.selectedValidObjectsCount,
    setColumnFilter: p.setColumnFilter,
    setElectricalTableSort: p.setElectricalTableSort,
    setOverwriteManualChoices: p.setOverwriteManualChoices,
    setRecalc: p.setRecalc,
    setSystemView: p.setSystemView,
    systemView: p.systemView,
    tableDragging: p.tableDragging,
    tableScrollRegionsRef: p.tableScrollRegionsRef,
    tableViewState: p.tableViewState,
    toggleParamsPanel: p.toggleParamsPanel,
    totalCableLength: p.summary.totalCableLength,
    totalCurrent: p.summary.totalCurrent,
    totalObjects: p.summary.totalObjects,
    validObjectsCount: p.summary.validObjectsCount,
    // presentation-only inputs
    cableMarkModalObject: p.cableMarkModal.object,
    cableSizingModalObject: p.cableSizingModal.object,
    cableTypeOptionsForObject: p.cableTypeOptionsState.cableTypeOptionsForObject,
    getObjectActionDisabledReason: p.data.getObjectActionDisabledReason,
    visibleCandidateColumnMetas: p.visibleCandidateColumnMetas,
    commercialFeaturesAvailable: p.commercialFeaturesAvailable,
    isEmployee: p.isEmployee,
    draftTableViewSettings: p.columnDraft.draftTableViewSettings,
    cableSourceOptions: p.cableTypeOptionsState.cableSourceOptions,
    updateDraftCalculationCableSource: p.columnDraft.updateDraftCalculationCableSource,
    deleteCandidateFolderMut: p.candidate.deleteCandidateFolderMut,
    activeCandidateFolderKey: p.candidate.activeCandidateFolderKey,
    activeCustomCandidateFolder: p.candidate.activeCustomCandidateFolder,
    setTableDragging: p.setTableDragging,
    cableMarkModalSelectedCable: p.cableMarkModal.selectedCable,
    cableMarkModalCableType: p.cableMarkModal.cableType,
    isCableMarkPending: p.cableSelection.isCableMarkPending,
    cableMarkModalValue: p.cableMarkModal.value,
    cableMarkModalOptions: p.cableMarkModal.options,
    cableMarkModalTargetVariants: p.cableMarkModal.targetVariants,
    cableMarkModalTargetVariantOptions: p.cableMarkModal.targetVariantOptions,
    changeCableMarkModalCableType: p.cableMarkModal.changeCableType,
    setCableMarkModalValue: p.cableMarkModal.setValue,
    setCableMarkModalTargetVariantsFromValues: p.cableMarkModal.setTargetVariantsFromValues,
    applyCableMarkModal: p.cableSelection.applyCableMarkModal,
    closeCableMarkModal: p.cableMarkModal.close,
    cableSizingModal: p.cableSizingModal,
    candidate: p.candidate,
    cableSizingModalSelectedCable: p.cableMarkPresentation.cableSizingModalSelectedCable,
    electricalCandidateGlideColumns: p.candidateWorkflow.electricalCandidateGlideColumns,
    candidateTableViewState: p.candidateTableViewState,
    candidateTableViewActive: p.candidateTableViewActive,
    closeCableSizingModal: p.objectActionModals.closeCableSizingModal,
    openCandidateColumnSettings: p.columnDraft.openCandidateColumnSettings,
    resetCandidateTableViewState: p.resetCandidateTableViewState,
    getElectricalCandidateGlideCellState: p.candidateWorkflow.getElectricalCandidateGlideCellState,
    handleElectricalCandidateGlideCellAction: p.candidateWorkflow.handleElectricalCandidateGlideCellAction,
    getElectricalCandidateGlideActionMenuItems: p.candidateWorkflow.getElectricalCandidateGlideActionMenuItems,
    setCandidateColumnFilter: p.setCandidateColumnFilter,
    resetCandidateColumnFilter: p.resetCandidateColumnFilter,
    setCandidateTableSort: p.setCandidateTableSort,
    applyElectricalCandidateGlideColumnDraftWidth:
      p.columnPersistence.applyElectricalCandidateGlideColumnDraftWidth,
    commitElectricalCandidateGlideColumnWidth:
      p.columnPersistence.commitElectricalCandidateGlideColumnWidth,
    candidateFolderModalOpen: p.candidate.candidateFolderModalOpen,
    candidateFolderModalMode: p.candidate.candidateFolderModalMode,
    createCandidateFolderMut: p.candidate.createCandidateFolderMut,
    updateCandidateFolderMut: p.candidate.updateCandidateFolderMut,
    candidateFolderName: p.candidate.candidateFolderName,
    submitCandidateFolderModal: p.candidate.submitCandidateFolderModal,
    closeCandidateFolderModal: p.candidate.closeCandidateFolderModal,
    setCandidateFolderName: p.candidate.setCandidateFolderName,
    candidateColumnSettingsOpen: p.candidateColumnSettingsOpen,
    setCandidateColumnSettingsOpen: p.setCandidateColumnSettingsOpen,
    draftCandidateTableColumnSettings: p.columnDraft.draftCandidateTableColumnSettings,
    normalizedTableViewSettings: p.normalizedTableViewSettings,
    updateCandidateTableColumnPreference: p.updateCandidateTableColumnPreference,
    applyCandidateColumnSettings: p.columnDraft.applyCandidateColumnSettings,
    selectAllDraftCandidateColumns: p.columnDraft.selectAllDraftCandidateColumns,
    resetDraftCandidateColumns: p.columnDraft.resetDraftCandidateColumns,
    updateDraftCandidateColumn: p.columnDraft.updateDraftCandidateColumn,
    updateDraftCandidateColumnOrder: p.columnDraft.updateDraftCandidateColumnOrder,
    reorderDraftCandidateColumn: p.columnDraft.reorderDraftCandidateColumn,
    updateDraftCandidateColumnWidth: p.columnDraft.updateDraftCandidateColumnWidth,
    resetDraftCandidateColumnWidth: p.columnDraft.resetDraftCandidateColumnWidth,
    columnSettingsOpen: p.columnSettingsOpen,
    setColumnSettingsOpen: p.setColumnSettingsOpen,
    draftTableColumnSettings: p.columnDraft.draftTableColumnSettings,
    updateTableColumnPreference: p.updateTableColumnPreference,
    updateTableSettingsPreference: p.updateTableSettingsPreference,
    applyColumnSettings: p.columnDraft.applyColumnSettings,
    selectAllDraftColumns: p.columnDraft.selectAllDraftColumns,
    resetDraftColumns: p.columnDraft.resetDraftColumns,
    updateDraftColumn: p.columnDraft.updateDraftColumn,
    updateDraftColumnOrder: p.columnDraft.updateDraftColumnOrder,
    reorderDraftColumn: p.columnDraft.reorderDraftColumn,
    updateDraftColumnWidth: p.columnDraft.updateDraftColumnWidth,
    resetDraftColumnWidth: p.columnDraft.resetDraftColumnWidth,
    updateDraftTableFontSize: p.columnDraft.updateDraftTableFontSize,
    updateDraftTableLabelFormat: p.columnDraft.updateDraftTableLabelFormat,
    updateDraftSettingsLabelFormat: p.columnDraft.updateDraftSettingsLabelFormat,
    resetDraftTableFontSize: p.columnDraft.resetDraftTableFontSize,
    resetDraftLabelFormats: p.columnDraft.resetDraftLabelFormats,
  };
}
