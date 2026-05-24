import {
  lazy,
  Suspense,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
  type ReactNode,
  type MouseEvent as ReactMouseEvent,
  type PointerEvent as ReactPointerEvent,
} from 'react';
import {
  Alert,
  Button,
  Card,
  Checkbox,
  Modal,
  Popconfirm,
  Segmented,
  Space,
  Table,
  Tag,
  Tooltip,
  Typography,
  message as antdMessage,
  type TableProps,
} from 'antd';
import {
  AppstoreOutlined,
  CheckCircleFilled,
  CloseCircleFilled,
  CloseCircleOutlined,
  CopyOutlined,
  DeleteOutlined,
  FilterFilled,
  FireOutlined,
  PlusOutlined,
  ReloadOutlined,
  MinusCircleFilled,
  SaveOutlined,
  StopOutlined,
  TableOutlined,
} from '@ant-design/icons';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { ColumnsType, ColumnType } from 'antd/es/table';

import ImportExcelButton from '@/components/ImportExcelButton';
import ExportObjectsButton from '@/components/ExportObjectsButton';
import EmptyProjectState from '@/components/common/EmptyProjectState';
import EditableTableCell from '@/components/heatcalc/EditableTableCell';
import { OBJECT_TYPE_LABELS } from '@/constants/objectTypes';
import { MATERIAL_LABELS } from '@/constants/materials';
import { useAuthStore } from '@/store/authStore';
import { useProjectStore } from '@/store/projectStore';
import { useWorkspaceHeaderStore } from '@/store/workspaceHeaderStore';
import { createObject, getObjectQueryCapabilities, getObjectsSummary, listObjects, queryObjects, updateObject } from '@/api/projects';
import { cancelCalcTask, enqueueHeatLossBatchJob, getCalcTask } from '@/api/calculations';
import { getUserPreference, updateUserPreference } from '@/api/preferences';
import { referenceQueryKeys, referenceQueryOptions } from '@/api/referenceQueries';
import { getInsulation } from '@/api/references';
import { useFocusableTableScrollRegions } from '@/hooks/useFocusableTableScrollRegions';
import { useHeatCalcMutations } from '@/hooks/useHeatCalcMutations';
import type { ProjectObject, ProjectObjectsQueryResponse } from '@/types/project';
import { formatNumber } from '@/utils/formatters';
import { buildTsv, copyToClipboard } from '@/utils/clipboard';
import { findDN } from '@/utils/objectWizardUtils';
import {
  getHeatCalcFieldDefinition,
  getHeatCalcFieldLabel,
  getHeatCalcFormFieldIds,
} from '@/domain/heatCalcFields';
import {
  HEATCALC_TABLE_COLUMN_PREF_KEY,
  HEATCALC_TABLE_COLUMN_CATALOG,
  clampTableColumnWidthPct,
  clearRegisteredTableColumnCache,
  createTableColumnSettingsPatch,
  getAllTableColumnMetas,
  getAvailableTableColumnKeys,
  getDefaultTableColumnSettings,
  getVisibleTableColumnMetas,
  moveTableColumnToOrder,
  normalizeTableColumnSettings,
  readGuestTableColumnSettings,
  readRegisteredTableColumnCache,
  reorderTableColumn,
  resetTableColumnTypeSettings,
  resetTableColumnWidth,
  setTableColumnVisibility,
  setTableColumnWidthPct,
  tableColumnWidthPxToPct,
  writeGuestTableColumnSettings,
  writeRegisteredTableColumnCache,
  type HeatCalcColumnKey,
  type HeatCalcObjectType,
  type HeatCalcResolvedColumnMeta,
  type HeatCalcTableColumnSettings,
  type HeatCalcTableColumnScope,
} from '@/utils/heatCalcTableColumns';
import {
  applyColumnFilters,
  applyTableSort,
  createEmptyTableViewState,
  hasActiveTableViewState,
  isColumnFilterActive,
  removeHiddenTableViewState,
  type HeatCalcColumnValueAccessors,
  type HeatCalcColumnFilter,
  type HeatCalcIndexedTableRow,
  type HeatCalcTableViewState,
} from '@/utils/heatCalcTableFindability';
import {
  HEATCALC_TABLE_VIEW_PREF_KEY,
  areFormSectionWeightsEqual,
  clearGuestTableViewSettings,
  clearRegisteredTableViewCache,
  getDefaultTableViewSettings,
  isDefaultTableViewSettings,
  normalizeTableViewSettings,
  normalizeFormSectionWeights,
  readGuestTableViewSettings,
  readRegisteredTableViewCache,
  resolveTableFontSize,
  writeGuestTableViewSettings,
  writeRegisteredTableViewCache,
  type HeatCalcFormPlacement,
  type HeatCalcFormSectionWeights,
  type HeatCalcTableFontSize,
  type HeatCalcTableLabelFormat,
  type HeatCalcTableViewSettings,
} from '@/utils/heatCalcTableViewSettings';
import {
  HEATCALC_CALCULATION_DETAILS_PREF_KEY,
  clearGuestCalculationDetailsSettings,
  clearRegisteredCalculationDetailsCache,
  getDefaultCalculationDetailsSettings,
  isDefaultCalculationDetailsSettings,
  normalizeCalculationDetailsSettings,
  readGuestCalculationDetailsSettings,
  readRegisteredCalculationDetailsCache,
  setCalculationDetailsMetrics,
  setCalculationDetailsPreset,
  writeGuestCalculationDetailsSettings,
  writeRegisteredCalculationDetailsCache,
  type HeatCalcCalculationDetailMetric,
  type HeatCalcCalculationDetailPreset,
  type HeatCalcCalculationDetailsSettings,
} from '@/utils/heatCalcCalculationDetailsSettings';
import {
  HEATCALC_FIELD_INPUT_PREF_KEY,
  areFieldInputSettingsEqual,
  clearGuestFieldInputSettings,
  clearRegisteredFieldInputCache,
  getDefaultFieldInputSettings,
  isDefaultFieldInputSettings,
  normalizeFieldInputSettings,
  readGuestFieldInputSettings,
  readRegisteredFieldInputCache,
  resetHeatCalcFieldStep,
  resolveHeatCalcFieldStep,
  setHeatCalcFieldStep,
  writeGuestFieldInputSettings,
  writeRegisteredFieldInputCache,
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
  isDraftRowDirty,
  isDraftRowEmpty,
  type DraftRowState,
  type DraftRowsById,
} from '@/utils/heatCalcInlineEdit';
import {
  buildExcelSelectionTsv,
  buildExcelTableErrorItems,
  createExcelSelectionRange,
  EXCEL_NEW_ROW_PREFIX,
  formatExcelCellDisplay,
  formatExcelDraftCellDisplay,
  getExcelSelectionOrigin,
  getExcelEditableColumnMetas,
  getExcelSelectedRowIndexes,
  isExcelCellActive,
  isExcelCellInRange,
  isExcelDraftRowBlank,
  isExcelNewRowId,
  missingExcelRowsForPaste,
  normalizeExcelSelectionRange,
  parseExcelCellValue,
  parseSpreadsheetText,
  type ExcelCellPosition,
  type ExcelErrorFieldInfo,
  type ExcelSelectionRange,
  type ExcelTableErrorItem,
} from '@/utils/heatCalcExcelMode';
import { getCalcJobRefetchInterval, isActiveCalcJobStatus } from '@/utils/calcJobPolling';
import ColumnFilterDropdown from '@/pages/heatcalc/HeatCalcColumnFilterDropdown';
import {
  DEFAULT_OBJECT_QUERY_PAGE_SIZE,
  INAPPLICABLE_TABLE_VALUE,
  booleanChoiceLabel,
  buildObjectQueryRequest,
  climateBasisLabel,
  countParamValue,
  environmentLabel,
  filterKindForColumn,
  formatDeltaTemperature,
  formatParamMetersAsMm,
  formatParamNumber,
  formatParamText,
  formatResultOrParamNumber,
  formatResultNumber,
  heatLossCalcStatus,
  heatLossErrorText,
  heatLossStatusLabel,
  insulationEntryLabel,
  insulationTemperatureBasisLabel,
  insulationLayerConductivity,
  insulationLayerCount,
  insulationLayerMaterial,
  insulationLayerThickness,
  isBatchHeatLossResponse,
  isColumnApplicableToObjectType,
  lambdaModeLabel,
  mmParam,
  placementLabel,
  sourceSuffix,
  sourceText,
  tankDimensions,
  tankShapeLabel,
  zoneLabel,
} from '@/pages/heatcalc/heatCalcPageUtils';

const loadObjectWizard = () => import('@/components/wizard/ObjectWizard');
const ObjectWizard = lazy(loadObjectWizard);
const ColumnSettingsModal = lazy(() => import('@/components/heatcalc/ColumnSettingsModal'));

const { Text } = Typography;

/** Мастер сейчас знает две формы — трубу и резервуар. */
type WizardObjectType = HeatCalcObjectType;
type ActiveObjectScope = HeatCalcObjectType | 'all';

type TableColumnRenderSpec = Pick<ColumnType<ProjectObject>, 'render' | 'ellipsis' | 'align'> & {
  copyValue: (record: ProjectObject, index: number) => string;
};

function draftRowFingerprint(row: DraftRowState | null | undefined) {
  if (!row) return '';
  return JSON.stringify({
    draftFormValues: row.draftFormValues,
    dirtyFields: row.dirtyFields,
    errors: row.errors,
  });
}

function canOpenObjectWizard(record: ProjectObject): record is ProjectObject & { object_type: HeatCalcObjectType } {
  return record.object_type === 'pipe' || record.object_type === 'tank';
}

