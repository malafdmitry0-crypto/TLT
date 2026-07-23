/** Extracted ElecCalc workspace shell (Track E13). */
import {
  useCallback,
  useEffect,
  lazy,
  useMemo,
  useRef,
  useState,
  Suspense,
  type ReactNode,
} from 'react';
import {
  Alert,
  Button,
  Card,
  Checkbox,
  Input,
  Modal,
  Space,
  Table,
  Typography,
} from 'antd';
import {
  ThunderboltOutlined,
} from '@ant-design/icons';
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

import EmptyProjectState from '@/components/common/EmptyProjectState';
import ElectricalSummary from '@/components/electrical/ElectricalSummary';
import ElectricalBatchActionBar from '@/pages/electrical/ElectricalBatchActionBar';
import ElectricalAssignmentPanel, {
  ASSIGNMENT_DND_MIME,
} from '@/pages/electrical/ElectricalAssignmentPanel';
import {
  systemViewLabel,
  type ElectricalSystemView,
} from '@/pages/electrical/elecCalcSystemViewModel';
import ElecCalcCableMarkModal from '@/pages/electrical/ElecCalcCableMarkModal';
import ElecCalcCableSizingModal from '@/pages/electrical/ElecCalcCableSizingModal';
import ElecCalcElectricalTypeControls from '@/pages/electrical/ElecCalcElectricalTypeControls';
import ElecCalcErrorSummary from '@/pages/electrical/ElecCalcErrorSummary';
import ElecCalcParamsPanel from '@/pages/electrical/ElecCalcParamsPanel';
import ElecCalcRecalculationSettings from '@/pages/electrical/ElecCalcRecalculationSettings';
import { ROUTES } from '@/routes/routes';
import type { ProjectObject } from '@/types/project';
import type { ElectricalVariant } from '@/types/electricalVariant';
import type {
  ElectricalCandidateFolder,
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
import {
  electricalAssignmentCompatibilityReason,
} from '@/pages/electrical/elecCalcAssignmentScopeModel';
import { useElecCalcErrorSummaryState } from '@/pages/electrical/useElecCalcErrorSummaryState';
import { ElectricalSectionHierarchy } from '@/pages/electrical/ElectricalSectionHierarchy';
import { useElecCalcBatchRecalcActions } from '@/pages/electrical/useElecCalcBatchRecalcActions';
import { useElecCalcAssignmentSelectionState } from '@/pages/electrical/useElecCalcAssignmentSelectionState';
import {
  buildElecCalcSummaryViewModel,
} from '@/pages/electrical/elecCalcSummaryModel';
import {
  objectDisplayName,
  type CableTypeKey,
} from '@/domain/electrical/elecCalcMainTableModel';
import { useElecCalcObjectActionModals } from '@/pages/electrical/useElecCalcObjectActionModals';
import { useElecCalcGlideLayoutCommit } from '@/pages/electrical/useElecCalcGlideLayoutCommit';
import { useElecCalcCableTypeOptions } from '@/pages/electrical/useElecCalcCableTypeOptions';
import { useElecCalcParamsPanelState } from '@/pages/electrical/useElecCalcParamsPanelState';
import { useElecCalcCableMarkPresentation } from '@/pages/electrical/useElecCalcCableMarkPresentation';
import { ElecCalcManualOverwriteControl } from '@/pages/electrical/ElecCalcManualOverwriteControl';
import { buildAssignAutoCalcBatchPayload } from '@/pages/electrical/elecCalcAssignAutoCalcModel';
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
const { Text } = Typography;
const ElectricalGlideGrid = lazy(() => import('@/components/electrical/ElectricalGlideGrid'));
const ElectricalCandidateColumnSettingsModal = lazy(
  () => import('@/components/electrical/ElectricalCandidateColumnSettingsModal'),
);
const ElectricalColumnSettingsModal = lazy(
  () => import('@/components/electrical/ElectricalColumnSettingsModal'),
);

type ElecCalcWorkspaceProps = {
  projectId: string;
  electricalVariant: ElectricalVariant;
  electricalVariants: ElectricalVariant[];
  canMutate: boolean;
  trackedJob: TrackedElectricalBatchJob | null;
  completion: ElectricalBatchJobCompletion | null;
  registerJob: RegisterElectricalBatchJob;
  onAssignmentsChanged?: () => void;
};

export function ElecCalcWorkspace({
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
  const defaultElectricalTypeControls = useMemo(() => (
    <ElecCalcElectricalTypeControls
      disabled={!canMutate}
      cableType={cableTypes.visibleCableTypeControl}
      recalc={recalc}
      setRecalc={setRecalc}
    />
  ), [cableTypes.visibleCableTypeControl, canMutate, recalc, setRecalc]);
  const cableSizingCandidateTableScrollX = useMemo(() => Math.max(
    920,
    visibleCandidateColumnMetas.reduce(
      (sum, column) => sum + Math.max(column.width, column.minWidthPx),
      0,
    ),
  ), [visibleCandidateColumnMetas]);

  if (!project) {
    return (
      <EmptyProjectState
        icon={<ThunderboltOutlined style={{ marginRight: 8, color: '#faad14' }} />}
        title="Электротехнический расчёт"
        description="Шаг 2 из 4. Результаты автоподбора греющего кабеля ТЛТ для каждого объекта."
      />
    );
  }

  function renderElectricalTypeControls(
    cableType: CableTypeKey | null = cableTypes.visibleCableTypeControl,
    options: { block?: boolean } = {},
  ) {
    return (
      <ElecCalcElectricalTypeControls
        cableType={cableType}
        block={options.block}
        recalc={recalc}
        setRecalc={setRecalc}
      />
    );
  }

  function renderRecalculationSettings() {
    return (
      <ElecCalcRecalculationSettings
        commercialFeaturesAvailable={commercialFeaturesAvailable}
        isEmployee={isEmployee}
        calculationCableSource={draftTableViewSettings.calculationCableSource}
        cableSourceOptions={cableSourceOptions}
        selectionPolicy={recalc.selectionPolicy}
        commercialDataStatus={commercialDataStatus}
        technicalDataStatus={technicalDataStatus}
        onCalculationCableSourceChange={updateDraftCalculationCableSource}
        onSelectionPolicyChange={setRecalc.selectionPolicy}
      />
    );
  }

  function showDeleteCandidateFolderConfirm(folder: ElectricalCandidateFolder) {
    if (!canMutate) return;
    Modal.confirm({
      title: `Удалить папку «${folder.name}»?`,
      content: 'Варианты останутся в списке. Удалится только фильтр-папка.',
      okText: 'Удалить',
      okType: 'danger',
      cancelText: 'Отмена',
      onOk: () => deleteCandidateFolderMut.mutate(folder.id),
    });
  }

  function candidateFolderEmptyText() {
    if (activeCandidateFolderKey === 'favorite') return 'В избранном пока нет вариантов';
    if (activeCustomCandidateFolder) return 'В этой папке пока нет вариантов';
    return 'Вариантов пока нет. Запустите авторасчёт или ручной расчёт.';
  }

  const handleTableRowDragStart = (
    event: React.DragEvent,
    objectId: string,
  ) => {
    if (!canMutate) {
      event.preventDefault();
      return;
    }
    const ids = selectedRowKeys.includes(objectId) && selectedRowKeys.length > 0
      ? selectedRowKeys
      : [objectId];
    const payload = JSON.stringify(ids);
    event.dataTransfer.setData(ASSIGNMENT_DND_MIME, payload);
    event.dataTransfer.setData('text/plain', payload);
    event.dataTransfer.effectAllowed = 'move';
    setTableDragging(true);
  };

  const handleTableRowDragEnd = () => {
    setTableDragging(false);
  };

  return (
    <>
      <div id="electrical-variant-workspace" ref={tableScrollRegionsRef}>
        <Space direction="vertical" size={8} style={{ width: '100%' }}>

        {/* PDF order: summary → system scope → one filtered table */}
        <ElectricalSummary
          systems={stats.systemSummaries}
          totalCableLength={totalCableLength}
          totalPower={Number(stats.totalPower)}
          totalCurrent={totalCurrent}
          calcedCount={calculatedCount}
          totalObjects={totalObjects}
        />

        <ElectricalAssignmentPanel
          projectId={projectId}
          electricalVariant={electricalVariant}
          canMutate={canMutate}
          systemView={systemView}
          onSystemViewChange={setSystemView}
          selectedObjectIds={selectedRowKeys}
          onSelectedObjectIdsChange={setSelectedRowKeys}
          versionByObjectId={versionByObjectId}
          onAssignmentsChanged={onAssignmentsChanged}
          onAssignedNeedCalc={(systemType, objectIds) => {
            if (!canMutate) return;
            // PDF-ER-08: assign → auto cable selection (+ sections when catalog hit).
            const payload = buildAssignAutoCalcBatchPayload({ systemType, objectIds });
            if (!payload) return;
            setSystemView(payload.nextSystemView);
            batchMut.mutate({
              scope: payload.scope,
              objectIds: payload.objectIds,
              skipManual: payload.skipManual,
              cableType: payload.cableType,
              objectOverrides: payload.objectOverrides,
            });
          }}
          tableDragging={tableDragging}
        />

        {/* Optional advanced params (default off). */}
        <div
          className="elec-workspace-chrome"
          data-testid="elec-workspace-chrome"
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'flex-end',
            gap: 8,
            minHeight: 28,
          }}
        >
          <Checkbox
            className="actionbar-form-toggle"
            checked={paramsPanelVisible}
            onChange={(event) => toggleParamsPanel(event.target.checked)}
          >
            Расширенные параметры
          </Checkbox>
        </div>

        {paramsPanelVisible && (
          <ElecCalcParamsPanel
            disabled={!canMutate}
            cableType={cableTypes.visibleCableTypeControl}
            cableTypeOptions={cableTypeOptions}
            onCableTypeChange={handleCableTypeControlChange}
            recalc={recalc}
            setRecalc={setRecalc}
          />
        )}
        <ElecCalcErrorSummary
          failedCount={failedCount}
          activeRowId={activeRowId}
          item={activeElectricalErrorItem}
          guidance={activeElectricalErrorGuidance}
        />

        {(isElectricalCapabilitiesError || isElectricalPageError) && (
          <Alert
            type="error"
            showIcon
            message="Не удалось загрузить данные выбранного ЭР"
            description={(
              electricalPageError instanceof Error
                ? electricalPageError.message
                : electricalCapabilitiesError instanceof Error
                  ? electricalCapabilitiesError.message
                  : 'Повторите запрос.'
            )}
            action={(
              <Button
                size="small"
                onClick={() => {
                  if (isElectricalCapabilitiesError) void retryElectricalCapabilities();
                  if (isElectricalPageError) void retryElectricalPage();
                }}
              >
                Повторить
              </Button>
            )}
          />
        )}

        <ElectricalBatchActionBar
          canMutate={canMutate}
          variantName={electricalVariantName}
          cableTypeControlLabel={cableTypeControlLabel}
          cableTypeOptions={cableTypeOptions}
          visibleCableTypeControl={cableTypes.visibleCableTypeControl}
          typeControls={paramsPanelVisible ? null : defaultElectricalTypeControls}
          isJobActive={isJobActive}
          selectedManualCableCount={selectedManualCableCount}
          selectedValidObjectsCount={selectedValidObjectsCount}
          selectedHeatLossFailedCount={selectedHeatLossFailedCount}
          manualCableCount={manualCableCount}
          overwriteManualChoices={overwriteManualChoices}
          selectedRecalcDisabled={selectedRecalcDisabled}
          selectedRecalcTooltip={selectedRecalcTooltip}
          selectedRecalcCountLabel={selectedRecalcCountLabel}
          batchPending={batchMut.isPending}
          validObjectsCount={validObjectsCount}
          cableTypeForRecalculation={cableTypes.cableTypeForRecalculation}
          activeJobId={activeJobId}
          cancelJobPending={cancelJobMut.isPending}
          currentTableViewActive={currentTableViewActive}
          renderManualOverwriteControl={renderManualOverwriteControl}
          onCableTypeChange={handleCableTypeControlChange}
          onManualOverwritePromptOpen={() => setOverwriteManualChoices(false)}
          onRecalculateSelected={onRecalculateSelected}
          onRecalculateAll={onRecalculateAll}
          onCancelJob={onCancelJob}
          onOpenColumnSettings={openColumnSettings}
          onResetFilters={resetCurrentTableViewState}
        />

        {isJobActive && (
          <Alert
            type="info"
            showIcon
            message={`Электрорасчёт выполняется · ${jobProgressLabel}`}
          />
        )}

        {/* Table: single list filtered by systemView */}
        <Card size="small" className="workspace-table-card srs-table-wrap" data-testid="electrical-unified-table">
          {electricalPage && totalObjects === 0 ? (
            <Alert
              type="warning"
              showIcon
              message="Нет объектов"
              description="Добавьте объекты на шаге «Теплопотери»."
              style={{ margin: 12 }}
            />
          ) : electricalGlideEnabled ? (
            <Suspense fallback={null}>
              <ElectricalGlideGrid
                rows={scopedObjects}
                gridColumns={electricalGlideColumns}
                tableScrollX={electricalTableScrollX}
                tableScrollY={electricalTableScrollY}
                fontSizeKey={resolvedTableFontSize.key}
                activeRowId={activeRowId}
                selectedRowKeys={systemView === 'unassigned'
                  ? selectedRowKeys
                  : compatibleSelectedRowKeys}
                tableViewState={tableViewState}
                pagination={electricalPagination}
                infiniteLoading={electricalInfiniteLoading}
                emptyContent={
                  scopedObjects.length === 0 && totalObjects > 0 ? (
                    <div className="table-filter-empty">
                      <Text type="secondary">
                        В разделе «{systemViewLabel(systemView)}» объектов нет
                      </Text>
                    </div>
                  ) : currentTableViewActive && totalObjects > 0 ? (
                  <div className="table-filter-empty">
                    <Text type="secondary">Нет строк по текущим фильтрам</Text>
                    <Button size="small" onClick={resetCurrentTableViewState}>
                      Сбросить фильтры
                    </Button>
                  </div>
                ) : undefined}
                rowClassName={electricalRowClassName}
                getCellState={getElectricalGlideCellState}
                onOpenRow={openElectricalRow}
                onSelectedRowKeysChange={handleAssignmentAwareSelectionChange}
                onSetColumnFilter={setColumnFilter}
                onResetColumnFilter={resetColumnFilter}
                onSetSort={setElectricalTableSort}
                onColumnResize={applyElectricalGlideColumnDraftWidth}
                onColumnResizeEnd={commitElectricalGlideColumnWidth}
                onPageChange={handleElectricalGlidePageChange}
                onLoadMore={handleElectricalGlideLoadMore}
                onCellAction={handleElectricalGlideCellAction}
                onStartCellEdit={handleElectricalGlideStartCellEdit}
                onCommitCell={handleElectricalGlideCommitCell}
              />
            </Suspense>
          ) : (
            <Table<ProjectObject>
              className={`calc-spreadsheet calc-spreadsheet--${resolvedTableFontSize.key} electrical-spreadsheet`}
              rowKey="id"
              size="small"
              loading={isElectricalPageFetching}
              pagination={electricalPagination}
              dataSource={scopedObjects}
              onChange={handleElectricalTableChange}
              scroll={{ x: electricalTableScrollX }}
              rowClassName={electricalRowClassName}
              onRow={(obj) => ({
                draggable: canMutate,
                onDragStart: (event) => handleTableRowDragStart(event, obj.id),
                onDragEnd: handleTableRowDragEnd,
                onClick: (event) => {
                  if ((event.target as HTMLElement).closest('.ant-table-selection-column')) return;
                  activateRowId(obj.id);
                },
                style: canMutate ? { cursor: 'grab' } : undefined,
                'data-testid': `electrical-object-row-${obj.id}`,
              })}
              rowSelection={{
                type: 'checkbox',
                selectedRowKeys: systemView === 'unassigned'
                  ? selectedRowKeys
                  : compatibleSelectedRowKeys,
                onChange: (keys) => handleAssignmentAwareSelectionChange(keys as string[]),
                getCheckboxProps: (obj) => {
                  // Unassigned tab: select for assign; other tabs: calc-compatible only.
                  if (systemView === 'unassigned') {
                    return {
                      disabled: !canMutate,
                      'aria-label': `Выбрать ${objectDisplayName(obj)} для назначения`,
                    };
                  }
                  const reason = electricalAssignmentCompatibilityReason(
                    assignmentByObjectId.get(obj.id),
                    cableTypes.cableTypeForRecalculation,
                  );
                  return {
                    disabled: reason != null,
                    title: reason ?? undefined,
                    'aria-label': reason
                      ? `${objectDisplayName(obj)}: ${reason}`
                      : `Выбрать ${objectDisplayName(obj)} для пересчёта`,
                  };
                },
                columnWidth: 36,
              }}
              columns={electricalColumns}
              expandable={{
                expandedRowRender: (obj) => (
                  <ElectricalSectionHierarchy calc={stats.calcByObjectId[obj.id]} />
                ),
                rowExpandable: () => systemView !== 'unassigned',
              }}
              locale={{
                emptyText: scopedObjects.length === 0 && totalObjects > 0 ? (
                  <div className="table-filter-empty">
                    <Text type="secondary">
                      В разделе «{systemViewLabel(systemView)}» объектов нет
                    </Text>
                  </div>
                ) : currentTableViewActive && totalObjects > 0 ? (
                  <div className="table-filter-empty">
                    <Text type="secondary">Нет строк по текущим фильтрам</Text>
                    <Button size="small" onClick={resetCurrentTableViewState}>
                      Сбросить фильтры
                    </Button>
                  </div>
                ) : undefined,
              }}
            />
          )}

          {/* Selection footer (mockup) */}
          <div className="electrical-table-footer">
            <Text type="secondary" className="electrical-table-footer__selection">
              Выбрано:{' '}
              {(systemView === 'unassigned' ? selectedRowKeys : compatibleSelectedRowKeys).length}
              {' '}
              из
              {' '}
              {scopedObjects.length}
            </Text>
            {calculatedCount > 0 && (
              <Button
                size="small"
                type="link"
                icon={<ThunderboltOutlined />}
                onClick={() => navigate(ROUTES.specification)}
              >
                Спецификация →
              </Button>
            )}
          </div>
        </Card>

        </Space>
      </div>
      <ElecCalcCableMarkModal
        object={cableMarkModalObject}
        selectedCable={cableMarkModalSelectedCable}
        cableType={cableMarkModalCableType}
        cableTypeOptions={cableMarkModalCableTypeOptions}
        commercialFeaturesAvailable={commercialFeaturesAvailable}
        projectSelected={
          Boolean(project)
          && canMutate
          && cableMarkModalAssignmentReason == null
        }
        pending={isCableMarkPending}
        value={cableMarkModalValue}
        markOptions={cableMarkModalOptions}
        targetVariants={cableMarkModalTargetVariants}
        targetVariantOptions={cableMarkModalTargetVariantOptions}
        renderTypeControls={(nextCableType) =>
          renderElectricalTypeControls(nextCableType, { block: true })}
        onCableTypeChange={changeCableMarkModalCableType}
        onMarkChange={setCableMarkModalValue}
        onTargetVariantsChange={setCableMarkModalTargetVariantsFromValues}
        onApply={applyCableMarkModal}
        onCancel={closeCableMarkModal}
      />
      <ElecCalcCableSizingModal
        canMutate={canMutate && cableSizingModalAssignmentReason == null}
        cableSizingModal={cableSizingModal}
        candidate={candidate}
        selectedCable={cableSizingModalSelectedCable}
        commercialFeaturesAvailable={commercialFeaturesAvailable}
        cableTypeOptions={cableSizingModalCableTypeOptions}
        cableSizingManualOptions={cableSizingManualOptions}
        candidateTableScrollX={cableSizingCandidateTableScrollX}
        candidateFontSizeKey={resolvedTableFontSize.key}
        electricalCandidateGlideColumns={electricalCandidateGlideColumns}
        candidateTableViewState={candidateTableViewState}
        candidateTableViewActive={candidateTableViewActive}
        normalizeAvailableCableType={cableTypes.normalizeAvailableCableType}
        onClose={closeCableSizingModal}
        onResetConnectionType={() => setRecalc.connectionType('line_1ph')}
        onOpenCandidateColumnSettings={openCandidateColumnSettings}
        onResetCandidateTableViewState={resetCandidateTableViewState}
        renderTypeControls={renderElectricalTypeControls}
        candidateFolderEmptyText={candidateFolderEmptyText}
        onDeleteCandidateFolder={showDeleteCandidateFolderConfirm}
        getCandidateCellState={getElectricalCandidateGlideCellState}
        onCandidateCellAction={handleElectricalCandidateGlideCellAction}
        getCandidateActionMenuItems={getElectricalCandidateGlideActionMenuItems}
        onSetCandidateColumnFilter={setCandidateColumnFilter}
        onResetCandidateColumnFilter={resetCandidateColumnFilter}
        onSetCandidateSort={setCandidateTableSort}
        onCandidateColumnResize={applyElectricalCandidateGlideColumnDraftWidth}
        onCandidateColumnResizeEnd={commitElectricalCandidateGlideColumnWidth}
      />
      <Modal
        open={candidateFolderModalOpen}
        title={candidateFolderModalMode === 'rename' ? 'Переименовать папку' : 'Новая папка'}
        okText={candidateFolderModalMode === 'rename' ? 'Сохранить' : 'Создать'}
        cancelText="Отмена"
        confirmLoading={createCandidateFolderMut.isPending || updateCandidateFolderMut.isPending}
        okButtonProps={{ disabled: !canMutate || candidateFolderName.trim().length === 0 }}
        onOk={submitCandidateFolderModal}
        onCancel={closeCandidateFolderModal}
      >
        <Input
          autoFocus
          maxLength={64}
          value={candidateFolderName}
          placeholder="Название папки"
          aria-label="Название папки вариантов"
          disabled={!canMutate}
          onChange={(event) => setCandidateFolderName(event.target.value)}
          onPressEnter={submitCandidateFolderModal}
        />
      </Modal>
      {candidateColumnSettingsOpen && (
        <Suspense fallback={null}>
          <ElectricalCandidateColumnSettingsModal
            open={candidateColumnSettingsOpen}
            settings={draftCandidateTableColumnSettings}
            settingsLabelFormat={normalizedTableViewSettings.settingsLabelFormat}
            confirmLoading={updateCandidateTableColumnPreference.isPending}
            onOk={applyCandidateColumnSettings}
            onCancel={() => setCandidateColumnSettingsOpen(false)}
            onSelectAllColumns={selectAllDraftCandidateColumns}
            onResetColumns={resetDraftCandidateColumns}
            onVisibleChange={updateDraftCandidateColumn}
            onOrderChange={updateDraftCandidateColumnOrder}
            onColumnReorder={reorderDraftCandidateColumn}
            onWidthChange={updateDraftCandidateColumnWidth}
            onResetWidth={resetDraftCandidateColumnWidth}
          />
        </Suspense>
      )}
      {columnSettingsOpen && (
        <Suspense fallback={null}>
          <ElectricalColumnSettingsModal
            open={columnSettingsOpen}
            settings={draftTableColumnSettings}
            viewSettings={draftTableViewSettings}
            confirmLoading={
              updateTableColumnPreference.isPending || updateTableSettingsPreference.isPending
            }
            onOk={applyColumnSettings}
            onCancel={() => setColumnSettingsOpen(false)}
            onSelectAllColumns={selectAllDraftColumns}
            onResetColumns={resetDraftColumns}
            onVisibleChange={updateDraftColumn}
            onOrderChange={updateDraftColumnOrder}
            onColumnReorder={reorderDraftColumn}
            onWidthChange={updateDraftColumnWidth}
            onResetWidth={resetDraftColumnWidth}
            onFontSizeChange={updateDraftTableFontSize}
            onTableLabelFormatChange={updateDraftTableLabelFormat}
            onSettingsLabelFormatChange={updateDraftSettingsLabelFormat}
            onResetFontSize={resetDraftTableFontSize}
            onResetLabelFormats={resetDraftLabelFormats}
            recalculationSettings={renderRecalculationSettings()}
          />
        </Suspense>
      )}
    </>
  );
}
