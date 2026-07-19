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
  message,
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
import {
  useCalculationVariantStore,
  type CalculationVariant,
} from '@/store/calculationVariantStore';
import { useProjectStore } from '@/store/projectStore';
import { areCommercialFeaturesEnabled } from '@/config/featureFlags';
import { useFocusableTableScrollRegions } from '@/hooks/useFocusableTableScrollRegions';

import EmptyProjectState from '@/components/common/EmptyProjectState';
import ElectricalSummary from '@/components/electrical/ElectricalSummary';
import ElectricalBatchActionBar from '@/pages/electrical/ElectricalBatchActionBar';
import ElectricalAssignmentPanel, {
  ASSIGNMENT_DND_MIME,
} from '@/pages/electrical/ElectricalAssignmentPanel';
import ElectricalVariantTabs, {
  electricalVariantPanelId,
  electricalVariantTabId,
} from '@/pages/electrical/ElectricalVariantTabs';
import {
  filterObjectsBySystemView,
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
  type ElectricalCalculationCableSource,
} from '@/utils/electricalTableViewSettings';
import {
  AUTO_CABLE_MARK_VALUE,
  cableMarkOptionValue,
  catalogSourceFromSnapshot,
  shouldShowProjectCableOption,
} from '@/pages/electrical/elecCalcCableOptionModel';
import {
  resolveCableRowForMark,
  type CableStatusRow,
} from '@/pages/electrical/elecCalcCableCatalogModel';
import {
  buildElectricalQueryRequest,
  updateElectricalQueryPageCalculation,
} from '@/pages/electrical/elecCalcQueryModel';
import {
  buildElectricalErrorItems,
  electricalErrorGuidanceForItem,
  resolveActiveElectricalErrorItem,
} from '@/pages/electrical/elecCalcErrorSummaryModel';
import {
  compatibleAssignedObjectIds,
  electricalAssignmentAvailabilityReason,
  electricalAssignmentCompatibilityReason,
  electricalAssignmentProjectionMap,
  electricalSystemForCableType,
  preferredCableTypeForElectricalAssignment,
} from '@/pages/electrical/elecCalcAssignmentScopeModel';
import {
  buildElecCalcSummaryViewModel,
} from '@/pages/electrical/elecCalcSummaryModel';
import {
  isElectricalLayoutCellEditable as resolveElectricalLayoutCellEditable,
  validateElectricalLayoutCellCommit,
} from '@/pages/electrical/elecCalcLayoutModel';
import {
  CABLE_TYPE_LABEL,
  objectDisplayName,
  type CableTypeKey,
} from '@/pages/electrical/elecCalcMainTableModel';
import type { ElectricalNavigationState } from '@/pages/electrical/elecCalcPageModel';
import {
  getCableMark,
  getCableMarkSource,
} from '@/pages/electrical/elecCalcResultValueModel';
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
import { useElectricalVariantSelection } from '@/pages/electrical/useElectricalVariantSelection';
import {
  useElectricalBatchJobTracker,
  type ElectricalBatchJobCompletion,
  type RegisterElectricalBatchJob,
  type TrackedElectricalBatchJob,
} from '@/pages/electrical/useElectricalBatchJobTracker';
import { readStorageJson } from '@/utils/storage';

const ELECCALC_PARAMS_PANEL_STORAGE_KEY = 'tlt-eleccalc-params-panel';
const ELECCALC_READ_ONLY_MESSAGE =
  'Проект открыт в режиме просмотра. Изменять электрорасчёт может только владелец или администратор.';

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

export default function ElecCalcPage() {
  const project = useProjectStore((state) => state.currentProject);
  const role = useAuthStore((state) => state.role);
  const userId = useAuthStore((state) => state.user?.id ?? null);
  const sessionId = useAuthStore((state) => state.sessionId);

  if (!project) {
    return (
      <EmptyProjectState
        icon={<ThunderboltOutlined style={{ marginRight: 8, color: '#faad14' }} />}
        title="Электротехнический расчёт"
        description="Шаг 2 из 4. Результаты автоподбора греющего кабеля ТЛТ для каждого объекта."
      />
    );
  }

  const canMutate = role === 'admin'
    || (role === 'employee' && project.user_id === userId)
    || (role === 'guest' && project.session_id === sessionId);

  return <ElecCalcProject key={project.id} projectId={project.id} canMutate={canMutate} />;
}

