import {
  lazy,
  Suspense,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
  type MouseEvent as ReactMouseEvent,
  type PointerEvent as ReactPointerEvent,
} from 'react';
import {
  Alert,
  Button,
  Checkbox,
  Modal,
  Popconfirm,
  Segmented,
  Space,
  Tag,
  Tooltip,
  Typography,
  message as antdMessage,
  type TableProps,
} from 'antd';
import {
  AppstoreOutlined,
  CloseCircleOutlined,
  CopyOutlined,
  DeleteOutlined,
  FireOutlined,
  PlusOutlined,
  ReloadOutlined,
  SaveOutlined,
  StopOutlined,
  TableOutlined,
} from '@ant-design/icons';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import ImportExcelButton from '@/components/ImportExcelButton';
import ExportObjectsButton from '@/components/ExportObjectsButton';
import EmptyProjectState from '@/components/common/EmptyProjectState';
import HeatCalcExcelContextMenu, {
  type HeatCalcExcelContextMenuState,
} from '@/components/heatcalc/HeatCalcExcelContextMenu';
import HeatCalcObjectsTableCard from '@/components/heatcalc/HeatCalcObjectsTableCard';
import { OBJECT_TYPE_LABELS } from '@/constants/objectTypes';
import { MATERIAL_LABELS } from '@/constants/materials';
import { useAuthStore } from '@/store/authStore';
import { useProjectStore } from '@/store/projectStore';
import { useWorkspaceHeaderStore } from '@/store/workspaceHeaderStore';
import { createObject, getObjectQueryCapabilities, getObjectsSummary, listObjects, queryObjects, updateObject } from '@/api/projects';
import { cancelCalcTask, enqueueHeatLossBatchJob, getCalcTask } from '@/api/calculations';
import { referenceQueryKeys, referenceQueryOptions } from '@/api/referenceQueries';
import { getInsulation } from '@/api/references';
import { useFocusableTableScrollRegions } from '@/hooks/useFocusableTableScrollRegions';
import { useHeatCalcExcelClipboard } from '@/hooks/useHeatCalcExcelClipboard';
import { useHeatCalcExcelKeyboard } from '@/hooks/useHeatCalcExcelKeyboard';
import { useHeatCalcExcelRowsModel } from '@/hooks/useHeatCalcExcelRowsModel';
import {
  canOpenObjectWizard,
  useHeatCalcObjectEditor,
} from '@/pages/heatcalc/useHeatCalcObjectEditor';
import { useHeatCalcPreferences } from '@/pages/heatcalc/useHeatCalcPreferences';
import {
  useHeatCalcTableColumns,
} from '@/hooks/useHeatCalcTableColumns';
import {
  useHeatCalcExcelSelection,
  type HeatCalcExcelCellRef,
} from '@/hooks/useHeatCalcExcelSelection';
import type { ProjectObject, ProjectObjectsQueryResponse } from '@/types/project';
import { formatNumber } from '@/utils/formatters';
import { buildTsv, copyToClipboard } from '@/utils/clipboard';
import {
  getHeatCalcFieldDefinition,
  getHeatCalcFieldLabel,
  getHeatCalcFormFieldIds,
} from '@/domain/heatCalcFields';
import {
  HEATCALC_TABLE_COLUMN_CATALOG,
  clampTableColumnWidthPct,
  createTableColumnSettingsPatch,
  getAllTableColumnMetas,
  getAvailableTableColumnKeys,
  getVisibleTableColumnMetas,
  moveTableColumnToOrder,
  normalizeTableColumnSettings,
  reorderTableColumn,
  resetTableColumnTypeSettings,
  resetTableColumnWidth,
  setTableColumnVisibility,
  setTableColumnWidthPct,
  tableColumnWidthPxToPct,
  type HeatCalcColumnKey,
  type HeatCalcObjectType,
  type HeatCalcResolvedColumnMeta,
  type HeatCalcTableColumnSettings,
  type HeatCalcTableColumnScope,
} from '@/utils/heatCalcTableColumns';
import {
  applyColumnFilters,
  applyTableSort,
  hasActiveTableViewState,
  type HeatCalcColumnValueAccessors,
  type HeatCalcIndexedTableRow,
} from '@/utils/heatCalcTableFindability';
import {
  getDefaultTableViewSettings,
  normalizeTableViewSettings,
  resolveTableFontSize,
  type HeatCalcFormPlacement,
  type HeatCalcTableFontSize,
  type HeatCalcTableLabelFormat,
  type HeatCalcTableViewSettings,
} from '@/utils/heatCalcTableViewSettings';
import {
  getDefaultCalculationDetailsSettings,
  normalizeCalculationDetailsSettings,
  setCalculationDetailsMetrics,
  setCalculationDetailsPreset,
  type HeatCalcCalculationDetailMetric,
  type HeatCalcCalculationDetailPreset,
  type HeatCalcCalculationDetailsSettings,
} from '@/utils/heatCalcCalculationDetailsSettings';
import {
  normalizeFieldInputSettings,
  resetHeatCalcFieldStep,
  resolveHeatCalcFieldStep,
  setHeatCalcFieldStep,
  type HeatCalcFieldInputSettings,
} from '@/utils/heatCalcFieldInputSettings';
import {
  applyInlineCellDraft,
  applyFormFieldDraft,
  buildDraftDisplayRecord,
  buildDraftRowParams,
  DraftRowValidationError,
  getDraftRowValidationErrors,
  getInlineCellFormValue,
  getInlineEditFieldConfig,
  type DraftRowState,
  type DraftRowsById,
} from '@/utils/heatCalcInlineEdit';
import {
  buildExcelTableErrorItems,
  formatExcelCellDisplay,
  formatExcelDraftCellDisplay,
  getExcelEditableColumnMetas,
  getExcelInsertAfterRowIndex,
  isExcelNewRowId,
  type ExcelErrorFieldInfo,
  type ExcelSelectionRange,
} from '@/utils/heatCalcExcelMode';
import type {
  HeatCalcGlideGridCellState,
  HeatCalcGlideGridColumn,
} from '@/utils/heatCalcGlideGrid';
import {
  applyExcelDraftRowPatch,
  buildExcelLocalRows,
  isSavableExcelDraftRow,
  MIN_TRAILING_EXCEL_INPUT_ROWS,
  missingTrailingExcelInputRows,
  pruneExcelLocalRowsByIds,
  removeDraftRowsByIds,
  removeExcelRowsFromModel,
  resetExcelRowsInModel,
  upsertSavedExcelObjectsInProjectList,
  type ExcelLocalProjectObject,
  type SavedExcelProjectObject,
} from '@/utils/heatCalcExcelRows';
import { getCalcJobRefetchInterval, isActiveCalcJobStatus } from '@/utils/calcJobPolling';
import {
  DEFAULT_OBJECT_QUERY_PAGE_SIZE,
  INAPPLICABLE_TABLE_VALUE,
  buildObjectQueryRequest,
  draftErrorMessages,
  draftRowFingerprint,
  escapeTableRowKey,
  filterKindForColumn,
  heatLossCalcStatus,
  heatLossErrorText,
  insulationEntryLabel,
  isBatchHeatLossResponse,
  isColumnApplicableToObjectType,
  normalizeGlideCellAlign,
  sourceSuffix,
  sourceText,
  uniqueErrorMessages,
} from '@/pages/heatcalc/heatCalcPageUtils';
import { buildHeatCalcColumnRenderers } from '@/pages/heatcalc/heatCalcColumnRenderers';
import {
  useHeatCalcTableState,
  type ActiveObjectScope,
} from '@/pages/heatcalc/useHeatCalcTableState';

const loadObjectWizard = () => import('@/components/wizard/ObjectWizard');
const ObjectWizard = lazy(loadObjectWizard);
const ColumnSettingsModal = lazy(() => import('@/components/heatcalc/ColumnSettingsModal'));

const { Text } = Typography;

function scrollTableRowIntoView(objectId: string) {
  const run = () => {
    const row = document.querySelector<HTMLElement>(
      `.srs-table-wrap .ant-table-row[data-row-key="${escapeTableRowKey(objectId)}"], ` +
      `.srs-table-wrap .excel-virtual-row[data-row-key="${escapeTableRowKey(objectId)}"]`,
    );
    const tableBody = row?.closest<HTMLElement>('.ant-table-body, .excel-virtual-table-body');
    if (!row || !tableBody) return;

    const rowRect = row.getBoundingClientRect();
    const bodyRect = tableBody.getBoundingClientRect();
    const targetTop = Math.max(
      0,
      tableBody.scrollTop + rowRect.top - bodyRect.top - (tableBody.clientHeight - rowRect.height) / 2,
    );

    if (typeof tableBody.scrollTo === 'function') {
      tableBody.scrollTo({ top: targetTop, behavior: 'smooth' });
      return;
    }
    tableBody.scrollTop = targetTop;
  };

  if (typeof window === 'undefined' || typeof window.requestAnimationFrame !== 'function') {
    run();
    return;
  }
  window.requestAnimationFrame(() => window.requestAnimationFrame(run));
}

type ActiveInlineCell = HeatCalcExcelCellRef;
type TableEditingMode = 'normal' | 'excel';
type PendingInlineDisableSettings = {
  columnSettings: HeatCalcTableColumnSettings;
  viewSettings: HeatCalcTableViewSettings;
  calculationDetailsSettings: HeatCalcCalculationDetailsSettings;
  fieldInputSettings: HeatCalcFieldInputSettings;
};

function PipeTypeIcon() {
  return (
    <svg className="object-type-svg" viewBox="0 0 16 16" aria-hidden="true" focusable="false">
      <path d="M2.5 6h11v4h-11z" />
      <path d="M1.5 5v6M14.5 5v6" />
      <path d="M5 4.5v7M11 4.5v7" />
    </svg>
  );
}

function TankTypeIcon() {
  return (
    <svg className="object-type-svg" viewBox="0 0 16 16" aria-hidden="true" focusable="false">
      <path d="M4 4.5c0-1 8-1 8 0v7c0 1-8 1-8 0z" />
      <path d="M4 4.5c0 1 8 1 8 0" />
      <path d="M4 11.5c0 1 8 1 8 0" />
    </svg>
  );
}

