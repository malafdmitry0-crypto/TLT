import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
  type PointerEvent as ReactPointerEvent,
} from 'react';
import {
  Alert,
  Button,
  Card,
  Checkbox,
  Input,
  InputNumber,
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
  CloseCircleFilled,
  CloseCircleOutlined,
  FilterFilled,
  ReloadOutlined,
  StopOutlined,
  TableOutlined,
  ThunderboltOutlined,
} from '@ant-design/icons';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useLocation, useNavigate } from 'react-router-dom';
import type { ColumnsType } from 'antd/es/table';

import {
  cancelCalcTask,
  enqueueElectricalBatchJob,
  getElectricalQueryCapabilities,
  getCalcTask,
  listCables,
  queryElectrical,
  selectCableManual,
  type CableSource,
} from '@/api/calculations';
import { getUserPreference, updateUserPreference } from '@/api/preferences';
import { referenceQueryKeys, referenceQueryOptions } from '@/api/referenceQueries';
import { getCablesTt, getResistiveCables } from '@/api/references';
import { useAuthStore } from '@/store/authStore';
import { useProjectStore } from '@/store/projectStore';
import { useElectricalStats } from '@/hooks/useElectricalStats';
import { isElectricalCalcSuccess, electricalCalcError } from '@/utils/calcStatus';
import { getCalcJobRefetchInterval, isActiveCalcJobStatus } from '@/utils/calcJobPolling';
import { buildTsv, copyToClipboard } from '@/utils/clipboard';
import { formatNumber, formatPower } from '@/utils/formatters';

import EmptyProjectState from '@/components/common/EmptyProjectState';
import ElectricalColumnSettingsModal from '@/components/electrical/ElectricalColumnSettingsModal';
import { ROUTES } from '@/routes/routes';
import type { ProjectObject } from '@/types/project';
import type {
  BatchElectricalResponse,
  ElectricalCalcSummary,
  ElectricalQueryRequest,
} from '@/types/calculation';
import {
  ELECTRICAL_TABLE_COLUMN_PREF_KEY,
  clampElectricalTableColumnWidthPct,
  clearRegisteredElectricalTableColumnCache,
  createElectricalTableColumnSettingsPatch,
  electricalTableColumnWidthPxToPct,
  getAvailableElectricalTableColumnKeys,
  getDefaultElectricalTableColumnSettings,
  getVisibleElectricalTableColumnMetas,
  moveElectricalTableColumnToOrder,
  normalizeElectricalTableColumnSettings,
  readGuestElectricalTableColumnSettings,
  readRegisteredElectricalTableColumnCache,
  reorderElectricalTableColumn,
  resetElectricalTableColumnSettings,
  resetElectricalTableColumnWidth,
  setElectricalTableColumnVisibility,
  setElectricalTableColumnWidthPct,
  writeGuestElectricalTableColumnSettings,
  writeRegisteredElectricalTableColumnCache,
  type ElectricalColumnKey,
  type ElectricalTableColumnSettings,
} from '@/utils/electricalTableColumns';
import {
  ELECTRICAL_TABLE_VIEW_PREF_KEY,
  clearRegisteredElectricalTableViewCache,
  getDefaultElectricalTableViewSettings,
  normalizeElectricalTableViewSettings,
  readGuestElectricalTableViewSettings,
  readRegisteredElectricalTableViewCache,
  resolveElectricalTableFontSize,
  writeGuestElectricalTableViewSettings,
  writeRegisteredElectricalTableViewCache,
  type ElectricalTableFontSize,
  type ElectricalTableLabelFormat,
  type ElectricalTableViewSettings,
} from '@/utils/electricalTableViewSettings';
import {
  createEmptyTableViewState,
  hasActiveTableViewState,
  isColumnFilterActive,
  removeHiddenTableViewState,
  type HeatCalcColumnFilter,
  type HeatCalcTableViewState,
} from '@/utils/heatCalcTableFindability';
import type {
  ObjectQueryFieldCapability,
  ObjectQueryFilter as BackendObjectQueryFilter,
} from '@/types/project';

const { Text } = Typography;

type CableTypeKey =
  | 'self_regulating'
  | 'self_regulating_tt'
  | 'single_core'
  | 'three_core'
  | 'mineral'
  | 'skin';

function isBatchElectricalResponse(result: unknown): result is BatchElectricalResponse {
  return typeof result === 'object' && result !== null && 'calculated' in result;
}

const CABLE_TYPE_LABEL: Record<CableTypeKey, string> = {
  self_regulating: 'Саморегулирующийся',
  self_regulating_tt: 'ТТН/ТТВ/ТТХ',
  single_core: 'Однож. пост. мощн.',
  three_core: 'Трёхж. пост. мощн.',
  mineral: 'С мин. изоляцией',
  skin: 'Скин-система',
};

const ENABLED_CABLE_TYPES: ReadonlySet<CableTypeKey> = new Set([
  'self_regulating',
  'self_regulating_tt',
  'single_core',
  'three_core',
]);
const ELECTRICAL_TABLE_PAGE_SIZE = 50;
type ElectricalBatchScope = 'all' | 'selected';
type ElectricalBatchMutationArgs = {
  scope: ElectricalBatchScope;
  objectIds?: string[];
};
const EMPTY_OBJECTS: ProjectObject[] = [];
const EMPTY_ELECTRICAL_CALCS: ElectricalCalcSummary[] = [];
const THREAD_OPTIONS = [
  { value: 1, label: '1' },
  { value: 2, label: '2' },
  { value: 3, label: '3' },
];

type CableLayoutDraft = {
  windingPitchMm?: number | null;
  numberOfThreads?: number | null;
};

type ElectricalNavigationState = {
  activeJobId?: string;
} | null;

type ElectricalTableColumnPreferenceMutation = {
  settings: ElectricalTableColumnSettings;
  closeModal?: boolean;
  showMessage?: boolean;
};

type ElectricalTableSettingsPreferenceMutation = {
  columnSettings: ElectricalTableColumnSettings;
  viewSettings: ElectricalTableViewSettings;
};

function getCableMark(calc: ElectricalCalcSummary | undefined) {
  const selectedCable = calc?.results?.selected_cable;
  return calc?.cable_mark ?? (typeof selectedCable === 'string' ? selectedCable : undefined);
}

function calcLayoutValues(calc: ElectricalCalcSummary | undefined, draft?: CableLayoutDraft) {
  return {
    windingPitchMm: draft?.windingPitchMm ?? Number(calc?.results?.winding_pitch ?? 0),
    numberOfThreads: draft?.numberOfThreads ?? Number(calc?.results?.num_circuits ?? 1),
  };
}

type ElectricalColumnRenderSpec = {
  align?: 'left' | 'right' | 'center';
  ellipsis?: boolean;
  render: (_: unknown, obj: ProjectObject, idx: number) => ReactNode;
};

const OBJECT_TYPE_LABEL: Record<string, string> = {
  pipe: 'Труба',
  tank: 'Резервуар',
};

const CONNECTION_TYPE_LABEL: Record<string, string> = {
  line_1ph: 'Линия',
  loop_1ph: 'Петля',
  star_3ph: 'Звезда',
  loop_2x3: 'Петля 2×3',
  loop_1x3: 'Петля 1×3',
  star_3x3: 'Звезда 3×3',
  star_1x3: 'Звезда 1×3',
};

type ElectricalFilterKind = 'text' | 'numberRange' | 'enum' | 'boolean';

