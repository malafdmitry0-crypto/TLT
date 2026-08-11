/**
 * @module electrical/workspace-presentation-assembly
 * @owner electrical
 *
 * ELEC3 presentation surface for ElecCalc workspace.
 *
 * Owns:
 * - modal presentation options (mark/sizing)
 * - workspace UI helpers (type controls, recalc settings, row-drag chrome)
 * - modal props bag + final view-model assemble
 *
 * Does-not: queries, mutations, selection domain, pagination, UUID ER semantics
 */
import { useMemo } from 'react';

import {
  buildElecCalcWorkspaceModalPresentation,
  buildElecCalcWorkspaceModalProps,
} from '@/pages/electrical/elecCalcWorkspaceModalPropsModel';
import { assembleElecCalcWorkspaceViewModel } from '@/pages/electrical/elecCalcWorkspacePresentationModel';
import { useElecCalcWorkspaceUiHelpers } from '@/pages/electrical/useElecCalcWorkspaceUiHelpers';
import type { mapWorkspaceToPresentation } from '@/pages/electrical/elecCalcWorkspacePresentationMap';

/**
 * The mapper return type is the compile-time workspace presentation contract.
 */
export function useElecCalcWorkspacePresentationAssembly(
  input: ReturnType<typeof mapWorkspaceToPresentation>,
) {
  const {
    cableMarkModalCableTypeOptions,
    cableSizingModalCableTypeOptions,
    cableMarkModalAssignmentReason,
    cableSizingModalAssignmentReason,
    cableSizingCandidateTableScrollX,
  } = useMemo(
    () => buildElecCalcWorkspaceModalPresentation({
      cableMarkModalObject: input.cableMarkModalObject,
      cableSizingModalObject: input.cableSizingModalObject,
      cableTypeOptionsForObject: input.cableTypeOptionsForObject,
      getObjectActionDisabledReason: input.getObjectActionDisabledReason,
      visibleCandidateColumnMetas: input.visibleCandidateColumnMetas,
    }),
    [
      input.cableMarkModalObject,
      input.cableSizingModalObject,
      input.cableTypeOptionsForObject,
      input.getObjectActionDisabledReason,
      input.visibleCandidateColumnMetas,
    ],
  );

  const {
    defaultElectricalTypeControls,
    renderElectricalTypeControls,
    renderRecalculationSettings,
    showDeleteCandidateFolderConfirm,
    candidateFolderEmptyText,
    handleTableRowDragStart,
    handleTableRowDragEnd,
  } = useElecCalcWorkspaceUiHelpers({
    canMutate: input.canMutate,
    visibleCableTypeControl: input.cableTypes.visibleCableTypeControl,
    recalc: input.recalc,
    setRecalc: input.setRecalc,
    commercialFeaturesAvailable: input.commercialFeaturesAvailable,
    isEmployee: input.isEmployee,
    calculationCableSource: input.draftTableViewSettings.calculationCableSource,
    cableSourceOptions: input.cableSourceOptions,
    commercialDataStatus: input.commercialDataStatus,
    technicalDataStatus: input.technicalDataStatus,
    updateDraftCalculationCableSource: input.updateDraftCalculationCableSource,
    deleteCandidateFolder: (id) => input.deleteCandidateFolderMut.mutate(id),
    activeCandidateFolderKey: input.activeCandidateFolderKey,
    hasActiveCustomFolder: Boolean(input.activeCustomCandidateFolder),
    selectedRowKeys: input.selectedRowKeys,
    setTableDragging: input.setTableDragging,
  });

  const workspaceModalProps = buildElecCalcWorkspaceModalProps({
    cableMarkModalObject: input.cableMarkModalObject,
    cableMarkModalSelectedCable: input.cableMarkModalSelectedCable,
    cableMarkModalCableType: input.cableMarkModalCableType,
    cableMarkModalCableTypeOptions,
    commercialFeaturesAvailable: input.commercialFeaturesAvailable,
    project: input.project,
    canMutate: input.canMutate,
    cableMarkModalAssignmentReason,
    isCableMarkPending: input.isCableMarkPending,
    cableMarkModalValue: input.cableMarkModalValue,
    cableMarkModalThreadCountValue: input.cableMarkModalThreadCountValue,
    cableMarkModalOptions: input.cableMarkModalOptions,
    cableMarkModalAutoAvailability: input.cableMarkModalAutoAvailability,
    retryCableMarkModalAutoAvailability: input.retryCableMarkModalAutoAvailability,
    electricalVariantName: input.electricalVariantName,
    renderElectricalTypeControls,
    changeCableMarkModalCableType: input.changeCableMarkModalCableType,
    setCableMarkModalValue: input.setCableMarkModalValue,
    setCableMarkModalThreadCountValue: input.setCableMarkModalThreadCountValue,
    applyCableMarkModal: input.applyCableMarkModal,
    closeCableMarkModal: input.closeCableMarkModal,
    cableSizingModalAssignmentReason,
    cableSizingModal: input.cableSizingModal,
    candidate: input.candidate,
    cableSizingModalSelectedCable: input.cableSizingModalSelectedCable,
    cableSizingModalCableTypeOptions,
    cableSizingManualOptions: input.cableSizingManualOptions,
    cableSizingCandidateTableScrollX,
    resolvedTableFontSize: input.resolvedTableFontSize,
    electricalCandidateGlideColumns: input.electricalCandidateGlideColumns,
    candidateTableViewState: input.candidateTableViewState,
    candidateTableViewActive: input.candidateTableViewActive,
    cableTypes: input.cableTypes,
    closeCableSizingModal: input.closeCableSizingModal,
    setRecalc: input.setRecalc,
    openCandidateColumnSettings: input.openCandidateColumnSettings,
    resetCandidateTableViewState: input.resetCandidateTableViewState,
    candidateFolderEmptyText,
    showDeleteCandidateFolderConfirm,
    getElectricalCandidateGlideCellState: input.getElectricalCandidateGlideCellState,
    handleElectricalCandidateGlideCellAction: input.handleElectricalCandidateGlideCellAction,
    getElectricalCandidateGlideActionMenuItems: input.getElectricalCandidateGlideActionMenuItems,
    setCandidateColumnFilter: input.setCandidateColumnFilter,
    resetCandidateColumnFilter: input.resetCandidateColumnFilter,
    setCandidateTableSort: input.setCandidateTableSort,
    applyElectricalCandidateGlideColumnDraftWidth: input.applyElectricalCandidateGlideColumnDraftWidth,
    commitElectricalCandidateGlideColumnWidth: input.commitElectricalCandidateGlideColumnWidth,
    candidateFolderModalOpen: input.candidateFolderModalOpen,
    candidateFolderModalMode: input.candidateFolderModalMode,
    createCandidateFolderMut: input.createCandidateFolderMut,
    updateCandidateFolderMut: input.updateCandidateFolderMut,
    candidateFolderName: input.candidateFolderName,
    submitCandidateFolderModal: input.submitCandidateFolderModal,
    closeCandidateFolderModal: input.closeCandidateFolderModal,
    setCandidateFolderName: input.setCandidateFolderName,
    candidateColumnSettingsOpen: input.candidateColumnSettingsOpen,
    setCandidateColumnSettingsOpen: input.setCandidateColumnSettingsOpen,
    draftCandidateTableColumnSettings: input.draftCandidateTableColumnSettings,
    normalizedTableViewSettings: input.normalizedTableViewSettings,
    updateCandidateTableColumnPreference: input.updateCandidateTableColumnPreference,
    applyCandidateColumnSettings: input.applyCandidateColumnSettings,
    selectAllDraftCandidateColumns: input.selectAllDraftCandidateColumns,
    resetDraftCandidateColumns: input.resetDraftCandidateColumns,
    updateDraftCandidateColumn: input.updateDraftCandidateColumn,
    updateDraftCandidateColumnOrder: input.updateDraftCandidateColumnOrder,
    reorderDraftCandidateColumn: input.reorderDraftCandidateColumn,
    updateDraftCandidateColumnWidth: input.updateDraftCandidateColumnWidth,
    resetDraftCandidateColumnWidth: input.resetDraftCandidateColumnWidth,
    columnSettingsOpen: input.columnSettingsOpen,
    setColumnSettingsOpen: input.setColumnSettingsOpen,
    draftTableColumnSettings: input.draftTableColumnSettings,
    draftTableViewSettings: input.draftTableViewSettings,
    updateTableColumnPreference: input.updateTableColumnPreference,
    updateTableSettingsPreference: input.updateTableSettingsPreference,
    applyColumnSettings: input.applyColumnSettings,
    selectAllDraftColumns: input.selectAllDraftColumns,
    resetDraftColumns: input.resetDraftColumns,
    updateDraftColumn: input.updateDraftColumn,
    updateDraftColumnOrder: input.updateDraftColumnOrder,
    reorderDraftColumn: input.reorderDraftColumn,
    updateDraftColumnWidth: input.updateDraftColumnWidth,
    resetDraftColumnWidth: input.resetDraftColumnWidth,
    updateDraftTableFontSize: input.updateDraftTableFontSize,
    updateDraftTableLabelFormat: input.updateDraftTableLabelFormat,
    updateDraftSettingsLabelFormat: input.updateDraftSettingsLabelFormat,
    resetDraftTableFontSize: input.resetDraftTableFontSize,
    resetDraftLabelFormats: input.resetDraftLabelFormats,
    renderRecalculationSettings,
  });

  // Spread preserves host field types; overrides replace presentation-owned keys.
  return assembleElecCalcWorkspaceViewModel({
    ...input,
    workspaceModalProps,
    defaultElectricalTypeControls,
    handleTableRowDragStart,
    handleTableRowDragEnd,
  });
}
