/**
 * @module electrical/workspace-model
 * @owner electrical
 * Orchestration bag for ElecCalcWorkspace.
 * Session (auth/boot/system/variant/focus): useElecCalcWorkspaceSessionController.
 * Data plane (queries/selection/batch): useElecCalcWorkspaceDataPlane.
 * Column preferences / table view / settings draft: useElecCalcWorkspaceColumnSettingsController.
 */
import { useEffect, useState } from 'react';

import { type CableSource } from '@/api/calculations';
import type { ElectricalVariant } from '@/types/electricalVariant';
import { useElecCalcObjectActionModals } from '@/pages/electrical/useElecCalcObjectActionModals';
import { useElecCalcCableTypeOptions } from '@/pages/electrical/useElecCalcCableTypeOptions';
import { useElecCalcCableMarkPresentation } from '@/pages/electrical/useElecCalcCableMarkPresentation';
import { useElecCalcCableMarkModalState } from '@/pages/electrical/useElecCalcCableMarkModalState';
import { useElecCalcCandidateWorkflowController } from '@/pages/electrical/useElecCalcCandidateWorkflowController';
import { useElecCalcCableSelectionMutationFlow } from '@/pages/electrical/useElecCalcCableSelectionMutationFlow';
import { useElecCalcFilterOptions } from '@/pages/electrical/useElecCalcFilterOptions';
import { useElecCalcMainTableController } from '@/pages/electrical/useElecCalcMainTableController';
import { useElecCalcPaginationState } from '@/pages/electrical/useElecCalcPaginationState';
import { useElecCalcWorkspaceColumnSettingsController } from '@/pages/electrical/useElecCalcWorkspaceColumnSettingsController';
import { useElecCalcWorkspaceDataPlane } from '@/pages/electrical/useElecCalcWorkspaceDataPlane';
import { useElecCalcWorkspaceSessionController } from '@/pages/electrical/useElecCalcWorkspaceSessionController';
import { mapWorkspaceToPresentation } from '@/pages/electrical/elecCalcWorkspacePresentationMap';
import { useElecCalcWorkspacePresentationAssembly } from '@/pages/electrical/useElecCalcWorkspacePresentationAssembly';
import { useElecCalcWorkspaceSummaryChrome } from '@/pages/electrical/useElecCalcWorkspaceSummaryChrome';
import { useElecCalcRecalculationParams } from '@/pages/electrical/useElecCalcRecalculationParams';
import {
  type ElectricalBatchJobCompletion,
  type RegisterElectricalBatchJob,
  type TrackedElectricalBatchJob,
} from '@/pages/electrical/useElectricalBatchJobTracker';

export type ElecCalcWorkspaceProps = {
  projectId: string;
  electricalVariant: ElectricalVariant;
  electricalVariants: ElectricalVariant[];
  canMutate: boolean;
  trackedJob: TrackedElectricalBatchJob | null;
  completion: ElectricalBatchJobCompletion | null;
  registerJob: RegisterElectricalBatchJob;
  onAssignmentsChanged?: () => void;
};