function escapeTableRowKey(value: string) {
  if (typeof CSS !== 'undefined' && typeof CSS.escape === 'function') {
    return CSS.escape(value);
  }
  return value.replace(/\\/g, '\\\\').replace(/"/g, '\\"');
}

function scrollTableRowIntoView(objectId: string) {
  const run = () => {
    const row = document.querySelector<HTMLElement>(
      `.srs-table-wrap .ant-table-row[data-row-key="${escapeTableRowKey(objectId)}"]`,
    );
    const tableBody = row?.closest<HTMLElement>('.ant-table-body');
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

type TableColumnPreferenceMutation = {
  settings: HeatCalcTableColumnSettings;
  closeModal?: boolean;
  showMessage?: boolean;
};
type TableSettingsPreferenceMutation = {
  columnSettings: HeatCalcTableColumnSettings;
  viewSettings?: HeatCalcTableViewSettings;
  calculationDetailsSettings?: HeatCalcCalculationDetailsSettings;
  fieldInputSettings?: HeatCalcFieldInputSettings;
};
type ActiveInlineCell = {
  objectId: string;
  columnKey: string;
} | null;
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

function ResizableColumnTitle({
  title,
  label,
  onResizeStart,
  selectable = false,
  selected = false,
  selectionActive = false,
  onSelectionPointerDown,
  onSelectionPointerEnter,
}: {
  title: string;
  label: string;
  onResizeStart: (event: ReactPointerEvent<HTMLButtonElement>) => void;
  selectable?: boolean;
  selected?: boolean;
  selectionActive?: boolean;
  onSelectionPointerDown?: (event: ReactPointerEvent<HTMLSpanElement>) => void;
  onSelectionPointerEnter?: (event: ReactPointerEvent<HTMLSpanElement>) => void;
}) {
  const className = [
    'resizable-column-title',
    selectable ? 'excel-column-title' : null,
    selected ? 'selected' : null,
    selectionActive ? 'active-selection' : null,
  ].filter(Boolean).join(' ');
  return (
    <span
      className={className}
      onPointerDown={(event) => {
        if (!selectable) return;
        event.preventDefault();
        event.stopPropagation();
        onSelectionPointerDown?.(event);
      }}
      onPointerEnter={(event) => {
        if (!selectable) return;
        onSelectionPointerEnter?.(event);
      }}
    >
      <span className="resizable-column-title-text">{title}</span>
      <button
        type="button"
        className="column-resize-handle"
        aria-label={`Изменить ширину: ${label}`}
        tabIndex={-1}
        onPointerDown={onResizeStart}
        onClick={(event) => {
          event.preventDefault();
          event.stopPropagation();
        }}
      />
    </span>
  );
}

interface WizardState {
  type: WizardObjectType;
  editingObject?: ProjectObject;
}

export default function HeatCalcPage() {
  const queryClient = useQueryClient();
  const project = useProjectStore((s) => s.currentProject);
  const role = useAuthStore((s) => s.role);
  const registeredUserId = useAuthStore((s) => s.user?.id ?? null);
  const isRegisteredUser = role === 'employee' || role === 'admin';
  const [wizardState, setWizardState] = useState<WizardState | null>({ type: 'pipe' });
  const [newWizardRevision, setNewWizardRevision] = useState(0);
  const [activeObjectScope, setActiveObjectScope] = useState<ActiveObjectScope>('pipe');
  const [formBlockVisible, setFormBlockVisible] = useState(true);
  const [selectedRowKeys, setSelectedRowKeys] = useState<string[]>([]);
  const [tableViewStateByType, setTableViewStateByType] = useState<
    Record<HeatCalcObjectType, HeatCalcTableViewState>
  >(() => ({
    pipe: createEmptyTableViewState(),
    tank: createEmptyTableViewState(),
  }));
  const [allTableViewState, setAllTableViewState] = useState<HeatCalcTableViewState>(
    () => createEmptyTableViewState(),
  );
  const [tablePageByScope, setTablePageByScope] = useState<Record<ActiveObjectScope, number>>({
    pipe: 1,
    tank: 1,
    all: 1,
  });
  const [lastSavedObject, setLastSavedObject] = useState<ProjectObject | null>(null);
  const [tableColumnSettings, setTableColumnSettings] = useState<HeatCalcTableColumnSettings>(() => {
    const auth = useAuthStore.getState();
    const cached = readRegisteredTableColumnCache(auth.user?.id ?? null);
    if (auth.role === 'employee' || auth.role === 'admin') {
      return cached ?? getDefaultTableColumnSettings();
    }
    return readGuestTableColumnSettings();
  });
  const tableColumnSettingsRef = useRef(tableColumnSettings);
  const [tableViewSettings, setTableViewSettings] = useState<HeatCalcTableViewSettings>(() => {
    const auth = useAuthStore.getState();
    const cached = readRegisteredTableViewCache(auth.user?.id ?? null);
    if (auth.role === 'employee' || auth.role === 'admin') {
      return cached ?? getDefaultTableViewSettings();
    }
    return readGuestTableViewSettings();
  });
  const tableViewSettingsRef = useRef(tableViewSettings);
  const sideWorkspaceRef = useRef<HTMLDivElement | null>(null);
  const excelSelectionDragRef = useRef<{ mode: 'cells' | 'rows' | 'columns'; anchor: ExcelCellPosition } | null>(null);
  const sideResizeStateRef = useRef<{
    placement: Extract<HeatCalcFormPlacement, 'left' | 'right'>;
    rect: DOMRect;
  } | null>(null);
  useFocusableTableScrollRegions(sideWorkspaceRef, 'Таблица расчёта теплопотерь', Boolean(project));
  const [calculationDetailsSettings, setCalculationDetailsSettings] =
    useState<HeatCalcCalculationDetailsSettings>(() => {
      const auth = useAuthStore.getState();
      const cached = readRegisteredCalculationDetailsCache(auth.user?.id ?? null);
      if (auth.role === 'employee' || auth.role === 'admin') {
        return cached ?? getDefaultCalculationDetailsSettings();
      }
      return readGuestCalculationDetailsSettings();
    });
  const [fieldInputSettings, setFieldInputSettings] =
    useState<HeatCalcFieldInputSettings>(() => {
      const auth = useAuthStore.getState();
      const cached = readRegisteredFieldInputCache(auth.user?.id ?? null);
      if (auth.role === 'employee' || auth.role === 'admin') {
        return cached ?? getDefaultFieldInputSettings();
      }
      return readGuestFieldInputSettings();
    });
  const [columnSettingsOpen, setColumnSettingsOpen] = useState(false);
  const [columnSettingsType, setColumnSettingsType] = useState<HeatCalcTableColumnScope>('pipe');
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
  const [tableEditingMode, setTableEditingMode] = useState<TableEditingMode>('normal');
  const [activeInlineCell, setActiveInlineCell] = useState<ActiveInlineCell>(null);
  const [selectedExcelCell, setSelectedExcelCell] = useState<ActiveInlineCell>(null);
  const [excelSelectionRange, setExcelSelectionRange] = useState<ExcelSelectionRange | null>(null);
  const [draftRowsById, setDraftRowsById] = useState<DraftRowsById>({});
  const [excelLocalRows, setExcelLocalRows] = useState<ProjectObject[]>([]);
  const excelNewRowSeqRef = useRef(0);
  const lastExcelCellPointerDownRef = useRef<{
    rowIndex: number;
    columnIndex: number;
    at: number;
  } | null>(null);
  const excelBaselineRowsInitializedRef = useRef<Record<HeatCalcObjectType, boolean>>({
    pipe: false,
    tank: false,
  });
  const [pendingInlineDisableSettings, setPendingInlineDisableSettings] =
    useState<PendingInlineDisableSettings | null>(null);
  const [pendingWizardObject, setPendingWizardObject] = useState<ProjectObject | null>(null);
  const [pendingTableFocusObject, setPendingTableFocusObject] = useState<ProjectObject | null>(null);
  const [activeHeatLossJobId, setActiveHeatLossJobId] = useState<string | null>(null);
  const setWorkspaceHeaderContext = useWorkspaceHeaderStore((s) => s.setContext);

  useEffect(() => {
    tableColumnSettingsRef.current = tableColumnSettings;
  }, [tableColumnSettings]);

  useEffect(() => {
    tableViewSettingsRef.current = tableViewSettings;
  }, [tableViewSettings]);

  useEffect(() => {
    excelNewRowSeqRef.current = 0;
    excelBaselineRowsInitializedRef.current = { pipe: false, tank: false };
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
  const isAllObjectScope = activeObjectScope === 'all';
  const activeTableObjectType: HeatCalcObjectType = activeObjectScope === 'tank' ? 'tank' : 'pipe';
  const activeTableColumnScope: HeatCalcTableColumnScope = isAllObjectScope ? 'all' : activeTableObjectType;
  const activeTableViewState = isAllObjectScope ? allTableViewState : tableViewStateByType[activeTableObjectType];
  const activeTablePage = tablePageByScope[activeObjectScope];
  const excelModeEnabled = tableEditingMode === 'excel' && !isAllObjectScope;

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

  const { data: persistedTableColumnPreference } = useQuery({
    queryKey: ['preference', HEATCALC_TABLE_COLUMN_PREF_KEY],
    queryFn: () => getUserPreference<HeatCalcTableColumnSettings>(HEATCALC_TABLE_COLUMN_PREF_KEY),
    enabled: isRegisteredUser,
    staleTime: 30_000,
  });

  const { data: persistedTableViewPreference } = useQuery({
    queryKey: ['preference', HEATCALC_TABLE_VIEW_PREF_KEY],
    queryFn: () => getUserPreference<HeatCalcTableViewSettings>(HEATCALC_TABLE_VIEW_PREF_KEY),
    enabled: isRegisteredUser,
    staleTime: 30_000,
  });

  const { data: persistedCalculationDetailsPreference } = useQuery({
    queryKey: ['preference', HEATCALC_CALCULATION_DETAILS_PREF_KEY],
    queryFn: () => getUserPreference<HeatCalcCalculationDetailsSettings>(HEATCALC_CALCULATION_DETAILS_PREF_KEY),
    enabled: isRegisteredUser,
    staleTime: 30_000,
  });

  const { data: persistedFieldInputPreference } = useQuery({
    queryKey: ['preference', HEATCALC_FIELD_INPUT_PREF_KEY],
    queryFn: () => getUserPreference<HeatCalcFieldInputSettings>(HEATCALC_FIELD_INPUT_PREF_KEY),
    enabled: isRegisteredUser,
    staleTime: 30_000,
  });

  const updateTableColumnPreference = useMutation({
    mutationFn: ({ settings }: TableColumnPreferenceMutation) =>
      updateUserPreference<HeatCalcTableColumnSettings>(
        HEATCALC_TABLE_COLUMN_PREF_KEY,
        normalizeTableColumnSettings(settings),
      ),
    onSuccess: (preference, variables) => {
      const normalized = normalizeTableColumnSettings(preference.value);
      setTableColumnSettings(normalized);
      if (preference.user_id) {
        writeRegisteredTableColumnCache(preference.user_id, normalized);
      }
      if (variables.closeModal) setColumnSettingsOpen(false);
      if (variables.showMessage !== false) antdMessage.success('Настройки таблицы сохранены');
    },
    onError: (error) => {
      antdMessage.error(error instanceof Error ? error.message : 'Не удалось сохранить настройки таблицы');
    },
  });

  const updateTableSettingsPreference = useMutation({
    mutationFn: async ({
      columnSettings,
      viewSettings,
      calculationDetailsSettings,
      fieldInputSettings: fieldInputPreferenceSettings,
    }: TableSettingsPreferenceMutation) => {
      const columnPreference = await updateUserPreference<HeatCalcTableColumnSettings>(
        HEATCALC_TABLE_COLUMN_PREF_KEY,
        normalizeTableColumnSettings(columnSettings),
      );
      const viewPreference = viewSettings
        ? await updateUserPreference<HeatCalcTableViewSettings>(
          HEATCALC_TABLE_VIEW_PREF_KEY,
          normalizeTableViewSettings(viewSettings),
        )
        : null;
      const calculationDetailsPreference = calculationDetailsSettings
        ? await updateUserPreference<HeatCalcCalculationDetailsSettings>(
          HEATCALC_CALCULATION_DETAILS_PREF_KEY,
          normalizeCalculationDetailsSettings(calculationDetailsSettings),
        )
        : null;
      const fieldInputPreference = fieldInputPreferenceSettings
        ? await updateUserPreference<HeatCalcFieldInputSettings>(
          HEATCALC_FIELD_INPUT_PREF_KEY,
          normalizeFieldInputSettings(fieldInputPreferenceSettings),
        )
        : null;
      return {
        columnPreference,
        viewPreference,
        calculationDetailsPreference,
        fieldInputPreference,
      };
    },
    onSuccess: ({
      columnPreference,
      viewPreference,
      calculationDetailsPreference,
      fieldInputPreference,
    }) => {
      const normalizedColumns = normalizeTableColumnSettings(columnPreference.value);
      setTableColumnSettings(normalizedColumns);
      if (columnPreference.user_id) {
        writeRegisteredTableColumnCache(columnPreference.user_id, normalizedColumns);
      }
      if (viewPreference) {
        const normalizedView = normalizeTableViewSettings(viewPreference.value);
        tableViewSettingsRef.current = normalizedView;
        setTableViewSettings(normalizedView);
        if (viewPreference.user_id) {
          writeRegisteredTableViewCache(viewPreference.user_id, normalizedView);
        }
      }
      if (calculationDetailsPreference) {
        const normalizedDetails = normalizeCalculationDetailsSettings(calculationDetailsPreference.value);
        setCalculationDetailsSettings(normalizedDetails);
        if (calculationDetailsPreference.user_id) {
          writeRegisteredCalculationDetailsCache(calculationDetailsPreference.user_id, normalizedDetails);
        }
      }
      if (fieldInputPreference) {
        const normalizedFieldInputs = normalizeFieldInputSettings(fieldInputPreference.value);
        setFieldInputSettings(normalizedFieldInputs);
        if (fieldInputPreference.user_id) {
          writeRegisteredFieldInputCache(fieldInputPreference.user_id, normalizedFieldInputs);
        }
      }
      setColumnSettingsOpen(false);
      antdMessage.success('Настройки таблицы сохранены');
    },
    onError: (error) => {
      antdMessage.error(error instanceof Error ? error.message : 'Не удалось сохранить настройки таблицы');
    },
  });

  const updateTableViewPreference = useMutation({
    mutationFn: (settings: HeatCalcTableViewSettings) =>
      updateUserPreference<HeatCalcTableViewSettings>(
        HEATCALC_TABLE_VIEW_PREF_KEY,
        normalizeTableViewSettings(settings),
      ),
    onSuccess: (preference) => {
      const normalizedView = normalizeTableViewSettings(preference.value);
      tableViewSettingsRef.current = normalizedView;
      setTableViewSettings(normalizedView);
      if (preference.user_id) {
        writeRegisteredTableViewCache(preference.user_id, normalizedView);
      }
    },
    onError: (error) => {
      antdMessage.error(error instanceof Error ? error.message : 'Не удалось сохранить настройки отображения');
    },
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
      )),
    [activeTableObjectType, activeTablePage, activeTableViewState, isAllObjectScope, objectQueryCapabilities],
  );
  const objectQueryKey = useMemo(
    () => ['project', project?.id, 'objects', 'query', objectQueryRequest] as const,
    [objectQueryRequest, project?.id],
  );
  const { data: objectQueryResult } = useQuery({
    queryKey: objectQueryKey,
    queryFn: () => queryObjects(project!.id, objectQueryRequest!),
    enabled: !!project && objectQueryRequest != null && !!objectQueryCapabilities,
    placeholderData: (previous) => previous,
  });
  const { data: allProjectObjects = [] } = useQuery({
    queryKey: ['project', project?.id, 'objects', 'query', 'all'],
    queryFn: () => listObjects(project!.id),
    enabled: !!project && isAllObjectScope,
  });
  const insulationLabelByCode = useMemo(
    () => new Map(insulationMaterials.map((m) => [m.material, insulationEntryLabel(m)])),
    [insulationMaterials],
  );
  const insulationLabel = useCallback((material: unknown) => {
    const code = String(material ?? '');
    if (!code) return '—';
    return insulationLabelByCode.get(code) ?? MATERIAL_LABELS[code] ?? code;
  }, [insulationLabelByCode]);

  useEffect(() => {
    if (isRegisteredUser) {
      const registeredTableViewSettings =
        readRegisteredTableViewCache(registeredUserId) ?? getDefaultTableViewSettings();
      setTableColumnSettings(
        readRegisteredTableColumnCache(registeredUserId) ?? getDefaultTableColumnSettings(),
      );
      tableViewSettingsRef.current = registeredTableViewSettings;
      setTableViewSettings(registeredTableViewSettings);
      setCalculationDetailsSettings(
        readRegisteredCalculationDetailsCache(registeredUserId) ?? getDefaultCalculationDetailsSettings(),
      );
      setFieldInputSettings(
        readRegisteredFieldInputCache(registeredUserId) ?? getDefaultFieldInputSettings(),
      );
      return;
    }
    const guestTableViewSettings = readGuestTableViewSettings();
    setTableColumnSettings(readGuestTableColumnSettings());
    tableViewSettingsRef.current = guestTableViewSettings;
    setTableViewSettings(guestTableViewSettings);
    setCalculationDetailsSettings(readGuestCalculationDetailsSettings());
    setFieldInputSettings(readGuestFieldInputSettings());
  }, [isRegisteredUser, registeredUserId]);

  useEffect(() => {
    if (!isRegisteredUser || !persistedTableColumnPreference) return;
    if (persistedTableColumnPreference.value) {
      const normalized = normalizeTableColumnSettings(persistedTableColumnPreference.value);
      setTableColumnSettings(normalized);
      if (persistedTableColumnPreference.user_id) {
        writeRegisteredTableColumnCache(persistedTableColumnPreference.user_id, normalized);
      }
      return;
    }
    clearRegisteredTableColumnCache(registeredUserId ?? persistedTableColumnPreference.user_id);
    setTableColumnSettings(getDefaultTableColumnSettings());
  }, [isRegisteredUser, persistedTableColumnPreference, registeredUserId]);

  useEffect(() => {
    if (!isRegisteredUser || !persistedTableViewPreference) return;
    if (persistedTableViewPreference.value) {
      const normalized = normalizeTableViewSettings(persistedTableViewPreference.value);
      tableViewSettingsRef.current = normalized;
      setTableViewSettings(normalized);
      if (persistedTableViewPreference.user_id) {
        writeRegisteredTableViewCache(persistedTableViewPreference.user_id, normalized);
      }
      return;
    }
    clearRegisteredTableViewCache(registeredUserId ?? persistedTableViewPreference.user_id);
    const defaults = getDefaultTableViewSettings();
    tableViewSettingsRef.current = defaults;
    setTableViewSettings(defaults);
  }, [isRegisteredUser, persistedTableViewPreference, registeredUserId]);

  useEffect(() => {
    if (!isRegisteredUser || !persistedCalculationDetailsPreference) return;
    if (persistedCalculationDetailsPreference.value) {
      const normalized = normalizeCalculationDetailsSettings(persistedCalculationDetailsPreference.value);
      setCalculationDetailsSettings(normalized);
      if (persistedCalculationDetailsPreference.user_id) {
        writeRegisteredCalculationDetailsCache(persistedCalculationDetailsPreference.user_id, normalized);
      }
      return;
    }
    clearRegisteredCalculationDetailsCache(registeredUserId ?? persistedCalculationDetailsPreference.user_id);
    setCalculationDetailsSettings(getDefaultCalculationDetailsSettings());
  }, [isRegisteredUser, persistedCalculationDetailsPreference, registeredUserId]);

  useEffect(() => {
    if (!isRegisteredUser || !persistedFieldInputPreference) return;
    if (persistedFieldInputPreference.value) {
      const normalized = normalizeFieldInputSettings(persistedFieldInputPreference.value);
      setFieldInputSettings(normalized);
      if (persistedFieldInputPreference.user_id) {
        writeRegisteredFieldInputCache(persistedFieldInputPreference.user_id, normalized);
      }
      return;
    }
    clearRegisteredFieldInputCache(registeredUserId ?? persistedFieldInputPreference.user_id);
    setFieldInputSettings(getDefaultFieldInputSettings());
  }, [isRegisteredUser, persistedFieldInputPreference, registeredUserId]);

  const outerDiameterMm = useCallback((record: ProjectObject) => {
    const value = record.object_type === 'pipe'
      ? Number(record.params?.outer_diameter) * 1000
      : Number(record.params?.diameter) * 1000;
    return Number.isFinite(value) ? value : null;
  }, []);

  const dnValue = useCallback((record: ProjectObject) => {
    if (record.object_type !== 'pipe') return '—';
    const diameter = outerDiameterMm(record);
    if (diameter == null) return '—';
    const dn = findDN(diameter);
    return dn != null ? `DN${dn}` : '—';
  }, [outerDiameterMm]);

  useEffect(() => {
    setSelectedRowKeys([]);
    setWizardState((current) => {
      if (activeObjectScope === 'all' || !current || current.type === activeObjectScope) return current;
      return null;
    });
  }, [activeObjectScope]);

  const resetNewWizard = (type: WizardObjectType) => {
    setNewWizardRevision((revision) => revision + 1);
    setWizardState({ type });
  };
  const clearWizard = () => {
    setNewWizardRevision((revision) => revision + 1);
    setWizardState(null);
  };
  const closeWizard = () => {
    if (formBlockVisible) {
      resetNewWizard(wizardState?.type ?? activeTableObjectType);
      return;
    }
    clearWizard();
  };
  const openNewObjectMode = (obj?: ProjectObject) => {
    const type =
      obj?.object_type === 'pipe' || obj?.object_type === 'tank'
        ? obj.object_type
        : wizardState?.type ?? activeTableObjectType;
    if (type !== 'pipe' && type !== 'tank') return;
    if (formBlockVisible) {
      resetNewWizard(type);
      return;
    }
    clearWizard();
  };
  const { add, edit, remove } = useHeatCalcMutations(
    project?.id,
    handleObjectAdded,
    handleObjectEdited,
    closeWizard,
  );

  const heatLossBatchMut = useMutation({
    mutationFn: () => enqueueHeatLossBatchJob(project!.id, true),
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
  const formCaptionMode = wizardState?.editingObject ? 'edit' : wizardState ? 'new' : 'idle';
  const formCaptionModeLabel =
    formCaptionMode === 'edit'
      ? 'Режим: изменение'
      : formCaptionMode === 'new'
        ? 'Режим: добавление'
        : 'Режим: ожидание';
  const hasWizard = !!wizardState;
  const submittingObject = add.isPending || edit.isPending;

  function openAddWizard(type: WizardObjectType = wizardState?.type ?? activeTableObjectType) {
    resetNewWizard(type);
  }

  function handleObjectScopeChange(scope: ActiveObjectScope) {
    setActiveObjectScope(scope);
    setSelectedRowKeys([]);
    setTablePageByScope((current) => ({ ...current, [scope]: 1 }));
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

  const openEditWizard = useCallback((obj: ProjectObject) => {
    // Редактировать можно только те типы, которые умеем: трубы и резервуары.
    // Другие типы (pump/platform/other) пока не имеют форм мастера.
    if (!canOpenObjectWizard(obj)) return;
    if (!excelModeEnabled && isDraftRowDirty(draftRowsById[obj.id])) {
      setPendingWizardObject(obj);
      return;
    }
    setWizardState({ type: obj.object_type, editingObject: obj });
  }, [draftRowsById, excelModeEnabled]);

  function handleWizardSubmit(params: Record<string, unknown>) {
    if (wizardState?.editingObject) {
      const currentState = wizardState;
      const editingObject = currentState.editingObject!;
      const optimisticObject: ProjectObject = {
        ...editingObject,
        params,
      };
      setWizardState({ type: currentState.type, editingObject: optimisticObject });
      if (isExcelNewRowId(editingObject.id)) {
        add.mutate({
          object_type: currentState.type,
          params,
          sort_order: projectObjectCount,
        }, {
          onSuccess: (createdObject) => {
            setExcelLocalRows((current) => current.filter((row) => row.id !== editingObject.id));
            setDraftRowsById((current) => {
              const next = { ...current };
              delete next[editingObject.id];
              return next;
            });
            if (createdObject.object_type === 'pipe' || createdObject.object_type === 'tank') {
              setWizardState({ type: createdObject.object_type, editingObject: createdObject });
            }
          },
        });
        return;
      }
      edit.mutate(
        { objectId: editingObject.id, version: editingObject.version, params },
        {
          onSuccess: () => {
            setDraftRowsById((current) => {
              if (!current[editingObject.id]) return current;
              const next = { ...current };
              delete next[editingObject.id];
              return next;
            });
          },
        },
      );
    } else if (wizardState) {
      add.mutate({
        object_type: wizardState.type,
        params,
        sort_order: projectObjectCount,
      });
    }
  }

  function handleObjectAdded(obj: ProjectObject) {
    setLastSavedObject(obj);
    if (!obj.is_valid && (obj.object_type === 'pipe' || obj.object_type === 'tank')) {
      setWizardState({ type: obj.object_type, editingObject: obj });
      return;
    }
    openNewObjectMode(obj);
  }

  function handleObjectEdited(obj: ProjectObject) {
    setLastSavedObject(obj);
    if (obj.object_type !== 'pipe' && obj.object_type !== 'tank') return;
    setWizardState({ type: obj.object_type, editingObject: obj });
  }

  const selectedRowId = wizardState?.editingObject?.id;
  const selectedObject = wizardState?.editingObject ?? null;
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

  const columnRenderers = useMemo<Record<HeatCalcColumnKey, TableColumnRenderSpec>>(() => ({
    index: {
      render: (_: unknown, __: ProjectObject, idx: number) => idx + 1,
      copyValue: (_record, idx) => String(idx + 1),
    },
    heat_loss_status: {
      align: 'center',
      render: (_: unknown, r: ProjectObject) => {
        const status = heatLossCalcStatus(r);
        if (status === 'calculated') {
          return (
            <Tooltip title="Рассчитан">
              <Tag className="heatloss-status-icon-tag" color="success" aria-label="Рассчитан">
                <CheckCircleFilled />
              </Tag>
            </Tooltip>
          );
        }
        if (status === 'error') {
          return (
            <Tooltip title={heatLossErrorText(r)}>
              <Tag className="heatloss-status-icon-tag" color="error" aria-label="Ошибка">
                <CloseCircleFilled />
              </Tag>
            </Tooltip>
          );
        }
        if (status === 'unsupported') {
          return (
            <Tooltip title={heatLossErrorText(r)}>
              <Tag
                className="heatloss-status-icon-tag"
                color="default"
                aria-label="Не применимо"
              >
                <MinusCircleFilled />
              </Tag>
            </Tooltip>
          );
        }
        return (
          <Tooltip title="Не рассчитан">
            <Tag className="heatloss-status-icon-tag" aria-label="Не рассчитан">—</Tag>
          </Tooltip>
        );
      },
      copyValue: (r) => heatLossStatusLabel(heatLossCalcStatus(r)),
    },
    type: {
      render: (_: unknown, r: ProjectObject) => (r.object_type === 'pipe' ? 'Тр.' : 'Рез.'),
      copyValue: (r) => (r.object_type === 'pipe' ? 'Труба' : 'Резервуар'),
    },
    name: {
      ellipsis: true,
      render: (_: unknown, r: ProjectObject, idx: number) =>
        String(r.params?.name ?? `${OBJECT_TYPE_LABELS[r.object_type]} #${idx + 1}`),
      copyValue: (r, idx) => String(r.params?.name ?? `${OBJECT_TYPE_LABELS[r.object_type]} #${idx + 1}`),
    },
    pipe_outer_diameter: {
      render: (_: unknown, r: ProjectObject) => {
        const diameter = outerDiameterMm(r);
        return diameter != null ? formatNumber(diameter, 0) : '—';
      },
      copyValue: (r) => {
        const diameter = outerDiameterMm(r);
        return diameter != null ? formatNumber(diameter, 0) : '—';
      },
    },
    pipe_dn: {
      render: (_: unknown, r: ProjectObject) => dnValue(r),
      copyValue: (r) => dnValue(r),
    },
    pipe_length: {
      render: (_: unknown, r: ProjectObject) => formatParamNumber(r, 'pipe_length', 1),
      copyValue: (r) => formatParamNumber(r, 'pipe_length', 1),
    },
    pipe_wall_thickness: {
      render: (_: unknown, r: ProjectObject) => formatParamMetersAsMm(r, 'wall_thickness'),
      copyValue: (r) => formatParamMetersAsMm(r, 'wall_thickness'),
    },
    pipe_material: {
      ellipsis: true,
      render: (_: unknown, r: ProjectObject) => formatParamText(r, 'pipe_material'),
      copyValue: (r) => formatParamText(r, 'pipe_material'),
    },
    pipe_lambda: {
      render: (_: unknown, r: ProjectObject) => formatParamNumber(r, 'pipe_lambda', 3),
      copyValue: (r) => formatParamNumber(r, 'pipe_lambda', 3),
    },
    pipe_lambda_mode: {
      render: (_: unknown, r: ProjectObject) => lambdaModeLabel(r.params?.pipe_lambda_mode),
      copyValue: (r) => lambdaModeLabel(r.params?.pipe_lambda_mode),
    },
    placement: {
      render: (_: unknown, r: ProjectObject) => placementLabel(r.params?.placement ?? r.params?.location),
      copyValue: (r) => placementLabel(r.params?.placement ?? r.params?.location),
    },
    insulation_layer_count: {
      render: (_: unknown, r: ProjectObject) => insulationLayerCount(r),
      copyValue: (r) => insulationLayerCount(r),
    },
    insulation_thickness: {
      render: (_: unknown, r: ProjectObject) => formatParamMetersAsMm(r, 'insulation_thickness'),
      copyValue: (r) => formatParamMetersAsMm(r, 'insulation_thickness'),
    },
    insulation_material: {
      ellipsis: true,
      render: (_: unknown, r: ProjectObject) => insulationLabel(r.params?.insulation_material),
      copyValue: (r) => insulationLabel(r.params?.insulation_material),
    },
    first_insulation_lambda: {
      render: (_: unknown, r: ProjectObject) => insulationLayerConductivity(r, 0),
      copyValue: (r) => insulationLayerConductivity(r, 0),
    },
    second_insulation_thickness: {
      render: (_: unknown, r: ProjectObject) => insulationLayerThickness(r, 1),
      copyValue: (r) => insulationLayerThickness(r, 1),
    },
    second_insulation_material: {
      ellipsis: true,
      render: (_: unknown, r: ProjectObject) => insulationLayerMaterial(r, 1, insulationLabel),
      copyValue: (r) => insulationLayerMaterial(r, 1, insulationLabel),
    },
    second_insulation_lambda: {
      render: (_: unknown, r: ProjectObject) => insulationLayerConductivity(r, 1),
      copyValue: (r) => insulationLayerConductivity(r, 1),
    },
    third_insulation_thickness: {
      render: (_: unknown, r: ProjectObject) => insulationLayerThickness(r, 2),
      copyValue: (r) => insulationLayerThickness(r, 2),
    },
    third_insulation_material: {
      ellipsis: true,
      render: (_: unknown, r: ProjectObject) => insulationLayerMaterial(r, 2, insulationLabel),
      copyValue: (r) => insulationLayerMaterial(r, 2, insulationLabel),
    },
    third_insulation_lambda: {
      render: (_: unknown, r: ProjectObject) => insulationLayerConductivity(r, 2),
      copyValue: (r) => insulationLayerConductivity(r, 2),
    },
    insulation_cover_material: {
      ellipsis: true,
      render: (_: unknown, r: ProjectObject) => formatParamText(r, 'insulation_cover_material'),
      copyValue: (r) => formatParamText(r, 'insulation_cover_material'),
    },
    process_temperature: {
      render: (_: unknown, r: ProjectObject) => formatParamNumber(r, 'process_temperature', 0),
      copyValue: (r) => formatParamNumber(r, 'process_temperature', 0),
    },
    ambient_temperature: {
      render: (_: unknown, r: ProjectObject) => formatParamNumber(r, 'ambient_temperature', 0),
      copyValue: (r) => formatParamNumber(r, 'ambient_temperature', 0),
    },
    ambient_temperature_source: {
      render: (_: unknown, r: ProjectObject) => sourceText(r.params?.ambient_temperature_source),
      copyValue: (r) => sourceText(r.params?.ambient_temperature_source),
    },
    max_ambient_temperature: {
      render: (_: unknown, r: ProjectObject) => formatParamNumber(r, 'max_ambient_temperature', 0),
      copyValue: (r) => formatParamNumber(r, 'max_ambient_temperature', 0),
    },
    max_process_temperature: {
      render: (_: unknown, r: ProjectObject) => formatParamNumber(r, 'max_process_temperature', 0),
      copyValue: (r) => formatParamNumber(r, 'max_process_temperature', 0),
    },
    wind_speed: {
      render: (_: unknown, r: ProjectObject) => formatParamNumber(r, 'wind_speed', 1),
      copyValue: (r) => formatParamNumber(r, 'wind_speed', 1),
    },
    wind_speed_source: {
      render: (_: unknown, r: ProjectObject) => sourceText(r.params?.wind_speed_source),
      copyValue: (r) => sourceText(r.params?.wind_speed_source),
    },
    alpha_vnesh: {
      render: (_: unknown, r: ProjectObject) => formatParamNumber(r, 'alpha_vnesh', 1),
      copyValue: (r) => formatParamNumber(r, 'alpha_vnesh', 1),
    },
    environment: {
      render: (_: unknown, r: ProjectObject) => environmentLabel(r.params?.environment),
      copyValue: (r) => environmentLabel(r.params?.environment),
    },
    zone_classification: {
      render: (_: unknown, r: ProjectObject) => zoneLabel(r.params?.zone_classification),
      copyValue: (r) => zoneLabel(r.params?.zone_classification),
    },
    temperature_group: {
      render: (_: unknown, r: ProjectObject) => formatParamText(r, 'temperature_group'),
      copyValue: (r) => formatParamText(r, 'temperature_group'),
    },
    climate_city: {
      ellipsis: true,
      render: (_: unknown, r: ProjectObject) => formatParamText(r, 'climate_city'),
      copyValue: (r) => formatParamText(r, 'climate_city'),
    },
    climate_region: {
      ellipsis: true,
      render: (_: unknown, r: ProjectObject) => formatParamText(r, 'climate_region'),
      copyValue: (r) => formatParamText(r, 'climate_region'),
    },
    climate_key: {
      ellipsis: true,
      render: (_: unknown, r: ProjectObject) => formatParamText(r, 'climate_key'),
      copyValue: (r) => formatParamText(r, 'climate_key'),
    },
    climate_temperature_basis: {
      render: (_: unknown, r: ProjectObject) => climateBasisLabel(r.params?.climate_temperature_basis),
      copyValue: (r) => climateBasisLabel(r.params?.climate_temperature_basis),
    },
    insulation_temperature_basis: {
      render: (_: unknown, r: ProjectObject) => insulationTemperatureBasisLabel(r.params?.insulation_temperature_basis),
      copyValue: (r) => insulationTemperatureBasisLabel(r.params?.insulation_temperature_basis),
    },
    burial_depth: {
      render: (_: unknown, r: ProjectObject) => formatParamNumber(r, 'burial_depth', 2),
      copyValue: (r) => formatParamNumber(r, 'burial_depth', 2),
    },
    ground_type: {
      ellipsis: true,
      render: (_: unknown, r: ProjectObject) => formatParamText(r, 'ground_type'),
      copyValue: (r) => formatParamText(r, 'ground_type'),
    },
    ground_conductivity: {
      render: (_: unknown, r: ProjectObject) => formatParamNumber(r, 'ground_conductivity', 2),
      copyValue: (r) => formatParamNumber(r, 'ground_conductivity', 2),
    },
    min_switch_temperature: {
      render: (_: unknown, r: ProjectObject) => formatParamNumber(r, 'min_switch_temperature', 0),
      copyValue: (r) => formatParamNumber(r, 'min_switch_temperature', 0),
    },
    supply_voltage: {
      render: (_: unknown, r: ProjectObject) => formatParamNumber(r, 'supply_voltage', 0),
      copyValue: (r) => formatParamNumber(r, 'supply_voltage', 0),
    },
    safety_factor: {
      render: (_: unknown, r: ProjectObject) => formatParamNumber(r, 'safety_factor', 2),
      copyValue: (r) => formatParamNumber(r, 'safety_factor', 2),
    },
    steam_tracing: {
      render: (_: unknown, r: ProjectObject) => booleanChoiceLabel(r.params?.steam_tracing),
      copyValue: (r) => booleanChoiceLabel(r.params?.steam_tracing),
    },
    vapor_temperature: {
      render: (_: unknown, r: ProjectObject) => formatParamNumber(r, 'vapor_temperature', 0),
      copyValue: (r) => formatParamNumber(r, 'vapor_temperature', 0),
    },
    valve_count: {
      render: (_: unknown, r: ProjectObject) => countParamValue(r, 'valve_count'),
      copyValue: (r) => countParamValue(r, 'valve_count'),
    },
    flange_count: {
      render: (_: unknown, r: ProjectObject) => countParamValue(r, 'flange_count'),
      copyValue: (r) => countParamValue(r, 'flange_count'),
    },
    support_count: {
      render: (_: unknown, r: ProjectObject) => countParamValue(r, 'support_count'),
      copyValue: (r) => countParamValue(r, 'support_count'),
    },
    local_element_equiv_length: {
      render: (_: unknown, r: ProjectObject) => formatParamNumber(r, 'local_element_equiv_length', 1),
      copyValue: (r) => formatParamNumber(r, 'local_element_equiv_length', 1),
    },
    tank_shape: {
      render: (_: unknown, r: ProjectObject) => tankShapeLabel(r.params?.shape),
      copyValue: (r) => tankShapeLabel(r.params?.shape),
    },
    tank_dimensions: {
      ellipsis: true,
      render: (_: unknown, r: ProjectObject) => tankDimensions(r),
      copyValue: (r) => tankDimensions(r),
    },
    tank_diameter: {
      render: (_: unknown, r: ProjectObject) => mmParam(r, 'diameter'),
      copyValue: (r) => mmParam(r, 'diameter'),
    },
    tank_height: {
      render: (_: unknown, r: ProjectObject) => mmParam(r, 'height'),
      copyValue: (r) => mmParam(r, 'height'),
    },
    tank_length: {
      render: (_: unknown, r: ProjectObject) => mmParam(r, 'length'),
      copyValue: (r) => mmParam(r, 'length'),
    },
    tank_width: {
      render: (_: unknown, r: ProjectObject) => mmParam(r, 'width'),
      copyValue: (r) => mmParam(r, 'width'),
    },
    tank_wall_thickness: {
      render: (_: unknown, r: ProjectObject) => formatParamMetersAsMm(r, 'wall_thickness'),
      copyValue: (r) => formatParamMetersAsMm(r, 'wall_thickness'),
    },
    tank_wall_lambda: {
      render: (_: unknown, r: ProjectObject) => formatParamNumber(r, 'wall_lambda', 3),
      copyValue: (r) => formatParamNumber(r, 'wall_lambda', 3),
    },
    q_additional: {
      render: (_: unknown, r: ProjectObject) => formatResultOrParamNumber(r, 'q_additional', 0),
      copyValue: (r) => formatResultOrParamNumber(r, 'q_additional', 0),
    },
    heat_loss_per_meter: {
      render: (_: unknown, r: ProjectObject) => formatResultNumber(r, 'heat_loss_per_meter', 1),
      copyValue: (r) => formatResultNumber(r, 'heat_loss_per_meter', 1),
    },
    heat_loss_per_m2: {
      render: (_: unknown, r: ProjectObject) => formatResultNumber(r, 'heat_loss_per_m2', 1),
      copyValue: (r) => formatResultNumber(r, 'heat_loss_per_m2', 1),
    },
    total_heat_loss: {
      render: (_: unknown, r: ProjectObject) => formatResultNumber(r, 'total_heat_loss', 0),
      copyValue: (r) => formatResultNumber(r, 'total_heat_loss', 0),
    },
    delta_t: {
      render: (_: unknown, r: ProjectObject) => formatDeltaTemperature(r, 0),
      copyValue: (r) => formatDeltaTemperature(r, 0),
    },
    applied_alpha_vnesh: {
      render: (_: unknown, r: ProjectObject) => formatResultNumber(r, 'alpha_vnesh', 1),
      copyValue: (r) => formatResultNumber(r, 'alpha_vnesh', 1),
    },
    applied_safety_factor: {
      render: (_: unknown, r: ProjectObject) => formatResultNumber(r, 'safety_factor', 2),
      copyValue: (r) => formatResultNumber(r, 'safety_factor', 2),
    },
    thermal_resistance: {
      render: (_: unknown, r: ProjectObject) => formatResultNumber(r, 'thermal_resistance', 4),
      copyValue: (r) => formatResultNumber(r, 'thermal_resistance', 4),
    },
    wall_resistance: {
      render: (_: unknown, r: ProjectObject) => formatResultNumber(r, 'wall_resistance', 4),
      copyValue: (r) => formatResultNumber(r, 'wall_resistance', 4),
    },
    insulation_resistance: {
      render: (_: unknown, r: ProjectObject) => formatResultNumber(r, 'insulation_resistance', 4),
      copyValue: (r) => formatResultNumber(r, 'insulation_resistance', 4),
    },
    external_resistance: {
      render: (_: unknown, r: ProjectObject) => formatResultNumber(r, 'external_resistance', 4),
      copyValue: (r) => formatResultNumber(r, 'external_resistance', 4),
    },
    ground_resistance: {
      render: (_: unknown, r: ProjectObject) => formatResultNumber(r, 'ground_resistance', 4),
      copyValue: (r) => formatResultNumber(r, 'ground_resistance', 4),
    },
    effective_length: {
      render: (_: unknown, r: ProjectObject) => formatResultNumber(r, 'effective_length', 1),
      copyValue: (r) => formatResultNumber(r, 'effective_length', 1),
    },
    surface_area: {
      render: (_: unknown, r: ProjectObject) => formatResultNumber(r, 'surface_area', 1),
      copyValue: (r) => formatResultNumber(r, 'surface_area', 1),
    },
    air_surface_area: {
      render: (_: unknown, r: ProjectObject) => formatResultNumber(r, 'air_surface_area', 1),
      copyValue: (r) => formatResultNumber(r, 'air_surface_area', 1),
    },
    ground_surface_area: {
      render: (_: unknown, r: ProjectObject) => formatResultNumber(r, 'ground_surface_area', 1),
      copyValue: (r) => formatResultNumber(r, 'ground_surface_area', 1),
    },
  }), [dnValue, insulationLabel, outerDiameterMm]);

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
  const activeExcelLocalRows = useMemo(
    () => excelLocalRows.filter((row) => row.object_type === activeTableObjectType),
    [activeTableObjectType, excelLocalRows],
  );
  const createExcelLocalRows = useCallback((count: number): ProjectObject[] => {
    const now = new Date().toISOString();
    return Array.from({ length: Math.max(0, count) }, () => {
      const seq = excelNewRowSeqRef.current;
      excelNewRowSeqRef.current += 1;
      return {
        id: `${EXCEL_NEW_ROW_PREFIX}${activeTableObjectType}:${seq}`,
        project_id: project?.id ?? '',
        object_type: activeTableObjectType,
        sort_order: projectObjectCount + seq,
        version: 0,
        params: {},
        results: null,
        is_valid: false,
        validation_errors: null,
        created_at: now,
        updated_at: now,
      };
    });
  }, [activeTableObjectType, project?.id, projectObjectCount]);
  const appendExcelLocalRows = useCallback((count: number) => {
    const rows = createExcelLocalRows(count);
    if (rows.length > 0) setExcelLocalRows((current) => [...current, ...rows]);
    return rows;
  }, [createExcelLocalRows]);

  useEffect(() => {
    if (!excelModeEnabled) return;
    if (excelBaselineRowsInitializedRef.current[activeTableObjectType]) return;
    excelBaselineRowsInitializedRef.current = {
      ...excelBaselineRowsInitializedRef.current,
      [activeTableObjectType]: true,
    };
    if (activeExcelLocalRows.length === 0) appendExcelLocalRows(5);
  }, [activeExcelLocalRows.length, activeTableObjectType, appendExcelLocalRows, excelModeEnabled]);

  const allTableOffset = isAllObjectScope ? (activeTablePage - 1) * DEFAULT_OBJECT_QUERY_PAGE_SIZE : 0;
  const visibleAllTableRows = useMemo(
    () => allFilteredSortedTableRows.slice(allTableOffset, allTableOffset + DEFAULT_OBJECT_QUERY_PAGE_SIZE),
    [allFilteredSortedTableRows, allTableOffset],
  );
  const baseVisibleTableObjects = useMemo(
    () => (isAllObjectScope
      ? visibleAllTableRows.map(({ record }) => record)
      : objectQueryResult?.items ?? []),
    [isAllObjectScope, objectQueryResult, visibleAllTableRows],
  );
  const visibleTableObjects = useMemo(
    () => (excelModeEnabled
      ? [...baseVisibleTableObjects, ...activeExcelLocalRows]
      : baseVisibleTableObjects),
    [activeExcelLocalRows, baseVisibleTableObjects, excelModeEnabled],
  );
  const visibleTableRows = useMemo(
    () => (isAllObjectScope
      ? visibleAllTableRows
      : visibleTableObjects.map((record, index) => ({
          record,
          sourceIndex: (objectQueryResult?.page_info.offset ?? 0) + index,
        }))),
    [isAllObjectScope, objectQueryResult, visibleAllTableRows, visibleTableObjects],
  );
  const wizardBaseObject = useMemo(() => {
    const editingObject = wizardState?.editingObject;
    if (!editingObject) return null;
    return visibleTableObjects.find((object) => object.id === editingObject.id)
      ?? allProjectObjects.find((object) => object.id === editingObject.id)
      ?? editingObject;
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

      const next = { ...current };
      if (
        isDraftRowEmpty(nextRow)
        || (isExcelNewRowId(wizardBaseObject.id)
          && isExcelDraftRowBlank(nextRow)
          && Object.keys(nextRow.errors).length === 0)
      ) {
        delete next[wizardBaseObject.id];
      } else {
        next[wizardBaseObject.id] = nextRow;
      }
      return next;
    });
  }, [wizardBaseObject]);
  const selectedVisibleRows = useMemo(
    () => visibleTableRows.filter(({ record }) => selectedRowKeys.includes(record.id)),
    [selectedRowKeys, visibleTableRows],
  );
  const selectedExcelRowIndex = useMemo(() => {
    if (!selectedExcelCell) return null;
    const rowIndex = visibleTableObjects.findIndex((object) => object.id === selectedExcelCell.objectId);
    return rowIndex >= 0 ? rowIndex : null;
  }, [selectedExcelCell, visibleTableObjects]);
  const selectedExcelRows = useMemo(() => {
    if (!excelModeEnabled) return [];
    const indexes = getExcelSelectedRowIndexes(
      excelSelectionRange,
      selectedExcelRowIndex == null ? null : { rowIndex: selectedExcelRowIndex, columnIndex: 0 },
      visibleTableRows.length,
    );
    return indexes
      .map((index) => visibleTableRows[index])
      .filter((row): row is HeatCalcIndexedTableRow<ProjectObject> => row != null);
  }, [excelModeEnabled, excelSelectionRange, selectedExcelRowIndex, visibleTableRows]);
  const tableDeleteRows = excelModeEnabled ? selectedExcelRows : selectedVisibleRows;
  const selectedObjectCount = selectedVisibleRows.length;
  const deleteTargetCount = tableDeleteRows.length;
  const currentTableViewActive = hasActiveTableViewState(activeTableViewState);
  const activeTypeTotalCount = isAllObjectScope
    ? projectObjectCount
    : objectQueryResult?.counts.by_type[activeTableObjectType] ?? totalCount;
  const filteredTableCount = isAllObjectScope
    ? allFilteredSortedTableRows.length
    : (objectQueryResult?.counts.filtered ?? baseVisibleTableObjects.length) +
      (excelModeEnabled ? activeExcelLocalRows.length : 0);
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
  const isSavableDraftRow = useCallback((row: DraftRowState | undefined) => (
    isDraftRowDirty(row)
    && !(row && isExcelNewRowId(row.objectId) && isExcelDraftRowBlank(row))
  ), []);
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
  const heatLossRecalcTooltip = dirtyDraftRowCount > 0
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

    setSelectedRowKeys([]);
    setTablePageByScope((current) => ({ ...current, [targetScope]: targetPage }));
    setPendingTableFocusObject(lastCreatedObject);
    openEditWizard(lastCreatedObject);
  }, [
    activeObjectScope,
    activeTypeTotalCount,
    add,
    allFilteredSortedTableRows.length,
    objectQueryResult?.counts.filtered,
    objectQueryResult?.page_info.page_size,
    openEditWizard,
    projectObjectCount,
    selectedVisibleRows,
  ]);

  const removeSelectedObjects = useCallback(() => {
    const localIds = new Set(
      tableDeleteRows
        .map(({ record }) => record.id)
        .filter(isExcelNewRowId),
    );
    if (localIds.size > 0) {
      setExcelLocalRows((current) => current.filter((row) => !localIds.has(row.id)));
      setDraftRowsById((current) => {
        const next = { ...current };
        localIds.forEach((id) => {
          delete next[id];
        });
        return next;
      });
    }

    const persistedRows = tableDeleteRows.filter(({ record }) => !isExcelNewRowId(record.id));
    persistedRows.forEach(({ record }) => {
      remove.mutate(record.id);
    });

    if (excelModeEnabled) {
      setSelectedExcelCell(null);
      setExcelSelectionRange(null);
      setActiveInlineCell(null);
    }
    setSelectedRowKeys([]);
    if (localIds.size > 0 && persistedRows.length === 0) {
      antdMessage.success(localIds.size > 1 ? 'Строки удалены' : 'Строка удалена');
    }
  }, [excelModeEnabled, remove, tableDeleteRows]);

  const updateObjectInCurrentQuery = useCallback((savedObject: ProjectObject) => {
    queryClient.setQueryData<ProjectObjectsQueryResponse | undefined>(objectQueryKey, (current) => {
      if (!current) return current;
      return {
        ...current,
        items: current.items.map((item) => (item.id === savedObject.id ? savedObject : item)),
      };
    });
  }, [objectQueryKey, queryClient]);

  const discardDraftRows = useCallback((rowIds?: string[]) => {
    setActiveInlineCell(null);
    setDraftRowsById((current) => {
      const ids = rowIds ?? Object.keys(current);
      const next = { ...current };
      ids.forEach((id) => {
        delete next[id];
      });
      return next;
    });
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
            sort_order: projectObjectCount + index,
          })
          : await updateObject(project.id, row.objectId, {
            version: row.baseVersion,
            params,
          });
        saved.push(savedObject);
        savedDraftIds.add(row.objectId);
        if (!isNewRow) updateObjectInCurrentQuery(savedObject);
      } catch (error) {
        if (error instanceof DraftRowValidationError) {
          failedValidation[row.objectId] = error.errors;
        } else {
          failed[row.objectId] = error instanceof Error ? error.message : 'Не удалось сохранить строку';
        }
      }
    }));

    if (savedDraftIds.size > 0) {
      setExcelLocalRows((current) => current.filter((row) => !savedDraftIds.has(row.id)));
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
  }, [draftRowsById, isSavableDraftRow, project, projectObjectCount, queryClient, updateObjectInCurrentQuery]);

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
      const next = { ...current };
      if (
        isDraftRowEmpty(nextRow)
        || (isExcelNewRowId(record.id)
          && isExcelDraftRowBlank(nextRow)
          && Object.keys(nextRow.errors).length === 0)
      ) {
        delete next[record.id];
      } else {
        next[record.id] = nextRow;
      }
      return next;
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
      if (canOpenObjectWizard(record)) {
        setWizardState({ type: record.object_type, editingObject: record });
      }
    }
    setActiveInlineCell({ objectId: record.id, columnKey });
  }, [excelModeEnabled, tableCellEditingEnabled]);

  const editableExcelColumnKeys = useMemo(
    () => (!isAllObjectScope
      ? sourceColumnMetas
        .filter((meta) => getInlineEditFieldConfig(activeTableObjectType, meta.key))
        .map((meta) => meta.key)
      : []),
    [activeTableObjectType, isAllObjectScope, sourceColumnMetas],
  );
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

  const selectedExcelPosition = useMemo<ExcelCellPosition | null>(() => {
    if (!selectedExcelCell) return null;
    const rowIndex = visibleTableObjects.findIndex((object) => object.id === selectedExcelCell.objectId);
    const columnIndex = editableExcelColumnKeys.indexOf(selectedExcelCell.columnKey);
    return rowIndex >= 0 && columnIndex >= 0 ? { rowIndex, columnIndex } : null;
  }, [editableExcelColumnKeys, selectedExcelCell, visibleTableObjects]);

  const selectExcelCellByPosition = useCallback((
    rowIndex: number,
    editableColumnIndex: number,
    extend = false,
  ) => {
    if (!excelModeEnabled || visibleTableObjects.length === 0 || editableExcelColumnKeys.length === 0) return;
    const nextRowIndex = Math.min(Math.max(rowIndex, 0), visibleTableObjects.length - 1);
    const nextColumnIndex = Math.min(Math.max(editableColumnIndex, 0), editableExcelColumnKeys.length - 1);
    const record = visibleTableObjects[nextRowIndex];
    const columnKey = editableExcelColumnKeys[nextColumnIndex];
    if (!record || !columnKey) return;
    const focus = { rowIndex: nextRowIndex, columnIndex: nextColumnIndex };
    setSelectedExcelCell({ objectId: record.id, columnKey });
    if (canOpenObjectWizard(record)) {
      setWizardState({ type: record.object_type, editingObject: record });
    }
    setExcelSelectionRange((current) => (
      extend && current
        ? { anchor: current.anchor, focus }
        : createExcelSelectionRange(focus)
    ));
    setActiveInlineCell(null);
  }, [editableExcelColumnKeys, excelModeEnabled, visibleTableObjects]);

  const setExcelRangeSelection = useCallback((
    anchor: ExcelCellPosition,
    focus: ExcelCellPosition,
    active: ExcelCellPosition = focus,
  ) => {
    if (!excelModeEnabled || visibleTableObjects.length === 0 || editableExcelColumnKeys.length === 0) return;
    const activeRowIndex = Math.min(Math.max(active.rowIndex, 0), visibleTableObjects.length - 1);
    const activeColumnIndex = Math.min(Math.max(active.columnIndex, 0), editableExcelColumnKeys.length - 1);
    const record = visibleTableObjects[activeRowIndex];
    const columnKey = editableExcelColumnKeys[activeColumnIndex];
    if (!record || !columnKey) return;
    setSelectedExcelCell({ objectId: record.id, columnKey });
    if (canOpenObjectWizard(record)) {
      setWizardState({ type: record.object_type, editingObject: record });
    }
    setExcelSelectionRange(createExcelSelectionRange(anchor, focus));
    setActiveInlineCell(null);
  }, [editableExcelColumnKeys, excelModeEnabled, visibleTableObjects]);

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

  const focusExcelTableError = useCallback((item: ExcelTableErrorItem) => {
    if (!excelModeEnabled || editableExcelColumnKeys.length === 0) return;
    const columnKey = item.messages.find((message) => message.columnKey)?.columnKey;
    const columnIndex = columnKey ? editableExcelColumnKeys.indexOf(columnKey) : -1;
    const safeRowIndex = Math.min(Math.max(item.rowIndex, 0), visibleTableObjects.length - 1);
    const record = visibleTableObjects[safeRowIndex];
    if (!record) return;
    if (columnIndex >= 0) {
      selectExcelCellByPosition(safeRowIndex, columnIndex);
    } else {
      setExcelRangeSelection(
        { rowIndex: safeRowIndex, columnIndex: 0 },
        { rowIndex: safeRowIndex, columnIndex: editableExcelColumnKeys.length - 1 },
        { rowIndex: safeRowIndex, columnIndex: 0 },
      );
    }
    window.setTimeout(() => scrollTableRowIntoView(record.id), 0);
  }, [
    editableExcelColumnKeys,
    excelModeEnabled,
    selectExcelCellByPosition,
    setExcelRangeSelection,
    visibleTableObjects,
  ]);

  const moveExcelSelection = useCallback((
    rowDelta: number,
    columnDelta: number,
    wrap = false,
    extend = false,
  ) => {
    if (!excelModeEnabled || !selectedExcelPosition) return;
    let nextRowIndex = selectedExcelPosition.rowIndex + rowDelta;
    let nextColumnIndex = selectedExcelPosition.columnIndex + columnDelta;
    if (wrap) {
      if (nextColumnIndex >= editableExcelColumnKeys.length) {
        nextColumnIndex = 0;
        nextRowIndex += 1;
      } else if (nextColumnIndex < 0) {
        nextColumnIndex = editableExcelColumnKeys.length - 1;
        nextRowIndex -= 1;
      }
    }
    selectExcelCellByPosition(nextRowIndex, nextColumnIndex, extend);
  }, [
    editableExcelColumnKeys.length,
    excelModeEnabled,
    selectedExcelPosition,
    selectExcelCellByPosition,
  ]);

  const selectAllExcelCells = useCallback(() => {
    if (!excelModeEnabled || visibleTableObjects.length === 0 || editableExcelColumnKeys.length === 0) return;
    setExcelRangeSelection(
      { rowIndex: 0, columnIndex: 0 },
      { rowIndex: visibleTableObjects.length - 1, columnIndex: editableExcelColumnKeys.length - 1 },
      { rowIndex: 0, columnIndex: 0 },
    );
  }, [editableExcelColumnKeys.length, excelModeEnabled, setExcelRangeSelection, visibleTableObjects.length]);

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

  const applyExcelPaste = useCallback((text: string) => {
    const origin = getExcelSelectionOrigin(excelSelectionRange, selectedExcelPosition);
    if (!excelModeEnabled || !origin) return;
    const rows = parseSpreadsheetText(text);
    if (rows.length === 0) return;
    const startRowIndex = origin.rowIndex;
    const startColumnIndex = origin.columnIndex;
    if (startRowIndex < 0 || startColumnIndex < 0) return;
    const appendedRows = appendExcelLocalRows(
      missingExcelRowsForPaste(startRowIndex, rows.length, visibleTableObjects.length),
    );
    const targetObjects = appendedRows.length > 0
      ? [...visibleTableObjects, ...appendedRows]
      : visibleTableObjects;

    const affectedIds = new Set<string>();
    let changedCells = 0;
    let skippedCells = 0;
    let invalidCells = 0;

    let nextDraftRows: DraftRowsById = { ...draftRowsById };
    rows.forEach((row, rowOffset) => {
      const record = targetObjects[startRowIndex + rowOffset];
      if (!record) {
        skippedCells += row.length;
        return;
      }
      row.forEach((rawValue, columnOffset) => {
        const meta = sourceColumnMetas[startColumnIndex + columnOffset];
        if (!meta) {
          skippedCells += 1;
          return;
        }
        if (record.object_type !== 'pipe' && record.object_type !== 'tank') {
          skippedCells += 1;
          return;
        }
        const config = getInlineEditFieldConfig(record.object_type, meta.key);
        if (!config) {
          skippedCells += 1;
          return;
        }
        const parsed = parseExcelCellValue(config, rawValue);
        const draftRow = applyInlineCellDraft(nextDraftRows[record.id] ?? null, record, meta.key, parsed.value);
        if (!draftRow) {
          skippedCells += 1;
          return;
        }
        const rowWithPasteError = parsed.error
          ? {
            ...draftRow,
            errors: {
              ...draftRow.errors,
              [config.fieldId]: parsed.error,
            },
          }
          : draftRow;
        if (Object.keys(rowWithPasteError.errors).length > 0) invalidCells += 1;
        if (
          isDraftRowEmpty(rowWithPasteError)
          || (isExcelNewRowId(record.id)
            && isExcelDraftRowBlank(rowWithPasteError)
            && Object.keys(rowWithPasteError.errors).length === 0)
        ) {
          const rest = { ...nextDraftRows };
          delete rest[record.id];
          nextDraftRows = rest;
        } else {
          nextDraftRows = {
            ...nextDraftRows,
            [record.id]: rowWithPasteError,
          };
          affectedIds.add(record.id);
        }
        changedCells += 1;
      });
    });
    setDraftRowsById(nextDraftRows);

    const summary = `Вставлено ячеек: ${changedCells}` +
      `${skippedCells > 0 ? `, пропущено: ${skippedCells}` : ''}`;
    if (invalidCells > 0) {
      antdMessage.error(`${summary}. Исправьте ошибки перед сохранением.`);
      return;
    }
    if (affectedIds.size > 0) {
      antdMessage.success(`${summary}. Сохраните изменения кнопкой «Сохранить».`);
    }
  }, [
    appendExcelLocalRows,
    draftRowsById,
    excelModeEnabled,
    excelSelectionRange,
    selectedExcelPosition,
    sourceColumnMetas,
    visibleTableObjects,
  ]);

  useEffect(() => {
    if (isAllObjectScope) {
      setAllTableViewState((current) => {
        const cleaned = removeHiddenTableViewState(current, visibleTableColumnKeys);
        if (
          cleaned.sort === current.sort
          && Object.keys(cleaned.filters).length === Object.keys(current.filters).length
        ) {
          return current;
        }
        return cleaned;
      });
      return;
    }
    setTableViewStateByType((current) => {
      const cleaned = removeHiddenTableViewState(current[activeTableObjectType], visibleTableColumnKeys);
      if (
        cleaned.sort === current[activeTableObjectType].sort
        && Object.keys(cleaned.filters).length === Object.keys(current[activeTableObjectType].filters).length
      ) {
        return current;
      }
      return { ...current, [activeTableObjectType]: cleaned };
    });
  }, [activeTableObjectType, isAllObjectScope, visibleTableColumnKeys]);

  useEffect(() => {
    const visibleIds = new Set(visibleTableObjects.map((object) => object.id));
    setSelectedRowKeys((keys) => {
      const nextKeys = keys.filter((key) => visibleIds.has(key));
      return nextKeys.length === keys.length && nextKeys.every((key, index) => key === keys[index])
        ? keys
        : nextKeys;
    });
  }, [visibleTableObjects]);

  useEffect(() => {
    if (!pendingTableFocusObject) return;
    const pendingObjectType: HeatCalcObjectType = pendingTableFocusObject.object_type === 'tank' ? 'tank' : 'pipe';
    if (activeObjectScope !== 'all' && pendingObjectType !== activeTableObjectType) {
      setActiveObjectScope(pendingObjectType);
      return;
    }
    if (!visibleTableObjects.some((object) => object.id === pendingTableFocusObject.id)) return;
    scrollTableRowIntoView(pendingTableFocusObject.id);
    setPendingTableFocusObject(null);
  }, [activeObjectScope, activeTableObjectType, pendingTableFocusObject, visibleTableObjects]);

  useEffect(() => {
    if (tableCellEditingEnabled || dirtyDraftRowCount > 0) return;
    setActiveInlineCell(null);
    setSelectedExcelCell(null);
    setExcelSelectionRange(null);
  }, [dirtyDraftRowCount, tableCellEditingEnabled]);

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
      setLastSavedObject(null);
      return;
    }
    if (!currentTableViewActive) {
      setLastSavedObject(null);
      return;
    }
    if (!visibleTableObjects.some((object) => object.id === lastSavedObject.id)) {
      antdMessage.info('Объект сохранён, но скрыт текущими фильтрами');
    }
    setLastSavedObject(null);
  }, [activeTableObjectType, currentTableViewActive, isAllObjectScope, lastSavedObject, visibleTableObjects]);

  const setColumnFilter = useCallback((columnKey: HeatCalcColumnKey, filter?: HeatCalcColumnFilter) => {
    setTablePageByScope((current) => ({ ...current, [activeObjectScope]: 1 }));
    if (isAllObjectScope) {
      setAllTableViewState((current) => {
        const nextFilters = { ...current.filters };
        if (filter && isColumnFilterActive(filter)) {
          nextFilters[columnKey] = filter;
        } else {
          delete nextFilters[columnKey];
        }
        return {
          ...current,
          filters: nextFilters,
        };
      });
      return;
    }
    setTableViewStateByType((current) => {
      const nextFilters = { ...current[activeTableObjectType].filters };
      if (filter && isColumnFilterActive(filter)) {
        nextFilters[columnKey] = filter;
      } else {
        delete nextFilters[columnKey];
      }
      return {
        ...current,
        [activeTableObjectType]: {
          ...current[activeTableObjectType],
          filters: nextFilters,
        },
      };
    });
  }, [activeObjectScope, activeTableObjectType, isAllObjectScope]);

  const resetColumnFilter = useCallback((columnKey: HeatCalcColumnKey) => {
    setColumnFilter(columnKey, undefined);
  }, [setColumnFilter]);

  const resetCurrentTableViewState = useCallback(() => {
    setTablePageByScope((current) => ({ ...current, [activeObjectScope]: 1 }));
    if (isAllObjectScope) {
      setAllTableViewState(createEmptyTableViewState());
      return;
    }
    setTableViewStateByType((current) => ({
      ...current,
      [activeTableObjectType]: createEmptyTableViewState(),
    }));
  }, [activeObjectScope, activeTableObjectType, isAllObjectScope]);

  const handleSourceTableChange = useCallback<NonNullable<TableProps<ProjectObject>['onChange']>>((pagination, _filters, sorter, extra) => {
    const nextPage = extra.action === 'sort' ? 1 : pagination.current ?? 1;
    setTablePageByScope((current) => ({ ...current, [activeObjectScope]: nextPage }));
    const nextSorter = Array.isArray(sorter)
      ? sorter.find((item) => item.order)
      : sorter;
    const columnKey = typeof nextSorter?.columnKey === 'string' ? nextSorter.columnKey : null;
    const order = nextSorter?.order;
    if (isAllObjectScope) {
      setAllTableViewState((current) => ({
        ...current,
        sort: columnKey && order
          ? { columnKey, direction: order === 'ascend' ? 'asc' : 'desc' }
          : undefined,
      }));
      return;
    }
    setTableViewStateByType((current) => ({
      ...current,
      [activeTableObjectType]: {
        ...current[activeTableObjectType],
        sort: columnKey && order
          ? { columnKey, direction: order === 'ascend' ? 'asc' : 'desc' }
          : undefined,
      },
    }));
  }, [activeObjectScope, activeTableObjectType, isAllObjectScope]);

  const persistTableColumnSettings = useCallback((
    settings: HeatCalcTableColumnSettings,
    options: { closeModal?: boolean; showMessage?: boolean } = {},
  ) => {
    const normalized = normalizeTableColumnSettings(settings);
    setTableColumnSettings(normalized);
    if (isRegisteredUser) {
      clearRegisteredTableColumnCache(registeredUserId);
      updateTableColumnPreference.mutate({
        settings: normalized,
        closeModal: options.closeModal,
        showMessage: options.showMessage,
      });
      return;
    }
    writeGuestTableColumnSettings(normalized);
    if (options.closeModal) setColumnSettingsOpen(false);
    if (options.showMessage !== false) antdMessage.success('Настройки таблицы сохранены');
  }, [isRegisteredUser, registeredUserId, updateTableColumnPreference]);

  const persistTableSettings = useCallback((
    columnSettings: HeatCalcTableColumnSettings,
    viewSettings: HeatCalcTableViewSettings,
    calculationDetails: HeatCalcCalculationDetailsSettings,
    fieldInputs: HeatCalcFieldInputSettings,
  ) => {
    const normalizedColumns = normalizeTableColumnSettings(columnSettings);
    const normalizedView = normalizeTableViewSettings(viewSettings);
    const normalizedDetails = normalizeCalculationDetailsSettings(calculationDetails);
    const normalizedFieldInputs = normalizeFieldInputSettings(fieldInputs);
    const currentView = normalizeTableViewSettings(tableViewSettings);
    const currentDetails = normalizeCalculationDetailsSettings(calculationDetailsSettings);
    const currentFieldInputs = normalizeFieldInputSettings(fieldInputSettings);
    const viewChanged = normalizedView.fontSize !== currentView.fontSize
      || normalizedView.tableLabelFormat !== currentView.tableLabelFormat
      || normalizedView.settingsLabelFormat !== currentView.settingsLabelFormat
      || normalizedView.inlineEditingEnabled !== currentView.inlineEditingEnabled
      || normalizedView.formPlacement !== currentView.formPlacement
      || normalizedView.sideFormWidthPct !== currentView.sideFormWidthPct
      || !areFormSectionWeightsEqual(normalizedView.formSectionWeights, currentView.formSectionWeights);
    const detailsChanged = normalizedDetails.preset !== currentDetails.preset
      || normalizedDetails.visibleMetrics.length !== currentDetails.visibleMetrics.length
      || normalizedDetails.visibleMetrics.some((metric) => !currentDetails.visibleMetrics.includes(metric));
    const fieldInputsChanged = !areFieldInputSettingsEqual(normalizedFieldInputs, currentFieldInputs);
    setTableColumnSettings(normalizedColumns);
    tableViewSettingsRef.current = normalizedView;
    setTableViewSettings(normalizedView);
    setCalculationDetailsSettings(normalizedDetails);
    setFieldInputSettings(normalizedFieldInputs);
    if (!normalizedView.inlineEditingEnabled) setActiveInlineCell(null);
    if (isRegisteredUser) {
      clearRegisteredTableColumnCache(registeredUserId);
      if (viewChanged) clearRegisteredTableViewCache(registeredUserId);
      if (detailsChanged) clearRegisteredCalculationDetailsCache(registeredUserId);
      if (fieldInputsChanged) clearRegisteredFieldInputCache(registeredUserId);
      updateTableSettingsPreference.mutate({
        columnSettings: normalizedColumns,
        viewSettings: viewChanged ? normalizedView : undefined,
        calculationDetailsSettings: detailsChanged ? normalizedDetails : undefined,
        fieldInputSettings: fieldInputsChanged ? normalizedFieldInputs : undefined,
      });
      return;
    }
    writeGuestTableColumnSettings(normalizedColumns);
    if (viewChanged) {
      if (isDefaultTableViewSettings(normalizedView)) {
        clearGuestTableViewSettings();
      } else {
        writeGuestTableViewSettings(normalizedView);
      }
    }
    if (detailsChanged) {
      if (isDefaultCalculationDetailsSettings(normalizedDetails)) {
        clearGuestCalculationDetailsSettings();
      } else {
        writeGuestCalculationDetailsSettings(normalizedDetails);
      }
    }
    if (fieldInputsChanged) {
      if (isDefaultFieldInputSettings(normalizedFieldInputs)) {
        clearGuestFieldInputSettings();
      } else {
        writeGuestFieldInputSettings(normalizedFieldInputs);
      }
    }
    setColumnSettingsOpen(false);
    antdMessage.success('Настройки таблицы сохранены');
  }, [
    calculationDetailsSettings,
    fieldInputSettings,
    isRegisteredUser,
    registeredUserId,
    tableViewSettings,
    updateTableSettingsPreference,
  ]);

  const persistTableViewOnly = useCallback((viewSettings: HeatCalcTableViewSettings) => {
    const normalizedView = normalizeTableViewSettings(viewSettings);
    tableViewSettingsRef.current = normalizedView;
    setTableViewSettings(normalizedView);
    if (isRegisteredUser) {
      clearRegisteredTableViewCache(registeredUserId);
      updateTableViewPreference.mutate(normalizedView);
      return;
    }
    if (isDefaultTableViewSettings(normalizedView)) {
      clearGuestTableViewSettings();
    } else {
      writeGuestTableViewSettings(normalizedView);
    }
  }, [isRegisteredUser, registeredUserId, updateTableViewPreference]);

  const applySideFormWidthPct = useCallback((widthPct: number) => {
    const normalizedView = normalizeTableViewSettings({
      ...tableViewSettingsRef.current,
      sideFormWidthPct: widthPct,
    });
    tableViewSettingsRef.current = normalizedView;
    setTableViewSettings(normalizedView);
    return normalizedView;
  }, []);

  const applyFormSectionWeights = useCallback((formSectionWeights: HeatCalcFormSectionWeights) => {
    const normalizedView = normalizeTableViewSettings({
      ...tableViewSettingsRef.current,
      formSectionWeights: normalizeFormSectionWeights(formSectionWeights),
    });
    tableViewSettingsRef.current = normalizedView;
    setTableViewSettings(normalizedView);
    return normalizedView;
  }, []);

  const commitFormSectionWeights = useCallback((formSectionWeights: HeatCalcFormSectionWeights) => {
    const normalizedView = applyFormSectionWeights(formSectionWeights);
    persistTableViewOnly(normalizedView);
  }, [applyFormSectionWeights, persistTableViewOnly]);

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

  const startColumnResize = useCallback((
    type: HeatCalcTableColumnScope,
    meta: HeatCalcResolvedColumnMeta,
    event: ReactPointerEvent<HTMLButtonElement>,
  ) => {
    event.preventDefault();
    event.stopPropagation();
    const startX = event.clientX;
    const startWidth = meta.width;
    let latestWidthPct = meta.widthPct;
    let frameId: number | null = null;

    function flushDraftWidth() {
      frameId = null;
      setTableColumnSettings((settings) => setTableColumnWidthPct(settings, type, meta.key, latestWidthPct));
    }

    function handlePointerMove(pointerEvent: PointerEvent) {
      const nextWidthPx = Math.max(30, startWidth + pointerEvent.clientX - startX);
      latestWidthPct = tableColumnWidthPxToPct(nextWidthPx);
      if (frameId == null) {
        frameId = window.requestAnimationFrame(flushDraftWidth);
      }
    }

    function handlePointerUp() {
      window.removeEventListener('pointermove', handlePointerMove);
      window.removeEventListener('pointerup', handlePointerUp);
      if (frameId != null) {
        window.cancelAnimationFrame(frameId);
        frameId = null;
      }
      applyColumnWidth(type, meta.key, latestWidthPct);
    }

    window.addEventListener('pointermove', handlePointerMove);
    window.addEventListener('pointerup', handlePointerUp);
  }, [applyColumnWidth]);

  const beginExcelCellSelection = useCallback((
    rowIndex: number,
    columnIndex: number,
    event: ReactPointerEvent<HTMLElement>,
  ) => {
    if (!excelModeEnabled) return;
    const now = Date.now();
    const previous = lastExcelCellPointerDownRef.current;
    const repeatedCellClick = !!previous
      && previous.rowIndex === rowIndex
      && previous.columnIndex === columnIndex
      && now - previous.at < 450;
    lastExcelCellPointerDownRef.current = { rowIndex, columnIndex, at: now };
    excelSelectionDragRef.current = {
      mode: 'cells',
      anchor: event.shiftKey && excelSelectionRange ? excelSelectionRange.anchor : { rowIndex, columnIndex },
    };
    selectExcelCellByPosition(rowIndex, columnIndex, event.shiftKey);
    if (repeatedCellClick) {
      const record = visibleTableObjects[rowIndex];
      const columnKey = editableExcelColumnKeys[columnIndex];
      if (record && columnKey) setActiveInlineCell({ objectId: record.id, columnKey });
    }
  }, [
    editableExcelColumnKeys,
    excelModeEnabled,
    excelSelectionRange,
    selectExcelCellByPosition,
    visibleTableObjects,
  ]);

  const extendExcelCellSelection = useCallback((rowIndex: number, columnIndex: number) => {
    const drag = excelSelectionDragRef.current;
    if (!excelModeEnabled || !drag || drag.mode !== 'cells') return;
    setExcelRangeSelection(drag.anchor, { rowIndex, columnIndex }, { rowIndex, columnIndex });
  }, [excelModeEnabled, setExcelRangeSelection]);

  const beginExcelRowSelection = useCallback((rowIndex: number, event: ReactPointerEvent<HTMLElement>) => {
    if (!excelModeEnabled || editableExcelColumnKeys.length === 0) return;
    const anchor = event.shiftKey && excelSelectionRange
      ? { rowIndex: excelSelectionRange.anchor.rowIndex, columnIndex: 0 }
      : { rowIndex, columnIndex: 0 };
    excelSelectionDragRef.current = { mode: 'rows', anchor };
    setExcelRangeSelection(
      anchor,
      { rowIndex, columnIndex: editableExcelColumnKeys.length - 1 },
      { rowIndex, columnIndex: 0 },
    );
  }, [editableExcelColumnKeys.length, excelModeEnabled, excelSelectionRange, setExcelRangeSelection]);

  const extendExcelRowSelection = useCallback((rowIndex: number) => {
    const drag = excelSelectionDragRef.current;
    if (!excelModeEnabled || !drag || drag.mode !== 'rows' || editableExcelColumnKeys.length === 0) return;
    setExcelRangeSelection(
      drag.anchor,
      { rowIndex, columnIndex: editableExcelColumnKeys.length - 1 },
      { rowIndex, columnIndex: 0 },
    );
  }, [editableExcelColumnKeys.length, excelModeEnabled, setExcelRangeSelection]);

  const beginExcelColumnSelection = useCallback((columnIndex: number, event: ReactPointerEvent<HTMLElement>) => {
    if (!excelModeEnabled || visibleTableObjects.length === 0) return;
    const anchor = event.shiftKey && excelSelectionRange
      ? { rowIndex: 0, columnIndex: excelSelectionRange.anchor.columnIndex }
      : { rowIndex: 0, columnIndex };
    excelSelectionDragRef.current = { mode: 'columns', anchor };
    setExcelRangeSelection(
      anchor,
      { rowIndex: visibleTableObjects.length - 1, columnIndex },
      { rowIndex: 0, columnIndex },
    );
  }, [excelModeEnabled, excelSelectionRange, setExcelRangeSelection, visibleTableObjects.length]);

  const extendExcelColumnSelection = useCallback((columnIndex: number) => {
    const drag = excelSelectionDragRef.current;
    if (!excelModeEnabled || !drag || drag.mode !== 'columns' || visibleTableObjects.length === 0) return;
    setExcelRangeSelection(
      drag.anchor,
      { rowIndex: visibleTableObjects.length - 1, columnIndex },
      { rowIndex: 0, columnIndex },
    );
  }, [excelModeEnabled, setExcelRangeSelection, visibleTableObjects.length]);

  const sourceColumns: ColumnsType<ProjectObject> = useMemo(
    () => sourceColumnMetas.map((meta, columnIndex) => {
      const renderer = columnRenderers[meta.key];
      const capability = fieldCapabilityByKey.get(meta.key);
      const filterEnabled = !excelModeEnabled
        && meta.filterable !== false
        && (isAllObjectScope || (capability?.filter.enabled ?? true));
      const sortEnabled = !excelModeEnabled
        && meta.sortable !== false
        && (isAllObjectScope || (capability?.sort.enabled ?? true));
      const filterKind = filterKindForColumn(meta.key, capability);
      const activeFilter = activeTableViewState.filters[meta.key];
      const normalizedExcelRange = excelSelectionRange ? normalizeExcelSelectionRange(excelSelectionRange) : null;
      const columnSelected = !!normalizedExcelRange
        && columnIndex >= normalizedExcelRange.left
        && columnIndex <= normalizedExcelRange.right;
      return {
        key: meta.key,
        title: (
          <ResizableColumnTitle
            title={meta.title}
            label={meta.label}
            onResizeStart={(event) => startColumnResize(activeTableColumnScope, meta, event)}
            selectable={excelModeEnabled}
            selected={columnSelected}
            selectionActive={selectedExcelPosition?.columnIndex === columnIndex}
            onSelectionPointerDown={(event) => beginExcelColumnSelection(columnIndex, event)}
            onSelectionPointerEnter={() => extendExcelColumnSelection(columnIndex)}
          />
        ),
        columnKey: meta.key,
        width: meta.width,
        ellipsis: meta.ellipsis ?? renderer.ellipsis,
        align: renderer.align,
        render: (value: unknown, record: ProjectObject, index: number) => {
          if (isAllObjectScope && !isColumnApplicableToObjectType(meta.key, record.object_type)) {
            return <Text type="secondary">{INAPPLICABLE_TABLE_VALUE}</Text>;
          }
          const draftRow = draftRowsById[record.id];
          const config = !isAllObjectScope && tableCellEditingEnabled && (record.object_type === 'pipe' || record.object_type === 'tank')
            ? getInlineEditFieldConfig(record.object_type, meta.key)
            : null;
          const content = config && excelModeEnabled
            ? excelCellDisplayValue(record, meta.key, draftRow)
            : (() => {
              const displayRecord = buildDraftDisplayRecord(draftRow, record);
              return renderer.render?.(value, displayRecord, index) as ReactNode;
            })();
          if (!config) return content;
          return (
            <EditableTableCell
              active={activeInlineCell?.objectId === record.id && activeInlineCell.columnKey === meta.key}
              selected={isExcelCellInRange(excelSelectionRange, index, columnIndex)}
              selectionActive={isExcelCellActive(selectedExcelPosition, index, columnIndex)}
              excelMode={excelModeEnabled}
              dirty={isSavableDraftRow(draftRow) && Object.prototype.hasOwnProperty.call(draftRow?.dirtyFields ?? {}, config.fieldId)}
              error={draftRow?.errors[config.fieldId]}
              field={config.field}
              step={resolveHeatCalcFieldStep(config.objectType, config.fieldId, fieldInputSettings)}
              value={getInlineCellFormValue(record, meta.key, draftRow)}
              onSelect={() => selectExcelCellByPosition(index, columnIndex)}
              onSelectionPointerDown={(event) => beginExcelCellSelection(index, columnIndex, event)}
              onSelectionPointerEnter={() => extendExcelCellSelection(index, columnIndex)}
              onStartEdit={() => startInlineCellEdit(record, meta.key)}
              onCommit={(nextValue) => commitInlineCell(record, meta.key, nextValue)}
              onCancel={() => setActiveInlineCell(null)}
            >
              {content}
            </EditableTableCell>
          );
        },
        sorter: sortEnabled,
        sortOrder: sortEnabled && activeTableViewState.sort?.columnKey === meta.key
          ? activeTableViewState.sort.direction === 'asc'
            ? 'ascend'
            : 'descend'
          : null,
        showSorterTooltip: false,
        filtered: isColumnFilterActive(activeFilter),
        filterIcon: filterEnabled ? () => (
          <span
            role="button"
            aria-label={`Фильтр ${meta.label}`}
            className="table-filter-trigger"
            style={{ pointerEvents: 'auto' }}
          >
            <FilterFilled
              className={isColumnFilterActive(activeFilter) ? 'table-filter-icon active' : 'table-filter-icon'}
            />
          </span>
        ) : undefined,
        filterDropdown: filterEnabled ? ({ close }) => (
          <ColumnFilterDropdown
            title={meta.label}
            kind={filterKind}
            filter={activeFilter}
            enumOptions={enumOptionsByColumn[meta.key] ?? []}
            onApply={(filter) => setColumnFilter(meta.key, filter)}
            onReset={() => resetColumnFilter(meta.key)}
            onClose={close}
          />
        ) : undefined,
        onCell: !isAllObjectScope && tableCellEditingEnabled && getInlineEditFieldConfig(activeTableObjectType, meta.key)
          ? () => ({ className: 'editable-cell-host editable-cell-enabled' })
          : undefined,
      };
    }),
    [
      activeInlineCell,
      activeTableColumnScope,
      activeTableViewState,
      activeTableObjectType,
      beginExcelCellSelection,
      beginExcelColumnSelection,
      columnRenderers,
      commitInlineCell,
      draftRowsById,
      enumOptionsByColumn,
      excelCellDisplayValue,
      excelSelectionRange,
      extendExcelCellSelection,
      extendExcelColumnSelection,
      fieldCapabilityByKey,
      fieldInputSettings,
      excelModeEnabled,
      isSavableDraftRow,
      isAllObjectScope,
      resetColumnFilter,
      selectExcelCellByPosition,
      selectedExcelPosition,
      setColumnFilter,
      sourceColumnMetas,
      startInlineCellEdit,
      startColumnResize,
      tableCellEditingEnabled,
    ],
  );
  const excelRowHeaderColumn = useMemo<ColumnType<ProjectObject> | null>(() => {
    if (!excelModeEnabled) return null;
    const normalizedExcelRange = excelSelectionRange ? normalizeExcelSelectionRange(excelSelectionRange) : null;
    return {
      key: '__excel_row_header__',
      title: (
        <button
          type="button"
          className={[
            'excel-row-header-button',
            normalizedExcelRange
              && normalizedExcelRange.top === 0
              && normalizedExcelRange.bottom === Math.max(visibleTableObjects.length - 1, 0)
              ? 'selected'
              : null,
          ].filter(Boolean).join(' ')}
          aria-label="Выделить все заполняемые ячейки"
          onClick={(event) => {
            event.preventDefault();
            event.stopPropagation();
            selectAllExcelCells();
          }}
        >
          ↖
        </button>
      ),
      width: 42,
      className: 'excel-row-header-cell',
      render: (_: unknown, _record: ProjectObject, index: number) => {
        const sourceIndex = visibleTableRows[index]?.sourceIndex ?? index;
        const record = visibleTableRows[index]?.record;
        const draftRow = record ? draftRowsById[record.id] : undefined;
        const rowDirty = isSavableDraftRow(draftRow);
        const draftErrorCount = Object.keys(draftRow?.errors ?? {}).length;
        const rowHasError = draftErrorCount > 0 || (record ? heatLossCalcStatus(record) === 'error' : false);
        const rowSelected = !!normalizedExcelRange
          && index >= normalizedExcelRange.top
          && index <= normalizedExcelRange.bottom;
        const rowTitleParts = [`Строка ${sourceIndex + 1}`];
        if (rowHasError) rowTitleParts.push('есть ошибки');
        if (rowDirty) rowTitleParts.push('есть несохранённые изменения');
        return (
          <button
            type="button"
            className={[
              'excel-row-header-button',
              rowSelected ? 'selected' : null,
              selectedExcelPosition?.rowIndex === index ? 'active-selection' : null,
              rowDirty ? 'dirty' : null,
              rowHasError ? 'has-error' : null,
            ].filter(Boolean).join(' ')}
            aria-label={`Выделить строку ${sourceIndex + 1}`}
            title={rowTitleParts.join(' · ')}
            onPointerDown={(event) => {
              event.preventDefault();
              event.stopPropagation();
              beginExcelRowSelection(index, event);
            }}
            onPointerEnter={() => extendExcelRowSelection(index)}
            onClick={(event) => {
              event.preventDefault();
              event.stopPropagation();
            }}
          >
            {sourceIndex + 1}
          </button>
        );
      },
    };
  }, [
    beginExcelRowSelection,
    draftRowsById,
    excelModeEnabled,
    excelSelectionRange,
    extendExcelRowSelection,
    isSavableDraftRow,
    selectAllExcelCells,
    selectedExcelPosition,
    visibleTableObjects.length,
    visibleTableRows,
  ]);
  const tableColumns: ColumnsType<ProjectObject> = useMemo(
    () => (excelModeEnabled && excelRowHeaderColumn
      ? [excelRowHeaderColumn, ...sourceColumns]
      : sourceColumns),
    [excelModeEnabled, excelRowHeaderColumn, sourceColumns],
  );
  const tableScrollX = useMemo(
    () => Math.max(640, sourceColumnMetas.reduce(
      (sum, column) => sum + column.width,
      excelModeEnabled ? 42 : 36,
    )),
    [excelModeEnabled, sourceColumnMetas],
  );
  const tableScrollY = formPlacement === 'left' || formPlacement === 'right'
    ? 'max(320px, calc(100vh - 190px))'
    : 'max(320px, calc(100vh - 430px))';

  useEffect(() => {
    if (tableEditingMode !== 'excel' || activeObjectScope !== 'all') return;
    setTableEditingMode('normal');
    setSelectedExcelCell(null);
    setExcelSelectionRange(null);
    setActiveInlineCell(null);
  }, [activeObjectScope, tableEditingMode]);

  useEffect(() => {
    if (!selectedExcelCell) return;
    if (
      !visibleTableObjects.some((object) => object.id === selectedExcelCell.objectId)
      || !editableExcelColumnKeys.includes(selectedExcelCell.columnKey)
    ) {
      setSelectedExcelCell(null);
      setExcelSelectionRange(null);
      setActiveInlineCell(null);
    }
  }, [editableExcelColumnKeys, selectedExcelCell, visibleTableObjects]);

  useEffect(() => {
    function clearExcelSelectionDrag() {
      excelSelectionDragRef.current = null;
    }

    window.addEventListener('pointerup', clearExcelSelectionDrag);
    window.addEventListener('pointercancel', clearExcelSelectionDrag);
    return () => {
      window.removeEventListener('pointerup', clearExcelSelectionDrag);
      window.removeEventListener('pointercancel', clearExcelSelectionDrag);
    };
  }, []);

  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      if (!excelModeEnabled || !selectedExcelPosition) return;
      const active = document.activeElement;
      if (active instanceof HTMLInputElement || active instanceof HTMLTextAreaElement) return;

      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'a') {
        e.preventDefault();
        selectAllExcelCells();
        return;
      }

      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'c') {
        e.preventDefault();
        const range = excelSelectionRange ?? createExcelSelectionRange(selectedExcelPosition);
        const tsv = buildExcelSelectionTsv(range, (rowIndex, columnIndex) => {
          const row = visibleTableRows[rowIndex];
          const meta = sourceColumnMetas[columnIndex];
          if (!row || !meta) return '';
          const draftRow = draftRowsById[row.record.id];
          return excelCellDisplayValue(row.record, meta.key, draftRow);
        });
        copyToClipboard(tsv).then(() => {
          antdMessage.success('Скопировано');
        });
        return;
      }

      if (e.key === 'Enter') {
        e.preventDefault();
        const record = visibleTableObjects[selectedExcelPosition.rowIndex];
        const columnKey = editableExcelColumnKeys[selectedExcelPosition.columnIndex];
        if (record && columnKey) startInlineCellEdit(record, columnKey);
        return;
      }

      if (e.key === 'Escape') {
        e.preventDefault();
        setActiveInlineCell(null);
        setExcelSelectionRange(createExcelSelectionRange(selectedExcelPosition));
        return;
      }

      if (e.key === 'Tab') {
        e.preventDefault();
        moveExcelSelection(0, e.shiftKey ? -1 : 1, true, false);
        return;
      }

      if (e.key === 'ArrowRight') {
        e.preventDefault();
        moveExcelSelection(0, 1, false, e.shiftKey);
      } else if (e.key === 'ArrowLeft') {
        e.preventDefault();
        moveExcelSelection(0, -1, false, e.shiftKey);
      } else if (e.key === 'ArrowDown') {
        e.preventDefault();
        moveExcelSelection(1, 0, false, e.shiftKey);
      } else if (e.key === 'ArrowUp') {
        e.preventDefault();
        moveExcelSelection(-1, 0, false, e.shiftKey);
      }
    }

    function handlePaste(e: ClipboardEvent) {
      if (!excelModeEnabled || !selectedExcelPosition) return;
      const active = document.activeElement;
      if (active instanceof HTMLInputElement || active instanceof HTMLTextAreaElement) return;
      const text = e.clipboardData?.getData('text/plain') ?? '';
      if (!text) return;
      e.preventDefault();
      applyExcelPaste(text);
    }

    document.addEventListener('keydown', handleKeyDown);
    document.addEventListener('paste', handlePaste);
    return () => {
      document.removeEventListener('keydown', handleKeyDown);
      document.removeEventListener('paste', handlePaste);
    };
  }, [
    applyExcelPaste,
    draftRowsById,
    editableExcelColumnKeys,
    excelCellDisplayValue,
    excelSelectionRange,
    excelModeEnabled,
    moveExcelSelection,
    selectAllExcelCells,
    selectedExcelPosition,
    sourceColumnMetas,
    startInlineCellEdit,
    visibleTableObjects,
    visibleTableRows,
  ]);

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
      setActiveObjectScope('pipe');
      antdMessage.info('Excel-режим включён для таблицы трубопроводов');
    }
    setTableEditingMode(nextMode);
    if (nextMode === 'excel') setSelectedRowKeys([]);
    setActiveInlineCell(null);
    setSelectedExcelCell(null);
    setExcelSelectionRange(null);
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
    setTableViewStateByType((current) => {
      let changed = false;
      const next = { ...current };
      (['pipe', 'tank'] as const).forEach((type) => {
        const visibleKeys = getVisibleTableColumnMetas(type, normalized).map((column) => column.key);
        const cleaned = removeHiddenTableViewState(current[type], visibleKeys);
        const currentFilterCount = Object.keys(current[type].filters).length;
        const cleanedFilterCount = Object.keys(cleaned.filters).length;
        if (cleaned.sort !== current[type].sort || cleanedFilterCount !== currentFilterCount) {
          next[type] = cleaned;
          changed = true;
        }
      });
      return changed ? next : current;
    });
    setAllTableViewState((current) => {
      const visibleKeys = getVisibleTableColumnMetas('all', normalized).map((column) => column.key);
      const cleaned = removeHiddenTableViewState(current, visibleKeys);
      const currentFilterCount = Object.keys(current.filters).length;
      const cleanedFilterCount = Object.keys(cleaned.filters).length;
      return cleaned.sort !== current.sort || cleanedFilterCount !== currentFilterCount ? cleaned : current;
    });
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
                submitting={add.isPending || edit.isPending}
                initialParams={wizardFormObject?.params}
                initialFormValues={excelModeEnabled && wizardBaseObject
                  ? draftRowsById[wizardBaseObject.id]?.draftFormValues
                  : undefined}
                validationErrors={wizardFormObject?.validation_errors}
                fieldErrors={excelModeEnabled ? wizardDraftFieldErrors : undefined}
                fieldInputSettings={fieldInputSettings}
                formSectionWeights={tableViewSettings.formSectionWeights}
                sectionResizeEnabled={formPlacement === 'top' || formPlacement === 'bottom'}
                onFormSectionWeightsChange={applyFormSectionWeights}
                onFormSectionWeightsCommit={commitFormSectionWeights}
                onDraftValuesChange={excelModeEnabled ? handleWizardDraftValuesChange : undefined}
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
              <Button
                type="primary"
                className="action-add-button"
                icon={<PlusOutlined />}
                aria-label="Добавить"
                onClick={() => openAddWizard()}
              >
                Добавить
              </Button>

              <Tooltip title={toolbarSaveTooltip}>
                <span className="action-tooltip-wrap">
                  <Button
                    className="action-save-button save"
                    icon={<SaveOutlined />}
                    aria-label="Сохранить"
                    disabled={toolbarSaveDisabled}
                    loading={toolbarSaveLoading}
                    onClick={handleToolbarSave}
                  >
                    Сохранить
                  </Button>
                </span>
              </Tooltip>
              <Popconfirm
                title={deleteTargetCount > 1 ? `Удалить выбранные строки: ${deleteTargetCount}?` : 'Удалить выбранную строку?'}
                okText="Удалить"
                cancelText="Отмена"
                disabled={deleteTargetCount === 0}
                onConfirm={removeSelectedObjects}
              >
                <Button
                  danger
                  className="action-secondary-button"
                  icon={<DeleteOutlined />}
                  aria-label="Удалить выбранные"
                  loading={remove.isPending}
                  disabled={deleteTargetCount === 0}
                >
                  Удалить
                </Button>
              </Popconfirm>
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
            {excelModeEnabled ? (
              <Tooltip title="Расчётные, служебные и readonly-колонки временно скрыты. Настройки таблицы не меняются.">
                <Typography.Text className="excel-mode-hint" type="secondary">
                  Только заполняемые поля
                </Typography.Text>
              </Tooltip>
            ) : null}
            {excelModeEnabled ? (
              <>
                <Button
                  size="small"
                  className="action-secondary-button"
                  icon={<PlusOutlined />}
                  aria-label="Добавить строку в Excel-режиме"
                  onClick={() => appendExcelLocalRows(1)}
                >
                  Строка
                </Button>
                <Button
                  size="small"
                  className="action-secondary-button"
                  icon={<PlusOutlined />}
                  aria-label="Добавить 10 строк в Excel-режиме"
                  onClick={() => appendExcelLocalRows(10)}
                >
                  10 строк
                </Button>
              </>
            ) : null}
            <Tooltip title={heatLossRecalcTooltip}>
              <span className="action-tooltip-wrap">
                <Button
                  className="action-secondary-button"
                  icon={<ReloadOutlined />}
                  aria-label="Пересчитать теплопотери"
                  loading={heatLossBatchMut.isPending || isHeatLossJobActive}
                  disabled={heatLossRecalcDisabled || heatLossBatchMut.isPending}
                  onClick={() => heatLossBatchMut.mutate()}
                >
                  Пересчитать теплопотери
                </Button>
              </span>
            </Tooltip>
            {isHeatLossJobActive && activeHeatLossJobId && (
              <Button
                danger
                className="action-secondary-button"
                icon={<StopOutlined />}
                aria-label="Отменить пересчёт теплопотерь"
                loading={cancelHeatLossJobMut.isPending}
                onClick={() => cancelHeatLossJobMut.mutate()}
              >
                Отменить
              </Button>
            )}
            <Button
              className="action-secondary-button"
              icon={<TableOutlined />}
              aria-label="Настройки отображения"
              onClick={openColumnSettings}
            >
              Настройки отображения
            </Button>
            <Tooltip title={currentTableViewActive ? 'Сбросить фильтры и сортировку' : 'Фильтры не активны'}>
              <span className="action-tooltip-wrap">
                <Button
                  className="action-secondary-button"
                  icon={<CloseCircleOutlined />}
                  aria-label="Сбросить фильтры таблицы"
                  disabled={!currentTableViewActive}
                  onClick={resetCurrentTableViewState}
                >
                  Сбросить фильтры
                </Button>
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
                  className="action-secondary-button"
                  icon={<CopyOutlined />}
                  aria-label="Добавить копии выбранных"
                  disabled={selectedObjectCount === 0 || add.isPending}
                  loading={add.isPending}
                  onClick={duplicateSelectedObjects}
                >
                  Добавить копии выбранных
                </Button>
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

  function renderExcelErrorsPanel() {
    if (!excelModeEnabled || excelTableErrors.length === 0) return null;
    return (
      <div className="excel-errors-panel" role="status" aria-label="Ошибки в Excel-таблице">
        <div className="excel-errors-panel-header">
          <Text strong>Ошибки в таблице</Text>
          <Tag color="error">{excelTableErrors.length}</Tag>
        </div>
        <div className="excel-errors-list">
          {excelTableErrors.slice(0, 6).map((item) => {
            const visibleMessages = item.messages.slice(0, 3);
            const hiddenCount = Math.max(0, item.messages.length - visibleMessages.length);
            return (
              <button
                key={item.rowId}
                type="button"
                className="excel-errors-row"
                onClick={() => focusExcelTableError(item)}
              >
                <span className="excel-errors-row-title">
                  Строка {item.rowNumber}
                  {item.objectName ? `: ${item.objectName}` : ''}
                </span>
                <span className="excel-errors-row-message">
                  {visibleMessages.map((message) => message.text).join('; ')}
                  {hiddenCount > 0 ? `; ещё ${hiddenCount}` : ''}
                </span>
              </button>
            );
          })}
          {excelTableErrors.length > 6 ? (
            <Text type="secondary" className="excel-errors-more">
              Ещё строк с ошибками: {excelTableErrors.length - 6}
            </Text>
          ) : null}
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
            {renderExcelErrorsPanel()}

            <Card size="small" className="workspace-table-card srs-table-wrap">
          <Table<ProjectObject>
            className={`calc-spreadsheet calc-spreadsheet--${resolvedTableFontSize.key}${excelModeEnabled ? ' calc-spreadsheet--excel-mode' : ''}`}
            rowKey="id"
            size="small"
            pagination={{
              current: isAllObjectScope ? activeTablePage : objectQueryResult?.page_info.page ?? activeTablePage,
              pageSize: isAllObjectScope ? DEFAULT_OBJECT_QUERY_PAGE_SIZE : objectQueryResult?.page_info.page_size ?? DEFAULT_OBJECT_QUERY_PAGE_SIZE,
              total: filteredTableCount,
              showSizeChanger: false,
              hideOnSinglePage: true,
              size: 'small',
            }}
            dataSource={visibleTableObjects}
            columns={tableColumns}
            onChange={handleSourceTableChange}
            scroll={{
              x: tableScrollX,
              y: tableScrollY,
            }}
            rowSelection={excelModeEnabled ? undefined : {
              type: 'checkbox',
              selectedRowKeys,
              onChange: (keys) => setSelectedRowKeys(keys as string[]),
              columnWidth: 36,
            }}
            rowClassName={(r) => {
              const classes = [];
              if (heatLossCalcStatus(r) === 'error') classes.push('row-invalid');
              if (r.id === selectedRowId) classes.push('row-selected');
              if (excelModeEnabled && Object.keys(draftRowsById[r.id]?.errors ?? {}).length > 0) {
                classes.push('row-excel-error');
              }
              if (isSavableDraftRow(draftRowsById[r.id])) {
                classes.push(excelModeEnabled ? 'row-excel-dirty' : 'row-dirty');
              }
              if (isExcelNewRowId(r.id)) classes.push('row-excel-new');
              return classes.join(' ');
            }}
            onRow={(record) => ({
              onClick: (e) => {
                // Ignore clicks on checkbox cell
                if ((e.target as HTMLElement).closest('.ant-table-selection-column')) return;
                if (excelModeEnabled) return;
                openEditWizard(record);
              },
            })}
            locale={{
              emptyText: (
                currentTableViewActive && activeTypeTotalCount > 0 ? (
                  <div className="table-filter-empty">
                    <Text type="secondary">Нет строк по текущим фильтрам</Text>
                    <Button size="small" onClick={resetCurrentTableViewState}>
                      Сбросить фильтры
                    </Button>
                  </div>
                ) : (
                  <Text type="secondary">
                    {activeObjectScope === 'all'
                      ? 'Объекты не добавлены. Нажмите «+» или импортируйте XLSX/CSV.'
                      : activeObjectScope === 'pipe'
                        ? 'Трубопроводы не добавлены. Нажмите «+» или импортируйте XLSX/CSV.'
                        : 'Резервуары не добавлены. Нажмите «+» или импортируйте XLSX/CSV.'}
                  </Text>
                )
              ),
            }}
            />
          </Card>
        </div>
        {formPlacement === 'right' && renderSideResizeHandle()}
        {formPlacement === 'right' && formPanel}
      </div>
      {formPlacement === 'bottom' && formPanel}
      </Space>

      {columnSettingsOpen && (
        <Suspense fallback={null}>
          <ColumnSettingsModal
            open={columnSettingsOpen}
            activeType={columnSettingsType}
            draftColumnSettings={draftTableColumnSettings}
            draftViewSettings={draftTableViewSettings}
            draftCalculationDetailsSettings={draftCalculationDetailsSettings}
            draftFieldInputSettings={draftFieldInputSettings}
            confirmLoading={
              updateTableColumnPreference.isPending
              || updateTableSettingsPreference.isPending
              || updateTableViewPreference.isPending
            }
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
              setWizardState({ type: objectType, editingObject: target });
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
                setWizardState({ type: objectType, editingObject: savedObject });
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
