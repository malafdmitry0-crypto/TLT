import {
  useCallback,
  useEffect,
  lazy,
  useMemo,
  useRef,
  useState,
  Suspense,
  type HTMLAttributes,
  type ReactNode,
} from 'react';
import {
  Alert,
  Button,
  Card,
  Checkbox,
  Dropdown,
  Input,
  InputNumber,
  Modal,
  Popconfirm,
  Select,
  Segmented,
  Space,
  Table,
  Tag,
  Tooltip,
  Typography,
  message,
  type TableProps,
} from 'antd';
import {
  CheckCircleFilled,
  CheckOutlined,
  CloseCircleFilled,
  CloseCircleOutlined,
  CopyOutlined,
  DeleteOutlined,
  EditOutlined,
  FilterFilled,
  FolderOutlined,
  MinusCircleFilled,
  MoreOutlined,
  PlusOutlined,
  ReloadOutlined,
  StopOutlined,
  TableOutlined,
  ThunderboltOutlined,
  UndoOutlined,
} from '@ant-design/icons';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useLocation, useNavigate } from 'react-router-dom';
import type { ColumnsType } from 'antd/es/table';

import {
  applyElectricalCandidate,
  addElectricalCandidateToFolder,
  cancelCalcTask,
  copyElectricalVariant,
  createElectricalCandidate,
  createElectricalCandidateFolder,
  deleteElectricalCandidateFolder,
  enqueueElectricalBatchJob,
  listElectricalCandidateFolders,
  listElectricalCandidates,
  getElectricalQueryCapabilities,
  getCalcTask,
  listCables,
  queryElectrical,
  selectCableForVariants,
  removeElectricalCandidateFromFolder,
  updateElectricalCandidateFolder,
  updateElectricalCandidate,
  type CableSource,
  type CopyElectricalVariantResponse,
  type SelectionPolicy,
} from '@/api/calculations';
import { getUserPreference, updateUserPreference } from '@/api/preferences';
import { referenceQueryKeys, referenceQueryOptions } from '@/api/referenceQueries';
import { getCablesTt, getResistiveCables } from '@/api/references';
import { useAuthStore } from '@/store/authStore';
import {
  normalizeCalculationVariant,
  useCalculationVariantStore,
  type CalculationVariant,
} from '@/store/calculationVariantStore';
import { useProjectStore } from '@/store/projectStore';
import { areCommercialFeaturesEnabled } from '@/config/featureFlags';
import { useFocusableTableScrollRegions } from '@/hooks/useFocusableTableScrollRegions';
import {
  electricalCalcError,
  electricalCalcHint,
  isElectricalCalcStale,
  isElectricalCalcSuccess,
  isElectricalCalcUnsupported,
} from '@/utils/calcStatus';
import { getCalcJobRefetchInterval, isActiveCalcJobStatus } from '@/utils/calcJobPolling';
import { buildTsv, copyToClipboard } from '@/utils/clipboard';
import { formatNumber } from '@/utils/formatters';

import EmptyProjectState from '@/components/common/EmptyProjectState';
import CablePickerCharacteristics from '@/components/electrical/CablePickerCharacteristics';
import ElectricalCandidateColumnSettingsModal from '@/components/electrical/ElectricalCandidateColumnSettingsModal';
import { renderCandidateElectricalField } from '@/components/electrical/ElectricalCandidateFieldRenderer';
import ElectricalColumnFilterDropdown from '@/components/electrical/ElectricalColumnFilterDropdown';
import ElectricalColumnSettingsModal from '@/components/electrical/ElectricalColumnSettingsModal';
import ResizableColumnTitle from '@/components/heatcalc/ResizableColumnTitle';
import { ROUTES } from '@/routes/routes';
import type { ProjectObject } from '@/types/project';
import type {
  ElectricalCandidate,
  ElectricalCandidateFolder,
  ElectricalCalcSummary,
  ElectricalQueryResponse,
} from '@/types/calculation';
import {
  ELECTRICAL_TABLE_COLUMN_PREF_KEY,
  clearRegisteredElectricalTableColumnCache,
  getDefaultElectricalTableColumnSettings,
  getVisibleElectricalTableColumnMetas,
  normalizeElectricalTableColumnSettings,
  readGuestElectricalTableColumnSettings,
  readRegisteredElectricalTableColumnCache,
  writeRegisteredElectricalTableColumnCache,
  type ElectricalColumnKey,
  type ElectricalTableColumnSettings,
} from '@/utils/electricalTableColumns';
import {
  ELECTRICAL_CANDIDATE_TABLE_COLUMN_PREF_KEY,
  clearRegisteredElectricalCandidateTableColumnCache,
  getDefaultElectricalCandidateTableColumnSettings,
  getVisibleElectricalCandidateTableColumnMetas,
  normalizeElectricalCandidateTableColumnSettings,
  readGuestElectricalCandidateTableColumnSettings,
  readRegisteredElectricalCandidateTableColumnCache,
  writeRegisteredElectricalCandidateTableColumnCache,
  type ElectricalCandidateTableColumnSettings,
} from '@/utils/electricalCandidateTableColumns';
import {
  ELECTRICAL_TABLE_VIEW_PREF_KEY,
  clearRegisteredElectricalTableViewCache,
  getDefaultElectricalTableViewSettings,
  normalizeElectricalTableViewSettings,
  readGuestElectricalTableViewSettings,
  readRegisteredElectricalTableViewCache,
  resolveElectricalTableFontSize,
  writeRegisteredElectricalTableViewCache,
  type ElectricalCalculationCableSource,
  type ElectricalTableViewSettings,
} from '@/utils/electricalTableViewSettings';
import {
  buildElectricalGlideColumns,
} from '@/utils/electricalGlideGrid';
import {
  buildElectricalCandidateGlideColumns,
} from '@/utils/electricalCandidateGlideGrid';
import {
  AUTO_CABLE_MARK_VALUE,
  cableMarkOptionValue,
  catalogSourceFromSnapshot,
  shouldShowProjectCableOption,
} from '@/pages/electrical/elecCalcCableOptionModel';
import {
  resolveCableCatalogStatuses,
  resolveCableRowForMark,
  resolveCableRowsForType,
  type CableStatusRow,
} from '@/pages/electrical/elecCalcCableCatalogModel';
import {
  isResistiveCableType,
} from '@/pages/electrical/elecCalcCableTypeModel';
import {
  isBatchElectricalResponse,
  isTargetVariantNotEmptyError,
} from '@/pages/electrical/elecCalcApiResponseGuards';
import {
  candidateCompareDisplayValue,
  candidateOrderCableLengthValue,
} from '@/pages/electrical/elecCalcCandidateCompareModel';
import {
  buildElectricalQueryRequest,
} from '@/pages/electrical/elecCalcQueryModel';
import {
  candidateCustomFolderKey,
  type CandidateFolderKey,
} from '@/pages/electrical/elecCalcCandidateFolderModel';
import {
  calculationVariantLabel,
} from '@/pages/electrical/elecCalcVariantModel';
import {
  SELECTION_POLICY_OPTIONS,
} from '@/pages/electrical/elecCalcSelectionPolicyModel';
import {
  countManualCableRows,
  countValidSelectedObjects,
  formatSelectedRecalcCountLabel,
  objectIdsForSelection,
  selectedObjectsForKeys,
  selectedRecalcDisabledTooltip,
} from '@/pages/electrical/elecCalcSelectionModel';
import {
  buildElectricalErrorItems,
  electricalErrorGuidanceForItem,
  resolveActiveElectricalErrorItem,
} from '@/pages/electrical/elecCalcErrorSummaryModel';
import {
  SHOW_COMMERCIAL_CABLE_BASE_UI,
  type CopyElectricalVariantMutationArgs,
  type ElectricalBatchMutationArgs,
  type ElectricalBatchScope,
  type ElectricalCandidateTableColumnPreferenceMutation,
  type ElectricalColumnRenderSpec,
  type ElectricalTableColumnPreferenceMutation,
  type ElectricalTableSettingsPreferenceMutation,
} from '@/pages/electrical/elecCalcPageModel';
import {
  ELECTRICAL_LAYOUT_EDITABLE_COLUMNS,
  maxThreadsForCableType,
  maxWindingCoefficientForDiameterMm,
  parseElectricalLayoutNumber,
  pipeOuterDiameterMm,
  windingCoefficientForPitch,
} from '@/pages/electrical/elecCalcLayoutModel';
import {
  cableSnapshotStatusTag,
  CABLE_TYPE_LABEL,
  CONNECTION_TYPE_LABEL,
  mainElectricalColumnCopyValue,
  OBJECT_TYPE_LABEL,
  objectDisplayName,
  STOCK_STATUS_LABEL,
  type CableTypeKey,
} from '@/pages/electrical/elecCalcMainTableModel';
import {
  calcLayoutValues,
  cablePowerPerMeterValue,
  commercialNumber,
  commercialValue,
  currentElectricalCalc,
  getCableMark,
  getCableMarkSource,
  getThreadSource,
  installedPowerPerMeterValue,
  numberText,
  objectResultNumber,
  orderCableLengthValue,
  powerText,
  resultNumber,
  selectionPolicyText,
  threadSourceTag,
  valueText,
} from '@/pages/electrical/elecCalcResultValueModel';
import {
  buildCandidateEnumOptionsByColumn,
  buildElectricalEnumOptionsByColumn,
  buildFieldCapabilityByKey,
  filterKindForCandidateColumn,
  filterKindForElectricalColumn,
} from '@/pages/electrical/elecCalcTableFilterModel';
import { useElecCalcAntTableHandlers } from '@/pages/electrical/useElecCalcAntTableHandlers';
import { useElecCalcBootViewState } from '@/pages/electrical/useElecCalcBootViewState';
import { useElecCalcCableMarkOptions } from '@/pages/electrical/useElecCalcCableMarkOptions';
import { useElecCalcCableMarkModalState } from '@/pages/electrical/useElecCalcCableMarkModalState';
import { useElecCalcCableSizingModalState } from '@/pages/electrical/useElecCalcCableSizingModalState';
import { useElecCalcCableTypeState } from '@/pages/electrical/useElecCalcCableTypeState';
import { useElecCalcCandidateCompareState } from '@/pages/electrical/useElecCalcCandidateCompareState';
import { useElecCalcCandidateFolderUiState } from '@/pages/electrical/useElecCalcCandidateFolderUiState';
import { useElecCalcCandidateFolderViewModel } from '@/pages/electrical/useElecCalcCandidateFolderViewModel';
import { useElecCalcColumnPersistence } from '@/pages/electrical/useElecCalcColumnPersistence';
import { useElecCalcColumnSettingsDraftState } from '@/pages/electrical/useElecCalcColumnSettingsDraftState';
import { useElecCalcPaginationState } from '@/pages/electrical/useElecCalcPaginationState';
import { useElecCalcRecalculationParams } from '@/pages/electrical/useElecCalcRecalculationParams';
import { useElecCalcRowSelectionState } from '@/pages/electrical/useElecCalcRowSelectionState';
import { useElecCalcTableProjection } from '@/pages/electrical/useElecCalcTableProjection';
import { useElecCalcTableViewState } from '@/pages/electrical/useElecCalcTableViewState';
import type {
  HeatCalcGlideGridCellState,
  HeatCalcGlideGridColumn,
} from '@/utils/heatCalcGlideGrid';
import {
  isColumnFilterActive,
} from '@/utils/heatCalcTableFindability';

const { Text } = Typography;
const ElectricalGlideGrid = lazy(() => import('@/components/electrical/ElectricalGlideGrid'));
const ElectricalCandidateGlideGrid = lazy(() => import('@/components/electrical/ElectricalCandidateGlideGrid'));