function ElecCalcProject({
  projectId,
  canMutate,
}: {
  projectId: string;
  canMutate: boolean;
}) {
  const location = useLocation();
  const controller = useElectricalVariantSelection({ projectId });
  const {
    registerJob,
    registerJobId,
    trackedJobs,
    completionByVariant,
  } = useElectricalBatchJobTracker();
  const registeredNavigationJobIdsRef = useRef(new Set<string>());
  const setLegacyVariant = useCalculationVariantStore((state) => state.setVariant);
  const clearLegacyVariant = useCalculationVariantStore((state) => state.clearVariant);
  const selectedVariant = controller.selectedVariant;
  const [assignmentDataEpoch, setAssignmentDataEpoch] = useState(0);
  const markAssignmentDataChanged = useCallback(() => {
    setAssignmentDataEpoch((current) => current + 1);
  }, []);
  const navigationActiveJobId =
    (location.state as ElectricalNavigationState | null | undefined)?.activeJobId ?? null;

  useEffect(() => {
    if (!navigationActiveJobId || !selectedVariant) return;
    if (registeredNavigationJobIdsRef.current.has(navigationActiveJobId)) return;
    registeredNavigationJobIdsRef.current.add(navigationActiveJobId);
    registerJobId(navigationActiveJobId, {
      projectId,
      electricalVariantId: selectedVariant.id,
      electricalVariantName: selectedVariant.name,
      scope: 'all',
    });
  }, [
    navigationActiveJobId,
    projectId,
    registerJobId,
    selectedVariant,
  ]);

  useEffect(() => {
    const legacyVariantNumber = selectedVariant?.legacy_variant_number;
    if (legacyVariantNumber == null) {
      clearLegacyVariant(projectId);
      return;
    }
    setLegacyVariant(projectId, legacyVariantNumber);
  }, [clearLegacyVariant, projectId, selectedVariant?.legacy_variant_number, setLegacyVariant]);

  return (
    <Space direction="vertical" size={8} style={{ width: '100%' }}>
      <ElectricalVariantTabs controller={controller} canMutate={canMutate} />
      {selectedVariant?.legacy_variant_number == null && selectedVariant && (
        <div
          id={electricalVariantPanelId(selectedVariant.id)}
          role="tabpanel"
          aria-labelledby={electricalVariantTabId(selectedVariant.id)}
        >
          <Alert
            type="warning"
            showIcon
            message={`«${selectedVariant.name}»: расчётные действия временно недоступны`}
            description={(
              <span>
                Для этого ЭР ещё нет UUID-совместимого расчётного контура. Расчёт, кандидаты,
                спецификация и отчёт отключены; данные другого ЭР не подставляются.
              </span>
            )}
          />
        </div>
      )}
      {selectedVariant?.legacy_variant_number != null && (
        <div
          id={electricalVariantPanelId(selectedVariant.id)}
          role="tabpanel"
          aria-labelledby={electricalVariantTabId(selectedVariant.id)}
        >
          <ElecCalcWorkspace
            key={`${selectedVariant.id}:${assignmentDataEpoch}`}
            projectId={projectId}
            electricalVariant={selectedVariant}
            electricalVariants={controller.variants}
            canMutate={canMutate}
            trackedJob={trackedJobs.find(
              (job) => job.electricalVariantId === selectedVariant.id,
            ) ?? null}
            completion={completionByVariant[selectedVariant.id] ?? null}
            registerJob={registerJob}
            onAssignmentsChanged={markAssignmentDataChanged}
          />
        </div>
      )}
    </Space>
  );
}

