/**
 * @module electrical/workspace-model
 * @owner electrical
 * Orchestration bag for ElecCalcWorkspace.
 * Data plane (queries/selection/batch): useElecCalcWorkspaceDataPlane.
 */
import {
  useEffect,
  useRef,
  useState,
} from 'react';
import { useLocation, useNavigate } from 'react-router-dom';

import { type CableSource } from '@/api/calculations';
import { useAuthStore } from '@/store/authStore';
import type { CalculationVariant } from '@/store/calculationVariantStore';
import { useProjectStore } from '@/store/projectStore';
import { areCommercialFeaturesEnabled } from '@/config/featureFlags';
import { useFocusableTableScrollRegions } from '@/hooks/useFocusableTableScrollRegions';

import {
  type ElectricalSystemView,
} from '@/pages/electrical/elecCalcSystemViewModel';
import type { ElectricalVariant } from '@/types/electricalVariant';
import { useElecCalcObjectActionModals } from '@/pages/electrical/useElecCalcObjectActionModals';
import { useElecCalcCableTypeOptions } from '@/pages/electrical/useElecCalcCableTypeOptions';
import { useElecCalcParamsPanelState } from '@/pages/electrical/useElecCalcParamsPanelState';
import { useElecCalcCableMarkPresentation } from '@/pages/electrical/useElecCalcCableMarkPresentation';
import { useElecCalcBootViewState } from '@/pages/electrical/useElecCalcBootViewState';
import { useElecCalcCableMarkModalState } from '@/pages/electrical/useElecCalcCableMarkModalState';
import { useElecCalcCandidateWorkflowController } from '@/pages/electrical/useElecCalcCandidateWorkflowController';
import { useElecCalcCableSelectionMutationFlow } from '@/pages/electrical/useElecCalcCableSelectionMutationFlow';
import { useElecCalcColumnPersistence } from '@/pages/electrical/useElecCalcColumnPersistence';
import { useElecCalcColumnSettingsDraftState } from '@/pages/electrical/useElecCalcColumnSettingsDraftState';
import { useElecCalcColumnViewModel } from '@/pages/electrical/useElecCalcColumnViewModel';
import { useElecCalcFilterOptions } from '@/pages/electrical/useElecCalcFilterOptions';
import { useElecCalcMainTableController } from '@/pages/electrical/useElecCalcMainTableController';
import { useElecCalcPaginationState } from '@/pages/electrical/useElecCalcPaginationState';
import { useElecCalcWorkspaceDataPlane } from '@/pages/electrical/useElecCalcWorkspaceDataPlane';
import { mapWorkspaceToPresentation } from '@/pages/electrical/elecCalcWorkspacePresentationMap';
import { useElecCalcWorkspacePresentationAssembly } from '@/pages/electrical/useElecCalcWorkspacePresentationAssembly';
import { useElecCalcWorkspaceSummaryChrome } from '@/pages/electrical/useElecCalcWorkspaceSummaryChrome';
import { useElecCalcPreferenceSettings } from '@/pages/electrical/useElecCalcPreferenceSettings';
import { useElecCalcRecalculationParams } from '@/pages/electrical/useElecCalcRecalculationParams';
import { useElecCalcTableViewState } from '@/pages/electrical/useElecCalcTableViewState';
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
  const project = useProjectStore((s) => s.currentProject);
  const role = useAuthStore((s) => s.role);
  const registeredUserId = useAuthStore((s) => s.user?.id ?? null);
  const isEmployee = role === 'employee' || role === 'admin';
  const isRegisteredUser = isEmployee;
  const commercialFeaturesAvailable = areCommercialFeaturesEnabled();
  const location = useLocation();
  /** One system tab for the whole workspace (assign chrome + filtered table). */
  const [systemView, setSystemView] = useState<ElectricalSystemView>('unassigned');
  const [tableDragging, setTableDragging] = useState(false);
  const {
    availableCableTypeKeys,
    availableCableTypes,
    electricalGlideEnabled,
  } = useElecCalcBootViewState({ location });
  // The parent mounts this workspace only for variants that still have a
  // temporary numeric adapter. UUID remains the identity everywhere else.
  const variant = electricalVariant.legacy_variant_number as CalculationVariant;
  const electricalVariantId = electricalVariant.id;
  const electricalVariantName = electricalVariant.name;

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
  const [columnSettingsOpen, setColumnSettingsOpen] = useState(false);
  const [candidateColumnSettingsOpen, setCandidateColumnSettingsOpen] = useState(false);
  const {
    tableColumnSettings,
    setTableColumnSettings,
    candidateTableColumnSettings,
    setCandidateTableColumnSettings,
    tableViewSettings,
    setTableViewSettings,
    updateTableColumnPreference,
    updateCandidateTableColumnPreference,
    updateTableSettingsPreference,
  } = useElecCalcPreferenceSettings({
    isRegisteredUser,
    registeredUserId,
    setColumnSettingsOpen,
    setCandidateColumnSettingsOpen,
  });
  const {
    normalizedTableViewSettings,
    visibleElectricalColumnMetas,
    visibleCandidateColumnMetas,
    resolvedTableFontSize,
    visibleElectricalColumnKeys,
    visibleCandidateColumnKeys,
  } = useElecCalcColumnViewModel({
    tableColumnSettings,
    candidateTableColumnSettings,
    tableViewSettings,
  });
  const {
    tableViewState,
    candidateTableViewState,
    setTableViewState,
    currentTableViewActive,
    candidateTableViewActive,
    setColumnFilter,
    resetColumnFilter,
    resetCurrentTableViewState,
    setElectricalTableSort,
    setCandidateColumnFilter,
    resetCandidateColumnFilter,
    resetCandidateTableViewState,
    setCandidateTableSort,
  } = useElecCalcTableViewState({
    visibleElectricalColumnKeys,
    visibleCandidateColumnKeys,
    resetElectricalTablePage: resetTablePage,
  });
  const cableSource: CableSource = isEmployee
    ? tableViewSettings.calculationCableSource
    : 'builtin';
  const effectiveSource: CableSource = commercialFeaturesAvailable ? cableSource : 'builtin';
  const [overwriteManualChoices, setOverwriteManualChoices] = useState(false);
  const { paramsPanelVisible, toggleParamsPanel } = useElecCalcParamsPanelState();
  const tableScrollRegionsRef = useRef<HTMLDivElement>(null);
  useFocusableTableScrollRegions(
    tableScrollRegionsRef,
    'Таблица электротехнического расчёта',
    Boolean(project),
  );

  const navigate = useNavigate();
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
    tableViewState,
    tablePage,
    tablePageSize,
    electricalPageCursor,
    electricalInfinitePages,
    recalc,
    resetTablePage,
    resetPaginationCache,
    rememberElectricalPage,
    rememberNextCursor,
    resetCandidateTableViewState,
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
    candidateTableViewState,
    visibleCandidateColumnMetas,
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
    setCandidateColumnSettingsOpen,
  });
  const {
    fieldCapabilityByKey,
    enumOptionsByColumn,
  } = useElecCalcFilterOptions({
    electricalFields: data.electricalQueryCapabilities?.fields,
    cableSizingCandidates: candidate.cableSizingCandidates,
    visibleCandidateColumnMetas,
    candidateColumnValueAccessors: candidate.candidateColumnValueAccessors,
  });

  const columnPersistence = useElecCalcColumnPersistence({
    tableColumnSettings,
    candidateTableColumnSettings,
    isRegisteredUser,
    registeredUserId,
    setTableColumnSettings,
    setCandidateTableColumnSettings,
    setTableViewSettings,
    setColumnSettingsOpen,
    setCandidateColumnSettingsOpen,
    updateTableColumnPreference: updateTableColumnPreference.mutate,
    updateCandidateTableColumnPreference: updateCandidateTableColumnPreference.mutate,
    updateTableSettingsPreference: updateTableSettingsPreference.mutate,
  });

  const columnDraft = useElecCalcColumnSettingsDraftState({
    tableColumnSettings,
    candidateTableColumnSettings,
    tableViewSettings,
    isEmployee,
    setColumnSettingsOpen,
    setCandidateColumnSettingsOpen,
    persistTableSettings: columnPersistence.persistTableSettings,
    persistCandidateTableColumnSettings: columnPersistence.persistCandidateTableColumnSettings,
  });

  const mainTable = useElecCalcMainTableController({
    activeRowId: data.activeRowId,
    activateRowId,
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
    setColumnFilter,
    setTablePage,
    setTablePageSize,
    setTableViewState,
    startColumnResize: columnPersistence.startColumnResize,
    resetColumnFilter,
    tablePage,
    tablePageSize,
    tableViewState,
    visibleElectricalColumnMetas,
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
      currentTableViewActive,
      tableDragging,
      setTableDragging,
      tableScrollRegionsRef,
      tableViewState,
      setColumnFilter,
      resetColumnFilter,
      setElectricalTableSort,
      resetCurrentTableViewState,
      resolvedTableFontSize,
      normalizedTableViewSettings,
      systemView,
      setSystemView,
    },
    candidate: {
      candidate,
      candidateWorkflow,
      candidateTableViewState,
      candidateTableViewActive,
      resetCandidateTableViewState,
      setCandidateColumnFilter,
      resetCandidateColumnFilter,
      setCandidateTableSort,
      candidateColumnSettingsOpen,
      setCandidateColumnSettingsOpen,
      updateCandidateTableColumnPreference,
      visibleCandidateColumnMetas,
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
      columnDraft,
      columnPersistence,
      columnSettingsOpen,
      setColumnSettingsOpen,
      updateTableColumnPreference,
      updateTableSettingsPreference,
      paramsPanelVisible,
      toggleParamsPanel,
    },
    modals: {
      cableMarkModal,
      cableSizingModal,
      cableMarkPresentation,
      objectActionModals,
    },
  }));
}