export default function ElecCalcPage() {
  const project = useProjectStore((s) => s.currentProject);
  const role = useAuthStore((s) => s.role);
  const registeredUserId = useAuthStore((s) => s.user?.id ?? null);
  const isEmployee = role === 'employee' || role === 'admin';
  const isRegisteredUser = isEmployee;
  const commercialFeaturesAvailable = areCommercialFeaturesEnabled();
  const location = useLocation();
  const {
    availableCableTypeKeys,
    availableCableTypes,
    electricalGlideEnabled,
    electricalCandidateGlideEnabled,
    navigationActiveJobId,
  } = useElecCalcBootViewState({
    commercialFeaturesAvailable,
    location,
  });
  const storedVariant = useCalculationVariantStore((s) =>
    project?.id ? s.variantByProject[project.id] : undefined
  );
  const saveVariant = useCalculationVariantStore((s) => s.setVariant);
  const variant = normalizeCalculationVariant(storedVariant);
  const setVariant = useCallback(
    (nextVariant: number) => {
      if (project?.id) saveVariant(project.id, nextVariant);
    },
    [project?.id, saveVariant],
  );

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
    resetTablePageAndCursors,
    rememberElectricalPage,
    rememberNextCursor,
    loadNextElectricalGlidePage,
  } = useElecCalcPaginationState();
  const {
    activeCandidateFolderKey,
    setActiveCandidateFolderKey,
    candidateFolderModalMode,
    candidateFolderModalOpen,
    candidateFolderName,
    setCandidateFolderName,
    editingCandidateFolder,
    closeCandidateFolderModal,
    openCreateCandidateFolderModal,
    openRenameCandidateFolderModal,
  } = useElecCalcCandidateFolderUiState();
  const [tableColumnSettings, setTableColumnSettings] =
    useState<ElectricalTableColumnSettings>(() => {
      const auth = useAuthStore.getState();
      const cached = readRegisteredElectricalTableColumnCache(auth.user?.id ?? null);
      if (auth.role === 'employee' || auth.role === 'admin') {
        return cached ?? getDefaultElectricalTableColumnSettings();
      }
      return readGuestElectricalTableColumnSettings();
    });
  const [candidateTableColumnSettings, setCandidateTableColumnSettings] =
    useState<ElectricalCandidateTableColumnSettings>(() => {
      const auth = useAuthStore.getState();
      const cached = readRegisteredElectricalCandidateTableColumnCache(auth.user?.id ?? null);
      if (auth.role === 'employee' || auth.role === 'admin') {
        return cached ?? getDefaultElectricalCandidateTableColumnSettings();
      }
      return readGuestElectricalCandidateTableColumnSettings();
    });
  const [tableViewSettings, setTableViewSettings] =
    useState<ElectricalTableViewSettings>(() => {
      const auth = useAuthStore.getState();
      const cached = readRegisteredElectricalTableViewCache(auth.user?.id ?? null);
      if (auth.role === 'employee' || auth.role === 'admin') {
        return cached ?? getDefaultElectricalTableViewSettings();
      }
      return readGuestElectricalTableViewSettings();
    });
  const normalizedTableViewSettings = useMemo(
    () => normalizeElectricalTableViewSettings(tableViewSettings),
    [tableViewSettings],
  );
  const visibleElectricalColumnMetas = useMemo(
    () => getVisibleElectricalTableColumnMetas(
      tableColumnSettings,
      normalizedTableViewSettings.tableLabelFormat,
    ),
    [normalizedTableViewSettings.tableLabelFormat, tableColumnSettings],
  );
  const visibleCandidateColumnMetas = useMemo(
    () => getVisibleElectricalCandidateTableColumnMetas(
      candidateTableColumnSettings,
      normalizedTableViewSettings.tableLabelFormat,
    ),
    [candidateTableColumnSettings, normalizedTableViewSettings.tableLabelFormat],
  );
  const resolvedTableFontSize = useMemo(
    () => resolveElectricalTableFontSize(normalizedTableViewSettings),
    [normalizedTableViewSettings],
  );
  const visibleElectricalColumnKeys = useMemo(
    () => visibleElectricalColumnMetas.map((meta) => meta.key),
    [visibleElectricalColumnMetas],
  );
  const visibleCandidateColumnKeys = useMemo(
    () => visibleCandidateColumnMetas.map((meta) => meta.key),
    [visibleCandidateColumnMetas],
  );
  const {
    tableViewState,
    candidateTableViewState,
    setTableViewState,
    setCandidateTableViewState,
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
  const [columnSettingsOpen, setColumnSettingsOpen] = useState(false);
  const [candidateColumnSettingsOpen, setCandidateColumnSettingsOpen] = useState(false);
  const [activeJobId, setActiveJobId] = useState<string | null>(
    () => navigationActiveJobId,
  );
  const [activeBatchScope, setActiveBatchScope] = useState<ElectricalBatchScope | null>(null);
  const [overwriteManualChoices, setOverwriteManualChoices] = useState(false);
  const activeBatchObjectIdsRef = useRef<string[] | null>(null);
  const pageScopeRef = useRef<{ projectId?: string; variant: number } | null>(null);
  const tableScrollRegionsRef = useRef<HTMLDivElement | null>(null);
  useFocusableTableScrollRegions(
    tableScrollRegionsRef,
    'Таблица электротехнического расчёта',
    Boolean(project),
  );

  const qc = useQueryClient();
  const navigate = useNavigate();

  useEffect(() => {
    resetTablePage();
  }, [project?.id, resetTablePage, variant]);

  useEffect(() => {
    resetPaginationCache();
  }, [effectiveSource, project?.id, resetPaginationCache, tablePageSize, tableViewState, variant]);

  useEffect(() => {
    if (navigationActiveJobId) {
      setActiveJobId(navigationActiveJobId);
    }
  }, [navigationActiveJobId]);

  useEffect(() => {
    const currentScope = { projectId: project?.id, variant };
    const previousScope = pageScopeRef.current;
    pageScopeRef.current = currentScope;
    if (!previousScope) return;
    if (!previousScope.projectId && currentScope.projectId) return;
    if (
      previousScope.projectId !== currentScope.projectId ||
      previousScope.variant !== currentScope.variant
    ) {
      setActiveJobId(null);
      setActiveBatchScope(null);
    }
  }, [project?.id, variant]);

  const { data: electricalQueryCapabilities } = useQuery({
    queryKey: ['project', project?.id, 'electrical-query-capabilities', variant],
    queryFn: () => getElectricalQueryCapabilities(project!.id, variant),
    enabled: !!project,
    staleTime: 60_000,
  });
  const electricalQueryRequest = useMemo(
    () => (project
      ? buildElectricalQueryRequest(
        project.id,
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
  } = useQuery({
    queryKey: ['project', project?.id, 'electrical-query', electricalQueryRequest],
    queryFn: () => queryElectrical(electricalQueryRequest!),
    enabled: !!project && electricalQueryRequest != null && !!electricalQueryCapabilities,
    placeholderData: (previous) => previous,
  });
  const pageSummary = electricalPage?.summary;
  const pageInfo = electricalPage?.page_info;
  const nextElectricalPageCursor = pageInfo?.next_cursor;
  useEffect(() => {
    rememberElectricalPage({
      electricalGlideEnabled,
      electricalPage,
      isFetching: isElectricalPageFetching,
      isPlaceholderData: isElectricalPagePlaceholderData,
    });
  }, [
    electricalGlideEnabled,
    electricalPage,
    isElectricalPageFetching,
    isElectricalPagePlaceholderData,
    rememberElectricalPage,
  ]);
  const {
    objects,
    elecCalcs,
    electricalDisplayOffset,
    stats,
  } = useElecCalcTableProjection({
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
    variant,
    tablePage,
    tablePageSize,
    objects,
  });
  const cableTypes = useElecCalcCableTypeState({
    availableCableTypes,
    calcByObjectId: stats.calcByObjectId,
    selectedRowKeys,
    projectId: project?.id,
    variant,
  });
  const cableSizingModal = useElecCalcCableSizingModalState({
    projectId: project?.id,
    variant,
    objects,
    calcByObjectId: stats.calcByObjectId,
    recalc,
    getSavedCableTypeForObject: cableTypes.getSavedCableTypeForObject,
    normalizeAvailableCableType: cableTypes.normalizeAvailableCableType,
  });
  const {
    objectId: cableSizingModalObjectId,
    mode: cableSizingMode,
    setMode: setCableSizingMode,
    cableType: cableSizingCableType,
    setCableType: setCableSizingCableType,
    manualMark: cableSizingManualMark,
    setManualMark: setCableSizingManualMark,
    effectiveCableType: cableSizingEffectiveCableType,
    candidateParams: cableSizingCandidateParams,
    candidatesQueryKey: cableSizingCandidatesQueryKey,
    candidateFoldersQueryKey: cableSizingCandidateFoldersQueryKey,
    object: cableSizingModalObject,
    calc: cableSizingModalCalc,
    resetModalState: resetCableSizingModalState,
    openModalState: openCableSizingModalState,
  } = cableSizingModal;

  useEffect(() => {
    resetCandidateTableViewState();
  }, [cableSizingModalObjectId, resetCandidateTableViewState]);

  useEffect(() => {
    setCableSizingCableType((current) => cableTypes.normalizeAvailableCableType(current));
  }, [cableTypes.normalizeAvailableCableType]);

  useEffect(() => {
    rememberNextCursor({
      nextCursor: nextElectricalPageCursor,
      isFetching: isElectricalPageFetching,
      isPlaceholderData: isElectricalPagePlaceholderData,
    });
  }, [
    isElectricalPageFetching,
    isElectricalPagePlaceholderData,
    nextElectricalPageCursor,
    rememberNextCursor,
  ]);

  const { data: activeJob } = useQuery({
    queryKey: ['calc-job', activeJobId],
    queryFn: () => getCalcTask(activeJobId!),
    enabled: !!activeJobId,
    refetchInterval: (query) => {
      const status = query.state.data?.status;
      return getCalcJobRefetchInterval(status);
    },
    refetchIntervalInBackground: true,
  });

  const { data: cables = [] } = useQuery({
    queryKey: referenceQueryKeys.cables(effectiveSource, 'self_regulating'),
    queryFn: () => listCables(effectiveSource, 'self_regulating'),
    ...referenceQueryOptions,
  });
  const { data: builtinCables = [] } = useQuery({
    queryKey: referenceQueryKeys.cables('builtin', 'self_regulating'),
    queryFn: () => listCables('builtin', 'self_regulating'),
    ...referenceQueryOptions,
  });
  const { data: ttCables = [] } = useQuery({
    queryKey: referenceQueryKeys.ttCables,
    queryFn: getCablesTt,
    enabled: !!project && commercialFeaturesAvailable,
    ...referenceQueryOptions,
  });
  const { data: resistiveCables } = useQuery({
    queryKey: referenceQueryKeys.resistiveCables(effectiveSource),
    queryFn: () => getResistiveCables(effectiveSource),
    enabled: !!project && commercialFeaturesAvailable,
    ...referenceQueryOptions,
  });
  const { data: builtinResistiveCables } = useQuery({
    queryKey: referenceQueryKeys.resistiveCables('builtin'),
    queryFn: () => getResistiveCables('builtin'),
    enabled: !!project && commercialFeaturesAvailable,
    ...referenceQueryOptions,
  });

  const cableRowsForType = useCallback((type: CableTypeKey): CableStatusRow[] => {
    return resolveCableRowsForType({
      type,
      availableCableTypes,
      cables,
      builtinCables,
      ttCables,
      resistiveCables,
      builtinResistiveCables,
      effectiveSource,
    });
  }, [
    availableCableTypes,
    builtinCables,
    builtinResistiveCables,
    cables,
    effectiveSource,
    resistiveCables,
    ttCables,
  ]);

  const visibleCableCatalog = useMemo<CableStatusRow[]>(() => {
    if (!cableTypes.visibleCableTypeControl) return [];
    return cableRowsForType(cableTypes.visibleCableTypeControl);
  }, [
    cableRowsForType,
    cableTypes.visibleCableTypeControl,
  ]);
  const {
    commercialDataStatus,
    technicalDataStatus,
  } = useMemo(
    () => resolveCableCatalogStatuses(cableTypes.visibleCableTypeControl, visibleCableCatalog),
    [visibleCableCatalog, cableTypes.visibleCableTypeControl],
  );

  const { data: persistedTableColumnPreference } = useQuery({
    queryKey: ['preference', ELECTRICAL_TABLE_COLUMN_PREF_KEY],
    queryFn: () =>
      getUserPreference<ElectricalTableColumnSettings>(ELECTRICAL_TABLE_COLUMN_PREF_KEY),
    enabled: isRegisteredUser,
    staleTime: 30_000,
  });

  const { data: persistedCandidateTableColumnPreference } = useQuery({
    queryKey: ['preference', ELECTRICAL_CANDIDATE_TABLE_COLUMN_PREF_KEY],
    queryFn: () =>
      getUserPreference<ElectricalCandidateTableColumnSettings>(
        ELECTRICAL_CANDIDATE_TABLE_COLUMN_PREF_KEY,
      ),
    enabled: isRegisteredUser,
    staleTime: 30_000,
  });

  const { data: persistedTableViewPreference } = useQuery({
    queryKey: ['preference', ELECTRICAL_TABLE_VIEW_PREF_KEY],
    queryFn: () =>
      getUserPreference<ElectricalTableViewSettings>(ELECTRICAL_TABLE_VIEW_PREF_KEY),
    enabled: isRegisteredUser,
    staleTime: 30_000,
  });

  const updateTableColumnPreference = useMutation({
    mutationFn: ({ settings }: ElectricalTableColumnPreferenceMutation) =>
      updateUserPreference<ElectricalTableColumnSettings>(
        ELECTRICAL_TABLE_COLUMN_PREF_KEY,
        normalizeElectricalTableColumnSettings(settings),
      ),
    onSuccess: (preference, variables) => {
      const normalized = normalizeElectricalTableColumnSettings(preference.value);
      setTableColumnSettings(normalized);
      if (preference.user_id) {
        writeRegisteredElectricalTableColumnCache(preference.user_id, normalized);
      }
      if (variables.closeModal) setColumnSettingsOpen(false);
      if (variables.showMessage !== false) message.success('Настройки таблицы сохранены');
    },
    onError: (error) => {
      message.error(error instanceof Error ? error.message : 'Не удалось сохранить настройки таблицы');
    },
  });

  const updateCandidateTableColumnPreference = useMutation({
    mutationFn: ({ settings }: ElectricalCandidateTableColumnPreferenceMutation) =>
      updateUserPreference<ElectricalCandidateTableColumnSettings>(
        ELECTRICAL_CANDIDATE_TABLE_COLUMN_PREF_KEY,
        normalizeElectricalCandidateTableColumnSettings(settings),
      ),
    onSuccess: (preference, variables) => {
      const normalized = normalizeElectricalCandidateTableColumnSettings(preference.value);
      setCandidateTableColumnSettings(normalized);
      if (preference.user_id) {
        writeRegisteredElectricalCandidateTableColumnCache(preference.user_id, normalized);
      }
      if (variables.closeModal) setCandidateColumnSettingsOpen(false);
      if (variables.showMessage !== false) message.success('Настройки таблицы подбора сохранены');
    },
    onError: (error) => {
      message.error(
        error instanceof Error ? error.message : 'Не удалось сохранить настройки таблицы подбора',
      );
    },
  });

  const updateTableSettingsPreference = useMutation({
    mutationFn: async ({ columnSettings, viewSettings }: ElectricalTableSettingsPreferenceMutation) => {
      const columnPreference = await updateUserPreference<ElectricalTableColumnSettings>(
        ELECTRICAL_TABLE_COLUMN_PREF_KEY,
        normalizeElectricalTableColumnSettings(columnSettings),
      );
      const viewPreference = await updateUserPreference<ElectricalTableViewSettings>(
        ELECTRICAL_TABLE_VIEW_PREF_KEY,
        normalizeElectricalTableViewSettings(viewSettings),
      );
      return { columnPreference, viewPreference };
    },
    onSuccess: ({ columnPreference, viewPreference }) => {
      const normalizedColumns = normalizeElectricalTableColumnSettings(columnPreference.value);
      const normalizedView = normalizeElectricalTableViewSettings(viewPreference.value);
      setTableColumnSettings(normalizedColumns);
      setTableViewSettings(normalizedView);
      if (columnPreference.user_id) {
        writeRegisteredElectricalTableColumnCache(columnPreference.user_id, normalizedColumns);
      }
      if (viewPreference.user_id) {
        writeRegisteredElectricalTableViewCache(viewPreference.user_id, normalizedView);
      }
      setColumnSettingsOpen(false);
      message.success('Настройки таблицы сохранены');
    },
    onError: (error) => {
      message.error(error instanceof Error ? error.message : 'Не удалось сохранить настройки таблицы');
    },
  });

  useEffect(() => {
    if (isRegisteredUser) {
      const registeredViewSettings =
        readRegisteredElectricalTableViewCache(registeredUserId) ??
        getDefaultElectricalTableViewSettings();
      setTableColumnSettings(
        readRegisteredElectricalTableColumnCache(registeredUserId) ??
          getDefaultElectricalTableColumnSettings(),
      );
      setCandidateTableColumnSettings(
        readRegisteredElectricalCandidateTableColumnCache(registeredUserId) ??
          getDefaultElectricalCandidateTableColumnSettings(),
      );
      setTableViewSettings(registeredViewSettings);
      return;
    }
    setTableColumnSettings(readGuestElectricalTableColumnSettings());
    setCandidateTableColumnSettings(readGuestElectricalCandidateTableColumnSettings());
    const guestViewSettings = readGuestElectricalTableViewSettings();
    setTableViewSettings(guestViewSettings);
  }, [isRegisteredUser, registeredUserId]);

  useEffect(() => {
    if (!isRegisteredUser || !persistedTableColumnPreference) return;
    if (persistedTableColumnPreference.value) {
      const normalized = normalizeElectricalTableColumnSettings(
        persistedTableColumnPreference.value,
      );
      setTableColumnSettings(normalized);
      if (persistedTableColumnPreference.user_id) {
        writeRegisteredElectricalTableColumnCache(
          persistedTableColumnPreference.user_id,
          normalized,
        );
      }
      return;
    }
    clearRegisteredElectricalTableColumnCache(
      registeredUserId ?? persistedTableColumnPreference.user_id,
    );
    setTableColumnSettings(getDefaultElectricalTableColumnSettings());
  }, [isRegisteredUser, persistedTableColumnPreference, registeredUserId]);

  useEffect(() => {
    if (!isRegisteredUser || !persistedCandidateTableColumnPreference) return;
    if (persistedCandidateTableColumnPreference.value) {
      const normalized = normalizeElectricalCandidateTableColumnSettings(
        persistedCandidateTableColumnPreference.value,
      );
      setCandidateTableColumnSettings(normalized);
      if (persistedCandidateTableColumnPreference.user_id) {
        writeRegisteredElectricalCandidateTableColumnCache(
          persistedCandidateTableColumnPreference.user_id,
          normalized,
        );
      }
      return;
    }
    clearRegisteredElectricalCandidateTableColumnCache(
      registeredUserId ?? persistedCandidateTableColumnPreference.user_id,
    );
    setCandidateTableColumnSettings(getDefaultElectricalCandidateTableColumnSettings());
  }, [isRegisteredUser, persistedCandidateTableColumnPreference, registeredUserId]);

  useEffect(() => {
    if (!isRegisteredUser || !persistedTableViewPreference) return;
    if (persistedTableViewPreference.value) {
      const normalized = normalizeElectricalTableViewSettings(persistedTableViewPreference.value);
      setTableViewSettings(normalized);
      if (persistedTableViewPreference.user_id) {
        writeRegisteredElectricalTableViewCache(persistedTableViewPreference.user_id, normalized);
      }
      return;
    }
    clearRegisteredElectricalTableViewCache(
      registeredUserId ?? persistedTableViewPreference.user_id,
    );
    const defaults = getDefaultElectricalTableViewSettings();
    setTableViewSettings(defaults);
  }, [isRegisteredUser, persistedTableViewPreference, registeredUserId]);

  const batchMut = useMutation({
    mutationFn: ({ scope, objectIds, skipManual = true }: ElectricalBatchMutationArgs) => {
      const selectedObjectIds = objectIds ?? [];
      const objectOverrides = scope === 'selected'
        ? cableTypes.objectOverridesForIds(selectedObjectIds)
        : [];
      const fallbackCableType = scope === 'selected'
        ? cableTypes.selectedCableType ?? cableTypes.defaultCableType
        : cableTypes.cableTypeForRecalculation;
      const effectiveCableType = cableTypes.normalizeAvailableCableType(fallbackCableType);
      const selectionMode = isResistiveCableType(effectiveCableType) ? 'auto' : undefined;
      return enqueueElectricalBatchJob(
        project!.id,
        effectiveSource,
        variant,
        effectiveCableType,
        {
          supplyVoltage: recalc.supplyVoltage,
          selectionMode,
          selectionPolicy: recalc.selectionPolicy,
          connectionType: recalc.connectionType,
          windingCoefficient: recalc.windingCoefficient,
          heatingHeight: recalc.heatingHeight,
          layingStep: recalc.layingStep,
          maintainTemperature: recalc.maintainTemperature,
          vaporTemperature: recalc.vaporTemperature,
          aggressiveProduct: recalc.aggressiveProduct,
          skipManual,
          objectIds: scope === 'selected' ? selectedObjectIds : undefined,
          forceCableType: scope === 'all',
          objectOverrides: objectOverrides.length > 0 ? objectOverrides : undefined,
        },
      );
    },
    onSuccess: (task, variables) => {
      setActiveJobId(task.id);
      setActiveBatchScope(variables.scope);
      activeBatchObjectIdsRef.current = variables.scope === 'selected'
        ? variables.objectIds ?? []
        : null;
      message.info(
        variables.scope === 'selected'
          ? `СО${variant} · электрорасчёт выбранных объектов поставлен в очередь`
          : `СО${variant} · электрорасчёт всех объектов поставлен в очередь`,
      );
    },
    onError: (e: Error) => message.error(e.message),
  });

  const copyVariantMut = useMutation({
    mutationFn: ({ targetVariant, overwrite = false }: CopyElectricalVariantMutationArgs) =>
      copyElectricalVariant({
        project_id: project!.id,
        source_variant_number: variant,
        target_variant_number: targetVariant,
        overwrite,
        regenerate_specification: true,
    }),
    onSuccess: (res: CopyElectricalVariantResponse) => {
      resetTablePageAndCursors();
      setSelectedRowKeys([]);
      cableTypes.setCableTypeDraftByObjectId({});
      setVariant(res.target_variant_number);
      qc.invalidateQueries({ queryKey: ['project', project?.id, 'electrical-query'] });
      qc.invalidateQueries({ queryKey: ['project', project?.id, 'electrical-query-capabilities'] });
      qc.invalidateQueries({ queryKey: ['spec', project?.id, res.target_variant_number] });
      qc.invalidateQueries({ queryKey: ['report-preview', project?.id, res.target_variant_number] });
      message.success(
        `СО${res.target_variant_number} создан на основании СО${res.source_variant_number}: ` +
        `скопировано ${res.copied_count}, успешно проверено ${res.validated_count ?? 0}`,
      );
      if ((res.validation_failed_count ?? 0) > 0) {
        message.warning(
          `В СО${res.target_variant_number} есть ошибки проверки скопированного выбора: ` +
          `${res.validation_failed_count}. Новый кабель автоматически не подбирался.`,
        );
      }
      if (res.copied_count < res.project_objects_count) {
        message.info(
          `В проекте объектов: ${res.project_objects_count}, скопировано расчётов: ${res.copied_count}. ` +
          `Остальные в СО${res.target_variant_number} не рассчитаны.`,
        );
      }
    },
    onError: (error: Error, variables) => {
      if (isTargetVariantNotEmptyError(error) && !variables.overwrite) {
        Modal.confirm({
          title: `СО${variables.targetVariant} уже содержит расчёты`,
          content: `Заменить СО${variables.targetVariant} копией СО${variant}? ` +
            `Все текущие расчёты СО${variables.targetVariant} будут удалены.`,
          okText: 'Заменить',
          okButtonProps: { danger: true },
          cancelText: 'Отмена',
          onOk: () => copyVariantMut.mutate({ ...variables, overwrite: true }),
        });
        return;
      }
      message.error(error.message);
    },
  });

  const cancelJobMut = useMutation({
    mutationFn: () => cancelCalcTask(activeJobId!),
    onSuccess: (task) => {
      setActiveJobId(task.id);
      setActiveBatchScope(null);
      activeBatchObjectIdsRef.current = null;
      message.warning('Электрорасчёт остановлен');
    },
    onError: (e: Error) => message.error(e.message),
  });

  useEffect(() => {
    if (!activeJob) return;
    if (activeJob.status === 'succeeded') {
      const res = isBatchElectricalResponse(activeJob.result) ? activeJob.result : null;
      const resultScope = res?.scope ?? activeBatchScope ?? 'all';
      const scopeLabel = resultScope === 'selected' ? 'выбранных объектов' : 'всех объектов';
      qc.invalidateQueries({ queryKey: ['project', project?.id, 'electrical-query'] });
      qc.invalidateQueries({ queryKey: ['project', project?.id, 'electrical-query-capabilities'] });
      qc.invalidateQueries({ queryKey: ['project', project?.id, 'objects', 'summary'] });
      if (res && res.calculated === 0 && res.heat_loss_failed > 0) {
        message.warning(
          `СО${variant} · электрорасчёт не выполнен: у выбранных объектов не рассчитаны теплопотери (${res.heat_loss_failed}).`,
        );
      } else if (res && (res.skipped > 0 || res.heat_loss_failed > 0)) {
        message.warning(
          `СО${variant} · рассчитано для ${scopeLabel}: ${res.calculated}, пропущено: ${res.skipped}` +
          `${res.heat_loss_failed > 0 ? `, ошибок теплопотерь: ${res.heat_loss_failed}` : ''}.`,
        );
      } else if (res) {
        message.success(
          `СО${variant} — расчёт выполнен для ${scopeLabel}: ${res.calculated}` +
          `${res.heat_loss_failed > 0 ? ` (ещё ${res.heat_loss_failed} с ошибками теплопотерь)` : ''}`,
        );
      } else {
        message.success(`СО${variant} — расчёт выполнен`);
      }
      cableTypes.setCableTypeDraftByObjectId((prev) => {
        if (resultScope === 'all') return {};
        const affectedIds = activeBatchObjectIdsRef.current;
        if (!affectedIds || affectedIds.length === 0) return prev;
        const next = { ...prev };
        for (const objectId of affectedIds) {
          delete next[objectId];
        }
        return next;
      });
      activeBatchObjectIdsRef.current = null;
      setActiveJobId(null);
      setActiveBatchScope(null);
    }
    if (activeJob.status === 'failed') {
      message.error(activeJob.error_message || 'Электрорасчёт завершился ошибкой');
      setActiveJobId(null);
      setActiveBatchScope(null);
      activeBatchObjectIdsRef.current = null;
    }
    if (activeJob.status === 'cancelled') {
      setActiveJobId(null);
      setActiveBatchScope(null);
      activeBatchObjectIdsRef.current = null;
    }
  }, [activeBatchScope, activeJob, project?.id, qc, variant]);

  const {
    manualCableOptionsForType,
    cableMarkOptionsFor,
    cableSizingManualOptions,
  } = useElecCalcCableMarkOptions({
    availableCableTypes,
    cables,
    builtinCables,
    ttCables,
    resistiveCables,
    builtinResistiveCables,
    effectiveSource,
    aggressiveProduct: recalc.aggressiveProduct,
    cableSizingEffectiveCableType,
  });
  const setCableSizingCandidateApplied = useCallback((
    candidateId: string | null,
    appliedCandidate?: ElectricalCandidate,
  ) => {
    qc.setQueryData<ElectricalCandidate[]>(
      cableSizingCandidatesQueryKey,
      (current) => {
        const next = current?.map((candidate) => {
          const isApplied = candidateId !== null && candidate.id === candidateId;
          return {
            ...candidate,
            ...(isApplied && appliedCandidate ? appliedCandidate : {}),
            is_applied: isApplied,
          };
        });
        if (!next || !appliedCandidate || next.some((candidate) => candidate.id === appliedCandidate.id)) {
          return next;
        }
        return [{ ...appliedCandidate, is_applied: true }, ...next];
      },
    );
  }, [cableSizingCandidatesQueryKey, qc]);
  const setElectricalQueryCalculation = useCallback((calculation: ElectricalCalcSummary) => {
    if (!project?.id) return;
    qc.setQueriesData<ElectricalQueryResponse>(
      { queryKey: ['project', project.id, 'electrical-query'] },
      (current) => {
        if (!current) return current;
        const replaced = current.calculations.some((calc) =>
          calc.object_id === calculation.object_id &&
          calc.variant_number === calculation.variant_number,
        );
        const calculations = replaced
          ? current.calculations.map((calc) =>
              calc.object_id === calculation.object_id &&
              calc.variant_number === calculation.variant_number
                ? calculation
                : calc)
          : [...current.calculations, calculation];
        return { ...current, calculations };
      },
    );
  }, [project?.id, qc]);
  const invalidateCableSizingCandidates = useCallback(() => {
    qc.invalidateQueries({
      queryKey: ['project', project?.id, 'electrical-candidates', cableSizingModalObjectId],
    });
  }, [cableSizingModalObjectId, project?.id, qc]);
  const invalidateCableSizingCandidateFolders = useCallback(() => {
    qc.invalidateQueries({
      queryKey: cableSizingCandidateFoldersQueryKey,
    });
  }, [cableSizingCandidateFoldersQueryKey, qc]);
  const createCandidateMut = useMutation({
    mutationFn: ({ mode, mark }: { mode: 'auto' | 'manual'; mark?: string | null }) =>
      createElectricalCandidate({
        project_id: project!.id,
        object_id: cableSizingModalObjectId!,
        variant_number: variant,
        cable_type: cableSizingEffectiveCableType,
        cable_source: effectiveSource,
        mode,
        cable_mark: mode === 'manual' ? mark ?? null : null,
        electrical_params: cableSizingCandidateParams,
      }),
    onSuccess: ({ candidate, action }) => {
      invalidateCableSizingCandidates();
      const statusMessage = candidate.status === 'applicable'
        ? action === 'updated'
          ? 'Вариант обновлён'
          : 'Вариант добавлен'
        : candidate.reason_message || 'Вариант подбора сохранён с диагностикой';
      message[candidate.status === 'applicable' ? 'success' : 'warning'](statusMessage);
    },
    onError: (error: Error) => message.error(error.message),
  });
  const updateCandidateMut = useMutation({
    mutationFn: ({
      candidateId,
      patch,
    }: {
      candidateId: string;
      patch: Partial<Pick<
        ElectricalCandidate,
        'priority' | 'is_recommended' | 'is_pinned' | 'status' | 'engineer_comment'
      >>;
    }) => updateElectricalCandidate(candidateId, patch),
    onSuccess: invalidateCableSizingCandidates,
    onError: (error: Error) => message.error(error.message),
  });
  const createCandidateFolderMut = useMutation({
    mutationFn: () => createElectricalCandidateFolder({
      project_id: project!.id,
      object_id: cableSizingModalObjectId!,
      variant_number: variant,
      name: candidateFolderName.trim(),
    }),
    onSuccess: (folder) => {
      invalidateCableSizingCandidateFolders();
      setActiveCandidateFolderKey(candidateCustomFolderKey(folder.id));
      closeCandidateFolderModal();
      message.success('Папка создана');
    },
    onError: (error: Error) => message.error(error.message),
  });
  const updateCandidateFolderMut = useMutation({
    mutationFn: ({ folderId, name }: { folderId: string; name: string }) =>
      updateElectricalCandidateFolder(folderId, { name }),
    onSuccess: () => {
      invalidateCableSizingCandidateFolders();
      closeCandidateFolderModal();
      message.success('Папка переименована');
    },
    onError: (error: Error) => message.error(error.message),
  });
  const deleteCandidateFolderMut = useMutation({
    mutationFn: deleteElectricalCandidateFolder,
    onSuccess: (_result, folderId) => {
      invalidateCableSizingCandidateFolders();
      if (activeCandidateFolderKey === candidateCustomFolderKey(folderId)) {
        setActiveCandidateFolderKey('all');
      }
      message.success('Папка удалена');
    },
    onError: (error: Error) => message.error(error.message),
  });
  const toggleCandidateFolderItemMut = useMutation({
    mutationFn: ({
      folderId,
      candidateId,
      checked,
    }: {
      folderId: string;
      candidateId: string;
      checked: boolean;
    }) => checked
      ? addElectricalCandidateToFolder(folderId, candidateId)
      : removeElectricalCandidateFromFolder(folderId, candidateId),
    onSuccess: invalidateCableSizingCandidateFolders,
    onError: (error: Error) => message.error(error.message),
  });
  const applyCandidateMut = useMutation({
    mutationFn: (candidateId: string) => applyElectricalCandidate(candidateId),
    onMutate: async (candidateId) => {
      await qc.cancelQueries({ queryKey: cableSizingCandidatesQueryKey });
      const previous = qc.getQueryData<ElectricalCandidate[]>(cableSizingCandidatesQueryKey);
      setCableSizingCandidateApplied(candidateId);
      return { previous };
    },
    onSuccess: ({ candidate, calculation }) => {
      setCableSizingCandidateApplied(String(candidate.id), candidate);
      setElectricalQueryCalculation(calculation);
      invalidateCableSizingCandidates();
      qc.invalidateQueries({ queryKey: ['project', project?.id, 'electrical-query'] });
      qc.invalidateQueries({ queryKey: ['project', project?.id, 'electrical-query-capabilities'] });
      qc.invalidateQueries({ queryKey: ['project', project?.id, 'objects', 'summary'] });
      message.success('Кандидат применён в электрорасчёт');
    },
    onError: (error: Error, _candidateId, context) => {
      if (context?.previous) qc.setQueryData(cableSizingCandidatesQueryKey, context.previous);
      message.error(error.message);
    },
  });
  const manualCableMut = useMutation({
    mutationFn: async ({
      objectId,
      mark,
      cableType,
      cableSource,
      targetVariants,
    }: {
      objectId: string;
      mark: string;
      cableType: CableTypeKey;
      cableSource?: CableSource;
      targetVariants: CalculationVariant[];
    }) => {
      const variantsToUpdate = targetVariants.length > 0 ? targetVariants : [variant];
      const effectiveCableType = cableTypes.normalizeAvailableCableType(cableType);
      return selectCableForVariants(
        objectId,
        mark,
        cableSource ?? effectiveSource,
        variantsToUpdate,
        effectiveCableType,
        {
          supplyVoltage: recalc.supplyVoltage,
          selectionMode: isResistiveCableType(effectiveCableType) ? 'auto' : undefined,
          selectionPolicy: recalc.selectionPolicy,
          connectionType: recalc.connectionType,
          windingCoefficient: recalc.windingCoefficient,
          heatingHeight: recalc.heatingHeight,
          layingStep: recalc.layingStep,
          maintainTemperature: recalc.maintainTemperature,
          vaporTemperature: recalc.vaporTemperature,
          aggressiveProduct: recalc.aggressiveProduct,
        },
      );
    },
    onSuccess: (_result, variables) => {
      qc.invalidateQueries({ queryKey: ['project', project?.id, 'electrical-query'] });
      qc.invalidateQueries({ queryKey: ['project', project?.id, 'electrical-query-capabilities'] });
      qc.invalidateQueries({ queryKey: ['project', project?.id, 'objects', 'summary'] });
      const targetLabel = calculationVariantLabel(variables.targetVariants);
      message.success(`Кабель выбран, расчёт обновлён${targetLabel ? `: ${targetLabel}` : ''}`);
    },
    onError: (e: Error) => message.error(e.message),
  });

  const autoCableMut = useMutation({
    mutationFn: async ({
      objectId,
      cableType,
      targetVariants,
    }: {
      objectId: string;
      cableType: CableTypeKey;
      targetVariants: CalculationVariant[];
    }) => {
      const variantsToUpdate = targetVariants.length > 0 ? targetVariants : [variant];
      const effectiveCableType = cableTypes.normalizeAvailableCableType(cableType);
      return selectCableForVariants(
        objectId,
        null,
        effectiveSource,
        variantsToUpdate,
        effectiveCableType,
        {
          supplyVoltage: recalc.supplyVoltage,
          selectionMode: isResistiveCableType(effectiveCableType) ? 'auto' : undefined,
          selectionPolicy: recalc.selectionPolicy,
          connectionType: recalc.connectionType,
          windingCoefficient: recalc.windingCoefficient,
          heatingHeight: recalc.heatingHeight,
          layingStep: recalc.layingStep,
          maintainTemperature: recalc.maintainTemperature,
          vaporTemperature: recalc.vaporTemperature,
          aggressiveProduct: recalc.aggressiveProduct,
        },
      );
    },
    onSuccess: (_result, variables) => {
      qc.invalidateQueries({ queryKey: ['project', project?.id, 'electrical-query'] });
      qc.invalidateQueries({ queryKey: ['project', project?.id, 'electrical-query-capabilities'] });
      qc.invalidateQueries({ queryKey: ['project', project?.id, 'objects', 'summary'] });
      const targetLabel = calculationVariantLabel(variables.targetVariants);
      message.success(`Автоподбор выполнен${targetLabel ? `: ${targetLabel}` : ''}`);
    },
    onError: (e: Error) => message.error(e.message),
  });

  const electricalLayoutMut = useMutation({
    mutationFn: async ({
      objectId,
      cableMark,
      cableSource,
      cableType,
      windingPitchMm,
      numberOfThreads,
    }: {
      objectId: string;
      cableMark: string | null;
      cableSource: CableSource;
      cableType: CableTypeKey;
      windingPitchMm: number | null;
      numberOfThreads: number | null;
    }) => {
      const effectiveCableType = cableTypes.normalizeAvailableCableType(cableType);
      return selectCableForVariants(
        objectId,
        cableMark,
        cableSource,
        [variant],
        effectiveCableType,
        {
          supplyVoltage: recalc.supplyVoltage,
          selectionMode: isResistiveCableType(effectiveCableType) ? 'auto' : undefined,
          selectionPolicy: recalc.selectionPolicy,
          connectionType: recalc.connectionType,
          windingCoefficient: recalc.windingCoefficient,
          windingPitchMm,
          numberOfThreads,
          heatingHeight: recalc.heatingHeight,
          layingStep: recalc.layingStep,
          maintainTemperature: recalc.maintainTemperature,
          vaporTemperature: recalc.vaporTemperature,
          aggressiveProduct: recalc.aggressiveProduct,
        },
      );
    },
    onSuccess: (calculations) => {
      calculations.forEach(setElectricalQueryCalculation);
      qc.invalidateQueries({ queryKey: ['project', project?.id, 'electrical-query'] });
      qc.invalidateQueries({ queryKey: ['project', project?.id, 'electrical-query-capabilities'] });
      qc.invalidateQueries({ queryKey: ['project', project?.id, 'objects', 'summary'] });
      message.success('Параметры укладки сохранены, расчёт обновлён');
    },
    onError: (e: Error) => message.error(e.message),
  });

  const manualCableMutate = manualCableMut.mutate;
  const autoCableMutate = autoCableMut.mutate;
  const electricalLayoutMutate = electricalLayoutMut.mutate;
  const isCableMarkPending = manualCableMut.isPending || autoCableMut.isPending || electricalLayoutMut.isPending;
  const {
    data: cableSizingCandidates = [],
    isFetching: isCableSizingCandidatesFetching,
  } = useQuery({
    queryKey: cableSizingCandidatesQueryKey,
    queryFn: () =>
      listElectricalCandidates(project!.id, cableSizingModalObjectId!, variant),
    enabled: !!project && !!cableSizingModalObjectId,
  });
  const { data: cableSizingCandidateFolders = [] } = useQuery({
    queryKey: cableSizingCandidateFoldersQueryKey,
    queryFn: () =>
      listElectricalCandidateFolders(project!.id, cableSizingModalObjectId!, variant),
    enabled: !!project && !!cableSizingModalObjectId,
  });
  const {
    activeCustomCandidateFolder,
    candidatesByActiveFolder: cableSizingCandidatesByActiveFolder,
    candidateFolderCounts,
  } = useElecCalcCandidateFolderViewModel({
    activeCandidateFolderKey,
    setActiveCandidateFolderKey,
    candidates: cableSizingCandidates,
    candidateFolders: cableSizingCandidateFolders,
  });
  const candidateCompare = useElecCalcCandidateCompareState({
    candidatesByActiveFolder: cableSizingCandidatesByActiveFolder,
    candidateTableViewState,
    visibleCandidateColumnMetas,
    resetKey: activeCandidateFolderKey,
  });
  const {
    markedCandidateIds: markedCableSizingCandidateIds,
    markedCandidateSet: markedCableSizingCandidateSet,
    candidateColumnValueAccessors,
    resetMarkedCandidates: resetMarkedCableSizingCandidates,
    toggleCandidateMarked: toggleCableSizingCandidateMark,
    toggleCandidateMarkedByRow: toggleElectricalCandidateGlideMarked,
    displayedCandidates: displayedCableSizingCandidates,
    displayedMarkedCandidates: displayedMarkedCableSizingCandidates,
    compareActive: cableSizingCandidateCompareActive,
    diffColumnKeys: candidateCompareDiffColumnKeys,
    isCompareDiffCell: isCandidateCompareDiffCell,
    candidateRowClassName: cableSizingCandidateRowClassName,
  } = candidateCompare;
  const appliedCableSizingCandidate = useMemo(
    () => cableSizingCandidates.find((candidate) => candidate.is_applied) ?? null,
    [cableSizingCandidates],
  );

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
    variant,
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
    open: openCableMarkModal,
    changeCableType: changeCableMarkModalCableType,
    normalizeSelectedCableType: normalizeCableMarkModalCableType,
    setTargetVariantsFromValues: setCableMarkModalTargetVariantsFromValues,
  } = cableMarkModal;

  useEffect(() => {
    normalizeCableMarkModalCableType();
  }, [normalizeCableMarkModalCableType]);

  const closeCableSizingModal = useCallback(() => {
    resetCableSizingModalState();
    resetMarkedCableSizingCandidates();
    setActiveCandidateFolderKey('all');
    closeCandidateFolderModal();
    setCandidateColumnSettingsOpen(false);
  }, [closeCandidateFolderModal, resetCableSizingModalState, resetMarkedCableSizingCandidates]);
  const openCableSizingModal = useCallback((obj: ProjectObject) => {
    activateRowId(obj.id);
    openCableSizingModalState(obj);
    resetMarkedCableSizingCandidates();
    setActiveCandidateFolderKey('all');
  }, [
    activateRowId,
    openCableSizingModalState,
    resetMarkedCableSizingCandidates,
  ]);
  const applyCableMarkModal = useCallback(() => {
    if (!cableMarkModalObject || !cableMarkModalCableType) return;
    const targetVariants = cableMarkModalTargetVariantsForSubmit;
    const selectedMark = cableMarkModalValue ?? AUTO_CABLE_MARK_VALUE;
    if (selectedMark === AUTO_CABLE_MARK_VALUE) {
      autoCableMutate({
        objectId: cableMarkModalObject.id,
        cableType: cableMarkModalCableType,
        targetVariants,
      }, {
        onSuccess: closeCableMarkModal,
      });
    } else {
      const selectedOption = cableMarkModalOptionByValue.get(selectedMark);
      if (!selectedOption?.mark) return;
      manualCableMutate({
        objectId: cableMarkModalObject.id,
        mark: selectedOption.mark,
        cableType: cableMarkModalCableType,
        cableSource: selectedOption.cableSource,
        targetVariants,
      }, {
        onSuccess: closeCableMarkModal,
      });
    }
  }, [
    autoCableMutate,
    cableMarkModalCableType,
    cableMarkModalObject,
    cableMarkModalOptionByValue,
    cableMarkModalTargetVariantsForSubmit,
    cableMarkModalValue,
    closeCableMarkModal,
    manualCableMutate,
  ]);

  const fieldCapabilityByKey = useMemo(
    () => buildFieldCapabilityByKey(electricalQueryCapabilities?.fields),
    [electricalQueryCapabilities],
  );
  const enumOptionsByColumn = useMemo(
    () => buildElectricalEnumOptionsByColumn(electricalQueryCapabilities?.fields),
    [electricalQueryCapabilities?.fields],
  );
  const candidateEnumOptionsByColumn = useMemo(
    () => buildCandidateEnumOptionsByColumn(
      cableSizingCandidates,
      visibleCandidateColumnMetas,
      candidateColumnValueAccessors,
    ),
    [cableSizingCandidates, candidateColumnValueAccessors, visibleCandidateColumnMetas],
  );

  const {
    handleElectricalTableChange,
    handleCandidateTableChange,
  } = useElecCalcAntTableHandlers({
    setTablePage,
    setTablePageSize,
    setTableViewState,
    setCandidateTableViewState,
  });

  const electricalColumnRenderers = useMemo<Record<ElectricalColumnKey, ElectricalColumnRenderSpec>>(() => ({
    index: {
      render: (_: unknown, __: ProjectObject, idx: number) =>
        electricalDisplayOffset + idx + 1,
    },
    object_name: {
      ellipsis: true,
      render: (_: unknown, obj) => (
        <Text style={{ fontSize: 12 }}>
          {objectDisplayName(obj)}
        </Text>
      ),
    },
    object_type: {
      render: (_: unknown, obj) => OBJECT_TYPE_LABEL[obj.object_type] ?? obj.object_type,
    },
    heat_loss_status: {
      align: 'center',
      render: (_: unknown, obj) => {
        if (obj.is_valid) {
          return (
            <Tooltip title="Рассчитан">
              <Tag className="heatloss-status-icon-tag" color="success" aria-label="Рассчитан">
                <CheckCircleFilled />
              </Tag>
            </Tooltip>
          );
        }
        if (obj.validation_errors?.category === 'unsupported') {
          return (
            <Tooltip title={valueText(obj.validation_errors?.message ?? obj.validation_errors)}>
              <Tag color="default">Не применимо</Tag>
            </Tooltip>
          );
        }
        return (
          <Tooltip
            title={valueText(
              obj.validation_errors?.message ??
              obj.validation_errors,
            )}
          >
            <Tag className="heatloss-status-icon-tag" color="error" aria-label="Ошибка">
              <CloseCircleFilled />
            </Tag>
          </Tooltip>
        );
      },
    },
    electrical_status: {
      align: 'center',
      render: (_: unknown, obj) => {
        const calc = stats.calcByObjectId[obj.id];
        const err = electricalCalcError(calc);
        const unsupported = isElectricalCalcUnsupported(calc);
        const stale = isElectricalCalcStale(calc);
        if (isElectricalCalcSuccess(calc))
          return (
            <Tooltip title="Рассчитан">
              <Tag className="electrical-status-icon-tag" color="success" aria-label="Рассчитан">
                <CheckCircleFilled />
              </Tag>
            </Tooltip>
          );
        if (unsupported)
          return (
            <Tooltip title={electricalCalcHint(calc) ?? err ?? 'Не применимо'}>
              <Tag
                className="electrical-status-icon-tag"
                color="default"
                aria-label="Не применимо"
              >
                <MinusCircleFilled />
              </Tag>
            </Tooltip>
          );
        if (stale)
          return (
            <Tooltip title={electricalCalcHint(calc) ?? 'Требуется пересчёт'}>
              <Tag className="electrical-status-icon-tag" color="warning" aria-label="Требуется пересчёт">
                ↻
              </Tag>
            </Tooltip>
          );
        if (err)
          return (
            <Tooltip title={err}>
              <Tag className="electrical-status-icon-tag" color="error" aria-label="Ошибка">
                <CloseCircleFilled />
              </Tag>
            </Tooltip>
          );
        return (
          <Tooltip title="Не рассчитан">
            <Tag className="electrical-status-icon-tag" aria-label="Не рассчитан">—</Tag>
          </Tooltip>
        );
      },
    },
    cable_type: {
      render: (_: unknown, obj) => {
        const type = cableTypes.getCalculatedCableTypeForObject(obj.id);
        if (!type) {
          return <Text style={{ fontSize: 12 }} type="secondary">—</Text>;
        }
        return (
          <Text style={{ fontSize: 12 }}>
            {CABLE_TYPE_LABEL[type] ?? valueText(type)}
          </Text>
        );
      },
    },
    cable_mark: {
      render: (_: unknown, obj) => {
        const calc = stats.calcByObjectId[obj.id];
        const currentCalc = currentElectricalCalc(calc);
        const mark = getCableMark(currentCalc);
        const isActive = activeRowId === obj.id;

        if (!isActive) {
          return (
            <Space size={4} wrap={false}>
              <Text style={{ fontSize: 12 }} type={mark ? undefined : 'secondary'}>
                {mark ?? '—'}
              </Text>
            </Space>
          );
        }

        return (
          <div className="electrical-cable-mark-cell">
            <span className="electrical-cable-mark-current">
              <Text
                className="electrical-cable-mark-text"
                style={{ fontSize: 12 }}
                title={mark ?? undefined}
                type={mark ? undefined : 'secondary'}
              >
                {mark ?? '—'}
              </Text>
            </span>
            <span className="electrical-cable-mark-actions">
              <Button
                className="electrical-cable-mark-action"
                size="small"
                disabled={!obj.is_valid || !project}
                loading={isCableMarkPending}
                onClick={() => openCableMarkModal(obj)}
              >
                Выбор
              </Button>
              <Button
                className="electrical-cable-mark-action"
                size="small"
                disabled={!project}
                onClick={() => openCableSizingModal(obj)}
              >
                Подбор
              </Button>
            </span>
          </div>
        );
      },
    },
    cable_snapshot_status: {
      render: (_: unknown, obj) => {
        const meta = cableSnapshotStatusTag(currentElectricalCalc(stats.calcByObjectId[obj.id]));
        if (!meta) return <Text type="secondary">—</Text>;
        return (
          <Tooltip title={meta.tooltip}>
            <Tag color={meta.color} style={{ marginInlineEnd: 0 }}>
              {meta.label}
            </Tag>
          </Tooltip>
        );
      },
    },
    selection_policy: {
      render: (_: unknown, obj) =>
        selectionPolicyText(currentElectricalCalc(stats.calcByObjectId[obj.id])?.results?.selection_policy),
    },
    applied_selection_policy: {
      render: (_: unknown, obj) => {
        const calc = currentElectricalCalc(stats.calcByObjectId[obj.id]);
        const requested = calc?.results?.selection_policy;
        const applied = calc?.results?.applied_selection_policy;
        const label = selectionPolicyText(applied);
        const changed = typeof requested === 'string' && typeof applied === 'string' && requested !== applied;
        return changed ? <Tag color="warning">{label}</Tag> : label;
      },
    },
    selection_reason: {
      render: (_: unknown, obj) => {
        const reason = currentElectricalCalc(stats.calcByObjectId[obj.id])?.results?.selection_reason;
        return (
          <Tooltip title={valueText(reason)}>
            <span className="electrical-selection-reason-cell">
              {valueText(reason)}
            </span>
          </Tooltip>
        );
      },
    },
    winding_pitch_mm: {
      align: 'right',
      render: (_: unknown, obj) => {
        const calc = currentElectricalCalc(stats.calcByObjectId[obj.id]);
        const mark = getCableMark(calc);
        const values = calcLayoutValues(calc);
        return (
          <Text style={{ fontSize: 12 }} type={mark ? undefined : 'secondary'}>
            {mark ? formatNumber(values.windingPitchMm, 0) : '—'}
          </Text>
        );
      },
    },
    number_of_threads: {
      align: 'right',
      render: (_: unknown, obj) => {
        const calc = currentElectricalCalc(stats.calcByObjectId[obj.id]);
        const mark = getCableMark(calc);
        const values = calcLayoutValues(calc);
        const sourceMeta = threadSourceTag(getThreadSource(calc));
        const sourceTag = sourceMeta ? (
          <Tooltip title={sourceMeta.tooltip}>
            <Tag
              color={sourceMeta.color}
              style={{ marginInlineEnd: 0, fontSize: 10, lineHeight: '16px' }}
            >
              {sourceMeta.label}
            </Tag>
          </Tooltip>
        ) : null;

        return (
          <Space size={4} wrap={false}>
            <Text style={{ fontSize: 12 }} type={mark ? undefined : 'secondary'}>
              {mark ? values.numberOfThreads : '—'}
            </Text>
            {mark ? sourceTag : null}
          </Space>
        );
      },
    },
    laying_step: {
      align: 'right',
      render: (_: unknown, obj) =>
        numberText(stats.calcByObjectId[obj.id]?.params?.laying_step ?? recalc.layingStep, 2),
    },
    heating_height: {
      align: 'right',
      render: (_: unknown, obj) =>
        numberText(stats.calcByObjectId[obj.id]?.params?.heating_height ?? recalc.heatingHeight, 1),
    },
    connection_type: {
      render: (_: unknown, obj) => {
        const value = stats.calcByObjectId[obj.id]?.params?.connection_type ?? recalc.connectionType;
        return CONNECTION_TYPE_LABEL[String(value)] ?? valueText(value);
      },
    },
    supply_voltage: {
      align: 'right',
      render: (_: unknown, obj) =>
        numberText(stats.calcByObjectId[obj.id]?.params?.supply_voltage ?? recalc.supplyVoltage, 0),
    },
    winding_coefficient: {
      align: 'right',
      render: (_: unknown, obj) =>
        numberText(
          stats.calcByObjectId[obj.id]?.params?.winding_coefficient ?? recalc.windingCoefficient,
          2,
        ),
    },
    vapor_temperature: {
      align: 'right',
      render: (_: unknown, obj) =>
        numberText(stats.calcByObjectId[obj.id]?.params?.vapor_temperature ?? recalc.vaporTemperature, 1),
    },
    maintain_temperature: {
      align: 'right',
      render: (_: unknown, obj) =>
        numberText(
          stats.calcByObjectId[obj.id]?.params?.maintain_temperature ?? recalc.maintainTemperature,
          1,
        ),
    },
    aggressive_product: {
      align: 'center',
      render: (_: unknown, obj) =>
        valueText(stats.calcByObjectId[obj.id]?.params?.aggressive_product ?? recalc.aggressiveProduct),
    },
    installed_cable_length: {
      align: 'right',
      render: (_: unknown, obj) =>
        resultNumber(currentElectricalCalc(stats.calcByObjectId[obj.id]), 'installed_cable_length', 1),
    },
    order_cable_length: {
      align: 'right',
      render: (_: unknown, obj) =>
        numberText(orderCableLengthValue(currentElectricalCalc(stats.calcByObjectId[obj.id])), 1),
    },
    total_power: {
      align: 'right',
      render: (_: unknown, obj) =>
        powerText(currentElectricalCalc(stats.calcByObjectId[obj.id])?.results?.total_power),
    },
    power_per_meter: {
      align: 'right',
      render: (_: unknown, obj) =>
        numberText(cablePowerPerMeterValue(currentElectricalCalc(stats.calcByObjectId[obj.id])), 2),
    },
    installed_power_per_meter: {
      align: 'right',
      render: (_: unknown, obj) =>
        numberText(installedPowerPerMeterValue(currentElectricalCalc(stats.calcByObjectId[obj.id])), 2),
    },
    current: {
      align: 'right',
      render: (_: unknown, obj) => resultNumber(currentElectricalCalc(stats.calcByObjectId[obj.id]), 'current', 2),
    },
    voltage: {
      align: 'right',
      render: (_: unknown, obj) => resultNumber(currentElectricalCalc(stats.calcByObjectId[obj.id]), 'voltage', 0),
    },
    price_per_meter: {
      align: 'right',
      render: (_: unknown, obj) => commercialNumber(currentElectricalCalc(stats.calcByObjectId[obj.id]), 'price_per_meter', 2),
    },
    required_order_length: {
      align: 'right',
      render: (_: unknown, obj) =>
        commercialNumber(currentElectricalCalc(stats.calcByObjectId[obj.id]), 'required_order_length', 1),
    },
    total_cost: {
      align: 'right',
      render: (_: unknown, obj) => commercialNumber(currentElectricalCalc(stats.calcByObjectId[obj.id]), 'total_cost', 2),
    },
    stock_status: {
      render: (_: unknown, obj) => {
        const value = commercialValue(currentElectricalCalc(stats.calcByObjectId[obj.id]), 'stock_status');
        return typeof value === 'string' ? STOCK_STATUS_LABEL[value] ?? value : '—';
      },
    },
    lead_time_days: {
      align: 'right',
      render: (_: unknown, obj) => commercialNumber(currentElectricalCalc(stats.calcByObjectId[obj.id]), 'lead_time_days', 0),
    },
    heat_loss_per_meter: {
      align: 'right',
      render: (_: unknown, obj) => objectResultNumber(obj, 'heat_loss_per_meter', 2),
    },
    heat_loss_per_m2: {
      align: 'right',
      render: (_: unknown, obj) => objectResultNumber(obj, 'heat_loss_per_m2', 2),
    },
    total_heat_loss: {
      align: 'right',
      render: (_: unknown, obj) => powerText(obj.results?.total_heat_loss),
    },
  }), [
    activeRowId,
    recalc.aggressiveProduct,
    recalc.connectionType,
    cableTypes.getCalculatedCableTypeForObject,
    recalc.heatingHeight,
    isCableMarkPending,
    recalc.layingStep,
    recalc.maintainTemperature,
    openCableMarkModal,
    openCableSizingModal,
    electricalDisplayOffset,
    project,
    stats.calcByObjectId,
    recalc.supplyVoltage,
    recalc.vaporTemperature,
    recalc.windingCoefficient,
  ]);

  const {
    persistCandidateTableColumnSettings,
    persistTableSettings,
    applyElectricalGlideColumnDraftWidth,
    commitElectricalGlideColumnWidth,
    applyElectricalCandidateGlideColumnDraftWidth,
    commitElectricalCandidateGlideColumnWidth,
    startColumnResize,
    startCandidateColumnResize,
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

  const electricalColumns = useMemo<ColumnsType<ProjectObject>>(() =>
    visibleElectricalColumnMetas.map((column) => {
      const renderer = electricalColumnRenderers[column.key];
      const capability = fieldCapabilityByKey.get(column.key);
      const filterEnabled = column.key !== 'index' && (capability?.filter.enabled ?? false);
      const sortEnabled = column.key !== 'index' && (capability?.sort.enabled ?? false);
      const filterKind = filterKindForElectricalColumn(column.key, capability);
      const activeFilter = tableViewState.filters[column.key];
      return {
        key: column.key,
        title: (
          <ResizableColumnTitle
            title={column.title}
            label={column.label}
            onResizeStart={(event) => startColumnResize(column, event)}
          />
        ),
        columnKey: column.key,
        width: Math.max(column.width, column.minWidthPx),
        align: renderer?.align,
        ellipsis: column.key === 'selection_reason'
          ? false
          : column.ellipsis || renderer?.ellipsis,
        render: renderer?.render ?? (() => '—'),
        sorter: sortEnabled,
        sortOrder: sortEnabled && tableViewState.sort?.columnKey === column.key
          ? tableViewState.sort.direction === 'asc'
            ? 'ascend'
            : 'descend'
          : null,
        showSorterTooltip: false,
        filtered: isColumnFilterActive(activeFilter),
        filterIcon: filterEnabled ? () => (
          <span
            role="button"
            aria-label={`Фильтр ${column.label}`}
            className="table-filter-trigger"
            style={{ pointerEvents: 'auto' }}
          >
            <FilterFilled
              className={isColumnFilterActive(activeFilter) ? 'table-filter-icon active' : 'table-filter-icon'}
            />
          </span>
        ) : undefined,
        filterDropdown: filterEnabled ? ({ close }) => (
          <ElectricalColumnFilterDropdown
            title={column.label}
            kind={filterKind}
            filter={activeFilter}
            enumOptions={enumOptionsByColumn[column.key] ?? []}
            onApply={(filter) => setColumnFilter(column.key, filter)}
            onReset={() => resetColumnFilter(column.key)}
            onClose={close}
          />
        ) : undefined,
      };
    }), [
      electricalColumnRenderers,
      enumOptionsByColumn,
      fieldCapabilityByKey,
      resetColumnFilter,
      setColumnFilter,
      startColumnResize,
      tableViewState,
      visibleElectricalColumnMetas,
    ]);

  const electricalGlideColumns = useMemo<HeatCalcGlideGridColumn[]>(() =>
    buildElectricalGlideColumns({
      columns: visibleElectricalColumnMetas,
      capabilitiesByKey: fieldCapabilityByKey,
      enumOptionsByColumn,
      getAlign: (key) => electricalColumnRenderers[key]?.align,
    }), [
      electricalColumnRenderers,
      enumOptionsByColumn,
      fieldCapabilityByKey,
      visibleElectricalColumnMetas,
    ]);

  const candidateGlideColumnMetaByKey = useMemo(
    () => new Map(visibleCandidateColumnMetas.map((column) => [column.key, column])),
    [visibleCandidateColumnMetas],
  );
  const electricalCandidateGlideColumns = useMemo<HeatCalcGlideGridColumn[]>(() =>
    buildElectricalCandidateGlideColumns({
      columns: visibleCandidateColumnMetas,
      enumOptionsByColumn: candidateEnumOptionsByColumn,
      getFilterKind: filterKindForCandidateColumn,
    }), [
      candidateEnumOptionsByColumn,
      visibleCandidateColumnMetas,
    ]);

  const electricalColumnCopyValue = useCallback((
    key: ElectricalColumnKey,
    obj: ProjectObject,
    index: number,
  ) => mainElectricalColumnCopyValue(key, obj, index, {
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
  }), [
    recalc.aggressiveProduct,
    recalc.connectionType,
    cableTypes.getCalculatedCableTypeForObject,
    recalc.heatingHeight,
    recalc.layingStep,
    recalc.maintainTemperature,
    electricalDisplayOffset,
    stats.calcByObjectId,
    recalc.supplyVoltage,
    recalc.vaporTemperature,
    recalc.windingCoefficient,
  ]);

  const isElectricalLayoutCellEditable = useCallback((obj: ProjectObject, columnKey: string) => {
    if (!ELECTRICAL_LAYOUT_EDITABLE_COLUMNS.has(columnKey)) return false;
    if (!project || !obj.is_valid || isCableMarkPending) return false;
    const calc = currentElectricalCalc(stats.calcByObjectId[obj.id]);
    if (!calc || !getCableMark(calc)) return false;
    const cableType = cableTypes.getSavedCableTypeForObject(obj.id);
    return cableType !== 'mineral' && cableType !== 'skin';
  }, [cableTypes.getSavedCableTypeForObject, isCableMarkPending, project, stats.calcByObjectId]);

  const getElectricalGlideCellState = useCallback((
    obj: ProjectObject,
    columnKey: string,
    rowIndex: number,
  ): HeatCalcGlideGridCellState => {
    const renderer = electricalColumnRenderers[columnKey];
    const layoutEditable = isElectricalLayoutCellEditable(obj, columnKey);
    const currentCalc = currentElectricalCalc(stats.calcByObjectId[obj.id]);
    const layoutValues = layoutEditable ? calcLayoutValues(currentCalc) : null;
    const displayValue = layoutValues && columnKey === 'winding_pitch_mm'
      ? String(layoutValues.windingPitchMm)
      : layoutValues && columnKey === 'number_of_threads'
        ? String(layoutValues.numberOfThreads)
        : String(electricalColumnCopyValue(columnKey, obj, rowIndex) ?? '');
    const actions = columnKey === 'cable_mark' && activeRowId === obj.id
      ? [
        {
          key: 'choose',
          label: 'Выбор',
          disabled: !obj.is_valid || !project || isCableMarkPending,
        },
        {
          key: 'size',
          label: 'Подбор',
          disabled: !project,
        },
      ]
      : undefined;
    return {
      displayValue,
      editable: layoutEditable,
      align: renderer?.align,
      editor: layoutEditable ? 'number' : undefined,
      step: layoutEditable ? 1 : undefined,
      actions,
    };
  }, [
    activeRowId,
    electricalColumnCopyValue,
    electricalColumnRenderers,
    isCableMarkPending,
    isElectricalLayoutCellEditable,
    project,
    stats.calcByObjectId,
  ]);

  const handleElectricalGlideStartCellEdit = useCallback((obj: ProjectObject) => {
    activateRowId(obj.id);
  }, [activateRowId]);

  const handleElectricalGlideCommitCell = useCallback((
    obj: ProjectObject,
    columnKey: string,
    value: unknown,
  ) => {
    if (!ELECTRICAL_LAYOUT_EDITABLE_COLUMNS.has(columnKey)) return null;
    if (!project) return 'Проект не выбран';
    if (!obj.is_valid) return 'Теплопотери объекта не рассчитаны';
    const calc = currentElectricalCalc(stats.calcByObjectId[obj.id]);
    const mark = getCableMark(calc);
    if (!calc || !mark) return 'Сначала выполните электрорасчёт';

    const cableType = cableTypes.getSavedCableTypeForObject(obj.id);
    if (cableType === 'mineral' || cableType === 'skin') {
      return 'Для этого типа кабеля параметры укладки не редактируются в таблице';
    }

    const parsed = parseElectricalLayoutNumber(value);
    if (parsed === null) return 'Введите число';
    const layoutValues = calcLayoutValues(calc);
    let windingPitchMm = layoutValues.windingPitchMm;
    let numberOfThreads: number | null = null;

    if (columnKey === 'winding_pitch_mm') {
      if (parsed < 0) return 'Шаг навива не может быть отрицательным';
      const diameterMm = pipeOuterDiameterMm(obj);
      if (diameterMm !== null && parsed > 0 && parsed <= diameterMm) {
        return 'Шаг навива должен быть больше наружного диаметра трубы';
      }
      if (diameterMm !== null && parsed > 0) {
        const coefficient = windingCoefficientForPitch(diameterMm, parsed);
        const maxCoefficient = maxWindingCoefficientForDiameterMm(diameterMm);
        if (coefficient > maxCoefficient + 1e-9) {
          return `Коэффициент навива ${coefficient.toFixed(3)} превышает максимум ${maxCoefficient.toFixed(1)} для D=${diameterMm.toFixed(0)} мм`;
        }
      }
      windingPitchMm = parsed;
      const threadSource = getThreadSource(calc);
      if (threadSource === 'manual' || threadSource === 'previous_result') {
        numberOfThreads = Math.round(layoutValues.numberOfThreads);
      }
    } else if (columnKey === 'number_of_threads') {
      const integerValue = Math.round(parsed);
      if (integerValue !== parsed) return 'Количество ниток должно быть целым числом';
      if (integerValue < 1) return 'Количество ниток должно быть не меньше 1';
      const maxThreads = maxThreadsForCableType(cableType);
      if (integerValue > maxThreads) {
        return `Количество ниток должно быть не больше ${maxThreads}`;
      }
      numberOfThreads = integerValue;
    }

    const markSource = getCableMarkSource(calc);
    electricalLayoutMutate({
      objectId: obj.id,
      cableMark: markSource === 'manual' ? mark : null,
      cableSource: markSource === 'manual' ? catalogSourceFromSnapshot(calc) ?? effectiveSource : effectiveSource,
      cableType,
      windingPitchMm,
      numberOfThreads,
    });
    return null;
  }, [
    effectiveSource,
    electricalLayoutMutate,
    cableTypes.getSavedCableTypeForObject,
    project,
    stats.calcByObjectId,
  ]);

  const handleElectricalGlideCellAction = useCallback((
    obj: ProjectObject,
    columnKey: string,
    actionKey: string,
  ) => {
    if (columnKey !== 'cable_mark') return;
    if (actionKey === 'choose') {
      if (!obj.is_valid || !project || isCableMarkPending) return;
      openCableMarkModal(obj);
      return;
    }
    if (actionKey === 'size') {
      if (!project) return;
      openCableSizingModal(obj);
    }
  }, [isCableMarkPending, openCableMarkModal, openCableSizingModal, project]);

  useEffect(() => {
    function handleKeyDown(event: KeyboardEvent) {
      if (!(event.ctrlKey || event.metaKey) || event.key !== 'c') return;
      if (selectedRowKeys.length === 0) return;
      const active = document.activeElement;
      if (active instanceof HTMLInputElement || active instanceof HTMLTextAreaElement) return;

      const selectedRows = objects
        .map((object, index) => ({ object, index }))
        .filter(({ object }) => selectedRowKeys.includes(object.id));
      if (selectedRows.length === 0) return;
      const header = visibleElectricalColumnMetas.map((meta) => meta.title);
      const rows = selectedRows.map(({ object, index }) =>
        visibleElectricalColumnMetas.map((meta) =>
          String(electricalColumnCopyValue(meta.key, object, index) ?? ''),
        ),
      );
      copyToClipboard(buildTsv([header, ...rows])).then(() => {
        message.success(`Скопировано строк: ${selectedRows.length}`);
      });
    }

    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [
    electricalColumnCopyValue,
    objects,
    selectedRowKeys,
    visibleElectricalColumnMetas,
  ]);

  const electricalTableScrollX = useMemo(
    () => Math.max(
      1200,
      visibleElectricalColumnMetas.reduce(
        (sum, column) => sum + Math.max(column.width, column.minWidthPx),
        36,
      ),
    ),
    [visibleElectricalColumnMetas],
  );

  const electricalTableScrollY = 'max(320px, calc(100vh - 230px))';

  const handleElectricalGlidePageChange = useCallback((page: number) => {
    setTablePage(page);
  }, []);

  const handleElectricalGlideLoadMore = useCallback(() => {
    loadNextElectricalGlidePage({
      isFetching: isElectricalPageFetching,
      hasNextPage: Boolean(pageInfo?.has_next_page),
      nextCursor: nextElectricalPageCursor,
    });
  }, [isElectricalPageFetching, loadNextElectricalGlidePage, nextElectricalPageCursor, pageInfo?.has_next_page]);

  const electricalRowClassName = useCallback((obj: ProjectObject) => {
    const calc = stats.calcByObjectId[obj.id];
    return [
      electricalCalcError(calc) && !isElectricalCalcUnsupported(calc)
        && !isElectricalCalcStale(calc)
        ? 'row-invalid'
        : '',
      activeRowId === obj.id ? 'electrical-row-active' : '',
    ].filter(Boolean).join(' ');
  }, [activeRowId, stats.calcByObjectId]);

  const cablePickerModalTitle = (
    <div className="electrical-cable-picker-title">
      <span className="electrical-cable-picker-title-text">Выбор марки кабеля</span>
      {cableMarkModalObject && (
        <>
          <span className="electrical-cable-picker-title-for">для</span>
          <span className="electrical-cable-picker-title-object">
            {objectDisplayName(cableMarkModalObject)}
          </span>
        </>
      )}
    </div>
  );

  const totalObjects = pageSummary?.total_objects ?? objects.length;
  const filteredTableCount = electricalPage?.counts?.filtered ?? totalObjects;
  const electricalPagination = useMemo<TableProps<ProjectObject>['pagination']>(() => ({
    current: tablePage,
    pageSize: tablePageSize,
    total: filteredTableCount,
    pageSizeOptions: ['25', '50', '100'],
    showSizeChanger: true,
    hideOnSinglePage: filteredTableCount <= tablePageSize,
    showTotal: (total, range) => `${range[0]}-${range[1]} из ${total}`,
    size: 'small',
  }), [filteredTableCount, tablePage, tablePageSize]);
  const electricalInfiniteLoading = useMemo(() => (electricalGlideEnabled ? {
    loaded: objects.length,
    total: filteredTableCount,
    hasNextPage: Boolean(pageInfo?.has_next_page && nextElectricalPageCursor),
    loading: isElectricalPageFetching,
  } : null), [
    electricalGlideEnabled,
    filteredTableCount,
    isElectricalPageFetching,
    nextElectricalPageCursor,
    objects.length,
    pageInfo?.has_next_page,
  ]);
  const validObjectsCount = pageSummary?.valid_objects ?? stats.validObjects.length;
  const selectedObjectsCount = selectedRowKeys.length;
  const selectedObjects = useMemo(
    () => selectedObjectsForKeys(objects, selectedRowKeys),
    [objects, selectedRowKeys],
  );
  const selectedValidObjectsCount = useMemo(
    () => countValidSelectedObjects(selectedObjects),
    [selectedObjects],
  );
  const selectedHeatLossFailedCount = selectedObjectsCount - selectedValidObjectsCount;
  const calculatedCount = pageSummary?.calculated_count ?? stats.calcedCount;
  const failedCount = pageSummary?.failed_count ?? stats.failedCount;
  const totalCableLength = pageSummary?.total_cable_length ?? stats.totalCableLength;
  const totalPower = pageSummary?.total_power ?? stats.totalPower;
  const totalCurrent = pageSummary?.total_current ?? stats.totalCurrent;
  const visibleManualCableCount = useMemo(
    () => countManualCableRows(objectIdsForSelection(objects), stats.calcByObjectId),
    [objects, stats.calcByObjectId],
  );
  const manualCableCount = pageSummary?.manual_cable_mark_count ?? visibleManualCableCount;
  const selectedManualCableCount = useMemo(
    () => countManualCableRows(selectedRowKeys, stats.calcByObjectId),
    [selectedRowKeys, stats.calcByObjectId],
  );
  const renderManualOverwriteControl = useCallback((manualCount: number): ReactNode => {
    if (manualCount <= 0) return null;
    return (
      <>
        <Text type="secondary">
          Найдено ручных выборов: {manualCount}. По умолчанию они будут сохранены и пропущены.
        </Text>
        <Checkbox
          checked={overwriteManualChoices}
          onChange={(event) => setOverwriteManualChoices(event.target.checked)}
        >
          Перезаписать ручные выборы ({manualCount})
        </Checkbox>
      </>
    );
  }, [overwriteManualChoices]);
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
  const showSummaryInKW = totalPower >= 1000;
  const summaryPowerDisplay = showSummaryInKW
    ? `${(totalPower / 1000).toFixed(2)} кВт`
    : `${totalPower.toFixed(0)} Вт`;

  const bannerStats = calculatedCount > 0
    ? `${totalCableLength.toFixed(1)} м · ${summaryPowerDisplay} · ${totalCurrent.toFixed(2)} А · рассчитано: ${calculatedCount}/${totalObjects}`
    : 'расчёт не выполнен';
  const activeJobStatus = activeJob?.status ?? null;
  const isJobActive = isActiveCalcJobStatus(activeJobStatus);
  const selectedRecalcDisabled = selectedValidObjectsCount === 0 || isJobActive;
  const selectedRecalcTooltip = selectedRecalcDisabledTooltip(
    selectedObjectsCount,
    selectedValidObjectsCount,
  );
  const selectedRecalcCountLabel = formatSelectedRecalcCountLabel(
    selectedObjectsCount,
    selectedValidObjectsCount,
  );
  const jobProgress = activeJob?.progress;
  const jobProgressLabel = jobProgress?.total
    ? `${jobProgress.current}/${jobProgress.total}`
    : activeJobStatus ?? '';
  const bannerCableTypeLabel = cableTypes.selectedCableTypesMixed
    ? 'смешанные типы'
    : cableTypes.selectedCableType
      ? CABLE_TYPE_LABEL[cableTypes.selectedCableType]
      : 'тип по объектам';
  const cableTypeControlLabel = 'Тип для пересчёта:';
  const getElectricalCandidateGlideCellState = useCallback((
    candidate: ElectricalCandidate,
    columnKey: string,
  ): HeatCalcGlideGridCellState => {
    const marked = markedCableSizingCandidateSet.has(candidate.id);
    const isDiff = (
      cableSizingCandidateCompareActive
      && marked
      && candidateCompareDiffColumnKeys.has(columnKey)
    );
    const actions = columnKey === 'actions'
      ? [
        {
          key: 'apply',
          label: candidate.is_applied ? 'Выбран' : 'Выбрать',
          disabled: candidate.status !== 'applicable' || applyCandidateMut.isPending,
        },
        {
          key: 'folder',
          label: 'Папка',
          disabled: toggleCandidateFolderItemMut.isPending,
        },
        {
          key: 'exclude',
          label: candidate.status === 'excluded' ? 'Вернуть' : 'Искл.',
          disabled: updateCandidateMut.isPending,
        },
      ]
      : undefined;
    return {
      displayValue: columnKey === 'marked'
        ? (marked ? '1' : '0')
        : columnKey === 'actions'
          ? ''
          : candidateCompareDisplayValue(columnKey, candidate),
      editable: false,
      align: candidateGlideColumnMetaByKey.get(columnKey)?.align,
      dirty: isDiff,
      error: candidate.status === 'error'
        ? candidate.reason_message ?? 'Ошибка варианта'
        : undefined,
      actions,
    };
  }, [
    applyCandidateMut.isPending,
    cableSizingCandidateCompareActive,
    candidateCompareDiffColumnKeys,
    candidateGlideColumnMetaByKey,
    markedCableSizingCandidateSet,
    toggleCandidateFolderItemMut.isPending,
    updateCandidateMut.isPending,
  ]);
  const handleElectricalCandidateGlideCellAction = useCallback((
    candidate: ElectricalCandidate,
    columnKey: string,
    actionKey: string,
  ) => {
    if (columnKey !== 'actions') return;
    if (actionKey === 'apply') {
      if (candidate.status !== 'applicable' || candidate.is_applied) return;
      applyCandidateMut.mutate(candidate.id);
      return;
    }
    if (actionKey === 'exclude') {
      updateCandidateMut.mutate({
        candidateId: candidate.id,
        patch: {
          status: candidate.status === 'excluded' ? 'applicable' : 'excluded',
        },
      });
    }
  }, [applyCandidateMut, updateCandidateMut]);
  const candidateFolderMenuItems = useCallback((candidate: ElectricalCandidate) => {
    const favoriteItem = {
      key: 'favorite',
      label: `${candidate.is_pinned ? '✓ ' : ''}Избранное`,
      disabled: updateCandidateMut.isPending,
      onClick: () => updateCandidateMut.mutate({
        candidateId: candidate.id,
        patch: {
          is_pinned: !candidate.is_pinned,
        },
      }),
    };
    const customFolderItems = cableSizingCandidateFolders.length > 0
      ? cableSizingCandidateFolders.map((folder) => {
          const checked = folder.candidate_ids.includes(candidate.id);
          return {
            key: folder.id,
            label: `${checked ? '✓ ' : ''}${folder.name}`,
            onClick: () => toggleCandidateFolderItemMut.mutate({
              folderId: folder.id,
              candidateId: candidate.id,
              checked: !checked,
            }),
          };
        })
      : [{ key: 'empty', label: 'Создайте папку', disabled: true }];
    return [
      favoriteItem,
      { key: 'folders-divider', type: 'divider' as const },
      ...customFolderItems,
    ];
  }, [cableSizingCandidateFolders, toggleCandidateFolderItemMut, updateCandidateMut]);
  const getElectricalCandidateGlideActionMenuItems = useCallback((
    candidate: ElectricalCandidate,
    columnKey: string,
    actionKey: string,
  ) => {
    if (columnKey === 'actions' && actionKey === 'folder') {
      return candidateFolderMenuItems(candidate);
    }
    return null;
  }, [candidateFolderMenuItems]);

  if (!project) {
    return (
      <EmptyProjectState
        icon={<ThunderboltOutlined style={{ marginRight: 8, color: '#faad14' }} />}
        title="Электротехнический расчёт"
        description="Шаг 2 из 4. Результаты автоподбора греющего кабеля ТЛТ для каждого объекта."
      />
    );
  }

  const cableTypeOptions = availableCableTypeKeys.map((k) => ({
    label: commercialFeaturesAvailable
      ? CABLE_TYPE_LABEL[k]
      : <Tooltip title="Расширенные типы кабеля закрыты feature flag">{CABLE_TYPE_LABEL[k]}</Tooltip>,
    value: k,
  }));
  const cableSourceOptions: Array<{ label: string; value: ElectricalCalculationCableSource }> = [
    { label: 'Встроенная', value: 'builtin' },
    ...(isEmployee
      ? [
          { label: 'Внешняя', value: 'extended' as ElectricalCalculationCableSource },
          { label: 'Все', value: 'all' as ElectricalCalculationCableSource },
        ]
      : []),
  ];
  const sourceVariantCalculationCount =
    pageSummary?.electrical_calculations_total ?? elecCalcs.length;
  const projectObjectsForCopyCount = pageSummary?.total_objects ?? objects.length;
  const copyVariantMenuItems = [1, 2, 3, 4]
    .filter((targetVariant) => targetVariant !== variant)
    .map((targetVariant) => ({
      key: String(targetVariant),
      label: `Скопировать СО${variant} в СО${targetVariant}`,
      disabled: copyVariantMut.isPending || isJobActive,
    }));

  function showCopyVariantConfirm(targetVariant: number) {
    Modal.confirm({
      title: `Создать СО${targetVariant} на основании СО${variant}?`,
      content: (
        <Space direction="vertical" size={6}>
          <Text>
            Скопируются {sourceVariantCalculationCount} объектов с расчётами в СО{variant}.
          </Text>
          {sourceVariantCalculationCount < projectObjectsForCopyCount && (
            <Text type="secondary">
              В проекте объектов: {projectObjectsForCopyCount}. Остальные в СО{targetVariant}
              {' '}останутся не рассчитаны.
            </Text>
          )}
          <Text type="secondary">
            Система проверит скопированные марки на текущих данных, но не заменит их более
            оптимальным кабелем.
          </Text>
        </Space>
      ),
      okText: 'Создать',
      cancelText: 'Отмена',
      onOk: () => copyVariantMut.mutate({ targetVariant }),
    });
  }

  function renderElectricalTypeControls(
    cableType: CableTypeKey | null = cableTypes.visibleCableTypeControl,
    options: { block?: boolean } = {},
  ) {
    if (!cableType) return null;
    if (cableType === 'self_regulating') return null;

    const wrap = (content: ReactNode) =>
      options.block ? (
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, alignItems: 'center' }}>
          {content}
        </div>
      ) : content;

    if (cableType === 'self_regulating_tt') {
      return wrap(
        <>
          <Text style={{ fontSize: 11, color: '#607080', alignSelf: 'center' }}>T проп., °C:</Text>
          <InputNumber<number>
            aria-label="T пропарки"
            size="small"
            value={recalc.vaporTemperature}
            onChange={setRecalc.vaporTemperature}
            style={{ width: 92 }}
          />
          <Text style={{ fontSize: 11, color: '#607080', alignSelf: 'center' }}>T3, °C:</Text>
          <InputNumber<number>
            aria-label="T3 поддержания"
            size="small"
            value={recalc.maintainTemperature}
            onChange={setRecalc.maintainTemperature}
            style={{ width: 92 }}
          />
          <Checkbox
            checked={recalc.aggressiveProduct}
            onChange={(e) => setRecalc.aggressiveProduct(e.target.checked)}
          >
            <span style={{ fontSize: 12 }}>агр.</span>
          </Checkbox>
        </>,
      );
    }
    if (cableType === 'single_core' || cableType === 'three_core') {
      const connectionOptions = cableType === 'single_core'
        ? [
            { value: 'line_1ph', label: 'Линия' },
            { value: 'loop_1ph', label: 'Петля' },
            { value: 'star_3ph', label: 'Звезда' },
          ]
        : [
            { value: 'line_1ph', label: 'Линия' },
            { value: 'loop_2x3', label: 'Петля 2×3' },
            { value: 'loop_1x3', label: 'Петля 1×3' },
            { value: 'star_3x3', label: 'Звезда 3×3' },
            { value: 'star_1x3', label: 'Звезда 1×3' },
          ];
      return wrap(
        <>
          <Select
            aria-label="Схема подключения"
            size="small"
            value={recalc.connectionType}
            onChange={setRecalc.connectionType}
            options={connectionOptions}
            style={{ width: 118 }}
          />
          <Text style={{ fontSize: 11, color: '#607080', alignSelf: 'center' }}>U:</Text>
          <InputNumber<number> size="small" min={1} value={recalc.supplyVoltage} onChange={setRecalc.supplyVoltage} style={{ width: 76 }} />
          <Text style={{ fontSize: 11, color: '#607080', alignSelf: 'center' }}>w:</Text>
          <InputNumber<number> size="small" min={1} max={1.5} step={0.05} value={recalc.windingCoefficient} onChange={setRecalc.windingCoefficient} style={{ width: 72 }} />
          <Text style={{ fontSize: 11, color: '#607080', alignSelf: 'center' }}>h:</Text>
          <InputNumber<number> size="small" min={0} step={0.1} value={recalc.heatingHeight} onChange={setRecalc.heatingHeight} style={{ width: 76 }} />
          <Text style={{ fontSize: 11, color: '#607080', alignSelf: 'center' }}>шаг:</Text>
          <InputNumber<number> size="small" min={0.05} max={0.5} step={0.01} value={recalc.layingStep} onChange={setRecalc.layingStep} style={{ width: 76 }} />
        </>,
      );
    }
    return null;
  }

  function renderRecalculationSettings() {
    return (
      <div
        className="table-view-settings-panel electrical-recalculation-settings-panel"
        aria-label="Настройки пересчёта"
      >
        {commercialFeaturesAvailable && (
          <>
            <Tooltip title="Используется только при новом пересчёте или новом ручном выборе. Уже рассчитанные строки хранят снимок кабеля в проекте.">
              <Text className="table-view-settings-label">
                База для пересчёта:
              </Text>
            </Tooltip>
            <Segmented<ElectricalCalculationCableSource>
              aria-label="База для пересчёта"
              size="small"
              value={isEmployee ? draftTableViewSettings.calculationCableSource : 'builtin'}
              onChange={updateDraftCalculationCableSource}
              options={cableSourceOptions}
            />
          </>
        )}
        {SHOW_COMMERCIAL_CABLE_BASE_UI && (
          <>
            <Tag color={commercialDataStatus.color} style={{ marginInlineEnd: 0 }}>
              {commercialDataStatus.label}
            </Tag>
            <Text className="table-view-settings-label">
              Критерий:
            </Text>
            <Select<SelectionPolicy>
              aria-label="Критерий подбора кабеля"
              size="small"
              value={recalc.selectionPolicy}
              onChange={setRecalc.selectionPolicy}
              options={SELECTION_POLICY_OPTIONS}
              style={{ width: 128 }}
            />
          </>
        )}
        <Tag color={technicalDataStatus.color} style={{ marginInlineEnd: 0 }}>
          {technicalDataStatus.label}
        </Tag>
      </div>
    );
  }

  function renderSelectedCableSummary() {
    const appliedCandidate = appliedCableSizingCandidate;
    const calc = cableSizingModalCalc;
    const mark = appliedCandidate?.cable_mark ?? getCableMark(calc);
    const cableType = (appliedCandidate?.cable_type ?? calc?.cable_type ?? cableSizingCableType) as CableTypeKey;
    const results = appliedCandidate?.results ?? calc?.results;
    const orderLength = appliedCandidate
      ? candidateOrderCableLengthValue(appliedCandidate)
      : orderCableLengthValue(calc);

    if (!mark) {
      return (
        <div className="electrical-selected-cable-summary">
          <Text strong>Выбранный кабель:</Text>
          <Text type="secondary">Кабель не выбран</Text>
        </div>
      );
    }

    return (
      <div className="electrical-selected-cable-summary">
        <Text strong>Выбранный кабель:</Text>
        <Tag color="blue" className="electrical-selected-cable-summary__mark">
          {mark}
        </Tag>
        <Text type="secondary">{CABLE_TYPE_LABEL[cableType] ?? valueText(cableType)}</Text>
        <Text type="secondary">
          P: <strong>{powerText(results?.total_power)}</strong>
        </Text>
        <Text type="secondary">
          Заказ: <strong>{numberText(orderLength, 1)} м</strong>
        </Text>
        <Text type="secondary">
          I: <strong>{numberText(results?.current, 2)} А</strong>
        </Text>
      </div>
    );
  }

  function renderCandidateCompareBar() {
    if (!cableSizingCandidateCompareActive) return null;
    const diffCount = candidateCompareDiffColumnKeys.size;
    return (
      <div
        className="electrical-candidate-compare-bar"
        data-testid="candidate-compare-bar"
        role="status"
        aria-live="polite"
      >
        <Text strong>Сравнение: {displayedMarkedCableSizingCandidates.length} вариантов</Text>
        <Text type="secondary">
          {diffCount > 0
            ? `Отличий в видимых колонках: ${diffCount}`
            : 'В видимых колонках отличий нет'}
        </Text>
        <Button
          size="small"
          onClick={resetMarkedCableSizingCandidates}
        >
          Сбросить сравнение
        </Button>
      </div>
    );
  }

  function submitCandidateFolderModal() {
    const name = candidateFolderName.trim();
    if (!name) {
      message.warning('Введите название папки');
      return;
    }
    if (candidateFolderModalMode === 'rename' && editingCandidateFolder) {
      updateCandidateFolderMut.mutate({ folderId: editingCandidateFolder.id, name });
      return;
    }
    createCandidateFolderMut.mutate();
  }

  function showDeleteCandidateFolderConfirm(folder: ElectricalCandidateFolder) {
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

  function renderCandidateFolderButton(
    key: CandidateFolderKey,
    label: string,
    count: number,
  ) {
    return (
      <Button
        key={key}
        size="small"
        type={activeCandidateFolderKey === key ? 'primary' : 'default'}
        onClick={() => setActiveCandidateFolderKey(key)}
      >
        {label} <span className="electrical-candidate-folder-count">{count}</span>
      </Button>
    );
  }

  function renderCandidateFolderTabs() {
    return (
      <div className="electrical-candidate-folders" aria-label="Папки вариантов подбора">
        <div className="electrical-candidate-folders__scroll">
          {renderCandidateFolderButton('all', 'Все', candidateFolderCounts.all)}
          {renderCandidateFolderButton('favorite', 'Избранное', candidateFolderCounts.favorite)}
          {cableSizingCandidateFolders.map((folder) => {
            const key = candidateCustomFolderKey(folder.id);
            return (
              <span key={folder.id} className="electrical-candidate-folder-tab">
                {renderCandidateFolderButton(
                  key,
                  folder.name,
                  candidateFolderCounts.custom.get(folder.id) ?? 0,
                )}
                <Dropdown
                  trigger={['click']}
                  menu={{
                    items: [
                      {
                        key: 'rename',
                        icon: <EditOutlined />,
                        label: 'Переименовать',
                        onClick: () => openRenameCandidateFolderModal(folder),
                      },
                      {
                        key: 'delete',
                        icon: <DeleteOutlined />,
                        danger: true,
                        label: 'Удалить',
                        onClick: () => showDeleteCandidateFolderConfirm(folder),
                      },
                    ],
                  }}
                >
                  <Button
                    size="small"
                    className="electrical-candidate-folder-menu"
                    icon={<MoreOutlined />}
                    aria-label={`Действия с папкой ${folder.name}`}
                  />
                </Dropdown>
              </span>
            );
          })}
        </div>
        <Button
          size="small"
          icon={<PlusOutlined />}
          onClick={openCreateCandidateFolderModal}
        >
          Папка
        </Button>
      </div>
    );
  }

  const cableSizingCandidateColumns: ColumnsType<ElectricalCandidate> =
    visibleCandidateColumnMetas.map((column) => {
      const filterEnabled = column.key !== 'actions';
      const sortEnabled = column.key !== 'actions';
      const activeFilter = candidateTableViewState.filters[column.key];
      const filterKind = filterKindForCandidateColumn(column.key);
      const columnTitle = (
        <ResizableColumnTitle
          title={column.title}
          label={column.label}
          onResizeStart={(event) => startCandidateColumnResize(column, event)}
        />
      );
      const baseColumn = {
        title: columnTitle,
        key: column.key,
        columnKey: column.key,
        width: Math.max(column.width, column.minWidthPx),
        fixed: column.fixed,
        sorter: sortEnabled,
        sortOrder: sortEnabled && candidateTableViewState.sort?.columnKey === column.key
          ? candidateTableViewState.sort.direction === 'asc'
            ? 'ascend' as const
            : 'descend' as const
          : null,
        showSorterTooltip: false,
        filtered: isColumnFilterActive(activeFilter),
        filterIcon: filterEnabled ? () => (
          <span
            role="button"
            aria-label={`Фильтр ${column.label}`}
            className="table-filter-trigger"
            style={{ pointerEvents: 'auto' }}
          >
            <FilterFilled
              className={isColumnFilterActive(activeFilter) ? 'table-filter-icon active' : 'table-filter-icon'}
            />
          </span>
        ) : undefined,
        filterDropdown: filterEnabled ? ({ close }: { close: () => void }) => (
          <ElectricalColumnFilterDropdown
            title={column.label}
            kind={filterKind}
            filter={activeFilter}
            enumOptions={candidateEnumOptionsByColumn[column.key] ?? []}
            onApply={(filter) => setCandidateColumnFilter(column.key, filter)}
            onReset={() => resetCandidateColumnFilter(column.key)}
            onClose={close}
          />
        ) : undefined,
        onCell: (candidate: ElectricalCandidate) => {
          const isDiff = isCandidateCompareDiffCell(candidate, column.key);
          return {
            className: isDiff ? 'electrical-candidate-cell--diff' : undefined,
            title: isDiff ? 'Отличается в выбранных вариантах' : undefined,
            'data-testid': isDiff ? `candidate-diff-${candidate.id}-${column.key}` : undefined,
          } as HTMLAttributes<HTMLElement>;
        },
      };
      if (column.key === 'marked') {
        return {
          ...baseColumn,
          align: 'center' as const,
          render: (_value, candidate) => (
            <Checkbox
              aria-label={`Пометить кандидат ${candidate.cable_mark ?? candidate.id}`}
              data-testid={`candidate-mark-${candidate.id}`}
              checked={markedCableSizingCandidateIds.includes(candidate.id)}
              onChange={(event) => toggleCableSizingCandidateMark(candidate.id, event.target.checked)}
            />
          ),
        };
      }
      if (column.key === 'actions') {
        return {
          ...baseColumn,
          render: (_value, candidate) => {
            const candidateName = candidate.cable_mark ?? candidate.id;
            const applyTooltip = candidate.is_applied
              ? 'Уже выбран'
              : candidate.status !== 'applicable'
                ? candidate.reason_message ?? 'Недоступно для выбора'
                : 'Выбрать';
            const excluded = candidate.status === 'excluded';
            const exclusionTooltip = excluded ? 'Вернуть вариант' : 'Исключить вариант';

            return (
              <Space size={2} wrap={false} className="electrical-candidate-actions">
                <Tooltip title={applyTooltip}>
                  <Button
                    aria-label={`${applyTooltip} кандидат ${candidateName}`}
                    aria-pressed={candidate.is_applied}
                    data-testid={`candidate-apply-${candidate.id}`}
                    className="electrical-candidate-action-button"
                    size="small"
                    type={candidate.is_applied ? 'primary' : 'default'}
                    icon={<CheckOutlined />}
                    disabled={
                      candidate.status !== 'applicable' ||
                      applyCandidateMut.isPending
                    }
                    loading={applyCandidateMut.isPending && applyCandidateMut.variables === candidate.id}
                    onClick={() => {
                      if (!candidate.is_applied) {
                        applyCandidateMut.mutate(candidate.id);
                      }
                    }}
                  />
                </Tooltip>
                <Dropdown
                  trigger={['click']}
                  menu={{ items: candidateFolderMenuItems(candidate) }}
                >
                  <Button
                    aria-label={`Добавить кандидат ${candidateName} в папку`}
                    data-testid={`candidate-folder-${candidate.id}`}
                    className="electrical-candidate-action-button"
                    size="small"
                    icon={<FolderOutlined />}
                    disabled={toggleCandidateFolderItemMut.isPending}
                  />
                </Dropdown>
                <Tooltip title={exclusionTooltip}>
                  <Button
                    aria-label={exclusionTooltip}
                    data-testid={`candidate-exclude-${candidate.id}`}
                    className="electrical-candidate-action-button"
                    size="small"
                    danger={!excluded}
                    icon={excluded ? <UndoOutlined /> : <StopOutlined />}
                    disabled={updateCandidateMut.isPending}
                    onClick={() => updateCandidateMut.mutate({
                      candidateId: candidate.id,
                      patch: {
                        status: excluded ? 'applicable' : 'excluded',
                      },
                    })}
                  />
                </Tooltip>
              </Space>
            );
          },
        };
      }
      if (column.key === 'mode') {
        return {
          ...baseColumn,
          dataIndex: 'mode',
          render: (value) => (value === 'auto' ? 'Авто' : 'Ручной'),
        };
      }
      return {
        ...baseColumn,
        dataIndex: column.key,
        ellipsis: column.key === 'selection_reason' ? false : column.ellipsis,
        align: column.align,
        render: (_value: unknown, candidate: ElectricalCandidate) =>
          renderCandidateElectricalField(column.key, candidate),
      };
    });
  const cableSizingCandidateTableScrollX = Math.max(
    920,
    visibleCandidateColumnMetas.reduce(
      (sum, column) => sum + Math.max(column.width, column.minWidthPx),
      0,
    ),
  );

  return (
    <>
      <div ref={tableScrollRegionsRef}>
        <Space direction="vertical" size={5} style={{ width: '100%' }}>

        {/* Summary banner */}
        <div className="common-data-banner">
          <span>
            <span className="label">СО{variant} · {bannerCableTypeLabel} · </span>
            {bannerStats}
          </span>
        </div>
        {failedCount > 0 && (
          <div className="electrical-error-summary" aria-label="Сообщения ошибок электрорасчёта">
            <div className="electrical-error-summary__header">
              <Tag color="error" icon={<CloseCircleFilled />}>
                Ошибок: {failedCount}
              </Tag>
            </div>
            {activeElectricalErrorItem?.error ? (
              <div className="electrical-error-summary__record">
                <Tooltip title={activeElectricalErrorItem.error}>
                  <Text type="secondary" ellipsis className="electrical-error-summary__message">
                    {activeElectricalErrorItem.error}
                  </Text>
                </Tooltip>
                {activeElectricalErrorItem.fallback && (
                  <Text type="secondary" className="electrical-error-summary__hint">
                    Показана первая ошибка на текущей странице. Выберите строку, чтобы переключить сообщение.
                  </Text>
                )}
                {activeElectricalErrorGuidance && (
                  <div className="electrical-error-summary__suggestions" aria-label="Предложения по исправлению ошибки">
                    <Tag color={activeElectricalErrorGuidance.tagColor} className="electrical-error-summary__kind">
                      {activeElectricalErrorGuidance.label}
                    </Tag>
                    <Text type="secondary" className="electrical-error-summary__suggestion-label">
                      Что попробовать:
                    </Text>
                    {activeElectricalErrorGuidance.suggestions.map((suggestion) => (
                      <Tag key={suggestion} className="electrical-error-summary__suggestion-tag">
                        {suggestion}
                      </Tag>
                    ))}
                  </div>
                )}
              </div>
            ) : !activeRowId && !activeElectricalErrorItem ? (
              <Text type="secondary" className="electrical-error-summary__empty">
                Ошибки есть вне текущей страницы таблицы.
              </Text>
            ) : null}
          </div>
        )}

        {/* ActionBar */}
        <div className="actionbar-srs electrical-actionbar">
          <div className="electrical-actionbar-row electrical-actionbar-row--setup">
            {[1, 2, 3, 4].map((n) => (
              <Button
                key={n}
                size="small"
                type={variant === n ? 'primary' : 'default'}
                onClick={() => {
                  resetTablePage();
                  setVariant(n);
                }}
              >
                СО{n}
              </Button>
            ))}
            <Dropdown
              trigger={['click']}
              disabled={copyVariantMut.isPending || isJobActive}
              menu={{
                items: copyVariantMenuItems,
                onClick: ({ key }) => showCopyVariantConfirm(Number(key)),
              }}
            >
              <Button
                size="small"
                icon={<CopyOutlined />}
                loading={copyVariantMut.isPending}
                disabled={copyVariantMut.isPending || isJobActive}
              >
                Создать на основании
              </Button>
            </Dropdown>
            <span className="sep" />
            <Text style={{ fontSize: 11, color: '#607080', alignSelf: 'center' }}>{cableTypeControlLabel}</Text>
            <Select<CableTypeKey>
              aria-label="Тип кабеля для пересчёта"
              size="small"
              value={cableTypes.visibleCableTypeControl ?? undefined}
              placeholder="Несколько типов"
              disabled={isJobActive || !commercialFeaturesAvailable}
              onChange={(next) => {
                const nextType = cableTypes.normalizeAvailableCableType(next);
                if (selectedRowKeys.length === 0) {
                  cableTypes.setDefaultCableType(nextType);
                } else {
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
              }}
              options={cableTypeOptions}
              style={{ width: 210 }}
            />
            {renderElectricalTypeControls()}
          </div>
          <div className="electrical-actionbar-row electrical-actionbar-row--actions">
            {selectedManualCableCount > 0 ? (
              <Popconfirm
                title="Пересчитать выбранные объекты?"
                description={(
                  <Space direction="vertical" size={8}>
                    <Text>
                      Будет обработано выбранных объектов с рассчитанными теплопотерями: {selectedValidObjectsCount}.
                    </Text>
                    {selectedHeatLossFailedCount > 0 && (
                      <Text type="secondary">
                        Без рассчитанных теплопотерь будет пропущено: {selectedHeatLossFailedCount}.
                      </Text>
                    )}
                    {renderManualOverwriteControl(selectedManualCableCount)}
                  </Space>
                )}
                okText="Пересчитать"
                okButtonProps={{ danger: overwriteManualChoices }}
                cancelText="Отмена"
                onOpenChange={(open) => {
                  if (open) setOverwriteManualChoices(false);
                }}
                onConfirm={() =>
                  batchMut.mutate({
                    scope: 'selected',
                    objectIds: selectedRowKeys,
                    skipManual: !overwriteManualChoices,
                  })
                }
                disabled={selectedRecalcDisabled}
              >
                <Tooltip title={selectedRecalcTooltip}>
                  <span>
                    <Button
                      size="small"
                      type="primary"
                      icon={<ReloadOutlined />}
                      loading={batchMut.isPending || isJobActive}
                      disabled={selectedRecalcDisabled}
                    >
                      Пересчитать выбранные ({selectedRecalcCountLabel})
                    </Button>
                  </span>
                </Tooltip>
              </Popconfirm>
            ) : (
              <Tooltip title={selectedRecalcTooltip}>
                <span>
                  <Button
                    size="small"
                    type="primary"
                    icon={<ReloadOutlined />}
                    loading={batchMut.isPending || isJobActive}
                    disabled={selectedRecalcDisabled}
                    onClick={() =>
                      batchMut.mutate({
                        scope: 'selected',
                        objectIds: selectedRowKeys,
                        skipManual: true,
                      })
                    }
                  >
                    Пересчитать выбранные ({selectedRecalcCountLabel})
                  </Button>
                </span>
              </Tooltip>
            )}
          <Popconfirm
            title={`Пересчитать все объекты СО${variant}?`}
            description={(
              <Space direction="vertical" size={8}>
                <Text>
                  {manualCableCount > 0
                    ? `Строки без ручной марки в СО${variant} будут пересчитаны с типом `
                    : `Все объекты СО${variant} будут пересчитаны с типом `}
                  «{CABLE_TYPE_LABEL[cableTypes.cableTypeForRecalculation]}». Тип кабеля у пересчитываемых
                  строк будет заменён.
                </Text>
                {renderManualOverwriteControl(manualCableCount)}
              </Space>
            )}
            okText="Да, пересчитать все"
            okButtonProps={{ danger: true }}
            cancelText="Отмена"
            onOpenChange={(open) => {
              if (open) setOverwriteManualChoices(false);
            }}
            onConfirm={() => batchMut.mutate({
              scope: 'all',
              skipManual: !overwriteManualChoices,
            })}
            disabled={validObjectsCount === 0 || isJobActive}
          >
            <Button
              size="small"
              danger
              icon={<ReloadOutlined />}
              loading={batchMut.isPending || isJobActive}
              disabled={validObjectsCount === 0 || isJobActive}
            >
              Пересчитать все СО{variant}
            </Button>
          </Popconfirm>
          {isJobActive && activeJobId && (
            <Button
              size="small"
              danger
              icon={<StopOutlined />}
              loading={cancelJobMut.isPending}
              onClick={() => cancelJobMut.mutate()}
            >
              Отменить
            </Button>
          )}
          <Button
            size="small"
            icon={<TableOutlined />}
            aria-label="Настройки"
            onClick={openColumnSettings}
          >
            Настройки
          </Button>
          <Tooltip title={currentTableViewActive ? 'Сбросить фильтры и сортировку' : 'Фильтры не активны'}>
            <span className="action-tooltip-wrap">
              <Button
                size="small"
                icon={<CloseCircleOutlined />}
                aria-label="Сбросить фильтры таблицы"
                disabled={!currentTableViewActive}
                onClick={resetCurrentTableViewState}
              >
                Сбросить фильтры
              </Button>
            </span>
          </Tooltip>
          </div>
        </div>

        {isJobActive && (
          <Alert
            type="info"
            showIcon
            message={`Электрорасчёт выполняется · ${jobProgressLabel}`}
          />
        )}

        {/* Table */}
        <Card size="small" className="workspace-table-card srs-table-wrap">
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
                rows={objects}
                gridColumns={electricalGlideColumns}
                tableScrollX={electricalTableScrollX}
                tableScrollY={electricalTableScrollY}
                fontSizeKey={resolvedTableFontSize.key}
                activeRowId={activeRowId}
                selectedRowKeys={selectedRowKeys}
                tableViewState={tableViewState}
                pagination={electricalPagination}
                infiniteLoading={electricalInfiniteLoading}
                emptyContent={currentTableViewActive && totalObjects > 0 ? (
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
                onSelectedRowKeysChange={setSelectedRowKeys}
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
              dataSource={objects}
              onChange={handleElectricalTableChange}
              scroll={{ x: electricalTableScrollX }}
              rowClassName={electricalRowClassName}
              onRow={(obj) => ({
                onClick: (event) => {
                  if ((event.target as HTMLElement).closest('.ant-table-selection-column')) return;
                  activateRowId(obj.id);
                },
              })}
              rowSelection={{
                type: 'checkbox',
                selectedRowKeys,
                onChange: (keys) => setSelectedRowKeys(keys as string[]),
                columnWidth: 36,
              }}
              columns={electricalColumns}
              locale={{
                emptyText: currentTableViewActive && totalObjects > 0 ? (
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

          {/* Legend / summary row */}
          <div className="legend-row-srs">
            <span>
              ⓘ Красная строка = ошибка подбора кабеля, серый статус = не применимо.
              Отметьте строки для пересчёта выбранных или используйте «Пересчитать все».
            </span>
            {calculatedCount > 0 && (
              <Space size={16}>
                <Text style={{ fontSize: 12 }}>
                  Кабель: <strong>{totalCableLength.toFixed(1)} м</strong>
                </Text>
                <Text style={{ fontSize: 12 }}>
                  Мощность: <strong>{summaryPowerDisplay}</strong>
                </Text>
                <Text style={{ fontSize: 12 }}>
                  Ток: <strong>{totalCurrent.toFixed(2)} А</strong>
                </Text>
                <Button
                  size="small"
                  type="primary"
                  icon={<ThunderboltOutlined />}
                  onClick={() => navigate(ROUTES.specification)}
                >
                  Спецификация →
                </Button>
              </Space>
            )}
          </div>
        </Card>

        </Space>
      </div>
      <Modal
        open={!!cableMarkModalObject}
        width="min(92vw, 1056px)"
        className="electrical-cable-picker-dialog"
        style={{ top: 28 }}
        title={cablePickerModalTitle}
        okText="Применить"
        cancelText="Отмена"
        confirmLoading={isCableMarkPending}
        okButtonProps={{
          disabled: !cableMarkModalObject?.is_valid
            || !cableMarkModalValue
            || cableMarkModalTargetVariants.length === 0,
        }}
        onOk={applyCableMarkModal}
        onCancel={closeCableMarkModal}
      >
        <Space direction="vertical" size={12} style={{ width: '100%' }}>
          {cableMarkModalObject && (
            <CablePickerCharacteristics
              object={cableMarkModalObject}
              cable={cableMarkModalSelectedCable}
              cableType={cableMarkModalCableType}
            />
          )}
          {cableMarkModalCableType && (
            <div>
              <Text type="secondary">Тип кабеля</Text>
              <Select<CableTypeKey>
                aria-label="Тип кабеля для выбора марки"
                size="small"
                value={cableMarkModalCableType}
                disabled={isCableMarkPending || !commercialFeaturesAvailable}
                onChange={changeCableMarkModalCableType}
                options={cableTypeOptions}
                style={{ width: '100%', marginTop: 4 }}
              />
            </div>
          )}
          {cableMarkModalCableType && renderElectricalTypeControls(cableMarkModalCableType, { block: true })}
          <div>
            <Text type="secondary">Марка</Text>
            <Select
              autoFocus
              showSearch
              value={cableMarkModalValue ?? AUTO_CABLE_MARK_VALUE}
              options={cableMarkModalOptions}
              optionFilterProp="searchLabel"
              disabled={!cableMarkModalObject?.is_valid || !project}
              loading={isCableMarkPending}
              notFoundContent="Нет доступных марок"
              style={{ width: '100%', marginTop: 4 }}
              onChange={setCableMarkModalValue}
            />
          </div>
          <div>
            <Text type="secondary">Сохранить в СО</Text>
            <Checkbox.Group
              aria-label="СО для сохранения выбора марки"
              options={cableMarkModalTargetVariantOptions}
              value={cableMarkModalTargetVariants}
              disabled={isCableMarkPending}
              onChange={setCableMarkModalTargetVariantsFromValues}
              style={{ display: 'flex', gap: 12, marginTop: 6, flexWrap: 'wrap' }}
            />
          </div>
          <Text type="secondary" style={{ fontSize: 12 }}>
            «Авто» запустит автоподбор для выбранных СО. Выбор конкретной марки сохранит ручной
            подбор в отмеченных СО.
          </Text>
        </Space>
      </Modal>
      <Modal
        open={!!cableSizingModalObject}
        width="100vw"
        style={{ top: 0, maxWidth: 'none', paddingBottom: 0 }}
        className="electrical-cable-picker-dialog electrical-cable-sizing-dialog"
        title={cableSizingModalObject ? `Подбор кабеля для ${objectDisplayName(cableSizingModalObject)}` : 'Подбор'}
        footer={null}
        onCancel={closeCableSizingModal}
      >
        <div className="electrical-cable-sizing-body">
          {cableSizingModalObject && (
            <CablePickerCharacteristics
              object={cableSizingModalObject}
              cable={cableSizingModalSelectedCable}
              cableType={cableSizingEffectiveCableType}
              showCable={false}
              objectColumnCount={4}
            />
          )}
          <div className="electrical-cable-sizing-controls">
            <Segmented<'auto' | 'manual'>
              aria-label="Режим подбора кабеля"
              size="small"
              value={cableSizingMode}
              onChange={setCableSizingMode}
              options={[
                { label: 'Авторасчёт', value: 'auto' },
                { label: 'Ручной расчёт', value: 'manual' },
              ]}
            />
            <Select<CableTypeKey>
              aria-label="Тип кабеля для подбора"
              size="small"
              value={cableSizingEffectiveCableType}
              disabled={!commercialFeaturesAvailable}
              onChange={(nextType) => {
                setCableSizingCableType(cableTypes.normalizeAvailableCableType(nextType));
                setCableSizingManualMark(null);
                setRecalc.connectionType('line_1ph');
              }}
              options={cableTypeOptions}
              style={{ minWidth: 220 }}
            />
            {cableSizingMode === 'manual' && (
              <Select
                aria-label="Марка ручного кандидата"
                showSearch
                size="small"
                value={cableSizingManualMark ?? undefined}
                placeholder="Марка"
                options={cableSizingManualOptions
                  .filter((option) => option.mark)
                  .map((option) => ({
                    ...option,
                    value: option.mark!,
                  }))}
                optionFilterProp="searchLabel"
                style={{ minWidth: 280 }}
                onChange={setCableSizingManualMark}
              />
            )}
            <Button
              size="small"
              type="primary"
              loading={createCandidateMut.isPending}
              disabled={
                !cableSizingModalObject ||
                (cableSizingMode === 'manual' && !cableSizingManualMark)
              }
              onClick={() => createCandidateMut.mutate({
                mode: cableSizingMode,
                mark: cableSizingManualMark,
              })}
            >
              {cableSizingMode === 'auto' ? 'Запустить авторасчёт' : 'Рассчитать вариант'}
            </Button>
            <Button
              size="small"
              icon={<TableOutlined />}
              aria-label="Настройки таблицы"
              onClick={() => openCandidateColumnSettings()}
            >
              Настройки таблицы
            </Button>
            <Button
              size="small"
              icon={<CloseCircleOutlined />}
              aria-label="Сбросить фильтры таблицы кандидатов"
              disabled={!candidateTableViewActive}
              onClick={resetCandidateTableViewState}
            >
              Сбросить фильтры
            </Button>
          </div>
          {renderElectricalTypeControls(cableSizingEffectiveCableType, { block: true })}
          {renderSelectedCableSummary()}
          {renderCandidateFolderTabs()}
          {renderCandidateCompareBar()}
          {electricalCandidateGlideEnabled ? (
            <Suspense fallback={null}>
              <ElectricalCandidateGlideGrid
                rows={displayedCableSizingCandidates}
                gridColumns={electricalCandidateGlideColumns}
                tableScrollX={cableSizingCandidateTableScrollX}
                tableScrollY="calc(100vh - 332px)"
                fontSizeKey={resolvedTableFontSize.key}
                loading={isCableSizingCandidatesFetching}
                tableViewState={candidateTableViewState}
                emptyContent={candidateFolderEmptyText()}
                rowClassName={cableSizingCandidateRowClassName}
                getCellState={getElectricalCandidateGlideCellState}
                onToggleMarked={toggleElectricalCandidateGlideMarked}
                onCellAction={handleElectricalCandidateGlideCellAction}
                getActionMenuItems={getElectricalCandidateGlideActionMenuItems}
                onSetColumnFilter={setCandidateColumnFilter}
                onResetColumnFilter={resetCandidateColumnFilter}
                onSetSort={setCandidateTableSort}
                onColumnResize={applyElectricalCandidateGlideColumnDraftWidth}
                onColumnResizeEnd={commitElectricalCandidateGlideColumnWidth}
              />
            </Suspense>
          ) : (
            <Table<ElectricalCandidate>
              className="electrical-cable-sizing-table"
              size="small"
              rowKey="id"
              onRow={(candidate) => ({
                'data-testid': `candidate-row-${candidate.id}`,
              }) as HTMLAttributes<HTMLElement>}
              rowClassName={cableSizingCandidateRowClassName}
              loading={isCableSizingCandidatesFetching}
              dataSource={displayedCableSizingCandidates}
              columns={cableSizingCandidateColumns}
              onChange={handleCandidateTableChange}
              pagination={false}
              scroll={{ x: cableSizingCandidateTableScrollX, y: 'calc(100vh - 332px)' }}
              locale={{
                emptyText: candidateFolderEmptyText(),
              }}
            />
          )}
          <Input.TextArea
            aria-label="Комментарий к выбранному кандидату"
            size="small"
            rows={2}
            maxLength={2000}
            placeholder="Комментарий инженера к выбранному варианту"
            disabled={!cableSizingCandidates.find((candidate) => candidate.is_applied)}
            defaultValue={
              cableSizingCandidates.find((candidate) => candidate.is_applied)?.engineer_comment ?? ''
            }
            onBlur={(event) => {
              const applied = cableSizingCandidates.find((candidate) => candidate.is_applied);
              if (!applied) return;
              const nextComment = event.currentTarget.value;
              if ((applied.engineer_comment ?? '') === nextComment) return;
              updateCandidateMut.mutate({
                candidateId: applied.id,
                patch: { engineer_comment: nextComment },
              });
            }}
          />
        </div>
      </Modal>
      <Modal
        open={candidateFolderModalOpen}
        title={candidateFolderModalMode === 'rename' ? 'Переименовать папку' : 'Новая папка'}
        okText={candidateFolderModalMode === 'rename' ? 'Сохранить' : 'Создать'}
        cancelText="Отмена"
        confirmLoading={createCandidateFolderMut.isPending || updateCandidateFolderMut.isPending}
        okButtonProps={{ disabled: candidateFolderName.trim().length === 0 }}
        onOk={submitCandidateFolderModal}
        onCancel={closeCandidateFolderModal}
      >
        <Input
          autoFocus
          maxLength={64}
          value={candidateFolderName}
          placeholder="Название папки"
          aria-label="Название папки вариантов"
          onChange={(event) => setCandidateFolderName(event.target.value)}
          onPressEnter={submitCandidateFolderModal}
        />
      </Modal>
      {candidateColumnSettingsOpen && (
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
      )}
      {columnSettingsOpen && (
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
      )}
    </>
  );
}