function ElecCalcWorkspace({
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
  const [systemView, setSystemView] = useState<ElectricalSystemView>('all');
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
  // Wide params panel optional (PDF page 35 has none). Default OFF — compact
  // U/type controls live in the action bar. Explicit true in storage keeps open.
  const [paramsPanelVisible, setParamsPanelVisible] = useState<boolean>(
    () => readStorageJson(ELECCALC_PARAMS_PANEL_STORAGE_KEY) === true,
  );
  const toggleParamsPanel = useCallback((visible: boolean) => {
    setParamsPanelVisible(visible);
    try {
      localStorage.setItem(ELECCALC_PARAMS_PANEL_STORAGE_KEY, JSON.stringify(visible));
    } catch {
      // localStorage может быть недоступен — настройка останется на сессию
    }
  }, []);
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
  const assignmentByObjectId = useMemo(
    () => electricalAssignmentProjectionMap(electricalLoadedPages),
    [electricalLoadedPages],
  );
  const versionByObjectId = useMemo(() => {
    const map = new Map<string, number>();
    assignmentByObjectId.forEach((assignment, objectId) => {
      if (Number.isFinite(assignment.version)) map.set(objectId, assignment.version);
    });
    return map;
  }, [assignmentByObjectId]);

  /** Single object list: filtered by shared systemView (no second assignment table). */
  const scopedObjects = useMemo(
    () => filterObjectsBySystemView(objects, assignmentByObjectId, systemView),
    [assignmentByObjectId, objects, systemView],
  );
  useEffect(() => {
    // Drop selection that is no longer visible after tab change / reassignment.
    setSelectedRowKeys((prev) => {
      const visible = new Set(scopedObjects.map((obj) => obj.id));
      const next = prev.filter((id) => visible.has(id));
      return next.length === prev.length ? prev : next;
    });
  }, [scopedObjects, setSelectedRowKeys]);
  const batchCableType = cableTypes.cableTypeForRecalculation;
  const compatibleSelectedRowKeys = useMemo(
    () => compatibleAssignedObjectIds(
      selectedRowKeys,
      assignmentByObjectId,
      batchCableType,
    ),
    [assignmentByObjectId, batchCableType, selectedRowKeys],
  );
  const handleAssignmentAwareSelectionChange = useCallback((keys: string[]) => {
    // Unassigned tab: select freely for assign/DnD.
    if (systemView === 'unassigned') {
      setSelectedRowKeys(keys);
      return;
    }
    // «Все» and system tabs: only calc-compatible selection (fail-closed batch).
    const compatible = compatibleAssignedObjectIds(
      keys,
      assignmentByObjectId,
      batchCableType,
    );
    if (compatible.length !== keys.length) {
      message.warning(
        'Можно выбрать только объекты, назначенные в совместимую систему текущего ЭР.',
      );
    }
    setSelectedRowKeys(compatible);
  }, [assignmentByObjectId, batchCableType, setSelectedRowKeys, systemView]);
  useEffect(() => {
    if (systemView === 'unassigned') return;
    if (compatibleSelectedRowKeys.length === selectedRowKeys.length) return;
    setSelectedRowKeys(compatibleSelectedRowKeys);
  }, [compatibleSelectedRowKeys, selectedRowKeys.length, setSelectedRowKeys, systemView]);
  const objectActionCableType = cableTypes.getSavedCableTypeForObject;
  const getObjectActionDisabledReason = useCallback((obj: ProjectObject) => (
    electricalAssignmentAvailabilityReason(assignmentByObjectId.get(obj.id))
  ), [assignmentByObjectId]);
  const getObjectCalculationDisabledReason = useCallback((obj: ProjectObject) => (
    electricalAssignmentCompatibilityReason(
      assignmentByObjectId.get(obj.id),
      objectActionCableType(obj.id),
    )
  ), [assignmentByObjectId, objectActionCableType]);
  const preferredObjectActionCableType = useCallback((obj: ProjectObject) => (
    preferredCableTypeForElectricalAssignment(
      assignmentByObjectId.get(obj.id),
      objectActionCableType(obj.id),
    )
  ), [assignmentByObjectId, objectActionCableType]);
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

  const findCableRowForMark = useCallback((
    type: CableTypeKey,
    mark: string | undefined,
    calc: ElectricalCalcSummary | undefined,
    selectedSource?: CableSource | null,
  ): CableStatusRow | null => resolveCableRowForMark({
    type,
    mark,
    calc,
    rows: cableRowsForType(type),
    selectedSource,
  }), [cableRowsForType]);

  const cableSizingModalSelectedCable = useMemo<CableStatusRow | null>(() => (
    cableSizingEffectiveCableType
      ? findCableRowForMark(
          cableSizingEffectiveCableType,
          cableSizingManualMark ?? getCableMark(cableSizingModalCalc),
          cableSizingModalCalc,
          catalogSourceFromSnapshot(cableSizingModalCalc),
        )
      : null
  ), [
    cableSizingEffectiveCableType,
    cableSizingManualMark,
    cableSizingModalCalc,
    findCableRowForMark,
  ]);
  const cableMarkValueForCalc = useCallback((
    type: CableTypeKey,
    mark: string | undefined,
    calc: ElectricalCalcSummary | undefined,
  ) => {
    if (!mark) return AUTO_CABLE_MARK_VALUE;
    if (shouldShowProjectCableOption(calc)) return cableMarkOptionValue('project', mark);
    const savedSource = catalogSourceFromSnapshot(calc);
    const manualOptions = manualCableOptionsForType(type);
    const matchingOption = manualOptions.find((option) =>
      option.mark === mark && (!savedSource || option.cableSource === savedSource))
      ?? manualOptions.find((option) => option.mark === mark);
    return matchingOption?.value ?? cableMarkOptionValue(savedSource ?? effectiveSource, mark);
  }, [effectiveSource, manualCableOptionsForType]);
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
  const openCableMarkModal = useCallback((obj: ProjectObject) => {
    const reason = getObjectActionDisabledReason(obj);
    if (reason) {
      message.warning(reason);
      return;
    }
    openCableMarkModalState(obj);
    const preferredType = preferredObjectActionCableType(obj);
    if (preferredType && preferredType !== objectActionCableType(obj.id)) {
      changeCableMarkModalCableType(preferredType);
    }
  }, [
    changeCableMarkModalCableType,
    getObjectActionDisabledReason,
    objectActionCableType,
    openCableMarkModalState,
    preferredObjectActionCableType,
  ]);

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

  const closeCableSizingModal = useCallback(() => {
    resetCableSizingModalState();
    resetMarkedCableSizingCandidates();
    setActiveCandidateFolderKey('all');
    closeCandidateFolderModal();
    setCandidateColumnSettingsOpen(false);
  }, [
    closeCandidateFolderModal,
    resetCableSizingModalState,
    resetMarkedCableSizingCandidates,
    setActiveCandidateFolderKey,
  ]);
  const openCableSizingModal = useCallback((obj: ProjectObject) => {
    const reason = getObjectActionDisabledReason(obj);
    if (reason) {
      message.warning(reason);
      return;
    }
    activateRowId(obj.id);
    openCableSizingModalState(obj);
    const preferredType = preferredObjectActionCableType(obj);
    if (preferredType) {
      setCableSizingCableType(preferredType);
      if (preferredType !== objectActionCableType(obj.id)) {
        setRecalc.connectionType('line_1ph');
      }
    }
    resetMarkedCableSizingCandidates();
    setActiveCandidateFolderKey('all');
  }, [
    activateRowId,
    getObjectActionDisabledReason,
    openCableSizingModalState,
    objectActionCableType,
    preferredObjectActionCableType,
    resetMarkedCableSizingCandidates,
    setCableSizingCableType,
    setRecalc,
    setActiveCandidateFolderKey,
  ]);
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

  const isElectricalLayoutCellEditable = useCallback((obj: ProjectObject, columnKey: string) => {
    if (getObjectCalculationDisabledReason(obj)) return false;
    return resolveElectricalLayoutCellEditable({
      obj,
      columnKey,
      projectSelected: Boolean(project) && canMutate,
      isCableMarkPending,
      calcByObjectId: stats.calcByObjectId,
      getCableTypeForObject: cableTypes.getSavedCableTypeForObject,
    });
  }, [
    cableTypes.getSavedCableTypeForObject,
    canMutate,
    getObjectCalculationDisabledReason,
    isCableMarkPending,
    project,
    stats.calcByObjectId,
  ]);

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

  const handleElectricalGlideStartCellEdit = useCallback((obj: ProjectObject) => {
    activateRowId(obj.id);
  }, [activateRowId]);

  const handleElectricalGlideCommitCell = useCallback((
    obj: ProjectObject,
    columnKey: string,
    value: unknown,
  ) => {
    if (!canMutate) return ELECCALC_READ_ONLY_MESSAGE;
    const assignmentReason = getObjectCalculationDisabledReason(obj);
    if (assignmentReason) return assignmentReason;
    const validation = validateElectricalLayoutCellCommit({
      obj,
      columnKey,
      value,
      projectSelected: Boolean(project),
      calcByObjectId: stats.calcByObjectId,
      getCableTypeForObject: cableTypes.getSavedCableTypeForObject,
    });
    if (validation.status === 'ignored') return null;
    if (validation.status === 'error') return validation.error;

    const markSource = getCableMarkSource(validation.calc);
    electricalLayoutMutate({
      objectId: obj.id,
      cableMark: markSource === 'manual' ? validation.mark : null,
      cableSource: markSource === 'manual'
        ? catalogSourceFromSnapshot(validation.calc) ?? effectiveSource
        : effectiveSource,
      cableType: validation.cableType,
      windingPitchMm: validation.windingPitchMm,
      numberOfThreads: validation.numberOfThreads,
    });
    return null;
  }, [
    effectiveSource,
    electricalLayoutMutate,
    cableTypes.getSavedCableTypeForObject,
    canMutate,
    getObjectCalculationDisabledReason,
    project,
    stats.calcByObjectId,
  ]);

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
  const renderManualOverwriteControl = useCallback((manualCount: number): ReactNode => {
    if (manualCount <= 0) return null;
    return (
      <>
        <Text type="secondary">
          Найдено ручных выборов: {manualCount}. По умолчанию они будут сохранены и пропущены.
        </Text>
        <Checkbox
          disabled={!canMutate}
          checked={overwriteManualChoices}
          onChange={(event) => {
            if (canMutate) setOverwriteManualChoices(event.target.checked);
          }}
        >
          Перезаписать ручные выборы ({manualCount})
        </Checkbox>
      </>
    );
  }, [canMutate, overwriteManualChoices]);
  const electricalErrorItems = useMemo(
    () => buildElectricalErrorItems({
      objects,
      calcByObjectId: stats.calcByObjectId,
      electricalDisplayOffset,
    }),
    [electricalDisplayOffset, objects, stats.calcByObjectId],
  );
  const activeElectricalErrorItem = useMemo(
    () => resolveActiveElectricalErrorItem({
      activeRowId,
      objects,
      calcByObjectId: stats.calcByObjectId,
      electricalDisplayOffset,
      electricalErrorItems,
    }),
    [activeRowId, electricalDisplayOffset, electricalErrorItems, objects, stats.calcByObjectId],
  );
  const activeElectricalErrorGuidance = useMemo(
    () => electricalErrorGuidanceForItem(activeElectricalErrorItem),
    [activeElectricalErrorItem],
  );
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
  const cableTypeOptions = useMemo(() => availableCableTypeKeys.map((k) => ({
    label: CABLE_TYPE_LABEL[k],
    value: k,
  })), [availableCableTypeKeys]);
  const cableTypeOptionsForObject = useCallback((objectId: string | undefined) => {
    if (!objectId) return cableTypeOptions;
    const assignedSystem = assignmentByObjectId.get(objectId)?.system_type;
    if (assignedSystem !== 'self_regulating' && assignedSystem !== 'resistive') return [];
    return cableTypeOptions.filter((option) =>
      electricalSystemForCableType(option.value) === assignedSystem,
    );
  }, [assignmentByObjectId, cableTypeOptions]);
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
  const cableSourceOptions = useMemo<Array<{ label: string; value: ElectricalCalculationCableSource }>>(() => [
    { label: 'Встроенная', value: 'builtin' },
    ...(isEmployee
      ? [
          { label: 'Внешняя', value: 'extended' as ElectricalCalculationCableSource },
          { label: 'Все', value: 'all' as ElectricalCalculationCableSource },
        ]
      : []),
  ], [isEmployee]);
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

  function handleCableTypeControlChange(next: CableTypeKey) {
    if (!canMutate) return;
    const nextType = cableTypes.normalizeAvailableCableType(next);
    if (selectedRowKeys.length === 0) {
      cableTypes.setDefaultCableType(nextType);
    } else {
      const compatibleForNextType = compatibleAssignedObjectIds(
        selectedRowKeys,
        assignmentByObjectId,
        nextType,
      );
      if (compatibleForNextType.length !== selectedRowKeys.length) {
        message.warning(
          'Выбранные объекты назначены в другую систему. Снимите выбор или выберите совместимый тип кабеля.',
        );
        return;
      }
      cableTypes.setCableTypeDraftByObjectId((prev) => {
        const nextDrafts = { ...prev };
        for (const objectId of selectedRowKeys) {
          if (nextType === cableTypes.getSavedCableTypeForObject(objectId)) {
            delete nextDrafts[objectId];
          } else {
            nextDrafts[objectId] = nextType;
          }
        }
        return nextDrafts;
      });
    }
    setRecalc.connectionType('line_1ph');
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
          onRecalculateSelected={(skipManual) => {
            if (!canMutate) return;
            const objectIds = compatibleAssignedObjectIds(
              selectedRowKeys,
              assignmentByObjectId,
              cableTypes.cableTypeForRecalculation,
            );
            if (objectIds.length !== selectedRowKeys.length) {
              message.warning(
                'Несовместимые или нераспределённые строки исключены. Проверьте назначения ЭР.',
              );
            }
            if (objectIds.length === 0) return;
            batchMut.mutate({
              scope: 'selected',
              objectIds,
              skipManual,
            });
          }}
          onRecalculateAll={(skipManual) => {
            if (!canMutate) return;
            batchMut.mutate({
              scope: 'all',
              skipManual,
            });
          }}
          onCancelJob={() => {
            if (canMutate) cancelJobMut.mutate();
          }}
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
                expandedRowRender: (obj) => {
                  const calc = stats.calcByObjectId[obj.id];
                  const results = (calc?.results ?? {}) as Record<string, unknown>;
                  const sections = Array.isArray(results.sections)
                    ? (results.sections as Array<Record<string, unknown>>)
                    : [];
                  const sectionCount = Number(results.section_count ?? results.num_sections ?? 0);
                  if (sections.length === 0 && !(sectionCount > 0)) {
                    return (
                      <div className="section-hierarchy-shell" data-testid="section-hierarchy-shell">
                        <strong>Нагревательные секции</strong>
                        <div>
                          Секции появятся после успешного электрорасчёта с каталогом
                          секционирования (Lмакс / Iдоп / Iст.уд).
                        </div>
                      </div>
                    );
                  }
                  return (
                    <div className="section-hierarchy-shell" data-testid="section-hierarchy-shell">
                      <strong>Нагревательные секции · {sectionCount || sections.length}</strong>
                      <table style={{ width: '100%', marginTop: 6, fontSize: 12 }}>
                        <thead>
                          <tr>
                            <th style={{ textAlign: 'left' }}>№</th>
                            <th style={{ textAlign: 'right' }}>L, м</th>
                            <th style={{ textAlign: 'right' }}>P, Вт</th>
                            <th style={{ textAlign: 'right' }}>Iраб, А</th>
                            <th style={{ textAlign: 'right' }}>Iст, А</th>
                          </tr>
                        </thead>
                        <tbody>
                          {(sections.length
                            ? sections
                            : Array.from({ length: sectionCount }, (_, i) => ({
                                index: i + 1,
                                length_m: results.section_length_m,
                                power_w: results.section_power_w,
                                working_current_a:
                                  Number(results.section_working_current_a ?? 0) / sectionCount,
                                start_current_a:
                                  Number(results.section_start_current_a ?? 0) / sectionCount,
                              }))
                          ).map((sec, i) => (
                            <tr key={String(sec.index ?? i)}>
                              <td>{String(sec.index ?? i + 1)}</td>
                              <td style={{ textAlign: 'right' }}>{String(sec.length_m ?? '—')}</td>
                              <td style={{ textAlign: 'right' }}>{String(sec.power_w ?? '—')}</td>
                              <td style={{ textAlign: 'right' }}>
                                {String(sec.working_current_a ?? '—')}
                              </td>
                              <td style={{ textAlign: 'right' }}>
                                {String(sec.start_current_a ?? '—')}
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  );
                },
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

          {/* Legend + CTA */}
          <div className="legend-row-srs">
            <span>
              ⓘ Таблица фильтруется вкладкой системы. Перетащите строку на зону назначения
              или используйте кнопки. Расчёт — для объектов в совместимой системе ЭР.
            </span>
            {calculatedCount > 0 && (
              <Button
                size="small"
                type="primary"
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