function valueText(value: unknown) {
  if (value === null || value === undefined || value === '') return '—';
  if (typeof value === 'boolean') return value ? 'Да' : 'Нет';
  return String(value);
}

function numberText(value: unknown, digits = 2) {
  if (value === null || value === undefined || value === '') return formatNumber(null, digits);
  return formatNumber(Number(value), digits);
}

function powerText(value: unknown) {
  if (value === null || value === undefined || value === '') return '—';
  return formatPower(Number(value));
}

function resultNumber(calc: ElectricalCalcSummary | undefined, key: string, digits = 2) {
  return numberText(calc?.results?.[key], digits);
}

function objectResultNumber(obj: ProjectObject, key: string, digits = 2) {
  return numberText(obj.results?.[key], digits);
}

function toInputNumberValue(value: unknown) {
  const numericValue = Number(value);
  return Number.isFinite(numericValue) ? numericValue : null;
}

function filterKindForElectricalColumn(
  key: ElectricalColumnKey,
  capability?: ObjectQueryFieldCapability,
): ElectricalFilterKind {
  if (capability?.filter.enabled) {
    if (capability.filter.ops.includes('range')) return 'numberRange';
    if (capability.filter.ops.includes('in')) return 'enum';
    if (capability.filter.ops.includes('equals') && capability.data_type === 'boolean') {
      return 'boolean';
    }
    return 'text';
  }
  if (['cable_length', 'total_power', 'current', 'voltage'].includes(key)) return 'numberRange';
  if (['electrical_status', 'object_type', 'heat_loss_status', 'cable_type'].includes(key)) {
    return 'enum';
  }
  return 'text';
}

function backendFilterFromElectricalColumnFilter(
  key: ElectricalColumnKey,
  filter: HeatCalcColumnFilter,
  capability?: ObjectQueryFieldCapability,
): BackendObjectQueryFilter | null {
  if (!isColumnFilterActive(filter)) return null;
  const ops = capability?.filter.ops ?? [];
  if (filter.kind === 'text') {
    return { key, op: 'contains', value: filter.value };
  }
  if (filter.kind === 'numberRange') {
    return {
      key,
      op: 'range',
      min: Number.isFinite(filter.min) ? filter.min : undefined,
      max: Number.isFinite(filter.max) ? filter.max : undefined,
      include_empty: !!filter.includeEmpty,
    };
  }
  if (filter.kind === 'enum') {
    return {
      key,
      op: ops.includes('equals') && filter.values.length === 1 ? 'equals' : 'in',
      value: ops.includes('equals') && filter.values.length === 1 ? filter.values[0] : undefined,
      values: ops.includes('equals') && filter.values.length === 1 ? undefined : filter.values,
      include_empty: !!filter.includeEmpty,
    };
  }
  if (filter.kind === 'boolean') {
    return {
      key,
      op: 'equals',
      value: filter.value === 'empty' ? null : filter.value,
      include_empty: filter.value === 'empty',
    };
  }
  return null;
}

function buildElectricalQueryRequest(
  projectId: string,
  variant: number,
  state: HeatCalcTableViewState,
  page: number,
  pageSize: number,
  capabilities?: { fields: ObjectQueryFieldCapability[] },
): ElectricalQueryRequest {
  const capabilityByKey = new Map(capabilities?.fields.map((field) => [field.key, field]) ?? []);
  const filters = Object.entries(state.filters)
    .map(([key, filter]) => filter
      ? backendFilterFromElectricalColumnFilter(key, filter, capabilityByKey.get(key))
      : null)
    .filter((filter): filter is BackendObjectQueryFilter => filter != null);
  const sortCapability = state.sort ? capabilityByKey.get(state.sort.columnKey) : undefined;
  return {
    project_id: projectId,
    variant_number: variant,
    page,
    page_size: pageSize,
    filters,
    sort: state.sort && (sortCapability?.sort.enabled ?? true)
      ? { key: state.sort.columnKey, dir: state.sort.direction }
      : null,
  };
}

function ColumnFilterDropdown({
  title,
  kind,
  filter,
  enumOptions,
  onApply,
  onReset,
  onClose,
}: {
  title: string;
  kind: ElectricalFilterKind;
  filter?: HeatCalcColumnFilter;
  enumOptions?: Array<{ value: string; label: string }>;
  onApply: (filter: HeatCalcColumnFilter) => void;
  onReset: () => void;
  onClose: () => void;
}) {
  const [textValue, setTextValue] = useState(filter?.kind === 'text' ? filter.value : '');
  const [minValue, setMinValue] = useState<number | null>(
    filter?.kind === 'numberRange' ? toInputNumberValue(filter.min) : null,
  );
  const [maxValue, setMaxValue] = useState<number | null>(
    filter?.kind === 'numberRange' ? toInputNumberValue(filter.max) : null,
  );
  const [enumValues, setEnumValues] = useState<string[]>(
    filter?.kind === 'enum' ? filter.values.map(String) : [],
  );
  const [booleanValue, setBooleanValue] = useState<boolean | 'empty' | undefined>(
    filter?.kind === 'boolean' ? filter.value : undefined,
  );
  const [includeEmpty, setIncludeEmpty] = useState(
    (filter?.kind === 'numberRange' || filter?.kind === 'enum') && !!filter.includeEmpty,
  );
  const invalidRange = Number.isFinite(minValue)
    && Number.isFinite(maxValue)
    && Number(minValue) > Number(maxValue);

  const applyFilter = () => {
    if (kind === 'text') onApply({ kind: 'text', value: textValue });
    if (kind === 'numberRange') {
      onApply({
        kind: 'numberRange',
        min: minValue ?? undefined,
        max: maxValue ?? undefined,
        includeEmpty,
      });
    }
    if (kind === 'enum') onApply({ kind: 'enum', values: enumValues, includeEmpty });
    if (kind === 'boolean') onApply({ kind: 'boolean', value: booleanValue });
    onClose();
  };

  const resetFilter = () => {
    onReset();
    onClose();
  };

  return (
    <div className="table-filter-dropdown">
      <Text strong>{title}</Text>
      {kind === 'text' && (
        <Input
          size="small"
          aria-label={`Поиск: ${title}`}
          value={textValue}
          onChange={(event) => setTextValue(event.target.value)}
          onPressEnter={applyFilter}
          allowClear
        />
      )}
      {kind === 'numberRange' && (
        <Space size={6}>
          <InputNumber
            size="small"
            placeholder="от"
            aria-label={`Минимум: ${title}`}
            value={minValue}
            onChange={(value) => setMinValue(toInputNumberValue(value))}
          />
          <InputNumber
            size="small"
            placeholder="до"
            aria-label={`Максимум: ${title}`}
            value={maxValue}
            onChange={(value) => setMaxValue(toInputNumberValue(value))}
          />
        </Space>
      )}
      {kind === 'enum' && (
        <Select
          mode="multiple"
          size="small"
          aria-label={`Значения: ${title}`}
          value={enumValues}
          options={enumOptions}
          onChange={setEnumValues}
          style={{ minWidth: 220 }}
          maxTagCount="responsive"
        />
      )}
      {kind === 'boolean' && (
        <Select
          size="small"
          aria-label={`Значение: ${title}`}
          allowClear
          value={booleanValue}
          options={[
            { value: true, label: 'Да' },
            { value: false, label: 'Нет' },
            { value: 'empty', label: 'Пустые' },
          ]}
          onChange={setBooleanValue}
          style={{ minWidth: 160 }}
        />
      )}
      {(kind === 'numberRange' || kind === 'enum') && (
        <Checkbox checked={includeEmpty} onChange={(event) => setIncludeEmpty(event.target.checked)}>
          Пустые
        </Checkbox>
      )}
      <div className="table-filter-actions">
        <Button size="small" onClick={resetFilter}>
          Сбросить
        </Button>
        <Button size="small" type="primary" disabled={invalidRange} onClick={applyFilter}>
          Применить
        </Button>
      </div>
    </div>
  );
}