export default function HeatCalcPage() {
  const queryClient = useQueryClient();
  const project = useProjectStore((s) => s.currentProject);
  const role = useAuthStore((s) => s.role);
  const registeredUserId = useAuthStore((s) => s.user?.id ?? null);
  const isRegisteredUser = role === 'employee' || role === 'admin';
  const [formBlockVisible, setFormBlockVisible] = useState(true);
  const {
    activeObjectScope,
    activeObjectQueryCursor,
    activeTableColumnScope,
    activeTableObjectType,
    activeTablePage,
    activeTableViewState,
    allTableViewState,
    changeNormalTablePage,
    cleanHiddenColumnState,
    cleanHiddenColumnStateForSettings,
    clearSelectedRows,
    handleNormalTableSortChange,
    isAllObjectScope,
    loadNextNormalPage,
    mergeNormalLoadedRows,
    normalLoadedRowsByType,
    pruneSelectedRows,
    rememberObjectQueryCursor,
    removeNormalLoadedRows,
    resetColumnFilter,
    resetCurrentTableViewState,
    resetNormalLoadMoreRequest,
    selectedRowKeys,
    selectObjectScope,
    setColumnFilter,
    setSelectedRowKeys,
    setTablePage,
    upsertNormalLoadedRow,
  } = useHeatCalcTableState({ projectId: project?.id });
  const [columnSettingsOpen, setColumnSettingsOpen] = useState(false);
  const [columnSettingsType, setColumnSettingsType] = useState<HeatCalcTableColumnScope>('pipe');
  const [tableEditingMode, setTableEditingMode] = useState<TableEditingMode>('normal');
  const [activeInlineCell, setActiveInlineCell] = useState<ActiveInlineCell>(null);
  const handleInlineEditingDisabled = useCallback(() => {
    setActiveInlineCell(null);
  }, []);
  const closeColumnSettings = useCallback(() => {
    setColumnSettingsOpen(false);
  }, []);
  const {
    tableColumnSettings,
    tableColumnSettingsRef,
    tableViewSettings,
    tableViewSettingsRef,
    calculationDetailsSettings,
    fieldInputSettings,
    preferenceSavePending,
    persistTableColumnSettings,
    persistTableSettings,
    persistTableViewOnly,
    updateTableColumnSettingsDraft,
    applySideFormWidthPct,
    applyFormSectionWeights,
    commitFormSectionWeights,
  } = useHeatCalcPreferences({
    isRegisteredUser,
    registeredUserId,
    onInlineEditingDisabled: handleInlineEditingDisabled,
    onCloseSettingsModal: closeColumnSettings,
  });
  const sideWorkspaceRef = useRef<HTMLDivElement | null>(null);
  const sideResizeStateRef = useRef<{
    placement: Extract<HeatCalcFormPlacement, 'left' | 'right'>;
    rect: DOMRect;
  } | null>(null);
  useFocusableTableScrollRegions(sideWorkspaceRef, 'Таблица расчёта теплопотерь', Boolean(project));
  const [draftTableColumnSettings, setDraftTableColumnSettings] = useState<HeatCalcTableColumnSettings>(
    () => tableColumnSettings,
  );
  const [draftTableViewSettings, setDraftTableViewSettings] = useState<HeatCalcTableViewSettings>(
    () => tableViewSettings,
  );
  const [draftCalculationDetailsSettings, setDraftCalculationDetailsSettings] =
    useState<HeatCalcCalculationDetailsSettings>(() => calculationDetailsSettings);
  const [draftFieldInputSettings, setDraftFieldInputSettings] =
    useState<HeatCalcFieldInputSettings>(() => fieldInputSettings);
  const [selectedExcelCell, setSelectedExcelCell] = useState<ActiveInlineCell>(null);
  const [excelSelectionRange, setExcelSelectionRange] = useState<ExcelSelectionRange | null>(null);
  const [draftRowsById, setDraftRowsById] = useState<DraftRowsById>({});
  const [excelLocalRows, setExcelLocalRows] = useState<ExcelLocalProjectObject[]>([]);
  const [excelContextMenu, setExcelContextMenu] = useState<HeatCalcExcelContextMenuState>(null);
  const excelNewRowSeqRef = useRef(0);
  const pendingExcelInputRowsRef = useRef<{
    objectType: HeatCalcObjectType;
    rowCount: number;
    missingCount: number;
  } | null>(null);
  const [pendingInlineDisableSettings, setPendingInlineDisableSettings] =
    useState<PendingInlineDisableSettings | null>(null);
  const [pendingWizardObject, setPendingWizardObject] = useState<ProjectObject | null>(null);
  const [pendingTableFocusObject, setPendingTableFocusObject] = useState<ProjectObject | null>(null);
  const [activeHeatLossJobId, setActiveHeatLossJobId] = useState<string | null>(null);
  const setWorkspaceHeaderContext = useWorkspaceHeaderStore((s) => s.setContext);

  useEffect(() => {
    excelNewRowSeqRef.current = 0;
    pendingExcelInputRowsRef.current = null;
    setExcelLocalRows([]);
    setSelectedExcelCell(null);
    setExcelSelectionRange(null);
    setActiveInlineCell(null);
    setDraftRowsById({});
  }, [project?.id]);

  useEffect(() => {
    setWorkspaceHeaderContext(null);
  }, [setWorkspaceHeaderContext]);

  useEffect(() => {
    setActiveHeatLossJobId(null);
  }, [project?.id]);

  const invalidateHeatLossProjectData = useCallback(() => {
    if (!project?.id) return;
    queryClient.invalidateQueries({ queryKey: ['project', project.id, 'objects'] });
    queryClient.invalidateQueries({ queryKey: ['project', project.id, 'electrical-page'] });
    queryClient.invalidateQueries({ queryKey: ['project', project.id, 'electrical-query'] });
    queryClient.invalidateQueries({ queryKey: ['project', project.id, 'electrical-query-capabilities'] });
  }, [project?.id, queryClient]);

  useEffect(() => {
    if (!project) return undefined;
    const win = window as Window & {
      requestIdleCallback?: (callback: () => void, options?: { timeout?: number }) => number;
      cancelIdleCallback?: (handle: number) => void;
    };
    const preload = () => {
      void loadObjectWizard();
    };
    if (win.requestIdleCallback) {
      const handle = win.requestIdleCallback(preload, { timeout: 2_000 });
      return () => win.cancelIdleCallback?.(handle);
    }
    const handle = window.setTimeout(preload, 0);
    return () => window.clearTimeout(handle);
  }, [project]);

  const { data: objectsSummary } = useQuery({
    queryKey: ['project', project?.id, 'objects', 'summary'],
    queryFn: () => getObjectsSummary(project!.id),
    enabled: !!project,
  });

  const { data: activeHeatLossJob } = useQuery({
    queryKey: ['calc-job', activeHeatLossJobId],
    queryFn: () => getCalcTask(activeHeatLossJobId!),
    enabled: !!activeHeatLossJobId,
    refetchInterval: (query) => getCalcJobRefetchInterval(query.state.data?.status),
    refetchIntervalInBackground: true,
  });
  const excelModeEnabled = tableEditingMode === 'excel' && !isAllObjectScope;
  const normalGlideEnabled = !excelModeEnabled;

  const { data: objectQueryCapabilities } = useQuery({
    queryKey: ['project', project?.id, 'objects', 'query-capabilities', activeTableObjectType],
    queryFn: () => getObjectQueryCapabilities(project!.id, activeTableObjectType),
    enabled: !!project && !isAllObjectScope,
    staleTime: 5 * 60_000,
  });

  const { data: insulationMaterials = [] } = useQuery({
    queryKey: referenceQueryKeys.insulation,
    queryFn: getInsulation,
    enabled: !!project,
    ...referenceQueryOptions,
  });

  const objectQueryRequest = useMemo(
    () => (isAllObjectScope
      ? null
      : buildObjectQueryRequest(
        activeTableObjectType,
        activeTableViewState,
        activeTablePage,
        objectQueryCapabilities?.default_page_size ?? DEFAULT_OBJECT_QUERY_PAGE_SIZE,
        objectQueryCapabilities,
        activeObjectQueryCursor,
      )),
    [
      activeObjectQueryCursor,
      activeTableObjectType,
      activeTablePage,
      activeTableViewState,
      isAllObjectScope,
      objectQueryCapabilities,
    ],
  );
  const objectQueryKey = useMemo(
    () => ['project', project?.id, 'objects', 'query', objectQueryRequest] as const,
    [objectQueryRequest, project?.id],
  );
  const allProjectObjectsQueryKey = useMemo(
    () => ['project', project?.id, 'objects', 'query', 'all'] as const,
    [project?.id],
  );
  const { data: objectQueryResult, isFetching: objectQueryFetching } = useQuery({
    queryKey: objectQueryKey,
    queryFn: () => queryObjects(project!.id, objectQueryRequest!),
    enabled: !!project && objectQueryRequest != null && !!objectQueryCapabilities,
    placeholderData: (previous) => previous,
  });
  useEffect(() => {
    rememberObjectQueryCursor(objectQueryResult);
  }, [objectQueryResult, rememberObjectQueryCursor]);
  useEffect(() => {
    mergeNormalLoadedRows(objectQueryResult, { excelModeEnabled });
  }, [excelModeEnabled, mergeNormalLoadedRows, objectQueryResult]);
  useEffect(() => {
    if (!objectQueryFetching) {
      resetNormalLoadMoreRequest();
    }
  }, [objectQueryFetching, objectQueryResult?.page_info.page, resetNormalLoadMoreRequest]);
  const currentPageObjectsForExcel = useMemo(
    () => (!isAllObjectScope ? objectQueryResult?.items ?? [] : []),
    [isAllObjectScope, objectQueryResult?.items],
  );
  const { data: allProjectObjectsData } = useQuery({
    queryKey: allProjectObjectsQueryKey,
    queryFn: () => listObjects(project!.id),
    enabled: !!project && (isAllObjectScope || excelModeEnabled),
    placeholderData: (previous) => previous ?? currentPageObjectsForExcel,
  });
  const allProjectObjects = allProjectObjectsData ?? currentPageObjectsForExcel;

  useEffect(() => {
    if (!project || isAllObjectScope) return undefined;
    const win = window as Window & {
      requestIdleCallback?: (callback: () => void, options?: { timeout?: number }) => number;
      cancelIdleCallback?: (handle: number) => void;
    };
    const prefetchObjects = () => {
      void queryClient.prefetchQuery({
        queryKey: allProjectObjectsQueryKey,
        queryFn: () => listObjects(project.id),
      });
    };
    if (win.requestIdleCallback) {
      const handle = win.requestIdleCallback(prefetchObjects, { timeout: 1_500 });
      return () => win.cancelIdleCallback?.(handle);
    }
    const handle = window.setTimeout(prefetchObjects, 0);
    return () => window.clearTimeout(handle);
  }, [allProjectObjectsQueryKey, isAllObjectScope, project, queryClient]);
  const insulationLabelByCode = useMemo(
    () => new Map(insulationMaterials.map((m) => [m.material, insulationEntryLabel(m)])),
    [insulationMaterials],
  );
  const insulationLabel = useCallback((material: unknown) => {
    const code = String(material ?? '');
    if (!code) return '—';
    return insulationLabelByCode.get(code) ?? MATERIAL_LABELS[code] ?? code;
  }, [insulationLabelByCode]);

  const heatLossBatchMut = useMutation({
    mutationFn: (objectIds?: string[]) => enqueueHeatLossBatchJob(project!.id, true, objectIds),
    onSuccess: (task) => {
      setActiveHeatLossJobId(task.id);
      queryClient.invalidateQueries({ queryKey: ['calc-job', task.id] });
      antdMessage.info('Пересчёт теплопотерь поставлен в очередь');
    },
    onError: (error) => {
      antdMessage.error(error instanceof Error ? error.message : 'Не удалось запустить пересчёт теплопотерь');
    },
  });

  const cancelHeatLossJobMut = useMutation({
    mutationFn: () => cancelCalcTask(activeHeatLossJobId!),
    onSuccess: (task) => {
      setActiveHeatLossJobId(task.id);
      antdMessage.warning('Пересчёт теплопотерь остановлен');
    },
    onError: (error) => {
      antdMessage.error(error instanceof Error ? error.message : 'Не удалось остановить пересчёт теплопотерь');
    },
  });

  useEffect(() => {
    if (!activeHeatLossJob) return;
    if (activeHeatLossJob.status === 'succeeded') {
      invalidateHeatLossProjectData();
      const result = isBatchHeatLossResponse(activeHeatLossJob.result) ? activeHeatLossJob.result : null;
      if (result && result.failed > 0) {
        antdMessage.warning(
          `Пересчёт теплопотерь завершён: пересчитано ${result.updated}, ошибок ${result.failed}`,
          10,
        );
      } else if (result) {
        antdMessage.success(`Пересчёт теплопотерь завершён: пересчитано ${result.updated}`);
      } else {
        antdMessage.success('Пересчёт теплопотерь завершён');
      }
      setActiveHeatLossJobId(null);
    }
    if (activeHeatLossJob.status === 'failed') {
      antdMessage.error(activeHeatLossJob.error_message || 'Пересчёт теплопотерь завершился ошибкой');
      setActiveHeatLossJobId(null);
    }
    if (activeHeatLossJob.status === 'cancelled') {
      setActiveHeatLossJobId(null);
    }
  }, [activeHeatLossJob, invalidateHeatLossProjectData]);

  const pipeCount = objectsSummary?.by_type.pipe ?? 0;
  const tankCount = objectsSummary?.by_type.tank ?? 0;
  const projectObjectCount = objectsSummary?.total ?? pipeCount + tankCount;
  const totalCount = activeObjectScope === 'all'
    ? projectObjectCount
    : objectsSummary?.by_type[activeObjectScope] ?? 0;
  const {
    add,
    remove,
    wizardState,
    newWizardRevision,
    lastSavedObject,
    resetNewWizard,
    clearWizard,
    closeWizard,
    openAddWizard,
    openEditWizard,
    forceOpenEditWizard,
    handleWizardSubmit,
    syncWizardWithRecord,
    clearLastSavedObject,
    selectedRowId,
    selectedObject,
    formCaptionMode,
    formCaptionModeLabel,
    hasWizard,
    submittingObject,
  } = useHeatCalcObjectEditor({
    projectId: project?.id,
    activeObjectScope,
    activeTableObjectType,
    formBlockVisible,
    excelModeEnabled,
    projectObjectCount,
    draftRowsById,
    setDraftRowsById,
    setExcelLocalRows,
    onScopeChanged: clearSelectedRows,
    onDirtyEditBlocked: setPendingWizardObject,
  });

  function handleObjectScopeChange(scope: ActiveObjectScope) {
    selectObjectScope(scope);
    if (scope === 'all') return;
    if (formBlockVisible) {
      resetNewWizard(scope);
      return;
    }
    clearWizard();
  }

  function handleFormBlockVisibilityChange(checked: boolean) {
    setFormBlockVisible(checked);
    if (checked) {
      resetNewWizard(wizardState?.type ?? activeTableObjectType);
      return;
    }
    clearWizard();
  }

  const selectedResults = selectedObject?.results as Record<string, unknown> | undefined;
  const selectedParams = selectedObject?.params as Record<string, unknown> | undefined;

  function resultValue(key: string, digits = 3) {
    const value = Number(selectedResults?.[key]);
    return Number.isFinite(value) ? formatNumber(value, digits) : '—';
  }

  function paramValue(key: string, digits = 1) {
    const value = Number(selectedParams?.[key]);
    return Number.isFinite(value) ? formatNumber(value, digits) : '—';
  }

  function renderAssumptionsPanel() {
    if (!selectedObject || !selectedResults) return null;
    const isPipe = selectedObject.object_type === 'pipe';
    const isUnderground = selectedParams?.placement === 'underground'
      || selectedParams?.burial_depth != null;
    const enabledMetrics = new Set(normalizeCalculationDetailsSettings(calculationDetailsSettings).visibleMetrics);
    const details: Array<{ key: string; label: string; value: string }> = [];

    function addDetail(metric: HeatCalcCalculationDetailMetric, label: string, value: string) {
      if (!enabledMetrics.has(metric) || value === '—') return;
      details.push({ key: metric, label, value });
    }

    function resultDetailValue(key: string, digits: number, unit = '') {
      const value = resultValue(key, digits);
      return value === '—' ? '—' : `${value}${unit}`;
    }

    const processTemperature = Number(selectedParams?.process_temperature);
    const ambientTemperature = Number(selectedParams?.ambient_temperature);
    if (Number.isFinite(processTemperature) && Number.isFinite(ambientTemperature)) {
      addDetail('delta_t', 'ΔT', `${formatNumber(processTemperature - ambientTemperature, 0)}°C`);
    }

    addDetail('applied_alpha_vnesh', 'α примен.', resultDetailValue('alpha_vnesh', 1, ' Вт/м²К'));
    addDetail('applied_safety_factor', 'Kзап примен.', resultValue('safety_factor', 2));
    addDetail('applied_location_factor', 'Kразм примен.', resultValue('location_factor', 2));
    addDetail('insulation_resistance', 'Rиз', resultValue('insulation_resistance', 4));

    if (isPipe) {
      addDetail('external_resistance', isUnderground ? 'Rгр' : 'Rвнеш', resultValue('external_resistance', 4));
      addDetail('effective_length', 'Lэфф', resultDetailValue('effective_length', 1, ' м'));
      addDetail('wall_resistance', 'Rст', resultValue('wall_resistance', 4));
      addDetail('thermal_resistance', 'RΣ', resultValue('thermal_resistance', 4));
    } else {
      addDetail('external_resistance', 'Rвнеш', resultValue('external_resistance', 4));
      if (isUnderground) {
        addDetail('ground_resistance', 'Rгр', resultValue('ground_resistance', 4));
      }
      addDetail('surface_area', 'Sпов.', resultDetailValue('surface_area', 1, ' м²'));
      addDetail('wall_resistance', 'Rст', resultValue('wall_resistance', 4));
      if (isUnderground) {
        addDetail('air_surface_area', 'Sвозд', resultDetailValue('air_surface_area', 1, ' м²'));
        addDetail('ground_surface_area', 'Sгр', resultDetailValue('ground_surface_area', 1, ' м²'));
      }
    }

    const windSpeed = Number(selectedResults.wind_speed ?? selectedParams?.wind_speed);
    if (Number.isFinite(windSpeed)) {
      addDetail('wind_speed', 'ветер', `${formatNumber(windSpeed, 1)} м/с`);
    }
    if (sourceSuffix(selectedParams?.ambient_temperature_source)) {
      const ambientValue = paramValue('ambient_temperature', 0);
      if (ambientValue !== '—') {
        addDetail(
          'temperature_source',
          'T окр.',
          `${ambientValue}°C${sourceSuffix(selectedParams?.ambient_temperature_source)}`,
        );
      }
    }
    if (sourceSuffix(selectedParams?.wind_speed_source)) {
      addDetail('wind_speed_source', 'ветер ист.', sourceText(selectedParams?.wind_speed_source));
    }
    if (isUnderground) {
      addDetail('ground_conductivity', 'λгр', resultDetailValue('ground_conductivity', 2, ' Вт/мК'));
    }

    if (details.length === 0) return null;

    return (
      <div className="calc-assumptions-panel">
        <strong>Расшифровка расчёта:</strong>
        {details.map((detail) => (
          <span key={`${detail.key}:${detail.label}`}>{detail.label}: {detail.value}</span>
        ))}
      </div>
    );
  }

  const columnRenderers = useMemo(
    () => buildHeatCalcColumnRenderers({ insulationLabel }),
    [insulationLabel],
  );

  const normalizedTableView = useMemo(
    () => normalizeTableViewSettings(tableViewSettings),
    [tableViewSettings],
  );
  const configuredColumnMetas = useMemo(
    () => getVisibleTableColumnMetas(
      activeTableColumnScope,
      tableColumnSettings,
      normalizedTableView.tableLabelFormat,
    ),
    [activeTableColumnScope, normalizedTableView.tableLabelFormat, tableColumnSettings],
  );
  const allConfiguredColumnMetas = useMemo(
    () => getAllTableColumnMetas(
      activeTableColumnScope,
      tableColumnSettings,
      normalizedTableView.tableLabelFormat,
    ),
    [activeTableColumnScope, normalizedTableView.tableLabelFormat, tableColumnSettings],
  );
  const sourceColumnMetas = useMemo(
    () => (excelModeEnabled
      ? getExcelEditableColumnMetas(activeTableObjectType, allConfiguredColumnMetas)
      : configuredColumnMetas),
    [activeTableObjectType, allConfiguredColumnMetas, configuredColumnMetas, excelModeEnabled],
  );
  const editableExcelColumnKeys = useMemo(
    () => (!isAllObjectScope
      ? sourceColumnMetas
        .filter((meta) => getInlineEditFieldConfig(activeTableObjectType, meta.key))
        .map((meta) => meta.key)
      : []),
    [activeTableObjectType, isAllObjectScope, sourceColumnMetas],
  );
  const resolvedTableFontSize = useMemo(
    () => resolveTableFontSize(normalizedTableView),
    [normalizedTableView],
  );
  const formPlacement = normalizedTableView.formPlacement;
  const sideFormWidthPct = normalizedTableView.sideFormWidthPct;
  const fieldCapabilityByKey = useMemo(
    () => new Map(objectQueryCapabilities?.fields.map((field) => [field.key, field]) ?? []),
    [objectQueryCapabilities],
  );
  const visibleTableColumnKeys = useMemo(
    () => configuredColumnMetas.map((meta) => meta.key),
    [configuredColumnMetas],
  );
  const tableValueAccessors = useMemo<HeatCalcColumnValueAccessors<ProjectObject>>(() => {
    const accessors: HeatCalcColumnValueAccessors<ProjectObject> = {};
    for (const meta of HEATCALC_TABLE_COLUMN_CATALOG.all) {
      accessors[meta.key] = (record, sourceIndex) => {
        if (!isColumnApplicableToObjectType(meta.key, record.object_type)) {
          return INAPPLICABLE_TABLE_VALUE;
        }
        return columnRenderers[meta.key].copyValue(record, sourceIndex);
      };
    }
    return accessors;
  }, [columnRenderers]);
  const allIndexedTableRows = useMemo<HeatCalcIndexedTableRow<ProjectObject>[]>(
    () => allProjectObjects
      .filter((object) => object.object_type === 'pipe' || object.object_type === 'tank')
      .sort((left, right) => {
        const bySortOrder = left.sort_order - right.sort_order;
        if (bySortOrder !== 0) return bySortOrder;
        return left.created_at.localeCompare(right.created_at);
      })
      .map((record, index) => ({ record, sourceIndex: index })),
    [allProjectObjects],
  );
  const allFilteredSortedTableRows = useMemo(
    () => applyTableSort(
      applyColumnFilters(allIndexedTableRows, allTableViewState.filters, tableValueAccessors),
      allTableViewState.sort,
      tableValueAccessors,
    ),
    [allIndexedTableRows, allTableViewState, tableValueAccessors],
  );
  const createExcelLocalRows = useCallback((
    count: number,
    insertAfterObjectId: string | null = null,
  ): ExcelLocalProjectObject[] => {
    const result = buildExcelLocalRows({
      count,
      objectType: activeTableObjectType,
      projectId: project?.id ?? '',
      projectObjectCount,
      startSeq: excelNewRowSeqRef.current,
      insertAfterObjectId,
    });
    excelNewRowSeqRef.current = result.nextSeq;
    return result.rows;
  }, [activeTableObjectType, project?.id, projectObjectCount]);
  const appendExcelLocalRows = useCallback((count: number, insertAfterObjectId: string | null = null) => {
    const rows = createExcelLocalRows(count, insertAfterObjectId);
    if (rows.length > 0) setExcelLocalRows((current) => [...current, ...rows]);
    return rows;
  }, [createExcelLocalRows]);
  const {
    baseRows: excelBaseRows,
    rows: excelRows,
    indexedRows: excelTableRows,
    rowIds: excelRowIds,
    activeCell: activeExcelCellPosition,
    selectedRows: selectedExcelRows,
  } = useHeatCalcExcelRowsModel({
    excelModeEnabled,
    allProjectObjects,
    activeObjectType: activeTableObjectType,
    tableViewState: activeTableViewState,
    tableValueAccessors,
    localRows: excelLocalRows,
    selectedCell: selectedExcelCell,
    selectionRange: excelSelectionRange,
    editableColumnKeys: editableExcelColumnKeys,
  });

  const missingExcelInputRowCount = useMemo(
    () => (excelModeEnabled
      ? missingTrailingExcelInputRows(excelRows, draftRowsById)
      : 0),
    [draftRowsById, excelModeEnabled, excelRows],
  );

  useEffect(() => {
    if (!excelModeEnabled || missingExcelInputRowCount <= 0) {
      pendingExcelInputRowsRef.current = null;
      return;
    }
    const pendingInputRows = pendingExcelInputRowsRef.current;
    if (
      pendingInputRows
      && pendingInputRows.objectType === activeTableObjectType
      && pendingInputRows.rowCount === excelRows.length
      && pendingInputRows.missingCount === missingExcelInputRowCount
    ) {
      return;
    }
    pendingExcelInputRowsRef.current = {
      objectType: activeTableObjectType,
      rowCount: excelRows.length,
      missingCount: missingExcelInputRowCount,
    };
    appendExcelLocalRows(missingExcelInputRowCount);
  }, [
    activeTableObjectType,
    appendExcelLocalRows,
    excelModeEnabled,
    excelRows.length,
    missingExcelInputRowCount,
  ]);

  const extendExcelInputRowsOnScroll = useCallback(() => {
    if (!excelModeEnabled) return;
    appendExcelLocalRows(MIN_TRAILING_EXCEL_INPUT_ROWS);
  }, [appendExcelLocalRows, excelModeEnabled]);

  const visibleAllTableRows = useMemo(
    () => allFilteredSortedTableRows,
    [allFilteredSortedTableRows],
  );
  const baseVisibleTableObjects = useMemo(
    () => {
      if (excelModeEnabled) return excelBaseRows;
      return isAllObjectScope
        ? visibleAllTableRows.map(({ record }) => record)
        : normalLoadedRowsByType[activeTableObjectType].length > 0
          ? normalLoadedRowsByType[activeTableObjectType]
          : objectQueryResult?.page_info.page === 1
            ? objectQueryResult.items
            : [];
    },
    [
      activeTableObjectType,
      excelBaseRows,
      excelModeEnabled,
      isAllObjectScope,
      normalLoadedRowsByType,
      objectQueryResult,
      visibleAllTableRows,
    ],
  );
  const visibleTableObjects = useMemo(() => {
    if (!excelModeEnabled) return baseVisibleTableObjects;
    return excelRows;
  }, [baseVisibleTableObjects, excelModeEnabled, excelRows]);
  const visibleTableRows = useMemo(
    () => {
      if (excelModeEnabled) {
        return excelTableRows;
      }
      return isAllObjectScope
        ? visibleAllTableRows
        : visibleTableObjects.map((record, index) => ({
            record,
            sourceIndex: index,
          }));
    },
    [excelModeEnabled, excelTableRows, isAllObjectScope, visibleAllTableRows, visibleTableObjects],
  );
  const visibleSourceIndexById = useMemo(
    () => new Map(visibleTableRows.map(({ record, sourceIndex }) => [record.id, sourceIndex])),
    [visibleTableRows],
  );
  const wizardBaseObject = useMemo(() => {
    const editingObject = wizardState?.editingObject;
    if (!editingObject) return null;
    const tableObject = visibleTableObjects.find((object) => object.id === editingObject.id)
      ?? allProjectObjects.find((object) => object.id === editingObject.id);
    if (!tableObject || editingObject.version > tableObject.version) return editingObject;
    return tableObject;
  }, [allProjectObjects, visibleTableObjects, wizardState?.editingObject]);
  const wizardFormObject = useMemo(() => {
    if (!wizardBaseObject) return null;
    return buildDraftDisplayRecord(draftRowsById[wizardBaseObject.id], wizardBaseObject);
  }, [draftRowsById, wizardBaseObject]);
  const wizardDraftFieldErrors = useMemo(() => {
    if (!wizardBaseObject) return undefined;
    const draftRow = draftRowsById[wizardBaseObject.id];
    return draftRow ? getDraftRowValidationErrors(draftRow) : undefined;
  }, [draftRowsById, wizardBaseObject]);
  const handleWizardDraftValuesChange = useCallback((
    changedValues: Record<string, unknown>,
    allValues: Record<string, unknown>,
  ) => {
    if (!wizardBaseObject || !canOpenObjectWizard(wizardBaseObject)) return;
    const fieldIds = Object.keys(changedValues);
    if (fieldIds.length === 0) return;

    setDraftRowsById((current) => {
      let nextRow: DraftRowState | null = current[wizardBaseObject.id] ?? null;
      const before = draftRowFingerprint(nextRow);
      fieldIds.forEach((fieldId) => {
        const value = Object.prototype.hasOwnProperty.call(allValues, fieldId)
          ? allValues[fieldId]
          : changedValues[fieldId];
        nextRow = applyFormFieldDraft(nextRow, wizardBaseObject, fieldId, value);
      });
      if (!nextRow) return current;
      const after = draftRowFingerprint(nextRow);
      if (before === after) return current;
      return applyExcelDraftRowPatch(current, wizardBaseObject.id, nextRow);
    });
  }, [wizardBaseObject]);
  const selectedVisibleRows = useMemo(
    () => visibleTableRows.filter(({ record }) => selectedRowKeys.includes(record.id)),
    [selectedRowKeys, visibleTableRows],
  );
  const tableDeleteRows = excelModeEnabled ? selectedExcelRows : selectedVisibleRows;
  const selectedObjectCount = selectedVisibleRows.length;
  const deleteTargetCount = tableDeleteRows.length;
  const currentTableViewActive = hasActiveTableViewState(activeTableViewState);
  const activeTypeTotalCount = isAllObjectScope
    ? projectObjectCount
    : objectQueryResult?.counts.by_type[activeTableObjectType] ?? totalCount;
  const filteredTableCount = isAllObjectScope
    ? allFilteredSortedTableRows.length
    : excelModeEnabled
      ? visibleTableObjects.length
      : objectQueryResult?.counts.filtered ?? baseVisibleTableObjects.length;
  const typeButtonCountText = useCallback((
    scope: ActiveObjectScope,
    total: number,
  ) => {
    if (activeObjectScope !== scope) return String(total);
    if (selectedObjectCount > 0) return `${selectedObjectCount}/${total}`;
    if (currentTableViewActive) return `${filteredTableCount}/${activeTypeTotalCount}`;
    return String(total);
  }, [activeObjectScope, activeTypeTotalCount, currentTableViewActive, filteredTableCount, selectedObjectCount]);
  const pipeButtonCountText = typeButtonCountText('pipe', pipeCount);
  const tankButtonCountText = typeButtonCountText('tank', tankCount);
  const allButtonCountText = typeButtonCountText('all', projectObjectCount);
  const enumOptionsByColumn = useMemo(() => {
    const result: Record<HeatCalcColumnKey, { label: string; value: string }[]> = {};
    for (const meta of sourceColumnMetas) {
      const capability = fieldCapabilityByKey.get(meta.key);
      if (filterKindForColumn(meta.key, capability) !== 'enum') continue;
      if (isAllObjectScope) {
        const values = new Map<string, string>();
        for (const row of allIndexedTableRows) {
          const value = tableValueAccessors[meta.key]?.(row.record, row.sourceIndex);
          if (value == null || value === INAPPLICABLE_TABLE_VALUE) continue;
          const textValue = String(value).trim();
          if (!textValue) continue;
          values.set(textValue, textValue);
        }
        result[meta.key] = [...values.values()]
          .sort((left, right) => left.localeCompare(right, 'ru', { numeric: true, sensitivity: 'base' }))
          .map((value) => ({ label: value, value }));
        continue;
      }
      result[meta.key] = (capability?.options?.items ?? []).map((item) => ({
        label: item.label,
        value: String(item.value),
      }));
    }
    return result;
  }, [allIndexedTableRows, fieldCapabilityByKey, isAllObjectScope, sourceColumnMetas, tableValueAccessors]);
  const inlineEditingEnabled = normalizedTableView.inlineEditingEnabled;
  const tableCellEditingEnabled = inlineEditingEnabled || excelModeEnabled;
  const isSavableDraftRow = isSavableExcelDraftRow;
  const dirtyDraftRows = useMemo(
    () => Object.values(draftRowsById).filter(isSavableDraftRow),
    [draftRowsById, isSavableDraftRow],
  );
  const dirtyDraftRowCount = dirtyDraftRows.length;
  const selectedDirtyRowIds = useMemo(
    () => selectedRowKeys.filter((key) => isSavableDraftRow(draftRowsById[key])),
    [draftRowsById, isSavableDraftRow, selectedRowKeys],
  );
  const saveTargetIds = selectedDirtyRowIds.length > 0
    ? selectedDirtyRowIds
    : dirtyDraftRows.map((row) => row.objectId);
  const saveTargetCount = saveTargetIds.length;
  const selectedDirtyTarget = selectedDirtyRowIds.length > 0;
  const draftControlsVisible = tableCellEditingEnabled || dirtyDraftRowCount > 0;
  const draftDiscardLabel = selectedDirtyTarget
    ? `Сбросить выбранные (${saveTargetCount})`
    : `Сбросить все (${saveTargetCount})`;
  const inlineDraftSaving = dirtyDraftRows.some((row) => row.saving);
  const toolbarSaveDisabled = saveTargetCount === 0 && !hasWizard;
  const toolbarSaveLoading = inlineDraftSaving || submittingObject;
  const toolbarSaveTooltip = saveTargetCount > 0
    ? selectedDirtyTarget
      ? `Сохранить выбранные строки (${saveTargetCount})`
      : `Сохранить несохранённые строки (${saveTargetCount})`
    : hasWizard
      ? 'Сохранить объект'
      : 'Нет изменений для сохранения';
  const activeHeatLossJobStatus = activeHeatLossJob?.status ?? null;
  const isHeatLossJobActive = isActiveCalcJobStatus(activeHeatLossJobStatus);
  const heatLossJobProgress = activeHeatLossJob?.progress;
  const heatLossJobProgressLabel = heatLossJobProgress?.total
    ? `${heatLossJobProgress.current}/${heatLossJobProgress.total}` +
      `${heatLossJobProgress.percent != null ? ` (${heatLossJobProgress.percent}%)` : ''}`
    : activeHeatLossJobStatus ?? '';
  const heatLossRecalcDisabled =
    projectObjectCount === 0 ||
    dirtyDraftRowCount > 0 ||
    submittingObject ||
    isHeatLossJobActive;
  const heatLossRecalcObjectIds = useMemo(() => {
    const selectedIds = selectedVisibleRows.map(({ record }) => record.id);
    if (selectedIds.length > 0) return selectedIds;
    if (selectedRowId) return [selectedRowId];
    return undefined;
  }, [selectedRowId, selectedVisibleRows]);
  const heatLossScopedRecalcDisabled = heatLossRecalcDisabled || !heatLossRecalcObjectIds;
  const heatLossRecalcTooltip = dirtyDraftRowCount > 0
    ? 'Сохраните или сбросьте изменения в таблице перед пересчётом'
    : projectObjectCount === 0
      ? 'Добавьте объекты для пересчёта'
      : isHeatLossJobActive
        ? 'Пересчёт теплопотерь уже выполняется'
        : heatLossRecalcObjectIds
          ? selectedVisibleRows.length > 0
            ? `Пересчитать теплопотери выбранных строк (${heatLossRecalcObjectIds.length})`
            : 'Пересчитать теплопотери активной строки'
          : 'Выберите строку для точечного пересчёта или нажмите «Пересчитать все»';
  const heatLossRecalcAriaLabel = heatLossRecalcObjectIds
    ? selectedVisibleRows.length > 0
      ? `Пересчитать теплопотери выбранных строк (${heatLossRecalcObjectIds.length})`
      : 'Пересчитать теплопотери активной строки'
    : 'Пересчитать теплопотери выбранных или активной строки';
  const heatLossRecalcAllTooltip = dirtyDraftRowCount > 0
    ? 'Сохраните или сбросьте изменения в таблице перед пересчётом'
    : projectObjectCount === 0
      ? 'Добавьте объекты для пересчёта'
      : isHeatLossJobActive
        ? 'Пересчёт теплопотерь уже выполняется'
        : 'Пересчитать теплопотери всех объектов проекта';

  const duplicateSelectedObjects = useCallback(async () => {
    const duplicatePayloads = selectedVisibleRows
      .filter(({ record }) => record.object_type === 'pipe' || record.object_type === 'tank')
      .map(({ record }, index) => {
        const sourceName = String(record.params?.name ?? OBJECT_TYPE_LABELS[record.object_type]);
        return {
          object_type: record.object_type,
          params: {
            ...record.params,
            name: `${sourceName} (копия)`,
          },
          sort_order: projectObjectCount + index,
        };
      });
    if (duplicatePayloads.length === 0) return;

    const createdObjects: ProjectObject[] = [];
    for (const payload of duplicatePayloads) {
      try {
        createdObjects.push(await add.mutateAsync(payload));
      } catch {
        break;
      }
    }

    const lastCreatedObject = createdObjects[createdObjects.length - 1];
    if (!lastCreatedObject) return;

    const lastCreatedObjectType: HeatCalcObjectType = lastCreatedObject.object_type === 'tank' ? 'tank' : 'pipe';
    const targetScope: ActiveObjectScope = activeObjectScope === 'all' ? 'all' : lastCreatedObjectType;
    const createdInTargetScope = activeObjectScope === 'all'
      ? createdObjects.length
      : createdObjects.filter((object) => object.object_type === lastCreatedObjectType).length;
    const pageSize = activeObjectScope === 'all'
      ? DEFAULT_OBJECT_QUERY_PAGE_SIZE
      : objectQueryResult?.page_info.page_size ?? DEFAULT_OBJECT_QUERY_PAGE_SIZE;
    const currentTargetCount = activeObjectScope === 'all'
      ? allFilteredSortedTableRows.length
      : objectQueryResult?.counts.filtered ?? activeTypeTotalCount;
    const targetPage = Math.max(1, Math.ceil((currentTargetCount + createdInTargetScope) / pageSize));

    clearSelectedRows();
    setTablePage(targetScope, targetPage);
    setPendingTableFocusObject(lastCreatedObject);
    openEditWizard(lastCreatedObject);
  }, [
    activeObjectScope,
    activeTypeTotalCount,
    add,
    allFilteredSortedTableRows.length,
    clearSelectedRows,
    objectQueryResult?.counts.filtered,
    objectQueryResult?.page_info.page_size,
    openEditWizard,
    projectObjectCount,
    selectedVisibleRows,
    setTablePage,
  ]);

  const removeSelectedObjects = useCallback(() => {
    const rowIds = tableDeleteRows.map(({ record }) => record.id);
    const nextModel = removeExcelRowsFromModel({
      localRows: excelLocalRows,
      draftRowsById,
      rowIds,
    });
    if (nextModel.localIds.length > 0) {
      setExcelLocalRows(nextModel.localRows);
      setDraftRowsById(nextModel.draftRowsById);
    }

    const persistedIdSet = new Set(nextModel.persistedIds);
    const persistedRows = tableDeleteRows.filter(({ record }) => persistedIdSet.has(record.id));
    persistedRows.forEach(({ record }) => {
      remove.mutate(record.id);
    });
    if (persistedIdSet.size > 0) {
      removeNormalLoadedRows(persistedIdSet);
    }

    if (excelModeEnabled) {
      setSelectedExcelCell(null);
      setExcelSelectionRange(null);
      setActiveInlineCell(null);
    }
    clearSelectedRows();
    if (nextModel.localIds.length > 0 && persistedRows.length === 0) {
      antdMessage.success(nextModel.localIds.length > 1 ? 'Строки удалены' : 'Строка удалена');
    }
  }, [clearSelectedRows, draftRowsById, excelLocalRows, excelModeEnabled, remove, removeNormalLoadedRows, tableDeleteRows]);

  const updateObjectInCurrentQuery = useCallback((savedObject: ProjectObject) => {
    queryClient.setQueryData<ProjectObjectsQueryResponse | undefined>(objectQueryKey, (current) => {
      if (!current) return current;
      return {
        ...current,
        items: current.items.map((item) => (item.id === savedObject.id ? savedObject : item)),
      };
    });
    upsertNormalLoadedRow(savedObject);
  }, [objectQueryKey, queryClient, upsertNormalLoadedRow]);

  const updateSavedExcelObjectsInCaches = useCallback((savedRows: SavedExcelProjectObject[]) => {
    if (savedRows.length === 0) return;
    queryClient.setQueryData<ProjectObject[] | undefined>(allProjectObjectsQueryKey, (current) => (
      upsertSavedExcelObjectsInProjectList(current, savedRows, allProjectObjects)
    ));
    savedRows.forEach(({ draftRowId, savedObject }) => {
      if (!isExcelNewRowId(draftRowId)) updateObjectInCurrentQuery(savedObject);
    });
  }, [allProjectObjects, allProjectObjectsQueryKey, queryClient, updateObjectInCurrentQuery]);

  const discardDraftRows = useCallback((rowIds?: string[]) => {
    setActiveInlineCell(null);
    setDraftRowsById((current) => removeDraftRowsByIds(current, rowIds));
  }, []);

  const saveDraftRows = useCallback(async (rowIds?: string[]) => {
    if (!project) return { ok: false, saved: [] as ProjectObject[] };
    const targetRows = (rowIds ?? Object.keys(draftRowsById))
      .map((id) => draftRowsById[id])
      .filter((row): row is DraftRowState => isSavableDraftRow(row));

    if (targetRows.length === 0) return { ok: true, saved: [] as ProjectObject[] };
    const validationByRowId = Object.fromEntries(
      targetRows.map((row) => [row.objectId, getDraftRowValidationErrors(row)]),
    ) as Record<string, Record<string, string>>;
    const invalidRows = targetRows.filter((row) => Object.keys(validationByRowId[row.objectId] ?? {}).length > 0);
    const validRows = targetRows.filter((row) => Object.keys(validationByRowId[row.objectId] ?? {}).length === 0);
    if (invalidRows.length > 0) {
      setDraftRowsById((current) => {
        const next = { ...current };
        invalidRows.forEach((row) => {
          if (next[row.objectId]) {
            next[row.objectId] = {
              ...next[row.objectId],
              saving: false,
              errors: validationByRowId[row.objectId] ?? {},
            };
          }
        });
        return next;
      });
    }
    if (validRows.length === 0) {
      antdMessage.error('Исправьте ошибки в строках перед сохранением');
      return { ok: false, saved: [] as ProjectObject[] };
    }

    const targetIds = new Set(validRows.map((row) => row.objectId));
    setDraftRowsById((current) => {
      const next = { ...current };
      targetIds.forEach((id) => {
        if (next[id]) next[id] = { ...next[id], saving: true };
      });
      return next;
    });

    const saved: ProjectObject[] = [];
    const savedExcelRows: SavedExcelProjectObject[] = [];
    const savedDraftIds = new Set<string>();
    const failed: Record<string, string> = {};
    const failedValidation: Record<string, Record<string, string>> = {};

    await Promise.all(validRows.map(async (row, index) => {
      try {
        const isNewRow = isExcelNewRowId(row.objectId);
        const params = buildDraftRowParams(row);
        const savedObject = isNewRow
          ? await createObject(project.id, {
            object_type: row.objectType,
            params,
            sort_order: (() => {
              const rowIndex = visibleTableObjects.findIndex((object) => object.id === row.objectId);
              return rowIndex >= 0 ? rowIndex : projectObjectCount + index;
            })(),
          })
          : await updateObject(project.id, row.objectId, {
            version: row.baseVersion,
            params,
          });
        saved.push(savedObject);
        savedExcelRows.push({ draftRowId: row.objectId, savedObject });
        savedDraftIds.add(row.objectId);
      } catch (error) {
        if (error instanceof DraftRowValidationError) {
          failedValidation[row.objectId] = error.errors;
        } else {
          failed[row.objectId] = error instanceof Error ? error.message : 'Не удалось сохранить строку';
        }
      }
    }));

    if (savedDraftIds.size > 0) {
      updateSavedExcelObjectsInCaches(savedExcelRows);
      setExcelLocalRows((current) => pruneExcelLocalRowsByIds(current, savedDraftIds));
    }
    setDraftRowsById((current) => {
      const next = { ...current };
      savedDraftIds.forEach((id) => {
        delete next[id];
      });
      Object.entries(failed).forEach(([id, message]) => {
        if (next[id]) {
          next[id] = {
            ...next[id],
            saving: false,
            errors: {
              ...next[id].errors,
              _row: message,
            },
          };
        }
      });
      Object.entries(failedValidation).forEach(([id, errors]) => {
        if (next[id]) {
          next[id] = {
            ...next[id],
            saving: false,
            errors,
          };
        }
      });
      return next;
    });

    queryClient.invalidateQueries({ queryKey: ['project', project.id, 'objects', 'query'] });
    queryClient.invalidateQueries({ queryKey: ['project', project.id, 'objects', 'summary'] });
    queryClient.invalidateQueries({ queryKey: ['spec', project.id] });

    if (Object.keys(failed).length > 0 || Object.keys(failedValidation).length > 0 || invalidRows.length > 0) {
      antdMessage.error('Часть строк не сохранена');
      return { ok: false, saved };
    }
    antdMessage.success(`Сохранено строк: ${saved.length}`);
    return { ok: true, saved };
  }, [
    draftRowsById,
    isSavableDraftRow,
    project,
    projectObjectCount,
    queryClient,
    updateSavedExcelObjectsInCaches,
    visibleTableObjects,
  ]);

  const commitInlineCell = useCallback((
    record: ProjectObject,
    columnKey: string,
    value: unknown,
  ) => {
    const config = record.object_type === 'pipe' || record.object_type === 'tank'
      ? getInlineEditFieldConfig(record.object_type, columnKey)
      : null;
    if (!config) return 'Поле недоступно для редактирования';
    let commitError: string | null = null;
    setDraftRowsById((current) => {
      const nextRow = applyInlineCellDraft(current[record.id] ?? null, record, columnKey, value);
      if (!nextRow) return current;
      commitError = nextRow.errors[config.fieldId] ?? null;
      return applyExcelDraftRowPatch(current, record.id, nextRow);
    });
    if (!commitError) {
      setActiveInlineCell(null);
    }
    return commitError;
  }, []);

  const startInlineCellEdit = useCallback((record: ProjectObject, columnKey: string) => {
    if (!tableCellEditingEnabled) return;
    if (excelModeEnabled) {
      setSelectedExcelCell({ objectId: record.id, columnKey });
      syncWizardWithRecord(record);
    }
    setActiveInlineCell({ objectId: record.id, columnKey });
  }, [excelModeEnabled, syncWizardWithRecord, tableCellEditingEnabled]);

  const excelFieldInfoById = useMemo<Record<string, ExcelErrorFieldInfo>>(() => {
    const result: Record<string, ExcelErrorFieldInfo> = {};
    if (isAllObjectScope) return result;
    sourceColumnMetas.forEach((meta) => {
      const config = getInlineEditFieldConfig(activeTableObjectType, meta.key);
      if (!config) return;
      result[config.fieldId] = {
        fieldId: config.fieldId,
        columnKey: meta.key,
        label: config.field.label,
      };
    });
    getHeatCalcFormFieldIds(activeTableObjectType).forEach((fieldId) => {
      if (result[fieldId]) return;
      const field = getHeatCalcFieldDefinition(fieldId, activeTableObjectType);
      const columnKey = field?.tableColumnKeys[activeTableObjectType];
      result[fieldId] = {
        fieldId,
        columnKey: columnKey && editableExcelColumnKeys.includes(columnKey) ? columnKey : undefined,
        label: getHeatCalcFieldLabel(fieldId, {
          context: 'settings',
          objectType: activeTableObjectType,
          tableKey: columnKey,
          variant: 'full',
        }),
      };
    });
    return result;
  }, [activeTableObjectType, editableExcelColumnKeys, isAllObjectScope, sourceColumnMetas]);

  const closeExcelContextMenu = useCallback(() => {
    setExcelContextMenu(null);
  }, []);

  const openExcelContextMenu = useCallback((event: ReactMouseEvent<HTMLElement>) => {
    event.preventDefault();
    event.stopPropagation();
    const width = 240;
    const height = 330;
    setExcelContextMenu({
      x: Math.max(8, Math.min(event.clientX, window.innerWidth - width)),
      y: Math.max(8, Math.min(event.clientY, window.innerHeight - height)),
    });
  }, []);

  const handleExcelRecordSelected = useCallback((record: ProjectObject) => {
    syncWizardWithRecord(record);
  }, [syncWizardWithRecord]);

  const {
    selectedPosition: selectedExcelPosition,
    clearSelectionState: clearExcelSelectionState,
    selectCellByPosition: selectExcelCellByPosition,
    setRangeSelection: setExcelRangeSelection,
    moveSelection: moveExcelSelection,
    selectAllCells: selectAllExcelCells,
    collapseSelectionToActiveCell,
    beginCellSelection: beginExcelCellSelection,
    extendCellSelection: extendExcelCellSelection,
    beginRowSelection: beginExcelRowSelection,
    extendRowSelection: extendExcelRowSelection,
    beginColumnSelection: beginExcelColumnSelection,
    extendColumnSelection: extendExcelColumnSelection,
    openCellContextMenu: openExcelCellContextMenu,
    openRowContextMenu: openExcelRowContextMenu,
    openRecordContextMenu: openExcelRecordContextMenu,
  } = useHeatCalcExcelSelection({
    excelModeEnabled,
    rows: visibleTableObjects,
    editableColumnKeys: editableExcelColumnKeys,
    selectedCell: selectedExcelCell,
    setSelectedCell: setSelectedExcelCell,
    selectionRange: excelSelectionRange,
    setSelectionRange: setExcelSelectionRange,
    setActiveInlineCell,
    focusedRowId: selectedRowId ?? null,
    onSelectRecord: handleExcelRecordSelected,
    openContextMenu: openExcelContextMenu,
  });

  const excelTableErrors = useMemo(
    () => (excelModeEnabled
      ? buildExcelTableErrorItems(
        visibleTableRows.map(({ record }, rowIndex) => ({
          rowId: record.id,
          rowIndex,
          objectName: typeof record.params?.name === 'string' ? record.params.name : undefined,
          draftRow: draftRowsById[record.id],
          backendError: draftRowsById[record.id] || isExcelNewRowId(record.id) || !record.validation_errors
            ? null
            : heatLossErrorText(record),
          backendValidationErrors: draftRowsById[record.id] || isExcelNewRowId(record.id)
            ? null
            : record.validation_errors,
          templateRow: isExcelNewRowId(record.id),
        })),
        excelFieldInfoById,
      )
      : []),
    [draftRowsById, excelFieldInfoById, excelModeEnabled, visibleTableRows],
  );

  const selectedRowErrorMessages = useMemo(() => {
    if (!wizardFormObject) return [];
    if (wizardBaseObject) {
      const draftRow = draftRowsById[wizardBaseObject.id];
      if (draftRow) {
        return uniqueErrorMessages(draftErrorMessages(
          draftRow.objectType,
          getDraftRowValidationErrors(draftRow, { enforceRequired: true }),
        ));
      }
    }
    if (excelModeEnabled) {
      const selectedError = excelTableErrors.find((item) => item.rowId === wizardFormObject.id);
      return uniqueErrorMessages(selectedError?.messages.map((message) => message.text) ?? []);
    }
    const hasBackendValidationErrors = !!wizardFormObject.validation_errors
      && Object.keys(wizardFormObject.validation_errors).length > 0;
    const message = heatLossCalcStatus(wizardFormObject) === 'error' || hasBackendValidationErrors
      ? heatLossErrorText(wizardFormObject)
      : '';
    return uniqueErrorMessages([message]);
  }, [draftRowsById, excelModeEnabled, excelTableErrors, wizardBaseObject, wizardFormObject]);

  const excelCellDisplayValue = useCallback((
    record: ProjectObject,
    columnKey: string,
    draftRow: DraftRowState | undefined,
  ) => {
    if (record.object_type !== 'pipe' && record.object_type !== 'tank') return '';
    const config = getInlineEditFieldConfig(record.object_type, columnKey);
    if (!config) return '';
    if (isExcelNewRowId(record.id)) return formatExcelDraftCellDisplay(config, draftRow);
    return formatExcelCellDisplay(config, getInlineCellFormValue(record, columnKey, draftRow));
  }, []);

  const glideGridColumns = useMemo<HeatCalcGlideGridColumn[]>(
    () => sourceColumnMetas.map((meta) => {
      const capability = fieldCapabilityByKey.get(meta.key);
      const filterEnabled = !excelModeEnabled
        && meta.filterable !== false
        && (isAllObjectScope || (capability?.filter.enabled ?? true));
      const sortEnabled = !excelModeEnabled
        && meta.sortable !== false
        && (isAllObjectScope || (capability?.sort.enabled ?? true));
      return {
        key: meta.key,
        title: meta.title,
        label: meta.label,
        width: meta.width,
        minWidthPx: meta.minWidthPx,
        resizable: meta.resizable,
        align: normalizeGlideCellAlign(columnRenderers[meta.key]?.align),
        sortable: sortEnabled,
        filterable: filterEnabled,
        filterKind: filterKindForColumn(meta.key, capability),
        enumOptions: enumOptionsByColumn[meta.key] ?? [],
      };
    }),
    [
      columnRenderers,
      enumOptionsByColumn,
      excelModeEnabled,
      fieldCapabilityByKey,
      isAllObjectScope,
      sourceColumnMetas,
    ],
  );

  const getGlideGridCellState = useCallback((
    record: ProjectObject,
    columnKey: string,
    rowIndex: number,
  ): HeatCalcGlideGridCellState => {
    const draftRow = draftRowsById[record.id];
    const renderer = columnRenderers[columnKey];
    const rendererAlign = normalizeGlideCellAlign(renderer?.align);
    if (isAllObjectScope && !isColumnApplicableToObjectType(columnKey, record.object_type)) {
      return {
        displayValue: INAPPLICABLE_TABLE_VALUE,
        editable: false,
        align: rendererAlign,
      };
    }

    const config = !isAllObjectScope
      && tableCellEditingEnabled
      && (record.object_type === 'pipe' || record.object_type === 'tank')
      ? getInlineEditFieldConfig(record.object_type, columnKey)
      : null;
    if (config) {
      return {
        displayValue: excelCellDisplayValue(record, columnKey, draftRow),
        editable: true,
        dirty: isSavableDraftRow(draftRow)
          && Object.prototype.hasOwnProperty.call(draftRow?.dirtyFields ?? {}, config.fieldId),
        error: draftRow?.errors[config.fieldId],
        align: config.field.editor === 'number' ? 'right' : rendererAlign,
        editor: config.field.editor,
        options: config.field.options,
        step: resolveHeatCalcFieldStep(config.objectType, config.fieldId, fieldInputSettings) ?? config.field.step,
      };
    }

    const displayRecord = buildDraftDisplayRecord(draftRow, record);
    const displayValue = renderer?.copyValue(displayRecord, rowIndex) ?? '';
    return {
      displayValue: String(displayValue),
      editable: false,
      align: rendererAlign,
    };
  }, [
    columnRenderers,
    draftRowsById,
    excelCellDisplayValue,
    fieldInputSettings,
    isAllObjectScope,
    isSavableDraftRow,
    tableCellEditingEnabled,
  ]);

  const getNormalGlideGridCellState = useCallback((
    record: ProjectObject,
    columnKey: string,
    rowIndex: number,
  ): HeatCalcGlideGridCellState => {
    const draftRow = draftRowsById[record.id];
    const renderer = columnRenderers[columnKey];
    const rendererAlign = normalizeGlideCellAlign(renderer?.align);
    if (isAllObjectScope && !isColumnApplicableToObjectType(columnKey, record.object_type)) {
      return {
        displayValue: INAPPLICABLE_TABLE_VALUE,
        editable: false,
        align: rendererAlign,
      };
    }

    const config = tableCellEditingEnabled && (record.object_type === 'pipe' || record.object_type === 'tank')
      ? getInlineEditFieldConfig(record.object_type, columnKey)
      : null;
    if (config) {
      return {
        displayValue: excelCellDisplayValue(record, columnKey, draftRow),
        editable: true,
        dirty: isSavableDraftRow(draftRow)
          && Object.prototype.hasOwnProperty.call(draftRow?.dirtyFields ?? {}, config.fieldId),
        error: draftRow?.errors[config.fieldId],
        align: config.field.editor === 'number' ? 'right' : rendererAlign,
        editor: config.field.editor,
        options: config.field.options,
        step: resolveHeatCalcFieldStep(config.objectType, config.fieldId, fieldInputSettings) ?? config.field.step,
      };
    }

    const displayRecord = buildDraftDisplayRecord(draftRow, record);
    const sourceIndex = visibleSourceIndexById.get(record.id) ?? rowIndex;
    return {
      displayValue: String(renderer?.copyValue(displayRecord, sourceIndex) ?? ''),
      editable: false,
      dirty: isSavableDraftRow(draftRow),
      align: rendererAlign,
    };
  }, [
    columnRenderers,
    draftRowsById,
    excelCellDisplayValue,
    fieldInputSettings,
    isAllObjectScope,
    isSavableDraftRow,
    tableCellEditingEnabled,
    visibleSourceIndexById,
  ]);

  const notifyExcelSuccess = useCallback((message: string) => {
    void antdMessage.success(message);
  }, []);

  const notifyExcelError = useCallback((message: string) => {
    void antdMessage.error(message);
  }, []);

  const notifyExcelInfo = useCallback((message: string) => {
    void antdMessage.info(message);
  }, []);

  const {
    copySelection: copyExcelSelection,
    clearSelection: clearExcelSelection,
    cutSelection: cutExcelSelection,
    applyPaste: applyExcelPaste,
    pasteFromClipboard: pasteExcelFromClipboard,
  } = useHeatCalcExcelClipboard({
    excelModeEnabled,
    rows: visibleTableObjects,
    sourceColumnMetas,
    draftRowsById,
    setDraftRowsById,
    selectionRange: excelSelectionRange,
    activeCell: activeExcelCellPosition,
    appendLocalRows: appendExcelLocalRows,
    cellDisplayValue: excelCellDisplayValue,
    notifySuccess: notifyExcelSuccess,
    notifyError: notifyExcelError,
    notifyInfo: notifyExcelInfo,
  });

  const addExcelRowsBelowSelection = useCallback((count: number) => {
    const afterRowIndex = getExcelInsertAfterRowIndex(
      excelSelectionRange,
      activeExcelCellPosition,
      excelRowIds,
      editableExcelColumnKeys,
    );
    const insertAfterObjectId = afterRowIndex == null ? null : visibleTableObjects[afterRowIndex]?.id ?? null;
    const rows = appendExcelLocalRows(count, insertAfterObjectId);
    if (rows.length > 0) {
      window.setTimeout(() => {
        const firstRowIndex = visibleTableObjects.findIndex((object) => object.id === insertAfterObjectId) + 1;
        selectExcelCellByPosition(firstRowIndex > 0 ? firstRowIndex : visibleTableObjects.length, 0);
      }, 0);
    }
  }, [
    appendExcelLocalRows,
    activeExcelCellPosition,
    editableExcelColumnKeys,
    excelSelectionRange,
    excelRowIds,
    selectExcelCellByPosition,
    visibleTableObjects,
  ]);

  const resetSelectedExcelRows = useCallback(() => {
    const ids = selectedExcelRows.map(({ record }) => record.id);
    if (ids.length === 0) return;
    const nextModel = resetExcelRowsInModel({
      localRows: excelLocalRows,
      draftRowsById,
      rowIds: ids,
    });
    setActiveInlineCell(null);
    setDraftRowsById(nextModel.draftRowsById);
    setExcelLocalRows(nextModel.localRows);
    antdMessage.success(ids.length > 1 ? 'Изменения строк сброшены' : 'Изменения строки сброшены');
  }, [draftRowsById, excelLocalRows, selectedExcelRows]);

  useEffect(() => {
    cleanHiddenColumnState(visibleTableColumnKeys);
  }, [cleanHiddenColumnState, visibleTableColumnKeys]);

  useEffect(() => {
    pruneSelectedRows(visibleTableObjects);
  }, [pruneSelectedRows, visibleTableObjects]);

  useEffect(() => {
    if (!pendingTableFocusObject) return;
    const pendingObjectType: HeatCalcObjectType = pendingTableFocusObject.object_type === 'tank' ? 'tank' : 'pipe';
    if (activeObjectScope !== 'all' && pendingObjectType !== activeTableObjectType) {
      selectObjectScope(pendingObjectType);
      return;
    }
    if (!visibleTableObjects.some((object) => object.id === pendingTableFocusObject.id)) return;
    scrollTableRowIntoView(pendingTableFocusObject.id);
    setPendingTableFocusObject(null);
  }, [activeObjectScope, activeTableObjectType, pendingTableFocusObject, selectObjectScope, visibleTableObjects]);

  useEffect(() => {
    if (tableCellEditingEnabled || dirtyDraftRowCount > 0) return;
    clearExcelSelectionState();
  }, [clearExcelSelectionState, dirtyDraftRowCount, tableCellEditingEnabled]);

  useEffect(() => {
    if (dirtyDraftRowCount === 0) return undefined;
    const handleBeforeUnload = (event: BeforeUnloadEvent) => {
      event.preventDefault();
      event.returnValue = '';
    };
    window.addEventListener('beforeunload', handleBeforeUnload);
    return () => window.removeEventListener('beforeunload', handleBeforeUnload);
  }, [dirtyDraftRowCount]);

  useEffect(() => {
    if (!lastSavedObject) return;
    if (!isAllObjectScope && lastSavedObject.object_type !== activeTableObjectType) {
      clearLastSavedObject();
      return;
    }
    if (!currentTableViewActive) {
      clearLastSavedObject();
      return;
    }
    if (!visibleTableObjects.some((object) => object.id === lastSavedObject.id)) {
      antdMessage.info('Объект сохранён, но скрыт текущими фильтрами');
    }
    clearLastSavedObject();
  }, [
    activeTableObjectType,
    clearLastSavedObject,
    currentTableViewActive,
    isAllObjectScope,
    lastSavedObject,
    visibleTableObjects,
  ]);

  const sideFormWidthPctFromClientX = useCallback((clientX: number) => {
    const state = sideResizeStateRef.current;
    if (!state || state.rect.width <= 0) return null;
    const rawWidthPct = state.placement === 'left'
      ? ((clientX - state.rect.left) / state.rect.width) * 100
      : ((state.rect.right - clientX) / state.rect.width) * 100;
    return normalizeTableViewSettings({
      ...tableViewSettingsRef.current,
      sideFormWidthPct: rawWidthPct,
    }).sideFormWidthPct;
  }, []);

  const startSideFormResizeDrag = useCallback((
    moveEventName: 'pointermove' | 'mousemove',
    upEventName: 'pointerup' | 'mouseup',
    cancelEventName?: 'pointercancel',
  ) => {
    if (formPlacement !== 'left' && formPlacement !== 'right') return;
    const rect = sideWorkspaceRef.current?.getBoundingClientRect();
    if (!rect || rect.width <= 0) return;
    sideResizeStateRef.current = { placement: formPlacement, rect };
    document.body.classList.add('heatcalc-side-resizing');

    const finishResize = (resizeEvent?: PointerEvent | MouseEvent) => {
      window.removeEventListener(moveEventName, handlePointerMove as EventListener);
      window.removeEventListener(upEventName, handlePointerUp as EventListener);
      if (cancelEventName) window.removeEventListener(cancelEventName, handlePointerCancel as EventListener);
      document.body.classList.remove('heatcalc-side-resizing');
      const finalWidthPct = resizeEvent
        ? sideFormWidthPctFromClientX(resizeEvent.clientX)
        : tableViewSettingsRef.current.sideFormWidthPct;
      sideResizeStateRef.current = null;
      const normalizedView = applySideFormWidthPct(finalWidthPct ?? tableViewSettingsRef.current.sideFormWidthPct);
      persistTableViewOnly(normalizedView);
    };

    function handlePointerMove(resizeEvent: PointerEvent | MouseEvent) {
      const nextWidthPct = sideFormWidthPctFromClientX(resizeEvent.clientX);
      if (nextWidthPct == null) return;
      applySideFormWidthPct(nextWidthPct);
    }

    function handlePointerUp(resizeEvent: PointerEvent | MouseEvent) {
      finishResize(resizeEvent);
    }

    function handlePointerCancel() {
      finishResize();
    }

    window.addEventListener(moveEventName, handlePointerMove as EventListener);
    window.addEventListener(upEventName, handlePointerUp as EventListener);
    if (cancelEventName) window.addEventListener(cancelEventName, handlePointerCancel as EventListener);
  }, [
    applySideFormWidthPct,
    formPlacement,
    persistTableViewOnly,
    sideFormWidthPctFromClientX,
  ]);

  const startSideFormResize = useCallback((event: ReactPointerEvent<HTMLDivElement>) => {
    event.preventDefault();
    event.stopPropagation();
    event.currentTarget.setPointerCapture?.(event.pointerId);
    startSideFormResizeDrag('pointermove', 'pointerup', 'pointercancel');
  }, [startSideFormResizeDrag]);

  const startSideFormMouseResize = useCallback((event: ReactMouseEvent<HTMLDivElement>) => {
    event.preventDefault();
    event.stopPropagation();
    startSideFormResizeDrag('mousemove', 'mouseup');
  }, [
    startSideFormResizeDrag,
  ]);

  const applyColumnWidth = useCallback((
    type: HeatCalcTableColumnScope,
    key: HeatCalcColumnKey,
    widthPct: number,
  ) => {
    const nextSettings = setTableColumnWidthPct(
      tableColumnSettingsRef.current,
      type,
      key,
      clampTableColumnWidthPct(widthPct),
    );
    persistTableColumnSettings(nextSettings, { showMessage: false });
  }, [persistTableColumnSettings]);

  const updateColumnWidthDraft = useCallback((
    type: HeatCalcTableColumnScope,
    key: HeatCalcColumnKey,
    widthPx: number,
  ) => {
    const widthPct = tableColumnWidthPxToPct(widthPx);
    updateTableColumnSettingsDraft((settings) => setTableColumnWidthPct(settings, type, key, widthPct));
  }, [updateTableColumnSettingsDraft]);

  const handleGlideColumnResize = useCallback((key: string, widthPx: number) => {
    updateColumnWidthDraft(activeTableColumnScope, key, widthPx);
  }, [activeTableColumnScope, updateColumnWidthDraft]);

  const handleGlideColumnResizeEnd = useCallback((key: string, widthPx: number) => {
    applyColumnWidth(activeTableColumnScope, key, tableColumnWidthPxToPct(widthPx));
  }, [activeTableColumnScope, applyColumnWidth]);

  const startColumnResize = useCallback((
    type: HeatCalcTableColumnScope,
    meta: HeatCalcResolvedColumnMeta,
    event: ReactPointerEvent<HTMLButtonElement>,
  ) => {
    event.preventDefault();
    event.stopPropagation();
    event.currentTarget.setPointerCapture?.(event.pointerId);
    const startX = event.clientX;
    const startWidth = meta.width;
    const minWidthPx = meta.minWidthPx;
    let latestWidthPct = meta.widthPct;
    let frameId: number | null = null;
    document.body.classList.add('heatcalc-column-resizing');

    function flushDraftWidth() {
      frameId = null;
      updateTableColumnSettingsDraft((settings) => setTableColumnWidthPct(settings, type, meta.key, latestWidthPct));
    }

    function handlePointerMove(pointerEvent: PointerEvent) {
      const nextWidthPx = Math.max(minWidthPx, startWidth + pointerEvent.clientX - startX);
      latestWidthPct = tableColumnWidthPxToPct(nextWidthPx);
      if (frameId == null) {
        frameId = window.requestAnimationFrame(flushDraftWidth);
      }
    }

    function finishResize() {
      window.removeEventListener('pointermove', handlePointerMove);
      window.removeEventListener('pointerup', finishResize);
      window.removeEventListener('pointercancel', finishResize);
      window.removeEventListener('blur', finishResize);
      if (frameId != null) {
        window.cancelAnimationFrame(frameId);
        frameId = null;
      }
      document.body.classList.remove('heatcalc-column-resizing');
      applyColumnWidth(type, meta.key, latestWidthPct);
    }

    window.addEventListener('pointermove', handlePointerMove);
    window.addEventListener('pointerup', finishResize);
    window.addEventListener('pointercancel', finishResize);
    window.addEventListener('blur', finishResize);
  }, [applyColumnWidth, updateTableColumnSettingsDraft]);

  const { tableColumns, tableScrollX, tableScrollY } = useHeatCalcTableColumns({
    activeTableColumnScope,
    activeTableObjectType,
    activeTableViewState,
    activeInlineCell,
    activeExcelCellPosition,
    beginExcelCellSelection,
    beginExcelColumnSelection,
    beginExcelRowSelection,
    columnRenderers,
    commitInlineCell,
    draftRowsById,
    enumOptionsByColumn,
    excelCellDisplayValue,
    editableExcelColumnKeys,
    excelModeEnabled,
    excelRowIds,
    excelSelectionRange,
    extendExcelCellSelection,
    extendExcelColumnSelection,
    extendExcelRowSelection,
    fieldCapabilityByKey,
    fieldInputSettings,
    formPlacement,
    isAllObjectScope,
    isSavableDraftRow,
    openExcelCellContextMenu,
    openExcelRowContextMenu,
    resetColumnFilter,
    selectAllExcelCells,
    selectExcelCellByPosition,
    selectedExcelPosition,
    setActiveInlineCell,
    setColumnFilter,
    sourceColumnMetas,
    startColumnResize,
    startInlineCellEdit,
    tableCellEditingEnabled,
    visibleTableObjectsLength: visibleTableObjects.length,
    visibleTableRows,
  });

  useEffect(() => {
    if (tableEditingMode !== 'excel' || activeObjectScope !== 'all') return;
    setTableEditingMode('normal');
    clearExcelSelectionState();
  }, [activeObjectScope, clearExcelSelectionState, tableEditingMode]);

  useHeatCalcExcelKeyboard({
    excelModeEnabled,
    selectedPosition: selectedExcelPosition,
    rows: visibleTableObjects,
    editableColumnKeys: editableExcelColumnKeys,
    contextMenuOpen: !!excelContextMenu,
    closeContextMenu: closeExcelContextMenu,
    collapseSelectionToActiveCell,
    moveSelection: moveExcelSelection,
    selectAllCells: selectAllExcelCells,
    copySelection: copyExcelSelection,
    applyPaste: applyExcelPaste,
    startInlineCellEdit,
  });

  useEffect(() => {
    if (!excelModeEnabled) {
      closeExcelContextMenu();
    }
  }, [closeExcelContextMenu, excelModeEnabled]);

  useEffect(() => {
    if (!excelContextMenu) return undefined;

    function handlePointerDown(event: PointerEvent) {
      if (event.target instanceof Element && event.target.closest('.excel-context-menu')) return;
      closeExcelContextMenu();
    }

    function handleKeyDown(event: KeyboardEvent) {
      if (event.key !== 'Escape') return;
      event.preventDefault();
      closeExcelContextMenu();
    }

    function handleScroll() {
      closeExcelContextMenu();
    }

    document.addEventListener('pointerdown', handlePointerDown);
    document.addEventListener('keydown', handleKeyDown);
    window.addEventListener('scroll', handleScroll, true);
    return () => {
      document.removeEventListener('pointerdown', handlePointerDown);
      document.removeEventListener('keydown', handleKeyDown);
      window.removeEventListener('scroll', handleScroll, true);
    };
  }, [closeExcelContextMenu, excelContextMenu]);

  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      if (!(e.ctrlKey || e.metaKey) || e.key !== 'c') return;
      if (excelModeEnabled) return;
      if (selectedRowKeys.length === 0) return;
      const active = document.activeElement;
      if (active instanceof HTMLInputElement || active instanceof HTMLTextAreaElement) return;

      const selected = visibleTableRows
        .map((row) => ({ object: row.record, index: row.sourceIndex }))
        .filter(({ object }) => selectedRowKeys.includes(object.id));
      const header = sourceColumnMetas.map((meta) => meta.copyTitle ?? meta.title);
      const rows = selected.map(({ object, index }) =>
        sourceColumnMetas.map((meta) => (
          isAllObjectScope && !isColumnApplicableToObjectType(meta.key, object.object_type)
            ? INAPPLICABLE_TABLE_VALUE
            : columnRenderers[meta.key].copyValue(object, index)
        )),
      );

      copyToClipboard(buildTsv([header, ...rows])).then(() => {
        antdMessage.success(`Скопировано строк: ${selected.length}`);
      });
    }

    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [columnRenderers, excelModeEnabled, isAllObjectScope, selectedRowKeys, sourceColumnMetas, visibleTableRows]);

  function openColumnSettings() {
    setColumnSettingsType(activeTableColumnScope);
    setDraftTableColumnSettings(normalizeTableColumnSettings(tableColumnSettings));
    setDraftTableViewSettings(normalizeTableViewSettings(tableViewSettings));
    setDraftCalculationDetailsSettings(normalizeCalculationDetailsSettings(calculationDetailsSettings));
    setDraftFieldInputSettings(normalizeFieldInputSettings(fieldInputSettings));
    setColumnSettingsOpen(true);
  }

  function handleTableEditingModeChange(value: string | number) {
    const nextMode: TableEditingMode = value === 'excel' ? 'excel' : 'normal';
    if (nextMode === 'excel' && isAllObjectScope) {
      selectObjectScope('pipe');
      antdMessage.info('Excel-режим включён для таблицы трубопроводов');
    }
    setTableEditingMode(nextMode);
    if (nextMode === 'excel') clearSelectedRows();
    clearExcelSelectionState();
    closeExcelContextMenu();
  }

  function updateDraftColumn(type: HeatCalcTableColumnScope, key: HeatCalcColumnKey, checked: boolean) {
    setDraftTableColumnSettings((settings) => setTableColumnVisibility(settings, type, key, checked));
  }

  function updateDraftColumnOrder(type: HeatCalcTableColumnScope, key: HeatCalcColumnKey, order: number) {
    setDraftTableColumnSettings((settings) => moveTableColumnToOrder(settings, type, key, order));
  }

  function updateDraftColumnWidth(type: HeatCalcTableColumnScope, key: HeatCalcColumnKey, widthPct: number) {
    setDraftTableColumnSettings((settings) => setTableColumnWidthPct(settings, type, key, widthPct));
  }

  function updateDraftTableFontSize(fontSize: HeatCalcTableFontSize) {
    setDraftTableViewSettings((settings) => normalizeTableViewSettings({ ...settings, fontSize }));
  }

  function resetDraftTableFontSize() {
    const defaultView = getDefaultTableViewSettings();
    setDraftTableViewSettings((settings) => normalizeTableViewSettings({
      ...settings,
      fontSize: defaultView.fontSize,
    }));
  }

  function updateDraftTableLabelFormat(tableLabelFormat: HeatCalcTableLabelFormat) {
    setDraftTableViewSettings((settings) => normalizeTableViewSettings({
      ...settings,
      tableLabelFormat,
    }));
  }

  function updateDraftSettingsLabelFormat(settingsLabelFormat: HeatCalcTableLabelFormat) {
    setDraftTableViewSettings((settings) => normalizeTableViewSettings({
      ...settings,
      settingsLabelFormat,
    }));
  }

  function resetDraftLabelFormats() {
    const defaultView = getDefaultTableViewSettings();
    setDraftTableViewSettings((settings) => normalizeTableViewSettings({
      ...settings,
      tableLabelFormat: defaultView.tableLabelFormat,
      settingsLabelFormat: defaultView.settingsLabelFormat,
    }));
  }

  function updateDraftFormPlacement(formPlacement: HeatCalcFormPlacement) {
    setDraftTableViewSettings((settings) => normalizeTableViewSettings({ ...settings, formPlacement }));
  }

  function updateDraftInlineEditingEnabled(inlineEditingEnabled: boolean) {
    setDraftTableViewSettings((settings) => normalizeTableViewSettings({
      ...settings,
      inlineEditingEnabled,
    }));
  }

  function updateDraftCalculationDetailsPreset(preset: HeatCalcCalculationDetailPreset) {
    setDraftCalculationDetailsSettings((settings) => setCalculationDetailsPreset(settings, preset));
  }

  function updateDraftCalculationDetailMetrics(metrics: HeatCalcCalculationDetailMetric[]) {
    setDraftCalculationDetailsSettings((settings) => setCalculationDetailsMetrics(settings, metrics));
  }

  function updateDraftFieldStep(type: HeatCalcObjectType, fieldId: string, step: number | null) {
    setDraftFieldInputSettings((settings) => setHeatCalcFieldStep(settings, type, fieldId, step));
  }

  function resetDraftFieldStep(type: HeatCalcObjectType, fieldId: string) {
    setDraftFieldInputSettings((settings) => resetHeatCalcFieldStep(settings, type, fieldId));
  }

  function resetDraftColumnWidth(type: HeatCalcTableColumnScope, key: HeatCalcColumnKey) {
    setDraftTableColumnSettings((settings) => resetTableColumnWidth(settings, type, key));
  }

  function handleToolbarSave() {
    if (saveTargetCount > 0) {
      void saveDraftRows(saveTargetIds);
      return;
    }
    document.getElementById('inline-object-save')?.click();
  }

  function reorderDraftColumn(type: HeatCalcTableColumnScope, activeKey: HeatCalcColumnKey, overKey: HeatCalcColumnKey) {
    if (activeKey === overKey) return;
    setDraftTableColumnSettings((settings) => reorderTableColumn(settings, type, activeKey, overKey));
  }

  function resetDraftColumns(type: HeatCalcTableColumnScope) {
    setDraftTableColumnSettings((settings) => resetTableColumnTypeSettings(settings, type));
  }

  function selectAllDraftColumns(type: HeatCalcTableColumnScope) {
    setDraftTableColumnSettings((settings) =>
      createTableColumnSettingsPatch(settings, type, getAvailableTableColumnKeys(type)),
    );
  }

  function applyColumnSettings() {
    const normalized = normalizeTableColumnSettings(draftTableColumnSettings);
    const normalizedView = normalizeTableViewSettings(draftTableViewSettings);
    const normalizedDetails = normalizeCalculationDetailsSettings(draftCalculationDetailsSettings);
    const normalizedFieldInputs = normalizeFieldInputSettings(draftFieldInputSettings);
    if (
      normalizeTableViewSettings(tableViewSettings).inlineEditingEnabled
      && !normalizedView.inlineEditingEnabled
      && dirtyDraftRowCount > 0
    ) {
      setPendingInlineDisableSettings({
        columnSettings: normalized,
        viewSettings: normalizedView,
        calculationDetailsSettings: normalizedDetails,
        fieldInputSettings: normalizedFieldInputs,
      });
      return;
    }
    cleanHiddenColumnStateForSettings(normalized);
    persistTableSettings(normalized, normalizedView, normalizedDetails, normalizedFieldInputs);
  }

  function renderFormPanel() {
    return (
      <div
        className={`inline-form-shell heatcalc-form-pane heatcalc-form-pane--${formPlacement}`}
        aria-label="Блок заполнения параметров"
        hidden={!formBlockVisible}
      >
        <div className="inline-form-srs">
          {wizardState ? (
            <Suspense fallback={<div className="inline-object-form-placeholder" />}>
              <ObjectWizard
                key={wizardState.editingObject?.id ?? `${wizardState.type}-new-${newWizardRevision}`}
                objectType={wizardState.type}
                onClose={closeWizard}
                onSubmit={handleWizardSubmit}
                submitting={submittingObject}
                initialParams={(excelModeEnabled ? wizardFormObject : wizardBaseObject)?.params}
                initialFormValues={excelModeEnabled && wizardBaseObject
                  ? draftRowsById[wizardBaseObject.id]?.draftFormValues
                  : undefined}
                validationErrors={wizardFormObject?.validation_errors}
                fieldErrors={wizardDraftFieldErrors}
                fieldInputSettings={fieldInputSettings}
                formSectionWeights={tableViewSettings.formSectionWeights}
                sectionResizeEnabled={formPlacement === 'top' || formPlacement === 'bottom'}
                onFormSectionWeightsChange={applyFormSectionWeights}
                onFormSectionWeightsCommit={commitFormSectionWeights}
                onDraftValuesChange={wizardBaseObject ? handleWizardDraftValuesChange : undefined}
              />
            </Suspense>
          ) : null}
        </div>
      </div>
    );
  }

  function renderTypeBar() {
    return (
      <div className="actionbar-srs actionbar-type-row" role="toolbar" aria-label="Тип объекта и блок параметров">
        <div className="actionbar-group actionbar-type-group" aria-label="Тип объекта">
          <Button
            className="action-type-button"
            type={activeObjectScope === 'pipe' ? 'primary' : 'default'}
            icon={<PipeTypeIcon />}
            aria-label={`Трубопровод: ${pipeButtonCountText}`}
            aria-pressed={activeObjectScope === 'pipe'}
            onClick={() => handleObjectScopeChange('pipe')}
          >
            Трубопровод: <strong className="action-type-count">{pipeButtonCountText}</strong>
          </Button>
          <Button
            className="action-type-button"
            type={activeObjectScope === 'tank' ? 'primary' : 'default'}
            icon={<TankTypeIcon />}
            aria-label={`Резервуар: ${tankButtonCountText}`}
            aria-pressed={activeObjectScope === 'tank'}
            onClick={() => handleObjectScopeChange('tank')}
          >
            Резервуар: <strong className="action-type-count">{tankButtonCountText}</strong>
          </Button>
          <Button
            className="action-type-button"
            type={activeObjectScope === 'all' ? 'primary' : 'default'}
            icon={<AppstoreOutlined />}
            aria-label={`Все: ${allButtonCountText}`}
            aria-pressed={activeObjectScope === 'all'}
            onClick={() => handleObjectScopeChange('all')}
          >
            Все: <strong className="action-type-count">{allButtonCountText}</strong>
          </Button>
        </div>

        <div className="actionbar-group actionbar-form-state-group">
          {formBlockVisible && (
            <Tag className={`actionbar-mode-tag ${formCaptionMode}`}>
              {formCaptionModeLabel}
            </Tag>
          )}
          <Checkbox
            className="actionbar-form-toggle"
            checked={formBlockVisible}
            onChange={(event) => handleFormBlockVisibilityChange(event.target.checked)}
          >
            Показать блок заполнения параметров
          </Checkbox>
        </div>
      </div>
    );
  }

  function renderActionsBar() {
    return (
      <div className="actionbar-srs actionbar-actions-row">
        {formBlockVisible && (
          <div className="actionbar-form-actions-row" role="toolbar" aria-label="Действия блока заполнения">
            <div className="actionbar-group actionbar-form-actions-group">
              <Tooltip title="Добавить">
                <Button
                  type="primary"
                  className="action-icon-button action-add-button add"
                  icon={<PlusOutlined />}
                  aria-label="Добавить"
                  onClick={() => openAddWizard()}
                />
              </Tooltip>

              <Tooltip title={toolbarSaveTooltip}>
                <span className="action-tooltip-wrap">
                  <Button
                    className="action-icon-button action-save-button save"
                    icon={<SaveOutlined />}
                    aria-label="Сохранить"
                    disabled={toolbarSaveDisabled}
                    loading={toolbarSaveLoading}
                    onClick={handleToolbarSave}
                  />
                </span>
              </Tooltip>
              <Tooltip title={deleteTargetCount === 0 ? 'Выберите строки для удаления' : 'Удалить выбранные'}>
                <span className="action-tooltip-wrap">
                  <Popconfirm
                    title={deleteTargetCount > 1 ? `Удалить выбранные строки: ${deleteTargetCount}?` : 'Удалить выбранную строку?'}
                    okText="Удалить"
                    cancelText="Отмена"
                    disabled={deleteTargetCount === 0}
                    onConfirm={removeSelectedObjects}
                  >
                    <Button
                      danger
                      className="action-icon-button action-secondary-button"
                      icon={<DeleteOutlined />}
                      aria-label="Удалить выбранные"
                      loading={remove.isPending}
                      disabled={deleteTargetCount === 0}
                    />
                  </Popconfirm>
                </span>
              </Tooltip>
            </div>
          </div>
        )}

        <div className="actionbar-table-actions-row" role="toolbar" aria-label="Действия таблицы объектов">
          <div className="actionbar-group actionbar-table-actions-group">
            <Segmented
              size="small"
              value={tableEditingMode}
              options={[
                { label: 'Обычный режим', value: 'normal' },
                { label: 'Excel-режим', value: 'excel' },
              ]}
              onChange={handleTableEditingModeChange}
            />
            <Tooltip title={heatLossRecalcTooltip}>
              <span className="action-tooltip-wrap">
                <Button
                  className="action-icon-button action-secondary-button"
                  icon={<ReloadOutlined />}
                  aria-label={heatLossRecalcAriaLabel}
                  loading={heatLossBatchMut.isPending || isHeatLossJobActive}
                  disabled={heatLossScopedRecalcDisabled || heatLossBatchMut.isPending}
                  onClick={() => heatLossBatchMut.mutate(heatLossRecalcObjectIds)}
                />
              </span>
            </Tooltip>
            <Tooltip title={heatLossRecalcAllTooltip}>
              <span className="action-tooltip-wrap">
                <Button
                  className="action-secondary-button action-recalc-all-button"
                  icon={<ReloadOutlined />}
                  aria-label="Пересчитать все"
                  loading={heatLossBatchMut.isPending || isHeatLossJobActive}
                  disabled={heatLossRecalcDisabled || heatLossBatchMut.isPending}
                  onClick={() => heatLossBatchMut.mutate(undefined)}
                >
                  Пересчитать все
                </Button>
              </span>
            </Tooltip>
            {isHeatLossJobActive && activeHeatLossJobId && (
              <Tooltip title="Отменить пересчёт теплопотерь">
                <Button
                  danger
                  className="action-icon-button action-secondary-button"
                  icon={<StopOutlined />}
                  aria-label="Отменить пересчёт теплопотерь"
                  loading={cancelHeatLossJobMut.isPending}
                  onClick={() => cancelHeatLossJobMut.mutate()}
                />
              </Tooltip>
            )}
            <Tooltip title="Настройки отображения">
              <span className="action-tooltip-wrap">
                <Button
                  className="action-icon-button action-secondary-button"
                  icon={<TableOutlined />}
                  aria-label="Настройки отображения"
                  onClick={openColumnSettings}
                />
              </span>
            </Tooltip>
            <Tooltip title={currentTableViewActive ? 'Сбросить фильтры и сортировку' : 'Фильтры не активны'}>
              <span className="action-tooltip-wrap">
                <Button
                  className="action-icon-button action-secondary-button"
                  icon={<CloseCircleOutlined />}
                  aria-label="Сбросить фильтры таблицы"
                  disabled={!currentTableViewActive}
                  onClick={resetCurrentTableViewState}
                />
              </span>
            </Tooltip>
            {draftControlsVisible && (
              <>
                <Tag color={dirtyDraftRowCount > 0 ? 'gold' : 'default'} className="inline-draft-status-tag">
                  Несохранено: {dirtyDraftRowCount}
                </Tag>
                <Button
                  size="small"
                  disabled={saveTargetCount === 0 || inlineDraftSaving}
                  onClick={() => discardDraftRows(saveTargetIds)}
                >
                  {draftDiscardLabel}
                </Button>
              </>
            )}
            <Tooltip
              title={
                selectedObjectCount > 0
                  ? `Добавить копии выбранных объектов: ${selectedObjectCount}`
                  : 'Выберите галочками один или несколько объектов для копирования'
              }
            >
              <span className="action-tooltip-wrap">
                <Button
                  className="action-icon-button action-secondary-button"
                  icon={<CopyOutlined />}
                  aria-label="Добавить копии выбранных"
                  disabled={selectedObjectCount === 0 || add.isPending}
                  loading={add.isPending}
                  onClick={duplicateSelectedObjects}
                />
              </span>
            </Tooltip>
            <ImportExcelButton
              projectId={project!.id}
              existingObjectCount={projectObjectCount}
            />
            {role === 'employee' && (
              <ExportObjectsButton
                projectId={project!.id}
                projectName={project!.name}
                disabled={projectObjectCount === 0}
              />
            )}
          </div>

        </div>
      </div>
    );
  }

  function renderHeatLossJobAlert() {
    if (!isHeatLossJobActive) return null;
    return (
      <Alert
        type="info"
        showIcon
        className="heatcalc-job-alert"
        message={`Пересчёт теплопотерь выполняется · ${heatLossJobProgressLabel}`}
      />
    );
  }

  function renderSelectedRowErrorsOverlay() {
    if (selectedRowErrorMessages.length === 0) return null;
    const visibleMessages = selectedRowErrorMessages.slice(0, 4);
    const hiddenCount = Math.max(0, selectedRowErrorMessages.length - visibleMessages.length);
    const messageText = [
      visibleMessages.join('; '),
      hiddenCount > 0 ? `ещё ${hiddenCount}` : '',
    ].filter(Boolean).join('; ');
    return (
      <div
        className="heatcalc-row-errors-overlay"
        role="status"
        aria-label="Ошибки выбранной строки"
        data-testid="heatcalc-row-errors-overlay"
      >
        <div className="heatcalc-row-errors-title">Ошибки выбранной строки</div>
        <div className="heatcalc-row-errors-message" title={messageText}>
          {messageText}
        </div>
      </div>
    );
  }

  const isSideFormPlacement = formPlacement === 'left' || formPlacement === 'right';
  const sideResizeVisible = isSideFormPlacement && formBlockVisible;
  const workspaceLayoutStyle = isSideFormPlacement
    ? ({ '--heatcalc-side-form-width': `${sideFormWidthPct}%` } as CSSProperties)
    : undefined;

  function renderSideResizeHandle() {
    if (!sideResizeVisible) return null;
    return (
      <div
        className="heatcalc-side-resize-handle"
        role="separator"
        aria-label="Изменить ширину областей"
        aria-orientation="vertical"
        tabIndex={0}
        onPointerDown={startSideFormResize}
        onMouseDown={startSideFormMouseResize}
      />
    );
  }

  const tableRowClassName = useCallback((record: ProjectObject) => {
    const classes = [];
    if (heatLossCalcStatus(record) === 'error') classes.push('row-invalid');
    if (record.id === selectedRowId) classes.push('row-selected');
    if (excelModeEnabled && Object.keys(draftRowsById[record.id]?.errors ?? {}).length > 0) {
      classes.push('row-excel-error');
    }
    if (isSavableDraftRow(draftRowsById[record.id])) {
      classes.push(excelModeEnabled ? 'row-excel-dirty' : 'row-dirty');
    }
    if (isExcelNewRowId(record.id)) classes.push('row-excel-new');
    return classes.join(' ');
  }, [draftRowsById, excelModeEnabled, isSavableDraftRow, selectedRowId]);

  const normalTablePagination = useMemo<TableProps<ProjectObject>['pagination']>(() => ({
    current: activeTablePage,
    pageSize: isAllObjectScope
      ? DEFAULT_OBJECT_QUERY_PAGE_SIZE
      : objectQueryResult?.page_info.page_size ?? DEFAULT_OBJECT_QUERY_PAGE_SIZE,
    total: filteredTableCount,
    showSizeChanger: false,
    hideOnSinglePage: true,
    size: 'small',
  }), [
    activeTablePage,
    filteredTableCount,
    isAllObjectScope,
    objectQueryResult?.page_info.page_size,
  ]);
  const normalInfiniteLoading = useMemo(() => (!normalGlideEnabled ? null : {
    loaded: visibleTableObjects.length,
    total: filteredTableCount,
    hasNextPage: !isAllObjectScope && !!objectQueryResult?.page_info.has_next_page,
    loading: !isAllObjectScope && objectQueryFetching,
  }), [
    filteredTableCount,
    isAllObjectScope,
    normalGlideEnabled,
    objectQueryFetching,
    objectQueryResult?.page_info.has_next_page,
    visibleTableObjects.length,
  ]);
  const handleNormalLoadMore = useCallback(() => {
    loadNextNormalPage(objectQueryResult, { excelModeEnabled, objectQueryFetching });
  }, [
    excelModeEnabled,
    loadNextNormalPage,
    objectQueryFetching,
    objectQueryResult,
  ]);
  const handleNormalTablePageChange = useCallback((page: number) => {
    changeNormalTablePage(page, objectQueryResult);
  }, [changeNormalTablePage, objectQueryResult]);

  const formPanel = renderFormPanel();

  if (!project) {
    return (
      <EmptyProjectState
        icon={<FireOutlined style={{ marginRight: 8, color: '#e06c1e' }} />}
        title="Расчёт теплопотерь"
        description="Шаг 1 из 4. Добавьте объекты (трубопроводы, резервуары) вручную или импортом из Excel / CSV — система автоматически рассчитает тепловые потери."
      />
    );
  }

  return (
    <>
      <div className="heatcalc-workspace-shell">
        {renderSelectedRowErrorsOverlay()}
        <Space direction="vertical" size={5} style={{ width: '100%' }}>
          {!isSideFormPlacement && renderTypeBar()}

          {formPlacement === 'top' && formPanel}

          {!isSideFormPlacement && renderActionsBar()}
          {!isSideFormPlacement && renderHeatLossJobAlert()}

          <div
            ref={sideWorkspaceRef}
            className={`heatcalc-workspace-layout heatcalc-workspace-layout--${formPlacement}`}
            style={workspaceLayoutStyle}
          >
            {formPlacement === 'left' && formPanel}
            {formPlacement === 'left' && renderSideResizeHandle()}
            <div className="heatcalc-table-pane">
              {isSideFormPlacement && renderTypeBar()}
              {isSideFormPlacement && renderActionsBar()}
              {isSideFormPlacement && renderHeatLossJobAlert()}
              {renderAssumptionsPanel()}

              <HeatCalcObjectsTableCard
                activeObjectScope={activeObjectScope}
                activeTypeTotalCount={activeTypeTotalCount}
                columns={tableColumns}
                currentTableViewActive={currentTableViewActive}
                dataSource={visibleTableObjects}
                excelModeEnabled={excelModeEnabled}
                excelSelectionRange={excelSelectionRange}
                fontSizeKey={resolvedTableFontSize.key}
                glideColumns={glideGridColumns}
                normalInfiniteLoading={normalInfiniteLoading}
                normalPagination={normalTablePagination}
                activeTableViewState={activeTableViewState}
                selectedExcelPosition={selectedExcelPosition}
                selectedExcelRowIndex={selectedExcelPosition?.rowIndex ?? null}
                selectedRowKeys={selectedRowKeys}
                tableScrollX={tableScrollX}
                tableScrollY={tableScrollY}
                activeRowId={selectedRowId ?? null}
                onExcelRowSecondaryAction={openExcelRecordContextMenu}
                onExcelReachScrollEnd={extendExcelInputRowsOnScroll}
                onExcelSetRangeSelection={setExcelRangeSelection}
                onGlideCellCommit={commitInlineCell}
                onGlideCellState={getGlideGridCellState}
                onGlideCellStartEdit={startInlineCellEdit}
                onGlideColumnResize={handleGlideColumnResize}
                onGlideColumnResizeEnd={handleGlideColumnResizeEnd}
                onNormalGlideCellState={getNormalGlideGridCellState}
                onNormalSetColumnFilter={setColumnFilter}
                onNormalResetColumnFilter={resetColumnFilter}
                onNormalSetSort={handleNormalTableSortChange}
                onNormalLoadMore={handleNormalLoadMore}
                onNormalPageChange={handleNormalTablePageChange}
                onOpenEditWizard={openEditWizard}
                onResetCurrentTableViewState={resetCurrentTableViewState}
                onSelectedRowKeysChange={setSelectedRowKeys}
                rowClassName={tableRowClassName}
              />
            </div>
            {formPlacement === 'right' && renderSideResizeHandle()}
            {formPlacement === 'right' && formPanel}
          </div>
          {formPlacement === 'bottom' && formPanel}
        </Space>
      </div>

      <HeatCalcExcelContextMenu
        excelModeEnabled={excelModeEnabled}
        contextMenu={excelContextMenu}
        selectionRange={excelSelectionRange}
        activeCell={activeExcelCellPosition}
        selectedRows={selectedExcelRows}
        draftRowsById={draftRowsById}
        isSavableDraftRow={isSavableDraftRow}
        closeContextMenu={closeExcelContextMenu}
        copySelection={copyExcelSelection}
        cutSelection={cutExcelSelection}
        pasteFromClipboard={pasteExcelFromClipboard}
        clearSelection={clearExcelSelection}
        addRowsBelowSelection={addExcelRowsBelowSelection}
        removeSelectedRows={removeSelectedObjects}
        resetSelectedRows={resetSelectedExcelRows}
      />

      {columnSettingsOpen && (
        <Suspense fallback={null}>
          <ColumnSettingsModal
            open={columnSettingsOpen}
            activeType={columnSettingsType}
            draftColumnSettings={draftTableColumnSettings}
            draftViewSettings={draftTableViewSettings}
            draftCalculationDetailsSettings={draftCalculationDetailsSettings}
            draftFieldInputSettings={draftFieldInputSettings}
            confirmLoading={preferenceSavePending}
            onTypeChange={setColumnSettingsType}
            onOk={applyColumnSettings}
            onCancel={() => setColumnSettingsOpen(false)}
            onSelectAllColumns={selectAllDraftColumns}
            onResetColumns={resetDraftColumns}
            onVisibleChange={updateDraftColumn}
            onOrderChange={updateDraftColumnOrder}
            onWidthChange={updateDraftColumnWidth}
            onResetWidth={resetDraftColumnWidth}
            onColumnReorder={reorderDraftColumn}
            onFontSizeChange={updateDraftTableFontSize}
            onTableLabelFormatChange={updateDraftTableLabelFormat}
            onSettingsLabelFormatChange={updateDraftSettingsLabelFormat}
            onFormPlacementChange={updateDraftFormPlacement}
            onInlineEditingEnabledChange={updateDraftInlineEditingEnabled}
            onResetFontSize={resetDraftTableFontSize}
            onResetLabelFormats={resetDraftLabelFormats}
            onCalculationDetailsPresetChange={updateDraftCalculationDetailsPreset}
            onCalculationDetailMetricsChange={updateDraftCalculationDetailMetrics}
            onResetCalculationDetails={() =>
              setDraftCalculationDetailsSettings(getDefaultCalculationDetailsSettings())}
            onFieldStepChange={updateDraftFieldStep}
            onResetFieldStep={resetDraftFieldStep}
          />
        </Suspense>
      )}
      <Modal
        open={pendingInlineDisableSettings != null}
        title="Отключить редактирование ячеек?"
        onCancel={() => {
          setPendingInlineDisableSettings(null);
          setDraftTableViewSettings(tableViewSettings);
          setDraftCalculationDetailsSettings(calculationDetailsSettings);
          setDraftFieldInputSettings(fieldInputSettings);
        }}
        footer={[
          <Button
            key="cancel"
            onClick={() => {
              setPendingInlineDisableSettings(null);
              setDraftTableViewSettings(tableViewSettings);
              setDraftCalculationDetailsSettings(calculationDetailsSettings);
              setDraftFieldInputSettings(fieldInputSettings);
            }}
          >
            Cancel
          </Button>,
          <Button
            key="discard"
            disabled={inlineDraftSaving}
            onClick={() => {
              const pending = pendingInlineDisableSettings;
              if (!pending) return;
              discardDraftRows();
              persistTableSettings(
                pending.columnSettings,
                pending.viewSettings,
                pending.calculationDetailsSettings,
                pending.fieldInputSettings,
              );
              setPendingInlineDisableSettings(null);
            }}
          >
            Discard
          </Button>,
          <Button
            key="save"
            type="primary"
            loading={inlineDraftSaving}
            onClick={() => {
              const pending = pendingInlineDisableSettings;
              if (!pending) return;
              void saveDraftRows().then((result) => {
                if (!result.ok) return;
                persistTableSettings(
                  pending.columnSettings,
                  pending.viewSettings,
                  pending.calculationDetailsSettings,
                  pending.fieldInputSettings,
                );
                setPendingInlineDisableSettings(null);
              });
            }}
          >
            Save
          </Button>,
        ]}
      >
        <Text>
          Есть несохранённые изменения в строках. Сохраните или сбросьте их перед отключением режима.
        </Text>
      </Modal>
      <Modal
        open={pendingWizardObject != null}
        title="Открыть форму объекта?"
        onCancel={() => setPendingWizardObject(null)}
        footer={[
          <Button key="cancel" onClick={() => setPendingWizardObject(null)}>
            Cancel
          </Button>,
          <Button
            key="discard"
            disabled={inlineDraftSaving}
            onClick={() => {
              const target = pendingWizardObject;
              if (!target) return;
              const objectType = target.object_type;
              if (objectType !== 'pipe' && objectType !== 'tank') return;
              discardDraftRows([target.id]);
              setPendingWizardObject(null);
              forceOpenEditWizard(target);
            }}
          >
            Discard
          </Button>,
          <Button
            key="save"
            type="primary"
            loading={inlineDraftSaving}
            onClick={() => {
              const target = pendingWizardObject;
              if (!target) return;
              const objectType = target.object_type;
              if (objectType !== 'pipe' && objectType !== 'tank') return;
              void saveDraftRows([target.id]).then((result) => {
                if (!result.ok) return;
                const savedObject = result.saved.find((item) => item.id === target.id) ?? target;
                setPendingWizardObject(null);
                forceOpenEditWizard(savedObject);
              });
            }}
          >
            Save
          </Button>,
        ]}
      >
        <Text>
          В строке есть несохранённые изменения. Сохраните их, сбросьте или отмените открытие формы.
        </Text>
      </Modal>
    </>
  );
}