export function useElecCalcWorkspaceModel({
  projectId,
  electricalVariant,
  electricalVariants,
  canMutate,
  trackedJob,
  completion,
  registerJob,
  onAssignmentsChanged,
}: ElecCalcWorkspaceProps) {
  const {
    project,
    registeredUserId,
    isEmployee,
    isRegisteredUser,
    commercialFeaturesAvailable,
    navigate,
    systemView,
    setSystemView,
    tableDragging,
    setTableDragging,
    availableCableTypeKeys,
    availableCableTypes,
    electricalGlideEnabled,
    variant,
    electricalVariantId,
    electricalVariantName,
    tableScrollRegionsRef,
  } = useElecCalcWorkspaceSessionController({ electricalVariant });

  const { values: recalc, setters: setRecalc } = useElecCalcRecalculationParams();
  const {
    tablePage,
    tablePageSize,
    electricalPageCursor,
    electricalInfinitePages,
    setTablePage,
    setTablePageSize,
    resetTablePage,
    resetPaginationCache,
    rememberElectricalPage,
    rememberNextCursor,
    loadNextElectricalGlidePage,
  } = useElecCalcPaginationState();

  const columnSettings = useElecCalcWorkspaceColumnSettingsController({
    isRegisteredUser,
    registeredUserId,
    isEmployee,
    resetElectricalTablePage: resetTablePage,
  });

  const cableSource: CableSource = isEmployee
    ? columnSettings.tableViewSettings.calculationCableSource
    : 'builtin';
  const effectiveSource: CableSource = commercialFeaturesAvailable ? cableSource : 'builtin';
  const [overwriteManualChoices, setOverwriteManualChoices] = useState(false);

  const data = useElecCalcWorkspaceDataPlane({
    projectId,
    project,
    electricalVariantId,
    electricalVariantName,
    variant,
    canMutate,
    trackedJob,
    completion,
    registerJob,
    cableSource,
    effectiveSource,
    commercialFeaturesAvailable,
    availableCableTypes,
    electricalGlideEnabled,
    systemView,
    tableViewState: columnSettings.tableViewState,
    tablePage,
    tablePageSize,
    electricalPageCursor,
    electricalInfinitePages,
    recalc,
    resetTablePage,
    resetPaginationCache,
    rememberElectricalPage,
    rememberNextCursor,
    resetCandidateTableViewState: columnSettings.resetCandidateTableViewState,
  });
  const {
    cableTypes,
    cableSizingModal,
    stats,
    objects,
    selectedRowKeys,
    activateRowId,
    setElectricalQueryCalculation,
  } = data;

  const candidateWorkflow = useElecCalcCandidateWorkflowController({
    projectId: project?.id,
    electricalVariantId,
    canMutate,
    variant,
    effectiveSource,
    setElectricalQueryCalculation,
    cableSizingModal,
    candidateTableViewState: columnSettings.candidateTableViewState,
    visibleCandidateColumnMetas: columnSettings.visibleCandidateColumnMetas,
  });
  const { candidate } = candidateWorkflow;

  const cableMarkPresentation = useElecCalcCableMarkPresentation({
    effectiveSource,
    cableRowsForType: data.cableRowsForType,
    manualCableOptionsForType: data.manualCableOptionsForType,
    cableSizingEffectiveCableType: cableSizingModal.effectiveCableType,
    cableSizingManualMark: cableSizingModal.manualMark,
    cableSizingModalCalc: cableSizingModal.calc,
  });
  const cableMarkModal = useElecCalcCableMarkModalState({
    objects,
    calcByObjectId: stats.calcByObjectId,
    electricalVariants,
    electricalVariantId,
    getSavedCableTypeForObject: cableTypes.getSavedCableTypeForObject,
    normalizeAvailableCableType: cableTypes.normalizeAvailableCableType,
    cableMarkOptionsFor: data.cableMarkOptionsFor,
    cableMarkValueForCalc: cableMarkPresentation.cableMarkValueForCalc,
    findCableRowForMark: cableMarkPresentation.findCableRowForMark,
    onOpenObject: (object) => activateRowId(object.id),
    onCableTypeChange: () => setRecalc.connectionType('line_1ph'),
  });
  const cableSelection = useElecCalcCableSelectionMutationFlow({
    projectId: project?.id,
    electricalVariantId,
    electricalVariantName,
    canMutate,
    variant,
    effectiveSource,
    recalc,
    normalizeAvailableCableType: cableTypes.normalizeAvailableCableType,
    setElectricalQueryCalculation,
    assignmentByObjectId: data.assignmentByObjectId,
    objects,
    cableMarkModalObject: cableMarkModal.object,
    cableMarkModalCableType: cableMarkModal.cableType,
    cableMarkModalValue: cableMarkModal.value,
    cableMarkModalTargetVariantsForSubmit: cableMarkModal.targetVariantsForSubmit,
    cableMarkModalOptionByValue: cableMarkModal.optionByValue,
    closeCableMarkModal: cableMarkModal.close,
  });

  const normalizeSelectedCableType = cableMarkModal.normalizeSelectedCableType;
  useEffect(() => {
    normalizeSelectedCableType();
  }, [normalizeSelectedCableType]);

  const objectActionModals = useElecCalcObjectActionModals({
    getObjectActionDisabledReason: data.getObjectActionDisabledReason,
    preferredObjectActionCableType: data.preferredObjectActionCableType,
    objectActionCableType: cableTypes.getSavedCableTypeForObject,
    openCableMarkModalState: cableMarkModal.open,
    changeCableMarkModalCableType: cableMarkModal.changeCableType,
    activateRowId,
    openCableSizingModalState: cableSizingModal.openModalState,
    setCableSizingCableType: cableSizingModal.setCableType,
    resetConnectionTypeOnPreferredChange: () => setRecalc.connectionType('line_1ph'),
    resetMarkedCableSizingCandidates: candidate.resetMarkedCableSizingCandidates,
    setActiveCandidateFolderKey: candidate.setActiveCandidateFolderKey,
    resetCableSizingModalState: cableSizingModal.resetModalState,
    closeCandidateFolderModal: candidate.closeCandidateFolderModal,
    setCandidateColumnSettingsOpen: columnSettings.setCandidateColumnSettingsOpen,
  });
  const {
    fieldCapabilityByKey,
    enumOptionsByColumn,
  } = useElecCalcFilterOptions({
    electricalFields: data.electricalQueryCapabilities?.fields,
    cableSizingCandidates: candidate.cableSizingCandidates,
    visibleCandidateColumnMetas: columnSettings.visibleCandidateColumnMetas,
    candidateColumnValueAccessors: candidate.candidateColumnValueAccessors,
  });

  const mainTable = useElecCalcMainTableController({
    activeRowId: data.activeRowId,
    activateRowId,
    assignmentByObjectId: data.assignmentByObjectId,
    canMutate,
    calcByObjectId: stats.calcByObjectId,
    effectiveSource,
    electricalDisplayOffset: data.electricalDisplayOffset,
    electricalGlideEnabled,
    electricalLayoutMutate: cableSelection.electricalLayoutMutate,
    enumOptionsByColumn,
    fieldCapabilityByKey,
    filteredCount: data.electricalPage?.counts?.filtered,
    getCalculatedCableTypeForObject: cableTypes.getCalculatedCableTypeForObject,
    getObjectActionDisabledReason: data.getObjectActionDisabledReason,
    getObjectCalculationDisabledReason: data.getObjectCalculationDisabledReason,
    getSavedCableTypeForObject: cableTypes.getSavedCableTypeForObject,
    hasNextPage: Boolean(data.pageInfo?.has_next_page),
    isCableMarkPending: cableSelection.isCableMarkPending,
    isElectricalPageFetching: data.isElectricalPageFetching,
    loadNextElectricalGlidePage,
    nextElectricalPageCursor: data.nextElectricalPageCursor,
    objects,
    openCableMarkModal: objectActionModals.openCableMarkModal,
    openCableSizingModal: objectActionModals.openCableSizingModal,
    pageSummary: data.pageSummary,
    projectSelected: Boolean(project),
    recalc,
    selectedRowKeys: data.compatibleSelectedRowKeys,
    setColumnFilter: columnSettings.setColumnFilter,
    setTablePage,
    setTablePageSize,
    setTableViewState: columnSettings.setTableViewState,
    startColumnResize: columnSettings.columnPersistence.startColumnResize,
    resetColumnFilter: columnSettings.resetColumnFilter,
    tablePage,
    tablePageSize,
    tableViewState: columnSettings.tableViewState,
    visibleElectricalColumnMetas: columnSettings.visibleElectricalColumnMetas,
  });

  const summary = useElecCalcWorkspaceSummaryChrome({
    pageSummary: data.pageSummary,
    objects,
    elecCalcsCount: data.elecCalcs.length,
    compatibleSelectedRowKeys: data.compatibleSelectedRowKeys,
    stats,
    activeJob: data.activeJob,
    activeJobId: data.activeJobId,
    canMutate,
    overwriteManualChoices,
    setOverwriteManualChoices,
    electricalDisplayOffset: data.electricalDisplayOffset,
    activeRowId: data.activeRowId,
    selectedRowKeys,
    assignmentByObjectId: data.assignmentByObjectId,
    cableTypeForRecalculation: cableTypes.cableTypeForRecalculation,
    mutateBatch: (args) => data.batchMut.mutate(args),
    cancelJob: () => data.cancelJobMut.mutate(),
    calcByObjectId: stats.calcByObjectId,
  });
  const cableTypeOptionsState = useElecCalcCableTypeOptions({
    availableCableTypeKeys,
    assignmentByObjectId: data.assignmentByObjectId,
    isEmployee,
    canMutate,
    selectedRowKeys,
    normalizeAvailableCableType: cableTypes.normalizeAvailableCableType,
    setDefaultCableType: cableTypes.setDefaultCableType,
    setCableTypeDraftByObjectId: cableTypes.setCableTypeDraftByObjectId,
    getSavedCableTypeForObject: cableTypes.getSavedCableTypeForObject,
    resetConnectionType: () => setRecalc.connectionType('line_1ph'),
  });

  return useElecCalcWorkspacePresentationAssembly(mapWorkspaceToPresentation({
    core: {
      data,
      project,
      canMutate,
      projectId,
      electricalVariant,
      onAssignmentsChanged,
      activateRowId,
      navigate,
      commercialFeaturesAvailable,
      isEmployee,
    },
    table: {
      summary,
      mainTable,
      electricalGlideEnabled,
      electricalVariantName,
      currentTableViewActive: columnSettings.currentTableViewActive,
      tableDragging,
      setTableDragging,
      tableScrollRegionsRef,
      tableViewState: columnSettings.tableViewState,
      setColumnFilter: columnSettings.setColumnFilter,
      resetColumnFilter: columnSettings.resetColumnFilter,
      setElectricalTableSort: columnSettings.setElectricalTableSort,
      resetCurrentTableViewState: columnSettings.resetCurrentTableViewState,
      resolvedTableFontSize: columnSettings.resolvedTableFontSize,
      normalizedTableViewSettings: columnSettings.normalizedTableViewSettings,
      systemView,
      setSystemView,
    },
    candidate: {
      candidate,
      candidateWorkflow,
      candidateTableViewState: columnSettings.candidateTableViewState,
      candidateTableViewActive: columnSettings.candidateTableViewActive,
      resetCandidateTableViewState: columnSettings.resetCandidateTableViewState,
      setCandidateColumnFilter: columnSettings.setCandidateColumnFilter,
      resetCandidateColumnFilter: columnSettings.resetCandidateColumnFilter,
      setCandidateTableSort: columnSettings.setCandidateTableSort,
      candidateColumnSettingsOpen: columnSettings.candidateColumnSettingsOpen,
      setCandidateColumnSettingsOpen: columnSettings.setCandidateColumnSettingsOpen,
      updateCandidateTableColumnPreference: columnSettings.updateCandidateTableColumnPreference,
      visibleCandidateColumnMetas: columnSettings.visibleCandidateColumnMetas,
    },
    catalog: {
      cableTypeOptionsState,
      cableSelection,
      recalc,
      setRecalc,
      overwriteManualChoices,
      setOverwriteManualChoices,
    },
    settings: {
      columnDraft: columnSettings.columnDraft,
      columnPersistence: columnSettings.columnPersistence,
      columnSettingsOpen: columnSettings.columnSettingsOpen,
      setColumnSettingsOpen: columnSettings.setColumnSettingsOpen,
      updateTableColumnPreference: columnSettings.updateTableColumnPreference,
      updateTableSettingsPreference: columnSettings.updateTableSettingsPreference,
      paramsPanelVisible: columnSettings.paramsPanelVisible,
      toggleParamsPanel: columnSettings.toggleParamsPanel,
    },
    modals: {
      cableMarkModal,
      cableSizingModal,
      cableMarkPresentation,
      objectActionModals,
    },
  }));
}
