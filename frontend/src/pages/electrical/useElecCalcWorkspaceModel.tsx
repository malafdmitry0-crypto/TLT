/**
 * @module electrical/workspace-model
 * @owner electrical
 * Orchestration bag for ElecCalcWorkspace.
 */
import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useLocation, useNavigate } from 'react-router-dom';

import {
  getElectricalQueryCapabilities,
  queryElectrical,
  type CableSource,
} from '@/api/calculations';
import { electricalDataQueryKeys } from '@/api/electricalQueryKeys';
import { useAuthStore } from '@/store/authStore';
import type { CalculationVariant } from '@/store/calculationVariantStore';
import { useProjectStore } from '@/store/projectStore';
import { areCommercialFeaturesEnabled } from '@/config/featureFlags';
import { useFocusableTableScrollRegions } from '@/hooks/useFocusableTableScrollRegions';

import {
  type ElectricalSystemView,
} from '@/pages/electrical/elecCalcSystemViewModel';
import type { ElectricalVariant } from '@/types/electricalVariant';
import type {
  ElectricalCalcSummary,
  ElectricalQueryResponse,
} from '@/types/calculation';
import {
  type ElectricalColumnKey,
} from '@/utils/electricalTableColumns';
import {
  buildElectricalQueryRequest,
  updateElectricalQueryPageCalculation,
} from '@/pages/electrical/elecCalcQueryModel';
import { useElecCalcErrorSummaryState } from '@/pages/electrical/useElecCalcErrorSummaryState';
import { useElecCalcBatchRecalcActions } from '@/pages/electrical/useElecCalcBatchRecalcActions';
import { useElecCalcAssignmentSelectionState } from '@/pages/electrical/useElecCalcAssignmentSelectionState';
import {
  buildElecCalcSummaryViewModel,
} from '@/pages/electrical/elecCalcSummaryModel';
import { useElecCalcObjectActionModals } from '@/pages/electrical/useElecCalcObjectActionModals';
import { useElecCalcGlideLayoutCommit } from '@/pages/electrical/useElecCalcGlideLayoutCommit';
import { useElecCalcCableTypeOptions } from '@/pages/electrical/useElecCalcCableTypeOptions';
import { useElecCalcParamsPanelState } from '@/pages/electrical/useElecCalcParamsPanelState';
import { useElecCalcCableMarkPresentation } from '@/pages/electrical/useElecCalcCableMarkPresentation';
import { ElecCalcManualOverwriteControl } from '@/pages/electrical/ElecCalcManualOverwriteControl';
import type { LegacyElectricalVariantTarget } from '@/pages/electrical/elecCalcVariantModel';
import { useElecCalcAntTableHandlers } from '@/pages/electrical/useElecCalcAntTableHandlers';
import { useElecCalcBootViewState } from '@/pages/electrical/useElecCalcBootViewState';
import { useElecCalcCableReferenceData } from '@/pages/electrical/useElecCalcCableReferenceData';
import { useElecCalcCableMarkModalState } from '@/pages/electrical/useElecCalcCableMarkModalState';
import { useElecCalcCableSizingModalState } from '@/pages/electrical/useElecCalcCableSizingModalState';
import { useElecCalcCableTypeState } from '@/pages/electrical/useElecCalcCableTypeState';
import { useElecCalcBatchJobOrchestration } from '@/pages/electrical/useElecCalcBatchJobOrchestration';
import { useElecCalcCandidateGlideActions } from '@/pages/electrical/useElecCalcCandidateGlideActions';
import { useElecCalcCandidateState } from '@/pages/electrical/useElecCalcCandidateState';
import { useElecCalcCableSelectionMutationFlow } from '@/pages/electrical/useElecCalcCableSelectionMutationFlow';
import { useElecCalcColumnPersistence } from '@/pages/electrical/useElecCalcColumnPersistence';
import { useElecCalcColumnSettingsDraftState } from '@/pages/electrical/useElecCalcColumnSettingsDraftState';
import { useElecCalcColumnViewModel } from '@/pages/electrical/useElecCalcColumnViewModel';
import { useElecCalcDataLifecycleEffects } from '@/pages/electrical/useElecCalcDataLifecycleEffects';
import { useElecCalcElectricalColumns } from '@/pages/electrical/useElecCalcElectricalColumns';
import { useElecCalcElectricalColumnCopyValue } from '@/pages/electrical/useElecCalcElectricalColumnCopyValue';
import { useElecCalcElectricalColumnRenderers } from '@/pages/electrical/useElecCalcElectricalColumnRenderers';
import { useElecCalcFilterOptions } from '@/pages/electrical/useElecCalcFilterOptions';
import { useElecCalcCandidateGlideCellState } from '@/pages/electrical/useElecCalcCandidateGlideCellState';
import { useElecCalcGlideActions } from '@/pages/electrical/useElecCalcGlideActions';
import { useElecCalcGlideColumnModel } from '@/pages/electrical/useElecCalcGlideColumnModel';
import { useElecCalcGlideCellState } from '@/pages/electrical/useElecCalcGlideCellState';
import { useElecCalcPageScopeEffects } from '@/pages/electrical/useElecCalcPageScopeEffects';
import { useElecCalcPaginationState } from '@/pages/electrical/useElecCalcPaginationState';
import { useElecCalcPreferenceSettings } from '@/pages/electrical/useElecCalcPreferenceSettings';
import { useElecCalcRecalculationParams } from '@/pages/electrical/useElecCalcRecalculationParams';
import { useElecCalcRowClassName } from '@/pages/electrical/useElecCalcRowClassName';
import { useElecCalcRowSelectionState } from '@/pages/electrical/useElecCalcRowSelectionState';
import { useElecCalcSelectedRowsClipboardEffect } from '@/pages/electrical/useElecCalcSelectedRowsClipboardEffect';
import { useElecCalcTableProjection } from '@/pages/electrical/useElecCalcTableProjection';
import { useElecCalcTableDimensions } from '@/pages/electrical/useElecCalcTableDimensions';
import { useElecCalcTableNavigation } from '@/pages/electrical/useElecCalcTableNavigation';
import { useElecCalcTableViewState } from '@/pages/electrical/useElecCalcTableViewState';
import {
  type ElectricalBatchJobCompletion,
  type RegisterElectricalBatchJob,
  type TrackedElectricalBatchJob,
} from '@/pages/electrical/useElectricalBatchJobTracker';
import { useElecCalcWorkspaceUiHelpers } from '@/pages/electrical/useElecCalcWorkspaceUiHelpers';

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
  } = useElecCalcBootViewState({
    location,
  });
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
  const tableScrollRegionsRef = useRef<HTMLDivElement | null>(null);
  useFocusableTableScrollRegions(
    tableScrollRegionsRef,
    'Таблица электротехнического расчёта',
    Boolean(project),
  );

  const qc = useQueryClient();
  const navigate = useNavigate();

  const {
    data: electricalQueryCapabilities,
    error: electricalCapabilitiesError,
    isError: isElectricalCapabilitiesError,
    refetch: retryElectricalCapabilities,
  } = useQuery({
    queryKey: electricalDataQueryKeys.capabilities(project!.id, electricalVariantId),
    queryFn: () => getElectricalQueryCapabilities(
      project!.id,
      variant,
      electricalVariantId,
    ),
    enabled: !!project,
    staleTime: 60_000,
  });
  const electricalQueryRequest = useMemo(
    () => (project
      ? buildElectricalQueryRequest(
        project.id,
        electricalVariantId,
        variant,
        cableSource,
        tableViewState,
        tablePage,
        tablePageSize,
        electricalQueryCapabilities,
        electricalPageCursor,
      )
      : null),
    [
      electricalPageCursor,
      electricalQueryCapabilities,
      electricalVariantId,
      project,
      cableSource,
      tablePage,
      tablePageSize,
      tableViewState,
      variant,
    ],
  );
  const {
    data: electricalPage,
    isFetching: isElectricalPageFetching,
    isPlaceholderData: isElectricalPagePlaceholderData,
    error: electricalPageError,
    isError: isElectricalPageError,
    refetch: retryElectricalPage,
  } = useQuery({
    queryKey: electricalDataQueryKeys.page(
      project!.id,
      electricalVariantId,
      electricalQueryRequest,
    ),
    queryFn: () => queryElectrical(electricalQueryRequest!),
    enabled: !!project && electricalQueryRequest != null && !!electricalQueryCapabilities,
  });
  const pageSummary = electricalPage?.summary;
  const pageInfo = electricalPage?.page_info;
  const nextElectricalPageCursor = pageInfo?.next_cursor;
  const {
    electricalLoadedPages,
    objects,
    elecCalcs,
    electricalDisplayOffset,
    stats,
  } = useElecCalcTableProjection({
    selectedLegacyVariantNumber: variant,
    electricalGlideEnabled,
    electricalPage,
    electricalInfinitePages,
    isElectricalPagePlaceholderData,
    tablePage,
  });
  const {
    activeRowId,
    selectedRowKeys,
    setSelectedRowKeys,
    activateRowId,
    openElectricalRow,
  } = useElecCalcRowSelectionState({
    projectId: project?.id,
    variant: electricalVariantId,
    tablePage,
    tablePageSize,
    objects,
  });
  const cableTypes = useElecCalcCableTypeState({
    availableCableTypes,
    calcByObjectId: stats.calcByObjectId,
    selectedRowKeys,
    projectId: project?.id,
    variant: electricalVariantId,
  });
  const batchCableType = cableTypes.cableTypeForRecalculation;
  const objectActionCableType = cableTypes.getSavedCableTypeForObject;
  const {
    assignmentByObjectId,
    versionByObjectId,
    scopedObjects,
    compatibleSelectedRowKeys,
    handleAssignmentAwareSelectionChange,
    getObjectActionDisabledReason,
    getObjectCalculationDisabledReason,
    preferredObjectActionCableType,
  } = useElecCalcAssignmentSelectionState({
    electricalLoadedPages,
    objects,
    systemView,
    selectedRowKeys,
    setSelectedRowKeys,
    batchCableType,
    getSavedCableTypeForObject: objectActionCableType,
  });
  const {
    activeJob,
    activeJobId,
    batchMut,
    cancelJobMut,
  } = useElecCalcBatchJobOrchestration({
    canMutate,
    projectId,
    electricalVariantId,
    electricalVariantName,
    trackedJob,
    completion,
    registerJob,
    effectiveSource,
    recalc,
    selectedCableType: cableTypes.selectedCableType,
    defaultCableType: cableTypes.defaultCableType,
    cableTypeForRecalculation: cableTypes.cableTypeForRecalculation,
    normalizeAvailableCableType: cableTypes.normalizeAvailableCableType,
    objectOverridesForIds: cableTypes.objectOverridesForIds,
    setCableTypeDraftByObjectId: cableTypes.setCableTypeDraftByObjectId,
  });

  useElecCalcPageScopeEffects({
    projectId: project?.id,
    variant: electricalVariantId,
    effectiveSource,
    tablePageSize,
    tableViewState,
    resetTablePage,
    resetPaginationCache,
  });

  const cableSizingModal = useElecCalcCableSizingModalState({
    projectId: project?.id,
    electricalVariantId,
    variant,
    objects,
    calcByObjectId: stats.calcByObjectId,
    recalc,
    getSavedCableTypeForObject: cableTypes.getSavedCableTypeForObject,
    normalizeAvailableCableType: cableTypes.normalizeAvailableCableType,
  });
  const {
    objectId: cableSizingModalObjectId,
    setCableType: setCableSizingCableType,
    manualMark: cableSizingManualMark,
    effectiveCableType: cableSizingEffectiveCableType,
    calc: cableSizingModalCalc,
    resetModalState: resetCableSizingModalState,
    openModalState: openCableSizingModalState,
  } = cableSizingModal;

  useElecCalcDataLifecycleEffects({
    electricalGlideEnabled,
    electricalPage,
    isElectricalPageFetching,
    isElectricalPagePlaceholderData,
    rememberElectricalPage,
    cableSizingModalObjectId,
    resetCandidateTableViewState,
    setCableSizingCableType,
    normalizeAvailableCableType: cableTypes.normalizeAvailableCableType,
    nextElectricalPageCursor,
    rememberNextCursor,
  });

  const {
    cableRowsForType,
    commercialDataStatus,
    technicalDataStatus,
    manualCableOptionsForType,
    cableMarkOptionsFor,
    cableSizingManualOptions,
  } = useElecCalcCableReferenceData({
    projectSelected: Boolean(project),
    commercialFeaturesAvailable,
    availableCableTypes,
    effectiveSource,
    visibleCableTypeControl: cableTypes.visibleCableTypeControl,
    aggressiveProduct: recalc.aggressiveProduct,
    cableSizingEffectiveCableType,
  });
  const setElectricalQueryCalculation = useCallback((
    calculation: ElectricalCalcSummary,
    target?: LegacyElectricalVariantTarget,
  ) => {
    if (!project?.id) return;
    const targetVariantId = target?.id ?? electricalVariantId;
    const targetLegacyVariantNumber = target?.legacyVariantNumber ?? variant;
    if (calculation.variant_number !== targetLegacyVariantNumber) return;
    qc.setQueriesData<ElectricalQueryResponse>(
      { queryKey: electricalDataQueryKeys.queries(project.id, targetVariantId) },
      (current) => {
        if (!current) return current;
        return updateElectricalQueryPageCalculation(current, calculation);
      },
    );
  }, [electricalVariantId, project?.id, qc, variant]);
  const candidate = useElecCalcCandidateState({
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
  const {
    activeCandidateFolderKey,
    setActiveCandidateFolderKey,
    candidateFolderModalMode,
    candidateFolderModalOpen,
    candidateFolderName,
    setCandidateFolderName,
    closeCandidateFolderModal,
    updateCandidateMut,
    createCandidateFolderMut,
    updateCandidateFolderMut,
    deleteCandidateFolderMut,
    toggleCandidateFolderItemMut,
    applyCandidateMut,
    submitCandidateFolderModal,
    cableSizingCandidates,
    cableSizingCandidateFolders,
    activeCustomCandidateFolder,
    markedCableSizingCandidateSet,
    candidateColumnValueAccessors,
    resetMarkedCableSizingCandidates,
    cableSizingCandidateCompareActive,
    candidateCompareDiffColumnKeys,
  } = candidate;

  const {
    findCableRowForMark,
    cableSizingModalSelectedCable,
    cableMarkValueForCalc,
  } = useElecCalcCableMarkPresentation({
    effectiveSource,
    cableRowsForType,
    manualCableOptionsForType,
    cableSizingEffectiveCableType,
    cableSizingManualMark,
    cableSizingModalCalc,
  });
  const cableMarkModal = useElecCalcCableMarkModalState({
    objects,
    calcByObjectId: stats.calcByObjectId,
    electricalVariants,
    electricalVariantId,
    getSavedCableTypeForObject: cableTypes.getSavedCableTypeForObject,
    normalizeAvailableCableType: cableTypes.normalizeAvailableCableType,
    cableMarkOptionsFor,
    cableMarkValueForCalc,
    findCableRowForMark,
    onOpenObject: (object) => activateRowId(object.id),
    onCableTypeChange: () => setRecalc.connectionType('line_1ph'),
  });
  const {
    object: cableMarkModalObject,
    cableType: cableMarkModalCableType,
    value: cableMarkModalValue,
    setValue: setCableMarkModalValue,
    targetVariants: cableMarkModalTargetVariants,
    targetVariantsForSubmit: cableMarkModalTargetVariantsForSubmit,
    options: cableMarkModalOptions,
    optionByValue: cableMarkModalOptionByValue,
    selectedCable: cableMarkModalSelectedCable,
    targetVariantOptions: cableMarkModalTargetVariantOptions,
    close: closeCableMarkModal,
    open: openCableMarkModalState,
    changeCableType: changeCableMarkModalCableType,
    normalizeSelectedCableType: normalizeCableMarkModalCableType,
    setTargetVariantsFromValues: setCableMarkModalTargetVariantsFromValues,
  } = cableMarkModal;
  const {
    electricalLayoutMutate,
    isCableMarkPending,
    applyCableMarkModal,
  } = useElecCalcCableSelectionMutationFlow({
    projectId: project?.id,
    electricalVariantId,
    electricalVariantName,
    canMutate,
    variant,
    effectiveSource,
    recalc,
    normalizeAvailableCableType: cableTypes.normalizeAvailableCableType,
    setElectricalQueryCalculation,
    cableMarkModalObject,
    cableMarkModalCableType,
    cableMarkModalValue,
    cableMarkModalTargetVariantsForSubmit,
    cableMarkModalOptionByValue,
    closeCableMarkModal,
  });

  useEffect(() => {
    normalizeCableMarkModalCableType();
  }, [normalizeCableMarkModalCableType]);

  const {
    openCableMarkModal,
    openCableSizingModal,
    closeCableSizingModal,
  } = useElecCalcObjectActionModals({
    getObjectActionDisabledReason,
    preferredObjectActionCableType,
    objectActionCableType,
    openCableMarkModalState,
    changeCableMarkModalCableType,
    activateRowId,
    openCableSizingModalState,
    setCableSizingCableType,
    resetConnectionTypeOnPreferredChange: () => setRecalc.connectionType('line_1ph'),
    resetMarkedCableSizingCandidates,
    setActiveCandidateFolderKey,
    resetCableSizingModalState,
    closeCandidateFolderModal,
    setCandidateColumnSettingsOpen,
  });
  const {
    fieldCapabilityByKey,
    enumOptionsByColumn,
    candidateEnumOptionsByColumn,
  } = useElecCalcFilterOptions({
    electricalFields: electricalQueryCapabilities?.fields,
    cableSizingCandidates,
    visibleCandidateColumnMetas,
    candidateColumnValueAccessors,
  });

  const {
    handleElectricalTableChange,
  } = useElecCalcAntTableHandlers({
    setTablePage,
    setTablePageSize,
    setTableViewState,
  });

  const electricalColumnRenderers = useElecCalcElectricalColumnRenderers({
    activeRowId,
    calcByObjectId: stats.calcByObjectId,
    electricalDisplayOffset,
    getCalculatedCableTypeForObject: cableTypes.getCalculatedCableTypeForObject,
    isCableMarkPending,
    projectSelected: Boolean(project),
    canMutate,
    recalc,
    getObjectActionDisabledReason,
    openCableMarkModal,
    openCableSizingModal,
  });

  const {
    persistCandidateTableColumnSettings,
    persistTableSettings,
    applyElectricalGlideColumnDraftWidth,
    commitElectricalGlideColumnWidth,
    applyElectricalCandidateGlideColumnDraftWidth,
    commitElectricalCandidateGlideColumnWidth,
    startColumnResize,
  } = useElecCalcColumnPersistence({
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

  const {
    draftTableColumnSettings,
    draftCandidateTableColumnSettings,
    draftTableViewSettings,
    openColumnSettings,
    openCandidateColumnSettings,
    updateDraftColumn,
    updateDraftColumnOrder,
    reorderDraftColumn,
    updateDraftColumnWidth,
    updateDraftTableFontSize,
    resetDraftTableFontSize,
    updateDraftTableLabelFormat,
    updateDraftSettingsLabelFormat,
    resetDraftLabelFormats,
    updateDraftCalculationCableSource,
    resetDraftColumnWidth,
    resetDraftColumns,
    selectAllDraftColumns,
    applyColumnSettings,
    updateDraftCandidateColumn,
    updateDraftCandidateColumnOrder,
    reorderDraftCandidateColumn,
    updateDraftCandidateColumnWidth,
    resetDraftCandidateColumnWidth,
    resetDraftCandidateColumns,
    selectAllDraftCandidateColumns,
    applyCandidateColumnSettings,
  } = useElecCalcColumnSettingsDraftState({
    tableColumnSettings,
    candidateTableColumnSettings,
    tableViewSettings,
    isEmployee,
    setColumnSettingsOpen,
    setCandidateColumnSettingsOpen,
    persistTableSettings,
    persistCandidateTableColumnSettings,
  });

  const electricalColumns = useElecCalcElectricalColumns({
    visibleElectricalColumnMetas,
    electricalColumnRenderers,
    fieldCapabilityByKey,
    enumOptionsByColumn,
    tableViewState,
    onColumnResizeStart: startColumnResize,
    onSetColumnFilter: setColumnFilter,
    onResetColumnFilter: resetColumnFilter,
  });

  const getElectricalGlideColumnAlign = useCallback(
    (key: ElectricalColumnKey) => electricalColumnRenderers[key]?.align,
    [electricalColumnRenderers],
  );
  const {
    electricalGlideColumns,
    candidateGlideColumnMetaByKey,
    electricalCandidateGlideColumns,
  } = useElecCalcGlideColumnModel({
    visibleElectricalColumnMetas,
    fieldCapabilityByKey,
    enumOptionsByColumn,
    getElectricalColumnAlign: getElectricalGlideColumnAlign,
    visibleCandidateColumnMetas,
    candidateEnumOptionsByColumn,
  });

  const electricalColumnCopyValue = useElecCalcElectricalColumnCopyValue({
    calcByObjectId: stats.calcByObjectId,
    electricalDisplayOffset,
    getCableTypeForObject: cableTypes.getCalculatedCableTypeForObject,
    layingStep: recalc.layingStep,
    heatingHeight: recalc.heatingHeight,
    connectionType: recalc.connectionType,
    supplyVoltage: recalc.supplyVoltage,
    windingCoefficient: recalc.windingCoefficient,
    vaporTemperature: recalc.vaporTemperature,
    maintainTemperature: recalc.maintainTemperature,
    aggressiveProduct: recalc.aggressiveProduct,
  });

  const {
    isElectricalLayoutCellEditable,
    handleElectricalGlideStartCellEdit,
    handleElectricalGlideCommitCell,
  } = useElecCalcGlideLayoutCommit({
    canMutate,
    projectSelected: Boolean(project),
    effectiveSource,
    calcByObjectId: stats.calcByObjectId,
    getCableTypeForObject: cableTypes.getSavedCableTypeForObject,
    getObjectCalculationDisabledReason,
    isCableMarkPending,
    electricalLayoutMutate,
    activateRowId,
  });

  const {
    getElectricalGlideCellActions,
    handleElectricalGlideCellAction,
  } = useElecCalcGlideActions({
    activeRowId,
    projectSelected: Boolean(project),
    canMutate,
    isCableMarkPending,
    getObjectActionDisabledReason,
    onOpenCableMarkModal: openCableMarkModal,
    onOpenCableSizingModal: openCableSizingModal,
  });

  const getElectricalGlideCellState = useElecCalcGlideCellState({
    calcByObjectId: stats.calcByObjectId,
    electricalColumnCopyValue,
    isElectricalLayoutCellEditable,
    getColumnAlign: getElectricalGlideColumnAlign,
    getCellActions: getElectricalGlideCellActions,
  });

  useElecCalcSelectedRowsClipboardEffect({
    electricalColumnCopyValue,
    objects,
    selectedRowKeys: compatibleSelectedRowKeys,
    visibleElectricalColumnMetas,
  });

  const {
    electricalTableScrollX,
    electricalTableScrollY,
  } = useElecCalcTableDimensions({
    visibleElectricalColumnMetas,
  });

  const electricalRowClassName = useElecCalcRowClassName({
    activeRowId,
    calcByObjectId: stats.calcByObjectId,
  });

  const totalObjects = pageSummary?.total_objects ?? objects.length;
  const {
    electricalPagination,
    electricalInfiniteLoading,
    handleElectricalGlidePageChange,
    handleElectricalGlideLoadMore,
  } = useElecCalcTableNavigation({
    tablePage,
    tablePageSize,
    totalObjects,
    filteredCount: electricalPage?.counts?.filtered,
    electricalGlideEnabled,
    loadedObjectsCount: objects.length,
    hasNextPage: Boolean(pageInfo?.has_next_page),
    nextElectricalPageCursor,
    isElectricalPageFetching,
    setTablePage,
    loadNextElectricalGlidePage,
  });
  const activeJobStatus = activeJob?.status ?? (activeJobId ? 'queued' : null);
  const {
    validObjectsCount,
    selectedValidObjectsCount,
    selectedHeatLossFailedCount,
    calculatedCount,
    failedCount,
    totalCableLength,
    totalCurrent,
    manualCableCount,
    selectedManualCableCount,
    isJobActive,
    selectedRecalcDisabled,
    selectedRecalcTooltip,
    selectedRecalcCountLabel,
    jobProgressLabel,
  } = useMemo(
    () => buildElecCalcSummaryViewModel({
      pageSummary,
      objects,
      elecCalcsCount: elecCalcs.length,
      selectedRowKeys: compatibleSelectedRowKeys,
      stats,
      activeJobStatus,
      jobProgress: activeJob?.progress,
    }),
    [
      activeJob?.progress,
      activeJobStatus,
      elecCalcs.length,
      objects,
      pageSummary,
      compatibleSelectedRowKeys,
      stats,
    ],
  );
  const renderManualOverwriteControl = useCallback((manualCount: number): ReactNode => (
    <ElecCalcManualOverwriteControl
      manualCount={manualCount}
      canMutate={canMutate}
      overwriteManualChoices={overwriteManualChoices}
      onOverwriteChange={setOverwriteManualChoices}
    />
  ), [canMutate, overwriteManualChoices]);
  const {
    activeElectricalErrorItem,
    activeElectricalErrorGuidance,
  } = useElecCalcErrorSummaryState({
    objects,
    calcByObjectId: stats.calcByObjectId,
    electricalDisplayOffset,
    activeRowId,
  });
  const {
    onRecalculateSelected,
    onRecalculateAll,
    onCancelJob,
  } = useElecCalcBatchRecalcActions({
    canMutate,
    selectedRowKeys,
    assignmentByObjectId,
    cableTypeForRecalculation: cableTypes.cableTypeForRecalculation,
    mutateBatch: (args) => batchMut.mutate(args),
    cancelJob: () => cancelJobMut.mutate(),
  });
  const cableTypeControlLabel = 'Тип для пересчёта:';
  const {
    getElectricalCandidateGlideCellActions,
    handleElectricalCandidateGlideCellAction,
    getElectricalCandidateGlideActionMenuItems,
  } = useElecCalcCandidateGlideActions({
    candidateFolders: cableSizingCandidateFolders,
    canMutate,
    applyCandidatePending: applyCandidateMut.isPending,
    updateCandidatePending: updateCandidateMut.isPending,
    toggleCandidateFolderItemPending: toggleCandidateFolderItemMut.isPending,
    onApplyCandidate: applyCandidateMut.mutate,
    onUpdateCandidate: updateCandidateMut.mutate,
    onToggleCandidateFolderItem: toggleCandidateFolderItemMut.mutate,
  });
  const getElectricalCandidateGlideColumnAlign = useCallback(
    (columnKey: string) => candidateGlideColumnMetaByKey.get(columnKey)?.align,
    [candidateGlideColumnMetaByKey],
  );
  const getElectricalCandidateGlideCellState = useElecCalcCandidateGlideCellState({
    markedCandidateSet: markedCableSizingCandidateSet,
    candidateCompareActive: cableSizingCandidateCompareActive,
    diffColumnKeys: candidateCompareDiffColumnKeys,
    getColumnAlign: getElectricalCandidateGlideColumnAlign,
    getCellActions: getElectricalCandidateGlideCellActions,
  });
  const {
    cableTypeOptions,
    cableTypeOptionsForObject,
    cableSourceOptions,
    handleCableTypeControlChange,
  } = useElecCalcCableTypeOptions({
    availableCableTypeKeys,
    assignmentByObjectId,
    isEmployee,
    canMutate,
    selectedRowKeys,
    normalizeAvailableCableType: cableTypes.normalizeAvailableCableType,
    setDefaultCableType: cableTypes.setDefaultCableType,
    setCableTypeDraftByObjectId: cableTypes.setCableTypeDraftByObjectId,
    getSavedCableTypeForObject: cableTypes.getSavedCableTypeForObject,
    resetConnectionType: () => setRecalc.connectionType('line_1ph'),
  });
  const cableMarkModalCableTypeOptions = useMemo(
    () => cableTypeOptionsForObject(cableMarkModalObject?.id),
    [cableMarkModalObject?.id, cableTypeOptionsForObject],
  );
  const cableSizingModalCableTypeOptions = useMemo(
    () => cableTypeOptionsForObject(cableSizingModal.object?.id),
    [cableSizingModal.object?.id, cableTypeOptionsForObject],
  );
  const cableMarkModalAssignmentReason = cableMarkModalObject
    ? getObjectActionDisabledReason(cableMarkModalObject)
    : null;
  const cableSizingModalAssignmentReason = cableSizingModal.object
    ? getObjectActionDisabledReason(cableSizingModal.object)
    : null;
  const cableSizingCandidateTableScrollX = useMemo(() => Math.max(
    920,
    visibleCandidateColumnMetas.reduce(
      (sum, column) => sum + Math.max(column.width, column.minWidthPx),
      0,
    ),
  ), [visibleCandidateColumnMetas]);

  const {
    defaultElectricalTypeControls,
    renderElectricalTypeControls,
    renderRecalculationSettings,
    showDeleteCandidateFolderConfirm,
    candidateFolderEmptyText,
    handleTableRowDragStart,
    handleTableRowDragEnd,
  } = useElecCalcWorkspaceUiHelpers({
    canMutate,
    visibleCableTypeControl: cableTypes.visibleCableTypeControl,
    recalc: recalc as never,
    setRecalc: setRecalc as never,
    commercialFeaturesAvailable,
    isEmployee,
    calculationCableSource: draftTableViewSettings.calculationCableSource,
    cableSourceOptions,
    commercialDataStatus,
    technicalDataStatus,
    updateDraftCalculationCableSource,
    deleteCandidateFolder: (id) => deleteCandidateFolderMut.mutate(id),
    activeCandidateFolderKey,
    hasActiveCustomFolder: Boolean(activeCustomCandidateFolder),
    selectedRowKeys,
    setTableDragging,
  });


  const workspaceModalProps = {
    cableMarkModalObject,
    cableMarkModalSelectedCable,
    cableMarkModalCableType,
    cableMarkModalCableTypeOptions,
    commercialFeaturesAvailable,
    project,
    canMutate,
    cableMarkModalAssignmentReason,
    isCableMarkPending,
    cableMarkModalValue,
    cableMarkModalOptions,
    cableMarkModalTargetVariants,
    cableMarkModalTargetVariantOptions,
    renderElectricalTypeControls,
    changeCableMarkModalCableType,
    setCableMarkModalValue,
    setCableMarkModalTargetVariantsFromValues,
    applyCableMarkModal,
    closeCableMarkModal,
    cableSizingModalAssignmentReason,
    cableSizingModal,
    candidate,
    cableSizingModalSelectedCable,
    cableSizingModalCableTypeOptions,
    cableSizingManualOptions,
    cableSizingCandidateTableScrollX,
    resolvedTableFontSize,
    electricalCandidateGlideColumns,
    candidateTableViewState,
    candidateTableViewActive,
    cableTypes,
    closeCableSizingModal,
    setRecalc,
    openCandidateColumnSettings,
    resetCandidateTableViewState,
    candidateFolderEmptyText,
    showDeleteCandidateFolderConfirm,
    getElectricalCandidateGlideCellState,
    handleElectricalCandidateGlideCellAction,
    getElectricalCandidateGlideActionMenuItems,
    setCandidateColumnFilter,
    resetCandidateColumnFilter,
    setCandidateTableSort,
    applyElectricalCandidateGlideColumnDraftWidth,
    commitElectricalCandidateGlideColumnWidth,
    candidateFolderModalOpen,
    candidateFolderModalMode,
    createCandidateFolderMut,
    updateCandidateFolderMut,
    candidateFolderName,
    submitCandidateFolderModal,
    closeCandidateFolderModal,
    setCandidateFolderName,
    candidateColumnSettingsOpen,
    setCandidateColumnSettingsOpen,
    draftCandidateTableColumnSettings,
    normalizedTableViewSettings,
    updateCandidateTableColumnPreference,
    applyCandidateColumnSettings,
    selectAllDraftCandidateColumns,
    resetDraftCandidateColumns,
    updateDraftCandidateColumn,
    updateDraftCandidateColumnOrder,
    reorderDraftCandidateColumn,
    updateDraftCandidateColumnWidth,
    resetDraftCandidateColumnWidth,
    columnSettingsOpen,
    setColumnSettingsOpen,
    draftTableColumnSettings,
    draftTableViewSettings,
    updateTableColumnPreference,
    updateTableSettingsPreference,
    applyColumnSettings,
    selectAllDraftColumns,
    resetDraftColumns,
    updateDraftColumn,
    updateDraftColumnOrder,
    reorderDraftColumn,
    updateDraftColumnWidth,
    resetDraftColumnWidth,
    updateDraftTableFontSize,
    updateDraftTableLabelFormat,
    updateDraftSettingsLabelFormat,
    resetDraftTableFontSize,
    resetDraftLabelFormats,
    renderRecalculationSettings,
  };

  return {
    project,
    canMutate,
    projectId,
    electricalVariant,
    onAssignmentsChanged,
    workspaceModalProps,
    activateRowId,
    activeElectricalErrorGuidance,
    activeElectricalErrorItem,
    activeJobId,
    activeRowId,
    applyElectricalGlideColumnDraftWidth,
    assignmentByObjectId,
    batchMut,
    cableTypeControlLabel,
    cableTypeOptions,
    cableTypes,
    calculatedCount,
    cancelJobMut,
    commitElectricalGlideColumnWidth,
    compatibleSelectedRowKeys,
    currentTableViewActive,
    defaultElectricalTypeControls,
    electricalCapabilitiesError,
    electricalColumns,
    electricalGlideColumns,
    electricalGlideEnabled,
    electricalInfiniteLoading,
    electricalPage,
    electricalPageError,
    electricalPagination,
    electricalRowClassName,
    electricalTableScrollX,
    electricalTableScrollY,
    electricalVariantName,
    failedCount,
    getElectricalGlideCellState,
    handleAssignmentAwareSelectionChange,
    handleCableTypeControlChange,
    handleElectricalGlideCellAction,
    handleElectricalGlideCommitCell,
    handleElectricalGlideLoadMore,
    handleElectricalGlidePageChange,
    handleElectricalGlideStartCellEdit,
    handleElectricalTableChange,
    handleTableRowDragEnd,
    handleTableRowDragStart,
    isElectricalCapabilitiesError,
    isElectricalPageError,
    isElectricalPageFetching,
    isJobActive,
    jobProgressLabel,
    manualCableCount,
    navigate,
    onCancelJob,
    onRecalculateAll,
    onRecalculateSelected,
    openColumnSettings,
    openElectricalRow,
    overwriteManualChoices,
    paramsPanelVisible,
    recalc,
    renderManualOverwriteControl,
    resetColumnFilter,
    resetCurrentTableViewState,
    resolvedTableFontSize,
    retryElectricalCapabilities,
    retryElectricalPage,
    scopedObjects,
    selectedHeatLossFailedCount,
    selectedManualCableCount,
    selectedRecalcCountLabel,
    selectedRecalcDisabled,
    selectedRecalcTooltip,
    selectedRowKeys,
    selectedValidObjectsCount,
    setColumnFilter,
    setElectricalTableSort,
    setOverwriteManualChoices,
    setRecalc,
    setSelectedRowKeys,
    setSystemView,
    stats,
    systemView,
    tableDragging,
    tableScrollRegionsRef,
    tableViewState,
    toggleParamsPanel,
    totalCableLength,
    totalCurrent,
    totalObjects,
    validObjectsCount,
    versionByObjectId,
  };
}