function ResizableColumnTitle({
  title,
  label,
  onResizeStart,
}: {
  title: string;
  label: string;
  onResizeStart: (event: ReactPointerEvent<HTMLButtonElement>) => void;
}) {
  return (
    <span className="resizable-column-title">
      <span className="resizable-column-title-text">{title}</span>
      <button
        type="button"
        className="column-resize-handle"
        aria-label={`Изменить ширину: ${label}`}
        onPointerDown={onResizeStart}
        onClick={(event) => {
          event.preventDefault();
          event.stopPropagation();
        }}
      />
    </span>
  );
}

export default function ElecCalcPage() {
  const project = useProjectStore((s) => s.currentProject);
  const role = useAuthStore((s) => s.role);
  const registeredUserId = useAuthStore((s) => s.user?.id ?? null);
  const isEmployee = role === 'employee' || role === 'admin';
  const isRegisteredUser = isEmployee;
  const location = useLocation();
  const navigationActiveJobId =
    (location.state as ElectricalNavigationState)?.activeJobId ?? null;

  const [variant, setVariant] = useState<number>(1);
  const [cableSource, setCableSource] = useState<CableSource>('builtin');
  const [defaultCableType, setDefaultCableType] =
    useState<CableTypeKey>('self_regulating');
  const [cableTypeDraftByObjectId, setCableTypeDraftByObjectId] =
    useState<Record<string, CableTypeKey>>({});
  const [supplyVoltage, setSupplyVoltage] = useState<number | null>(220);
  const [connectionType, setConnectionType] = useState<string>('line_1ph');
  const [windingCoefficient, setWindingCoefficient] = useState<number | null>(1);
  const [heatingHeight, setHeatingHeight] = useState<number | null>(null);
  const [layingStep, setLayingStep] = useState<number | null>(0.1);
  const [vaporTemperature, setVaporTemperature] = useState<number | null>(null);
  const [aggressiveProduct, setAggressiveProduct] = useState(false);
  const [layoutDrafts, setLayoutDrafts] = useState<Record<string, CableLayoutDraft>>({});
  const [tablePage, setTablePage] = useState(1);
  const [tablePageSize, setTablePageSize] = useState(ELECTRICAL_TABLE_PAGE_SIZE);
  const [activeRowId, setActiveRowId] = useState<string | null>(null);
  const [selectedRowKeys, setSelectedRowKeys] = useState<string[]>([]);
  const [tableColumnSettings, setTableColumnSettings] =
    useState<ElectricalTableColumnSettings>(() => {
      const auth = useAuthStore.getState();
      const cached = readRegisteredElectricalTableColumnCache(auth.user?.id ?? null);
      if (auth.role === 'employee' || auth.role === 'admin') {
        return cached ?? getDefaultElectricalTableColumnSettings();
      }
      return readGuestElectricalTableColumnSettings();
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
  const [columnSettingsOpen, setColumnSettingsOpen] = useState(false);
  const [draftTableColumnSettings, setDraftTableColumnSettings] =
    useState<ElectricalTableColumnSettings>(() => tableColumnSettings);
  const [draftTableViewSettings, setDraftTableViewSettings] =
    useState<ElectricalTableViewSettings>(() => tableViewSettings);
  const tableColumnSettingsRef = useRef(tableColumnSettings);
  const tableViewSettingsRef = useRef(tableViewSettings);
  const [tableViewState, setTableViewState] =
    useState<HeatCalcTableViewState>(() => createEmptyTableViewState());
  const [activeJobId, setActiveJobId] = useState<string | null>(
    () => navigationActiveJobId,
  );
  const [activeBatchScope, setActiveBatchScope] = useState<ElectricalBatchScope | null>(null);
  const activeBatchObjectIdsRef = useRef<string[] | null>(null);
  const pageScopeRef = useRef<{ projectId?: string; variant: number } | null>(null);

  const qc = useQueryClient();
  const navigate = useNavigate();

  useEffect(() => {
    tableColumnSettingsRef.current = tableColumnSettings;
  }, [tableColumnSettings]);

  useEffect(() => {
    tableViewSettingsRef.current = tableViewSettings;
  }, [tableViewSettings]);

  useEffect(() => {
    setTablePage(1);
  }, [project?.id, variant]);

  useEffect(() => {
    setActiveRowId(null);
  }, [project?.id, variant, tablePage, tablePageSize]);

  useEffect(() => {
    setSelectedRowKeys([]);
    setCableTypeDraftByObjectId({});
  }, [project?.id, variant]);

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
        tableViewState,
        tablePage,
        tablePageSize,
        electricalQueryCapabilities,
      )
      : null),
    [electricalQueryCapabilities, project, tablePage, tablePageSize, tableViewState, variant],
  );
  const { data: electricalPage, isFetching: isElectricalPageFetching } = useQuery({
    queryKey: ['project', project?.id, 'electrical-query', electricalQueryRequest],
    queryFn: () => queryElectrical(electricalQueryRequest!),
    enabled: !!project && electricalQueryRequest != null && !!electricalQueryCapabilities,
    placeholderData: (previous) => previous,
  });
  const objects = electricalPage?.items ?? EMPTY_OBJECTS;
  const elecCalcs = electricalPage?.calculations ?? EMPTY_ELECTRICAL_CALCS;
  const pageSummary = electricalPage?.summary;
  const pageInfo = electricalPage?.page_info;
  const stats = useElectricalStats(objects, elecCalcs);

  const getSavedCableTypeForObject = useCallback((objectId: string): CableTypeKey => {
    const savedType = stats.calcByObjectId[objectId]?.cable_type;
    return (savedType && savedType in CABLE_TYPE_LABEL
      ? savedType
      : 'self_regulating') as CableTypeKey;
  }, [stats.calcByObjectId]);

  const getDraftCableTypeForObject = useCallback((objectId: string): CableTypeKey =>
    cableTypeDraftByObjectId[objectId] ?? getSavedCableTypeForObject(objectId),
  [cableTypeDraftByObjectId, getSavedCableTypeForObject]);

  const selectedCableTypes = useMemo(
    () => selectedRowKeys.map((objectId) => getDraftCableTypeForObject(objectId)),
    [getDraftCableTypeForObject, selectedRowKeys],
  );
  const selectedCableType = useMemo<CableTypeKey | null>(() => {
    if (selectedCableTypes.length === 0) return null;
    const [firstType] = selectedCableTypes;
    return selectedCableTypes.every((type) => type === firstType) ? firstType : null;
  }, [selectedCableTypes]);
  const selectedCableTypesMixed = selectedCableTypes.length > 0 && selectedCableType == null;

  const objectOverridesForIds = useCallback((objectIds: string[]) =>
    objectIds.map((objectId) => ({
      object_id: objectId,
      cable_type: getDraftCableTypeForObject(objectId),
    })),
  [getDraftCableTypeForObject]);

  useEffect(() => {
    const visibleIds = new Set(objects.map((object) => object.id));
    setSelectedRowKeys((keys) => {
      const nextKeys = keys.filter((key) => visibleIds.has(key));
      return nextKeys.length === keys.length && nextKeys.every((key, index) => key === keys[index])
        ? keys
        : nextKeys;
    });
  }, [objects]);

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

  const effectiveSource: CableSource = isEmployee ? cableSource : 'builtin';
  const { data: cables = [] } = useQuery({
    queryKey: referenceQueryKeys.cables(effectiveSource),
    queryFn: () => listCables(effectiveSource),
    ...referenceQueryOptions,
  });
  const { data: ttCables = [] } = useQuery({
    queryKey: referenceQueryKeys.ttCables,
    queryFn: getCablesTt,
    enabled: !!project,
    ...referenceQueryOptions,
  });
  const { data: resistiveCables } = useQuery({
    queryKey: referenceQueryKeys.resistiveCables,
    queryFn: getResistiveCables,
    enabled: !!project,
    ...referenceQueryOptions,
  });

  const { data: persistedTableColumnPreference } = useQuery({
    queryKey: ['preference', ELECTRICAL_TABLE_COLUMN_PREF_KEY],
    queryFn: () =>
      getUserPreference<ElectricalTableColumnSettings>(ELECTRICAL_TABLE_COLUMN_PREF_KEY),
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
      tableViewSettingsRef.current = normalizedView;
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
      tableViewSettingsRef.current = registeredViewSettings;
      setTableViewSettings(registeredViewSettings);
      return;
    }
    setTableColumnSettings(readGuestElectricalTableColumnSettings());
    const guestViewSettings = readGuestElectricalTableViewSettings();
    tableViewSettingsRef.current = guestViewSettings;
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
    if (!isRegisteredUser || !persistedTableViewPreference) return;
    if (persistedTableViewPreference.value) {
      const normalized = normalizeElectricalTableViewSettings(persistedTableViewPreference.value);
      tableViewSettingsRef.current = normalized;
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
    tableViewSettingsRef.current = defaults;
    setTableViewSettings(defaults);
  }, [isRegisteredUser, persistedTableViewPreference, registeredUserId]);

  const batchMut = useMutation({
    mutationFn: ({ scope, objectIds }: ElectricalBatchMutationArgs) => {
      const selectedObjectIds = objectIds ?? [];
      const objectOverrides = scope === 'selected'
        ? objectOverridesForIds(selectedObjectIds)
        : Object.entries(cableTypeDraftByObjectId).map(([objectId, type]) => ({
            object_id: objectId,
            cable_type: type,
          }));
      const fallbackCableType = scope === 'selected'
        ? selectedCableType ?? defaultCableType
        : defaultCableType;
      return enqueueElectricalBatchJob(
        project!.id,
        effectiveSource,
        variant,
        fallbackCableType,
        {
          supplyVoltage,
          connectionType,
          windingCoefficient,
          heatingHeight,
          layingStep,
          vaporTemperature,
          aggressiveProduct,
          objectIds: scope === 'selected' ? selectedObjectIds : undefined,
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
      if (res && res.skipped > 0) {
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
      setCableTypeDraftByObjectId((prev) => {
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

  const cableOptions = useMemo(
    () => cables.map((c) => ({ value: c.model, label: `${c.model} · ${c.power_per_meter} Вт/м` })),
    [cables],
  );
  const manualCableOptionsForType = useCallback((type: CableTypeKey) => {
    if (type === 'self_regulating') return cableOptions;
    if (type === 'self_regulating_tt') {
      const suffix = aggressiveProduct ? 'СТ' : 'СР';
      return ttCables.map((c) => ({
        value: `${c.model}-${suffix}`,
        label: `${c.model}-${suffix} · ${c.series} · ${c.nominal_power} Вт/м`,
      }));
    }
    if (type === 'single_core') {
      return (resistiveCables?.single_core ?? []).map((c) => ({
        value: c.model,
        label: `${c.model} · ${c.resistance_ohm_km ?? '—'} Ом/км`,
      }));
    }
    if (type === 'three_core') {
      return (resistiveCables?.three_core ?? []).map((c) => ({
        value: c.model,
        label: `${c.model} · ${c.nominal_size_mm ?? '—'}`,
      }));
    }
    return [];
  }, [aggressiveProduct, cableOptions, resistiveCables, ttCables]);

  const manualCableMut = useMutation({
    mutationFn: ({
      objectId,
      mark,
      cableType,
    }: {
      objectId: string;
      mark: string;
      cableType: CableTypeKey;
    }) =>
      selectCableManual(objectId, mark, effectiveSource, variant, cableType, {
        supplyVoltage,
        connectionType,
        windingCoefficient,
        heatingHeight,
        layingStep,
        vaporTemperature,
        aggressiveProduct,
    }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['project', project?.id, 'electrical-query'] });
      qc.invalidateQueries({ queryKey: ['project', project?.id, 'electrical-query-capabilities'] });
      qc.invalidateQueries({ queryKey: ['project', project?.id, 'objects', 'summary'] });
      message.success('Кабель выбран, расчёт обновлён');
    },
    onError: (e: Error) => message.error(e.message),
  });

  const layoutMut = useMutation({
    mutationFn: ({
      objectId,
      mark,
      cableType,
      windingPitchMm,
      numberOfThreads,
    }: {
      objectId: string;
      mark: string;
      cableType: CableTypeKey;
      windingPitchMm: number;
      numberOfThreads: number;
    }) =>
      selectCableManual(objectId, mark, effectiveSource, variant, cableType, {
        supplyVoltage,
        connectionType,
        windingCoefficient,
        windingPitchMm,
        numberOfThreads,
        heatingHeight,
        layingStep,
        vaporTemperature,
        aggressiveProduct,
      }),
    onSuccess: (_calc, vars) => {
      setLayoutDrafts((prev) => {
        const next = { ...prev };
        delete next[vars.objectId];
        return next;
      });
      qc.invalidateQueries({ queryKey: ['project', project?.id, 'electrical-query'] });
      qc.invalidateQueries({ queryKey: ['project', project?.id, 'electrical-query-capabilities'] });
      qc.invalidateQueries({ queryKey: ['project', project?.id, 'objects', 'summary'] });
      message.success('Параметры укладки применены');
    },
    onError: (e: Error) => message.error(e.message),
  });
  const manualCableMutate = manualCableMut.mutate;
  const isManualCablePending = manualCableMut.isPending;
  const layoutMutate = layoutMut.mutate;
  const isLayoutPending = layoutMut.isPending;

  const updateLayoutDraft = useCallback((objectId: string, patch: CableLayoutDraft) => {
    setLayoutDrafts((prev) => ({ ...prev, [objectId]: { ...prev[objectId], ...patch } }));
  }, []);

  const commitLayout = useCallback((obj: ProjectObject) => {
    const calc = stats.calcByObjectId[obj.id];
    const mark = getCableMark(calc);
    if (!mark) {
      message.warning('Сначала выполните электрорасчёт или выберите марку кабеля');
      return;
    }
    const values = calcLayoutValues(calc, layoutDrafts[obj.id]);
    layoutMutate({
      objectId: obj.id,
      mark,
      cableType: getSavedCableTypeForObject(obj.id),
      windingPitchMm: values.windingPitchMm,
      numberOfThreads: values.numberOfThreads,
    });
  }, [getSavedCableTypeForObject, layoutDrafts, layoutMutate, stats.calcByObjectId]);

  const visibleElectricalColumnMetas = useMemo(
    () => getVisibleElectricalTableColumnMetas(
      tableColumnSettings,
      normalizeElectricalTableViewSettings(tableViewSettings).tableLabelFormat,
    ),
    [tableColumnSettings, tableViewSettings],
  );
  const resolvedTableFontSize = useMemo(
    () => resolveElectricalTableFontSize(normalizeElectricalTableViewSettings(tableViewSettings)),
    [tableViewSettings],
  );
  const visibleElectricalColumnKeys = useMemo(
    () => visibleElectricalColumnMetas.map((meta) => meta.key),
    [visibleElectricalColumnMetas],
  );
  const fieldCapabilityByKey = useMemo(
    () => new Map(electricalQueryCapabilities?.fields.map((field) => [field.key, field]) ?? []),
    [electricalQueryCapabilities],
  );
  const enumOptionsByColumn = useMemo(() => {
    const result: Record<string, Array<{ value: string; label: string }>> = {};
    for (const field of electricalQueryCapabilities?.fields ?? []) {
      if (!field.options) continue;
      result[field.key] = field.options.items.map((item) => ({
        value: String(item.value),
        label: item.label,
      }));
    }
    return result;
  }, [electricalQueryCapabilities]);
  const currentTableViewActive = hasActiveTableViewState(tableViewState);

  useEffect(() => {
    setTableViewState((current) => {
      const cleaned = removeHiddenTableViewState(current, visibleElectricalColumnKeys);
      if (
        cleaned.sort === current.sort
        && Object.keys(cleaned.filters).length === Object.keys(current.filters).length
      ) {
        return current;
      }
      return cleaned;
    });
  }, [visibleElectricalColumnKeys]);

  const setColumnFilter = useCallback((columnKey: ElectricalColumnKey, filter?: HeatCalcColumnFilter) => {
    setTablePage(1);
    setTableViewState((current) => {
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
  }, []);

  const resetColumnFilter = useCallback((columnKey: ElectricalColumnKey) => {
    setColumnFilter(columnKey, undefined);
  }, [setColumnFilter]);

  const resetCurrentTableViewState = useCallback(() => {
    setTablePage(1);
    setTableViewState(createEmptyTableViewState());
  }, []);

  const handleElectricalTableChange = useCallback<NonNullable<TableProps<ProjectObject>['onChange']>>((pagination, _filters, sorter, extra) => {
    const nextPage = extra.action === 'sort' ? 1 : pagination.current ?? 1;
    setTablePage(nextPage);
    if (pagination.pageSize) setTablePageSize(pagination.pageSize);
    const nextSorter = Array.isArray(sorter)
      ? sorter.find((item) => item.order)
      : sorter;
    const columnKey = typeof nextSorter?.columnKey === 'string'
      ? nextSorter.columnKey
      : typeof nextSorter?.column?.key === 'string'
        ? nextSorter.column.key
        : null;
    const order = nextSorter?.order;
    setTableViewState((current) => ({
      ...current,
      sort: columnKey && order
        ? { columnKey, direction: order === 'ascend' ? 'asc' : 'desc' }
        : undefined,
    }));
  }, []);

  const electricalColumnRenderers = useMemo<Record<ElectricalColumnKey, ElectricalColumnRenderSpec>>(() => ({
    index: {
      render: (_: unknown, __: ProjectObject, idx: number) =>
        (pageInfo?.offset ?? 0) + idx + 1,
    },
    object_name: {
      ellipsis: true,
      render: (_: unknown, obj) => (
        <Text style={{ fontSize: 12 }}>
          {String(obj.params?.name ?? `${obj.object_type} ${obj.id}`)}
        </Text>
      ),
    },
    object_type: {
      render: (_: unknown, obj) => OBJECT_TYPE_LABEL[obj.object_type] ?? obj.object_type,
    },
    heat_loss_status: {
      align: 'center',
      render: (_: unknown, obj) => {
        if (obj.is_valid) return <Tag color="success">ОК</Tag>;
        return (
          <Tooltip title={valueText(obj.validation_errors?.error ?? obj.validation_errors)}>
            <Tag color="error">Ошибка</Tag>
          </Tooltip>
        );
      },
    },
    electrical_status: {
      align: 'center',
      render: (_: unknown, obj) => {
        const calc = stats.calcByObjectId[obj.id];
        const err = electricalCalcError(calc);
        if (isElectricalCalcSuccess(calc))
          return (
            <Tooltip title="Рассчитан">
              <Tag className="electrical-status-icon-tag" color="success" aria-label="Рассчитан">
                <CheckCircleFilled />
              </Tag>
            </Tooltip>
          );
        if (err)
          return (
            <Tooltip title="Ошибка">
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
        const type = getSavedCableTypeForObject(obj.id);
        return CABLE_TYPE_LABEL[type] ?? valueText(type);
      },
    },
    cable_mark: {
      render: (_: unknown, obj) => {
        const calc = stats.calcByObjectId[obj.id];
        const mark = getCableMark(calc);
        const isActive = activeRowId === obj.id;

        if (!isActive) {
          return (
            <Text style={{ fontSize: 12 }} type={mark ? undefined : 'secondary'}>
              {mark ?? 'Авто'}
            </Text>
          );
        }

        return (
          <Select
            size="small"
            showSearch
            allowClear
            placeholder="Авто"
            value={mark}
            options={manualCableOptionsForType(getSavedCableTypeForObject(obj.id))}
            disabled={
              !obj.is_valid
              || manualCableOptionsForType(getSavedCableTypeForObject(obj.id)).length === 0
            }
            loading={isManualCablePending}
            style={{ width: '100%' }}
            onChange={(nextMark) => {
              if (nextMark) {
                manualCableMutate({
                  objectId: obj.id,
                  mark: nextMark,
                  cableType: getSavedCableTypeForObject(obj.id),
                });
              }
            }}
          />
        );
      },
    },
    selected_cable: {
      render: (_: unknown, obj) => (
        <Text style={{ fontSize: 12 }}>
          {valueText(stats.calcByObjectId[obj.id]?.results?.selected_cable)}
        </Text>
      ),
    },
    variant_number: {
      align: 'right',
      render: (_: unknown, obj) => stats.calcByObjectId[obj.id]?.variant_number ?? variant,
    },
    winding_pitch_mm: {
      align: 'right',
      render: (_: unknown, obj) => {
        const calc = stats.calcByObjectId[obj.id];
        const mark = getCableMark(calc);
        const values = calcLayoutValues(calc, layoutDrafts[obj.id]);
        const isActive = activeRowId === obj.id;

        if (!isActive || !obj.is_valid || !mark) {
          return (
            <Text style={{ fontSize: 12 }} type={mark ? undefined : 'secondary'}>
              {mark ? formatNumber(values.windingPitchMm, 0) : '—'}
            </Text>
          );
        }

        return (
          <InputNumber
            size="small"
            min={0}
            max={500}
            value={values.windingPitchMm}
            disabled={isLayoutPending}
            style={{ width: '100%' }}
            onChange={(v) => updateLayoutDraft(obj.id, { windingPitchMm: Number(v ?? 0) })}
            onBlur={() => commitLayout(obj)}
            onPressEnter={() => commitLayout(obj)}
          />
        );
      },
    },
    number_of_threads: {
      align: 'right',
      render: (_: unknown, obj) => {
        const calc = stats.calcByObjectId[obj.id];
        const mark = getCableMark(calc);
        const values = calcLayoutValues(calc, layoutDrafts[obj.id]);
        const isActive = activeRowId === obj.id;

        if (!isActive || !obj.is_valid || !mark) {
          return (
            <Text style={{ fontSize: 12 }} type={mark ? undefined : 'secondary'}>
              {mark ? values.numberOfThreads : '—'}
            </Text>
          );
        }

        return (
          <Select
            size="small"
            value={values.numberOfThreads}
            disabled={isLayoutPending}
            options={THREAD_OPTIONS}
            style={{ width: '100%' }}
            onChange={(v) => {
              updateLayoutDraft(obj.id, { numberOfThreads: v });
              layoutMutate({
                objectId: obj.id,
                mark,
                cableType: getSavedCableTypeForObject(obj.id),
                windingPitchMm: values.windingPitchMm,
                numberOfThreads: v,
              });
            }}
          />
        );
      },
    },
    laying_step: {
      align: 'right',
      render: (_: unknown, obj) =>
        numberText(stats.calcByObjectId[obj.id]?.params?.laying_step ?? layingStep, 2),
    },
    heating_height: {
      align: 'right',
      render: (_: unknown, obj) =>
        numberText(stats.calcByObjectId[obj.id]?.params?.heating_height ?? heatingHeight, 1),
    },
    connection_type: {
      render: (_: unknown, obj) => {
        const value = stats.calcByObjectId[obj.id]?.params?.connection_type ?? connectionType;
        return CONNECTION_TYPE_LABEL[String(value)] ?? valueText(value);
      },
    },
    supply_voltage: {
      align: 'right',
      render: (_: unknown, obj) =>
        numberText(stats.calcByObjectId[obj.id]?.params?.supply_voltage ?? supplyVoltage, 0),
    },
    winding_coefficient: {
      align: 'right',
      render: (_: unknown, obj) =>
        numberText(
          stats.calcByObjectId[obj.id]?.params?.winding_coefficient ?? windingCoefficient,
          2,
        ),
    },
    vapor_temperature: {
      align: 'right',
      render: (_: unknown, obj) =>
        numberText(stats.calcByObjectId[obj.id]?.params?.vapor_temperature ?? vaporTemperature, 1),
    },
    aggressive_product: {
      align: 'center',
      render: (_: unknown, obj) =>
        valueText(stats.calcByObjectId[obj.id]?.params?.aggressive_product ?? aggressiveProduct),
    },
    cable_length: {
      align: 'right',
      render: (_: unknown, obj) => resultNumber(stats.calcByObjectId[obj.id], 'cable_length', 1),
    },
    total_power: {
      align: 'right',
      render: (_: unknown, obj) =>
        powerText(stats.calcByObjectId[obj.id]?.results?.total_power),
    },
    current: {
      align: 'right',
      render: (_: unknown, obj) => resultNumber(stats.calcByObjectId[obj.id], 'current', 2),
    },
    voltage: {
      align: 'right',
      render: (_: unknown, obj) => resultNumber(stats.calcByObjectId[obj.id], 'voltage', 0),
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
    message: {
      ellipsis: true,
      render: (_: unknown, obj) => (
        <Text type="secondary" style={{ fontSize: 11 }}>
          {electricalCalcError(stats.calcByObjectId[obj.id]) ?? '—'}
        </Text>
      ),
    },
  }), [
    activeRowId,
    aggressiveProduct,
    commitLayout,
    connectionType,
    getSavedCableTypeForObject,
    heatingHeight,
    isLayoutPending,
    isManualCablePending,
    layingStep,
    layoutDrafts,
    layoutMutate,
    manualCableMutate,
    manualCableOptionsForType,
    pageInfo?.offset,
    stats.calcByObjectId,
    supplyVoltage,
    updateLayoutDraft,
    vaporTemperature,
    variant,
    windingCoefficient,
  ]);

  const persistTableColumnSettings = useCallback((
    settings: ElectricalTableColumnSettings,
    options: { closeModal?: boolean; showMessage?: boolean } = {},
  ) => {
    const normalized = normalizeElectricalTableColumnSettings(settings);
    setTableColumnSettings(normalized);
    if (isRegisteredUser) {
      clearRegisteredElectricalTableColumnCache(registeredUserId);
      updateTableColumnPreference.mutate({
        settings: normalized,
        closeModal: options.closeModal,
        showMessage: options.showMessage,
      });
      return;
    }
    writeGuestElectricalTableColumnSettings(normalized);
    if (options.closeModal) setColumnSettingsOpen(false);
    if (options.showMessage !== false) message.success('Настройки таблицы сохранены');
  }, [isRegisteredUser, registeredUserId, updateTableColumnPreference]);

  const persistTableSettings = useCallback((
    columnSettings: ElectricalTableColumnSettings,
    viewSettings: ElectricalTableViewSettings,
  ) => {
    const normalizedColumns = normalizeElectricalTableColumnSettings(columnSettings);
    const normalizedView = normalizeElectricalTableViewSettings(viewSettings);
    setTableColumnSettings(normalizedColumns);
    tableViewSettingsRef.current = normalizedView;
    setTableViewSettings(normalizedView);
    if (isRegisteredUser) {
      clearRegisteredElectricalTableColumnCache(registeredUserId);
      clearRegisteredElectricalTableViewCache(registeredUserId);
      updateTableSettingsPreference.mutate({
        columnSettings: normalizedColumns,
        viewSettings: normalizedView,
      });
      return;
    }
    writeGuestElectricalTableColumnSettings(normalizedColumns);
    writeGuestElectricalTableViewSettings(normalizedView);
    setColumnSettingsOpen(false);
    message.success('Настройки таблицы сохранены');
  }, [isRegisteredUser, registeredUserId, updateTableSettingsPreference]);

  const applyColumnWidth = useCallback((key: ElectricalColumnKey, widthPct: number) => {
    const nextSettings = setElectricalTableColumnWidthPct(
      tableColumnSettingsRef.current,
      key,
      clampElectricalTableColumnWidthPct(widthPct),
    );
    persistTableColumnSettings(nextSettings, { showMessage: false });
  }, [persistTableColumnSettings]);

  const startColumnResize = useCallback((
    meta: { key: ElectricalColumnKey; width: number; widthPct: number },
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
      setTableColumnSettings((settings) =>
        setElectricalTableColumnWidthPct(settings, meta.key, latestWidthPct),
      );
    }

    function handlePointerMove(pointerEvent: PointerEvent) {
      const nextWidthPx = Math.max(30, startWidth + pointerEvent.clientX - startX);
      latestWidthPct = electricalTableColumnWidthPxToPct(nextWidthPx);
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
      applyColumnWidth(meta.key, latestWidthPct);
    }

    window.addEventListener('pointermove', handlePointerMove);
    window.addEventListener('pointerup', handlePointerUp);
  }, [applyColumnWidth]);

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
        ellipsis: column.ellipsis || renderer?.ellipsis,
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
          <span role="button" aria-label={`Фильтр ${column.label}`} className="table-filter-trigger">
            <FilterFilled
              className={isColumnFilterActive(activeFilter) ? 'table-filter-icon active' : 'table-filter-icon'}
            />
          </span>
        ) : undefined,
        filterDropdown: filterEnabled ? ({ close }) => (
          <ColumnFilterDropdown
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

  const electricalColumnCopyValue = useCallback((
    key: ElectricalColumnKey,
    obj: ProjectObject,
    index: number,
  ) => {
    const calc = stats.calcByObjectId[obj.id];
    switch (key) {
      case 'index':
        return (pageInfo?.offset ?? 0) + index + 1;
      case 'object_name':
        return obj.params?.name ?? `${obj.object_type} ${obj.id}`;
      case 'object_type':
        return OBJECT_TYPE_LABEL[obj.object_type] ?? obj.object_type;
      case 'heat_loss_status':
        return obj.is_valid ? 'Рассчитан' : obj.validation_errors ? 'Ошибка' : 'Не рассчитан';
      case 'electrical_status':
        return isElectricalCalcSuccess(calc)
          ? 'Рассчитан'
          : electricalCalcError(calc)
            ? 'Ошибка'
            : 'Не рассчитан';
      case 'cable_type':
        return CABLE_TYPE_LABEL[getSavedCableTypeForObject(obj.id)]
          ?? getSavedCableTypeForObject(obj.id);
      case 'cable_mark':
        return getCableMark(calc) ?? 'Авто';
      case 'selected_cable':
        return valueText(calc?.results?.selected_cable);
      case 'variant_number':
        return calc?.variant_number ?? variant;
      case 'winding_pitch_mm':
        return valueText(calc?.results?.winding_pitch);
      case 'number_of_threads':
        return valueText(calc?.results?.num_circuits);
      case 'laying_step':
      case 'heating_height':
      case 'connection_type':
      case 'supply_voltage':
      case 'winding_coefficient':
      case 'vapor_temperature':
      case 'aggressive_product':
        return valueText(calc?.params?.[key]);
      case 'cable_length':
      case 'total_power':
      case 'current':
      case 'voltage':
        return valueText(calc?.results?.[key]);
      case 'heat_loss_per_meter':
      case 'heat_loss_per_m2':
      case 'total_heat_loss':
        return valueText(obj.results?.[key]);
      case 'message':
        return electricalCalcError(calc) ?? '';
      default:
        return '';
    }
  }, [getSavedCableTypeForObject, pageInfo?.offset, stats.calcByObjectId, variant]);

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

  function openColumnSettings() {
    setDraftTableColumnSettings(normalizeElectricalTableColumnSettings(tableColumnSettings));
    setDraftTableViewSettings(normalizeElectricalTableViewSettings(tableViewSettings));
    setColumnSettingsOpen(true);
  }

  function updateDraftColumn(key: ElectricalColumnKey, checked: boolean) {
    setDraftTableColumnSettings((settings) =>
      setElectricalTableColumnVisibility(settings, key, checked),
    );
  }

  function updateDraftColumnOrder(key: ElectricalColumnKey, order: number) {
    setDraftTableColumnSettings((settings) =>
      moveElectricalTableColumnToOrder(settings, key, order),
    );
  }

  function reorderDraftColumn(activeKey: ElectricalColumnKey, overKey: ElectricalColumnKey) {
    setDraftTableColumnSettings((settings) =>
      reorderElectricalTableColumn(settings, activeKey, overKey),
    );
  }

  function updateDraftColumnWidth(key: ElectricalColumnKey, widthPct: number) {
    setDraftTableColumnSettings((settings) =>
      setElectricalTableColumnWidthPct(settings, key, widthPct),
    );
  }

  function updateDraftTableFontSize(fontSize: ElectricalTableFontSize) {
    setDraftTableViewSettings((settings) =>
      normalizeElectricalTableViewSettings({ ...settings, fontSize }),
    );
  }

  function resetDraftTableFontSize() {
    const defaultView = getDefaultElectricalTableViewSettings();
    setDraftTableViewSettings((settings) =>
      normalizeElectricalTableViewSettings({
        ...settings,
        fontSize: defaultView.fontSize,
      }),
    );
  }

  function updateDraftTableLabelFormat(tableLabelFormat: ElectricalTableLabelFormat) {
    setDraftTableViewSettings((settings) =>
      normalizeElectricalTableViewSettings({
        ...settings,
        tableLabelFormat,
      }),
    );
  }

  function updateDraftSettingsLabelFormat(settingsLabelFormat: ElectricalTableLabelFormat) {
    setDraftTableViewSettings((settings) =>
      normalizeElectricalTableViewSettings({
        ...settings,
        settingsLabelFormat,
      }),
    );
  }

  function resetDraftLabelFormats() {
    const defaultView = getDefaultElectricalTableViewSettings();
    setDraftTableViewSettings((settings) =>
      normalizeElectricalTableViewSettings({
        ...settings,
        tableLabelFormat: defaultView.tableLabelFormat,
        settingsLabelFormat: defaultView.settingsLabelFormat,
      }),
    );
  }

  function resetDraftColumnWidth(key: ElectricalColumnKey) {
    setDraftTableColumnSettings((settings) => resetElectricalTableColumnWidth(settings, key));
  }

  function resetDraftColumns() {
    setDraftTableColumnSettings(resetElectricalTableColumnSettings());
  }

  function selectAllDraftColumns() {
    setDraftTableColumnSettings((settings) =>
      createElectricalTableColumnSettingsPatch(settings, getAvailableElectricalTableColumnKeys()),
    );
  }

  function applyColumnSettings() {
    const normalized = normalizeElectricalTableColumnSettings(draftTableColumnSettings);
    const normalizedView = normalizeElectricalTableViewSettings(draftTableViewSettings);
    persistTableSettings(normalized, normalizedView);
  }

  if (!project) {
    return (
      <EmptyProjectState
        icon={<ThunderboltOutlined style={{ marginRight: 8, color: '#faad14' }} />}
        title="Электротехнический расчёт"
        description="Шаг 2 из 4. Результаты автоподбора греющего кабеля ТЛТ для каждого объекта."
      />
    );
  }

  const cableTypeOptions = (Object.keys(CABLE_TYPE_LABEL) as CableTypeKey[]).map((k) => ({
    label: ENABLED_CABLE_TYPES.has(k)
      ? CABLE_TYPE_LABEL[k]
      : <Tooltip title="Нет формулы/каталога в текущей поставке">{CABLE_TYPE_LABEL[k]}</Tooltip>,
    value: k,
    disabled: !ENABLED_CABLE_TYPES.has(k),
  }));

  const totalObjects = pageSummary?.total_objects ?? objects.length;
  const filteredTableCount = electricalPage?.counts?.filtered ?? totalObjects;
  const validObjectsCount = pageSummary?.valid_objects ?? stats.validObjects.length;
  const selectedObjectsCount = selectedRowKeys.length;
  const calculatedCount = pageSummary?.calculated_count ?? stats.calcedCount;
  const failedCount = pageSummary?.failed_count ?? stats.failedCount;
  const totalCableLength = pageSummary?.total_cable_length ?? stats.totalCableLength;
  const totalPower = pageSummary?.total_power ?? stats.totalPower;
  const totalCurrent = pageSummary?.total_current ?? stats.totalCurrent;
  const showSummaryInKW = totalPower >= 1000;
  const summaryPowerDisplay = showSummaryInKW
    ? `${(totalPower / 1000).toFixed(2)} кВт`
    : `${totalPower.toFixed(0)} Вт`;

  const bannerStats = calculatedCount > 0
    ? `${totalCableLength.toFixed(1)} м · ${summaryPowerDisplay} · ${totalCurrent.toFixed(2)} А · рассчитано: ${calculatedCount}/${totalObjects}`
    : 'расчёт не выполнен';
  const activeJobStatus = activeJob?.status ?? null;
  const isJobActive = isActiveCalcJobStatus(activeJobStatus);
  const jobProgress = activeJob?.progress;
  const jobProgressLabel = jobProgress?.total
    ? `${jobProgress.current}/${jobProgress.total}`
    : activeJobStatus ?? '';
  const bannerCableTypeLabel = selectedCableTypesMixed
    ? 'смешанные типы'
    : selectedCableType
      ? CABLE_TYPE_LABEL[selectedCableType]
      : 'тип по объектам';
  const controlCableType = selectedCableTypesMixed
    ? null
    : selectedCableType ?? defaultCableType;
  const cableTypeControlLabel = selectedRowKeys.length > 0
    ? 'Тип для выбранных:'
    : 'Тип по умолчанию:';

  function renderElectricalTypeControls() {
    if (!controlCableType) return null;
    if (controlCableType === 'self_regulating') return null;
    if (controlCableType === 'self_regulating_tt') {
      return (
        <>
          <Text style={{ fontSize: 11, color: '#607080', alignSelf: 'center' }}>T проп., °C:</Text>
          <InputNumber<number> size="small" value={vaporTemperature} onChange={setVaporTemperature} style={{ width: 92 }} />
          <Checkbox
            checked={aggressiveProduct}
            onChange={(e) => setAggressiveProduct(e.target.checked)}
          >
            <span style={{ fontSize: 12 }}>агр.</span>
          </Checkbox>
        </>
      );
    }
    if (controlCableType === 'single_core' || controlCableType === 'three_core') {
      const connectionOptions = controlCableType === 'single_core'
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
      return (
        <>
          <Select size="small" value={connectionType} onChange={setConnectionType} options={connectionOptions} style={{ width: 118 }} />
          <Text style={{ fontSize: 11, color: '#607080', alignSelf: 'center' }}>U:</Text>
          <InputNumber<number> size="small" min={1} value={supplyVoltage} onChange={setSupplyVoltage} style={{ width: 76 }} />
          <Text style={{ fontSize: 11, color: '#607080', alignSelf: 'center' }}>w:</Text>
          <InputNumber<number> size="small" min={1} max={1.5} step={0.05} value={windingCoefficient} onChange={setWindingCoefficient} style={{ width: 72 }} />
          <Text style={{ fontSize: 11, color: '#607080', alignSelf: 'center' }}>h:</Text>
          <InputNumber<number> size="small" min={0} step={0.1} value={heatingHeight} onChange={setHeatingHeight} style={{ width: 76 }} />
          <Text style={{ fontSize: 11, color: '#607080', alignSelf: 'center' }}>шаг:</Text>
          <InputNumber<number> size="small" min={0.05} max={0.5} step={0.01} value={layingStep} onChange={setLayingStep} style={{ width: 76 }} />
        </>
      );
    }
    return null;
  }

  return (
    <>
      <Space direction="vertical" size={5} style={{ width: '100%' }}>

        {/* Summary banner */}
        <div className="common-data-banner">
          <span>
            <span className="label">СО{variant} · {bannerCableTypeLabel} · </span>
            {bannerStats}
          </span>
          {failedCount > 0 && (
            <Tag color="error" icon={<CloseCircleFilled />}>
              Ошибок: {failedCount}
            </Tag>
          )}
        </div>

        {/* ActionBar */}
        <div className="actionbar-srs">
          <Button size="small" onClick={() => navigate(ROUTES.heatCalc)}>
            ← Теплопотери
          </Button>
          <span className="sep" />
          {[1, 2, 3, 4].map((n) => (
            <Button
              key={n}
              size="small"
              type={variant === n ? 'primary' : 'default'}
              onClick={() => {
                setTablePage(1);
                setVariant(n);
              }}
            >
              СО{n}
            </Button>
          ))}
          <span className="sep" />
          <Text style={{ fontSize: 11, color: '#607080', alignSelf: 'center' }}>{cableTypeControlLabel}</Text>
          <Select<CableTypeKey>
            size="small"
            value={controlCableType ?? undefined}
            placeholder="Несколько типов"
            disabled={isJobActive}
            onChange={(next) => {
              if (selectedRowKeys.length === 0) {
                setDefaultCableType(next);
              } else {
                setCableTypeDraftByObjectId((prev) => {
                  const nextDrafts = { ...prev };
                  for (const objectId of selectedRowKeys) {
                    nextDrafts[objectId] = next;
                  }
                  return nextDrafts;
                });
              }
              setConnectionType('line_1ph');
            }}
            options={cableTypeOptions}
            style={{ width: 210 }}
          />
          {renderElectricalTypeControls()}
          {isEmployee && (
            <>
              <span className="sep" />
              <Text style={{ fontSize: 11, color: '#607080', alignSelf: 'center' }}>База:</Text>
              <Segmented<CableSource>
                size="small"
                value={cableSource}
                onChange={setCableSource}
                options={[
                  { label: 'Встроенная', value: 'builtin' },
                  { label: 'Внешняя', value: 'extended' },
                  { label: 'Все', value: 'all' },
                ]}
              />
            </>
          )}
          <span className="sep" />
          <Button
            size="small"
            type="primary"
            icon={<ReloadOutlined />}
            loading={batchMut.isPending || isJobActive}
            disabled={selectedObjectsCount === 0 || isJobActive}
            onClick={() =>
              batchMut.mutate({
                scope: 'selected',
                objectIds: selectedRowKeys,
              })
            }
          >
            Пересчитать выбранные ({selectedObjectsCount})
          </Button>
          <Popconfirm
            title={`Пересчитать электрорасчёт для всех объектов СО${variant}?`}
            description="Существующие результаты этого варианта будут обновлены. Вы уверены?"
            okText="Да, пересчитать все"
            okButtonProps={{ danger: true }}
            cancelText="Отмена"
            onConfirm={() => batchMut.mutate({ scope: 'all' })}
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
            aria-label="Настройки отображения"
            onClick={openColumnSettings}
          >
            Настройки отображения
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
          <div style={{ marginLeft: 'auto' }}>
            <Button size="small" onClick={() => navigate(ROUTES.specification)}>
              Спецификация →
            </Button>
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
          ) : (
            <Table<ProjectObject>
              className={`calc-spreadsheet calc-spreadsheet--${resolvedTableFontSize.key} electrical-spreadsheet`}
              rowKey="id"
              size="small"
              loading={isElectricalPageFetching}
              pagination={{
                current: tablePage,
                pageSize: tablePageSize,
                total: filteredTableCount,
                pageSizeOptions: ['25', '50', '100'],
                showSizeChanger: true,
                hideOnSinglePage: filteredTableCount <= tablePageSize,
                showTotal: (total, range) => `${range[0]}-${range[1]} из ${total}`,
                size: 'small',
              }}
              dataSource={objects}
              onChange={handleElectricalTableChange}
              scroll={{ x: electricalTableScrollX, y: 'calc(100vh - 430px)' }}
              rowClassName={(obj) =>
                [
                  electricalCalcError(stats.calcByObjectId[obj.id]) ? 'row-invalid' : '',
                  activeRowId === obj.id ? 'electrical-row-active' : '',
                ].filter(Boolean).join(' ')
              }
              onRow={(obj) => ({
                onClick: (event) => {
                  if ((event.target as HTMLElement).closest('.ant-table-selection-column')) return;
                  setActiveRowId(obj.id);
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
              ⓘ Красная строка = ошибка подбора кабеля. Отметьте строки для пересчёта выбранных или используйте «Пересчитать все».
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
        />
      )}
    </>
  );
}
