/**
 * @module electrical/workspace-presentation-overlays-map
 * @owner electrical
 * Candidate / modals / candidate-settings slice of presentation mapping.
 */
import type { Dispatch, SetStateAction } from 'react';

import type { useElecCalcCableMarkModalState } from '@/pages/electrical/useElecCalcCableMarkModalState';
import type { useElecCalcCableMarkPresentation } from '@/pages/electrical/useElecCalcCableMarkPresentation';
import type { useElecCalcCandidateWorkflowController } from '@/pages/electrical/useElecCalcCandidateWorkflowController';
import type { useElecCalcColumnViewModel } from '@/pages/electrical/useElecCalcColumnViewModel';
import type { useElecCalcObjectActionModals } from '@/pages/electrical/useElecCalcObjectActionModals';
import type { useElecCalcPreferenceSettings } from '@/pages/electrical/useElecCalcPreferenceSettings';
import type { useElecCalcTableViewState } from '@/pages/electrical/useElecCalcTableViewState';
import type { useElecCalcWorkspaceDataPlane } from '@/pages/electrical/useElecCalcWorkspaceDataPlane';
import type {
  WorkspacePresentationCatalog,
  WorkspacePresentationCore,
  WorkspacePresentationSettings,
} from '@/pages/electrical/elecCalcWorkspacePresentationCoreTableMap';

type DataPlane = ReturnType<typeof useElecCalcWorkspaceDataPlane>;
type CandidateWorkflow = ReturnType<typeof useElecCalcCandidateWorkflowController>;
type ColumnViewModel = ReturnType<typeof useElecCalcColumnViewModel>;
type PreferenceSettings = ReturnType<typeof useElecCalcPreferenceSettings>;
type TableView = ReturnType<typeof useElecCalcTableViewState>;

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

/** Mark/sizing modals and object action openers. */
export type WorkspacePresentationModals = {
  cableMarkModal: ReturnType<typeof useElecCalcCableMarkModalState>;
  cableSizingModal: DataPlane['cableSizingModal'];
  cableMarkPresentation: ReturnType<typeof useElecCalcCableMarkPresentation>;
  objectActionModals: ReturnType<typeof useElecCalcObjectActionModals>;
};

export type OverlaysPresentationSource = {
  core: WorkspacePresentationCore;
  candidate: WorkspacePresentationCandidate;
  catalog: WorkspacePresentationCatalog;
  settings: WorkspacePresentationSettings;
  modals: WorkspacePresentationModals;
};

/** Candidate/modals/overlay fields for presentation assembly. */
export function mapOverlaysToPresentation(source: OverlaysPresentationSource) {
  const { candidate, settings, modals } = source;
  return {
    // presentation-only inputs
    cableMarkModalObject: modals.cableMarkModal.object,
    cableSizingModalObject: modals.cableSizingModal.object,
    visibleCandidateColumnMetas: candidate.visibleCandidateColumnMetas,
    deleteCandidateFolderMut: candidate.candidate.deleteCandidateFolderMut,
    activeCandidateFolderKey: candidate.candidate.activeCandidateFolderKey,
    activeCustomCandidateFolder: candidate.candidate.activeCustomCandidateFolder,
    cableMarkModalSelectedCable: modals.cableMarkModal.selectedCable,
    cableMarkModalCableType: modals.cableMarkModal.cableType,
    cableMarkModalValue: modals.cableMarkModal.value,
    cableMarkModalOptions: modals.cableMarkModal.options,
    cableMarkModalTargetVariants: modals.cableMarkModal.targetVariants,
    cableMarkModalTargetVariantOptions: modals.cableMarkModal.targetVariantOptions,
    changeCableMarkModalCableType: modals.cableMarkModal.changeCableType,
    setCableMarkModalValue: modals.cableMarkModal.setValue,
    setCableMarkModalTargetVariantsFromValues:
      modals.cableMarkModal.setTargetVariantsFromValues,
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
  };
}
