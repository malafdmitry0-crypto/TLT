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
  Modal,
  Space,
  Typography,
  message as antdMessage,
  type TableProps,
} from 'antd';
import { FireOutlined } from '@ant-design/icons';
import { useQuery, useQueryClient } from '@tanstack/react-query';

import EmptyProjectState from '@/components/common/EmptyProjectState';
import HeatCalcExcelContextMenu, {
  type HeatCalcExcelContextMenuState,
} from '@/components/heatcalc/HeatCalcExcelContextMenu';
import HeatCalcObjectsTableCard from '@/components/heatcalc/HeatCalcObjectsTableCard';
import { MATERIAL_LABELS } from '@/constants/materials';
import { useAuthStore } from '@/store/authStore';
import { useProjectStore } from '@/store/projectStore';
import { useWorkspaceHeaderStore } from '@/store/workspaceHeaderStore';
import { createObject, getObjectQueryCapabilities, getObjectsSummary, listObjects, queryObjects, updateObject } from '@/api/projects';
import { referenceQueryKeys, referenceQueryOptions } from '@/api/referenceQueries';
import { getInsulation } from '@/api/references';
import { useFocusableTableScrollRegions } from '@/hooks/useFocusableTableScrollRegions';
import { useHeatCalcExcelClipboard } from '@/hooks/useHeatCalcExcelClipboard';
import { useHeatCalcExcelKeyboard } from '@/hooks/useHeatCalcExcelKeyboard';
import {
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
  HEATCALC_TABLE_COLUMN_CATALOG,
  clampTableColumnWidthPct,
  getAllTableColumnMetas,
  getVisibleTableColumnMetas,
  setTableColumnWidthPct,
  tableColumnWidthPxToPct,
  type HeatCalcColumnKey,
  type HeatCalcObjectType,
  type HeatCalcResolvedColumnMeta,
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
  normalizeTableViewSettings,
  resolveTableFontSize,
  type HeatCalcFormPlacement,
} from '@/utils/heatCalcTableViewSettings';
import {
  normalizeCalculationDetailsSettings,
  type HeatCalcCalculationDetailMetric,
} from '@/utils/heatCalcCalculationDetailsSettings';
import {
  buildDraftDisplayRecord,
  buildDraftRowParams,
  DraftRowValidationError,
  getDraftRowValidationErrors,
  getInlineEditFieldConfig,
  type DraftRowState,
} from '@/utils/heatCalcInlineEdit';
import {
  getExcelEditableColumnMetas,
  getExcelInsertAfterRowIndex,
  isExcelNewRowId,
  type ExcelSelectionRange,
} from '@/utils/heatCalcExcelMode';
import {
  isSavableExcelDraftRow,
  pruneExcelLocalRowsByIds,
  resetExcelRowsInModel,
  upsertSavedExcelObjectsInProjectList,
  type SavedExcelProjectObject,
} from '@/utils/heatCalcExcelRows';
import {
  DEFAULT_OBJECT_QUERY_PAGE_SIZE,
  INAPPLICABLE_TABLE_VALUE,
  buildObjectQueryRequest,
  escapeTableRowKey,
  filterKindForColumn,
  heatLossCalcStatus,
  insulationEntryLabel,
  isColumnApplicableToObjectType,
  sourceSuffix,
  sourceText,
} from '@/pages/heatcalc/heatCalcPageUtils';
import { buildHeatCalcColumnRenderers } from '@/pages/heatcalc/heatCalcColumnRenderers';
import {
  HeatCalcActionsToolbar,
  HeatCalcTypeToolbar,
  type HeatCalcToolbarEditingMode,
} from '@/pages/heatcalc/HeatCalcToolbar';
import {
  useHeatCalcTableState,
  type ActiveObjectScope,
} from '@/pages/heatcalc/useHeatCalcTableState';
import { useHeatCalcColumnSettingsDialog } from '@/pages/heatcalc/useHeatCalcColumnSettingsDialog';
import { useHeatCalcInlineDraftModel } from '@/pages/heatcalc/useHeatCalcInlineDraftModel';
import { useHeatCalcGridModel } from '@/pages/heatcalc/useHeatCalcGridModel';
import { useHeatCalcBulkActions } from '@/pages/heatcalc/useHeatCalcBulkActions';
import { useHeatCalcHeatLossJob } from '@/pages/heatcalc/useHeatCalcHeatLossJob';

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
type TableEditingMode = HeatCalcToolbarEditingMode;

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
  const [tableEditingMode, setTableEditingMode] = useState<TableEditingMode>('normal');
  const resetInlineDraftActiveCellRef = useRef<(() => void) | null>(null);
  const handleInlineEditingDisabled = useCallback(() => {
    resetInlineDraftActiveCellRef.current?.();
  }, []);
  const closeColumnSettingsRef = useRef<(() => void) | null>(null);
  const closeColumnSettings = useCallback(() => {
    closeColumnSettingsRef.current?.();
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
  const [selectedExcelCell, setSelectedExcelCell] = useState<ActiveInlineCell>(null);
  const [excelSelectionRange, setExcelSelectionRange] = useState<ExcelSelectionRange | null>(null);
  const [excelContextMenu, setExcelContextMenu] = useState<HeatCalcExcelContextMenuState>(null);
  const [pendingWizardObject, setPendingWizardObject] = useState<ProjectObject | null>(null);
  const [pendingTableFocusObject, setPendingTableFocusObject] = useState<ProjectObject | null>(null);
  const setWorkspaceHeaderContext = useWorkspaceHeaderStore((s) => s.setContext);

  const clearExcelSelectionForProject = useCallback(() => {
    setSelectedExcelCell(null);
    setExcelSelectionRange(null);
  }, []);

  useEffect(() => {
    setWorkspaceHeaderContext(null);
  }, [setWorkspaceHeaderContext]);

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

  const pipeCount = objectsSummary?.by_type.pipe ?? 0;
  const tankCount = objectsSummary?.by_type.tank ?? 0;
  const projectObjectCount = objectsSummary?.total ?? pipeCount + tankCount;
  const totalCount = activeObjectScope === 'all'
    ? projectObjectCount
    : objectsSummary?.by_type[activeObjectScope] ?? 0;
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
  const {
    activeInlineCell,
    setActiveInlineCell,
    draftRowsById,
    setDraftRowsById,
    excelLocalRows,
    setExcelLocalRows,
    appendExcelLocalRows,
    extendExcelInputRowsOnScroll,
    discardDraftRows,
    commitInlineCell,
    handleWizardDraftValuesChange: applyWizardDraftValuesChange,
    excelBaseRows,
    excelRows,
    excelTableRows,
    excelRowIds,
    activeExcelCellPosition,
    selectedExcelRows,
  } = useHeatCalcInlineDraftModel({
    projectId: project?.id,
    excelModeEnabled,
    allProjectObjects,
    activeObjectType: activeTableObjectType,
    projectObjectCount,
    tableViewState: activeTableViewState,
    tableValueAccessors,
    selectedExcelCell,
    excelSelectionRange,
    editableExcelColumnKeys,
    onProjectReset: clearExcelSelectionForProject,
  });

  useEffect(() => {
    resetInlineDraftActiveCellRef.current = () => setActiveInlineCell(null);
    return () => {
      if (resetInlineDraftActiveCellRef.current) {
        resetInlineDraftActiveCellRef.current = null;
      }
    };
  }, [setActiveInlineCell]);

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
    applyWizardDraftValuesChange(wizardBaseObject, changedValues, allValues);
  }, [applyWizardDraftValuesChange, wizardBaseObject]);
  const selectedVisibleRows = useMemo(
    () => visibleTableRows.filter(({ record }) => selectedRowKeys.includes(record.id)),
    [selectedRowKeys, visibleTableRows],
  );
  const currentTableViewActive = hasActiveTableViewState(activeTableViewState);
  const activeTypeTotalCount = isAllObjectScope
    ? projectObjectCount
    : objectQueryResult?.counts.by_type[activeTableObjectType] ?? totalCount;
  const filteredTableCount = isAllObjectScope
    ? allFilteredSortedTableRows.length
    : excelModeEnabled
      ? visibleTableObjects.length
      : objectQueryResult?.counts.filtered ?? baseVisibleTableObjects.length;
  const notifyBulkActionSuccess = useCallback((message: string) => {
    void antdMessage.success(message);
  }, []);
  const {
    selectedObjectCount,
    deleteTargetCount,
    duplicateSelectedObjects,
    removeSelectedObjects,
  } = useHeatCalcBulkActions({
    activeObjectScope,
    activeTypeTotalCount,
    allFilteredSortedTableRowCount: allFilteredSortedTableRows.length,
    clearSelectedRows,
    draftRowsById,
    excelLocalRows,
    excelModeEnabled,
    objectQueryFilteredCount: objectQueryResult?.counts.filtered,
    objectQueryPageSize: objectQueryResult?.page_info.page_size,
    openEditWizard,
    projectObjectCount,
    removeNormalLoadedRows,
    selectedExcelRows,
    selectedVisibleRows,
    setActiveInlineCell,
    setDraftRowsById,
    setExcelLocalRows,
    setExcelSelectionRange,
    setPendingTableFocusObject,
    setSelectedExcelCell,
    setTablePage,
    addObject: add.mutateAsync,
    removeObject: remove.mutate,
    notifySuccess: notifyBulkActionSuccess,
  });
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
  const columnSettingsDialog = useHeatCalcColumnSettingsDialog({
    activeTableColumnScope,
    tableColumnSettings,
    tableViewSettings,
    calculationDetailsSettings,
    fieldInputSettings,
    dirtyDraftRowCount,
    cleanHiddenColumnStateForSettings,
    persistTableSettings,
  });

  useEffect(() => {
    closeColumnSettingsRef.current = columnSettingsDialog.close;
    return () => {
      if (closeColumnSettingsRef.current === columnSettingsDialog.close) {
        closeColumnSettingsRef.current = null;
      }
    };
  }, [columnSettingsDialog.close]);

  const toolbarSaveDisabled = saveTargetCount === 0 && !hasWizard;
  const toolbarSaveLoading = inlineDraftSaving || submittingObject;
  const toolbarSaveTooltip = saveTargetCount > 0
    ? selectedDirtyTarget
      ? `Сохранить выбранные строки (${saveTargetCount})`
      : `Сохранить несохранённые строки (${saveTargetCount})`
    : hasWizard
      ? 'Сохранить объект'
      : 'Нет изменений для сохранения';
  const {
    activeHeatLossJobId,
    isHeatLossJobActive,
    heatLossJobProgressLabel,
    heatLossRecalcDisabled,
    heatLossScopedRecalcDisabled,
    heatLossRecalcTooltip,
    heatLossRecalcAriaLabel,
    heatLossRecalcAllTooltip,
    heatLossBatchPending,
    cancelHeatLossJobPending,
    recalcScoped: recalcHeatLossScoped,
    recalcAll: recalcHeatLossAll,
    cancelJob: cancelHeatLossJob,
  } = useHeatCalcHeatLossJob({
    dirtyDraftRowCount,
    projectId: project?.id,
    projectObjectCount,
    selectedRowId,
    selectedVisibleRows,
    submittingObject,
  });

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

  const startInlineCellEdit = useCallback((record: ProjectObject, columnKey: string) => {
    if (!tableCellEditingEnabled) return;
    if (excelModeEnabled) {
      setSelectedExcelCell({ objectId: record.id, columnKey });
      syncWizardWithRecord(record);
    }
    setActiveInlineCell({ objectId: record.id, columnKey });
  }, [excelModeEnabled, syncWizardWithRecord, tableCellEditingEnabled]);

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

  const {
    selectedRowErrorMessages,
    excelCellDisplayValue,
    glideGridColumns,
    getGlideGridCellState,
    getNormalGlideGridCellState,
  } = useHeatCalcGridModel({
    activeTableObjectType,
    sourceColumnMetas,
    fieldCapabilityByKey,
    enumOptionsByColumn,
    columnRenderers,
    draftRowsById,
    editableExcelColumnKeys,
    excelModeEnabled,
    fieldInputSettings,
    isAllObjectScope,
    isSavableDraftRow,
    tableCellEditingEnabled,
    visibleTableRows,
    visibleSourceIndexById,
    wizardBaseObject,
    wizardFormObject,
  });

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

  function handleToolbarSave() {
    if (saveTargetCount > 0) {
      void saveDraftRows(saveTargetIds);
      return;
    }
    document.getElementById('inline-object-save')?.click();
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
      <HeatCalcTypeToolbar
        activeObjectScope={activeObjectScope}
        pipeButtonCountText={pipeButtonCountText}
        tankButtonCountText={tankButtonCountText}
        allButtonCountText={allButtonCountText}
        pipeIcon={<PipeTypeIcon />}
        tankIcon={<TankTypeIcon />}
        formBlockVisible={formBlockVisible}
        formCaptionMode={formCaptionMode}
        formCaptionModeLabel={formCaptionModeLabel}
        onObjectScopeChange={handleObjectScopeChange}
        onFormBlockVisibilityChange={handleFormBlockVisibilityChange}
      />
    );
  }

  function renderActionsBar() {
    return (
      <HeatCalcActionsToolbar
        formActions={{
          visible: formBlockVisible,
          saveTooltip: toolbarSaveTooltip,
          saveDisabled: toolbarSaveDisabled,
          saveLoading: toolbarSaveLoading,
          deleteTargetCount,
          deleteLoading: remove.isPending,
          onAdd: openAddWizard,
          onSave: handleToolbarSave,
          onDeleteSelected: removeSelectedObjects,
        }}
        tableActions={{
          editingMode: tableEditingMode,
          recalcTooltip: heatLossRecalcTooltip,
          recalcAriaLabel: heatLossRecalcAriaLabel,
          recalcLoading: heatLossBatchPending || isHeatLossJobActive,
          recalcDisabled: heatLossScopedRecalcDisabled || heatLossBatchPending,
          recalcAllTooltip: heatLossRecalcAllTooltip,
          recalcAllDisabled: heatLossRecalcDisabled || heatLossBatchPending,
          jobActive: isHeatLossJobActive,
          jobId: activeHeatLossJobId,
          cancelJobLoading: cancelHeatLossJobPending,
          currentTableViewActive,
          draftControlsVisible,
          dirtyDraftRowCount,
          saveTargetCount,
          inlineDraftSaving,
          draftDiscardLabel,
          selectedObjectCount,
          duplicateLoading: add.isPending,
          onEditingModeChange: handleTableEditingModeChange,
          onRecalcScoped: recalcHeatLossScoped,
          onRecalcAll: recalcHeatLossAll,
          onCancelJob: cancelHeatLossJob,
          onOpenSettings: columnSettingsDialog.open,
          onResetCurrentTableView: resetCurrentTableViewState,
          onDiscardDrafts: () => discardDraftRows(saveTargetIds),
          onDuplicateSelected: duplicateSelectedObjects,
        }}
        importExport={{
          projectId: project!.id,
          projectName: project!.name,
          existingObjectCount: projectObjectCount,
          canExport: role === 'employee',
        }}
      />
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

      {columnSettingsDialog.isOpen && (
        <Suspense fallback={null}>
          <ColumnSettingsModal
            open={columnSettingsDialog.isOpen}
            activeType={columnSettingsDialog.activeType}
            draftColumnSettings={columnSettingsDialog.draftColumnSettings}
            draftViewSettings={columnSettingsDialog.draftViewSettings}
            draftCalculationDetailsSettings={columnSettingsDialog.draftCalculationDetailsSettings}
            draftFieldInputSettings={columnSettingsDialog.draftFieldInputSettings}
            confirmLoading={preferenceSavePending}
            onTypeChange={columnSettingsDialog.setActiveType}
            onOk={columnSettingsDialog.apply}
            onCancel={columnSettingsDialog.close}
            onSelectAllColumns={columnSettingsDialog.selectAllDraftColumns}
            onResetColumns={columnSettingsDialog.resetDraftColumns}
            onVisibleChange={columnSettingsDialog.updateDraftColumn}
            onOrderChange={columnSettingsDialog.updateDraftColumnOrder}
            onWidthChange={columnSettingsDialog.updateDraftColumnWidth}
            onResetWidth={columnSettingsDialog.resetDraftColumnWidth}
            onColumnReorder={columnSettingsDialog.reorderDraftColumn}
            onFontSizeChange={columnSettingsDialog.updateDraftTableFontSize}
            onTableLabelFormatChange={columnSettingsDialog.updateDraftTableLabelFormat}
            onSettingsLabelFormatChange={columnSettingsDialog.updateDraftSettingsLabelFormat}
            onFormPlacementChange={columnSettingsDialog.updateDraftFormPlacement}
            onInlineEditingEnabledChange={columnSettingsDialog.updateDraftInlineEditingEnabled}
            onResetFontSize={columnSettingsDialog.resetDraftTableFontSize}
            onResetLabelFormats={columnSettingsDialog.resetDraftLabelFormats}
            onCalculationDetailsPresetChange={columnSettingsDialog.updateDraftCalculationDetailsPreset}
            onCalculationDetailMetricsChange={columnSettingsDialog.updateDraftCalculationDetailMetrics}
            onResetCalculationDetails={columnSettingsDialog.resetDraftCalculationDetails}
            onFieldStepChange={columnSettingsDialog.updateDraftFieldStep}
            onResetFieldStep={columnSettingsDialog.resetDraftFieldStep}
          />
        </Suspense>
      )}
      <Modal
        open={columnSettingsDialog.pendingInlineDisableSettings != null}
        title="Отключить редактирование ячеек?"
        onCancel={columnSettingsDialog.cancelPendingInlineDisable}
        footer={[
          <Button
            key="cancel"
            onClick={columnSettingsDialog.cancelPendingInlineDisable}
          >
            Cancel
          </Button>,
          <Button
            key="discard"
            disabled={inlineDraftSaving}
            onClick={() => columnSettingsDialog.discardPendingInlineDisable(discardDraftRows)}
          >
            Discard
          </Button>,
          <Button
            key="save"
            type="primary"
            loading={inlineDraftSaving}
            onClick={() => {
              void columnSettingsDialog.savePendingInlineDisable(() => saveDraftRows());
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
