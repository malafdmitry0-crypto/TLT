import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Button,
  Card,
  Checkbox,
  Input,
  InputNumber,
  Modal,
  Popconfirm,
  Segmented,
  Select,
  Space,
  Table,
  Tag,
  Tooltip,
  Typography,
  message as antdMessage,
  type TableProps,
} from 'antd';
import {
  CheckOutlined,
  CheckSquareOutlined,
  CloseCircleOutlined,
  CloseOutlined,
  CopyOutlined,
  DeleteOutlined,
  FilterFilled,
  FireOutlined,
  PlusOutlined,
  SaveOutlined,
  TableOutlined,
  ThunderboltOutlined,
} from '@ant-design/icons';
import { useMutation, useQuery } from '@tanstack/react-query';
import type { ColumnsType, ColumnType } from 'antd/es/table';

import ObjectWizard from '@/components/wizard/ObjectWizard';
import ImportExcelButton from '@/components/ImportExcelButton';
import ExportObjectsButton from '@/components/ExportObjectsButton';
import EmptyProjectState from '@/components/common/EmptyProjectState';
import { OBJECT_TYPE_LABELS } from '@/constants/objectTypes';
import { MATERIAL_LABELS } from '@/constants/materials';
import { useAuthStore } from '@/store/authStore';
import { useProjectStore } from '@/store/projectStore';
import { useWorkspaceHeaderStore } from '@/store/workspaceHeaderStore';
import { getObjectQueryCapabilities, listObjects, queryObjects } from '@/api/projects';
import { getUserPreference, updateUserPreference } from '@/api/preferences';
import { getInsulation } from '@/api/references';
import { useHeatCalcMutations } from '@/hooks/useHeatCalcMutations';
import type {
  ObjectQueryCapabilities,
  ObjectQueryFieldCapability,
  ObjectQueryFilter as BackendObjectQueryFilter,
  ProjectObject,
  ProjectObjectsQueryRequest,
} from '@/types/project';
import { formatNumber } from '@/utils/formatters';
import { buildTsv, copyToClipboard } from '@/utils/clipboard';
import { findDN } from '@/utils/objectWizardUtils';
import {
  HEATCALC_TABLE_COLUMN_CATALOG,
  HEATCALC_TABLE_COLUMN_PREF_KEY,
  clearRegisteredTableColumnCache,
  createTableColumnSettingsPatch,
  getAvailableTableColumnKeys,
  getDefaultTableColumnSettings,
  getDefaultVisibleTableColumnKeys,
  getVisibleTableColumnMetas,
  normalizeTableColumnSettings,
  readGuestTableColumnSettings,
  readRegisteredTableColumnCache,
  writeGuestTableColumnSettings,
  writeRegisteredTableColumnCache,
  type HeatCalcColumnKey,
  type HeatCalcObjectType,
  type HeatCalcTableColumnSettings,
} from '@/utils/heatCalcTableColumns';
import {
  activeTableFilterCount,
  createEmptyTableViewState,
  hasActiveTableViewState,
  isColumnFilterActive,
  removeHiddenTableViewState,
  type HeatCalcColumnFilter,
  type HeatCalcTableViewState,
} from '@/utils/heatCalcTableFindability';

const { Text } = Typography;

/** В MVP мастер знает только две формы — трубу и резервуар. */
type WizardObjectType = HeatCalcObjectType;

type TableColumnRenderSpec = Pick<ColumnType<ProjectObject>, 'render' | 'ellipsis' | 'align'> & {
  copyValue: (record: ProjectObject, index: number) => string;
};

const TABLE_SETTINGS_TYPE_LABELS: Record<HeatCalcObjectType, string> = {
  pipe: 'Труба',
  tank: 'Резервуар',
};

type HeatCalcFilterKind = 'text' | 'numberRange' | 'enum';
const DEFAULT_OBJECT_QUERY_PAGE_SIZE = 100;

const NUMBER_FILTER_COLUMNS = new Set<HeatCalcColumnKey>([
  'index',
  'pipe_outer_diameter',
  'pipe_length',
  'pipe_wall_thickness',
  'pipe_lambda',
  'insulation_layer_count',
  'insulation_thickness',
  'first_insulation_lambda',
  'second_insulation_thickness',
  'second_insulation_lambda',
  'third_insulation_thickness',
  'third_insulation_lambda',
  'process_temperature',
  'ambient_temperature',
  'max_ambient_temperature',
  'max_process_temperature',
  'wind_speed',
  'alpha_vnesh',
  'climate_temperature_basis',
  'burial_depth',
  'ground_conductivity',
  'min_switch_temperature',
  'supply_voltage',
  'safety_factor',
  'valve_count',
  'flange_count',
  'support_count',
  'local_element_equiv_length',
  'tank_diameter',
  'tank_height',
  'tank_length',
  'tank_width',
  'tank_wall_thickness',
  'tank_wall_lambda',
  'q_additional',
]);

const ENUM_FILTER_COLUMNS = new Set<HeatCalcColumnKey>([
  'type',
  'pipe_dn',
  'pipe_material',
  'pipe_lambda_mode',
  'placement',
  'insulation_material',
  'second_insulation_material',
  'third_insulation_material',
  'insulation_cover_material',
  'ambient_temperature_source',
  'wind_speed_source',
  'environment',
  'zone_classification',
  'temperature_group',
  'climate_city',
  'climate_region',
  'climate_key',
  'ground_type',
  'steam_tracing',
  'tank_shape',
]);

function filterKindForColumn(
  key: HeatCalcColumnKey,
  capability?: ObjectQueryFieldCapability,
): HeatCalcFilterKind {
  if (capability?.filter.enabled) {
    if (capability.filter.ops.includes('range')) return 'numberRange';
    if (capability.filter.ops.includes('in')) return 'enum';
    return 'text';
  }
  if (NUMBER_FILTER_COLUMNS.has(key)) return 'numberRange';
  if (ENUM_FILTER_COLUMNS.has(key)) return 'enum';
  return 'text';
}

function backendFilterFromColumnFilter(
  key: HeatCalcColumnKey,
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

function buildObjectQueryRequest(
  objectType: HeatCalcObjectType,
  state: HeatCalcTableViewState,
  page: number,
  pageSize: number,
  capabilities?: ObjectQueryCapabilities,
): ProjectObjectsQueryRequest {
  const capabilityByKey = new Map(capabilities?.fields.map((field) => [field.key, field]) ?? []);
  const filters = Object.entries(state.filters)
    .map(([key, filter]) => filter
      ? backendFilterFromColumnFilter(key, filter, capabilityByKey.get(key))
      : null)
    .filter((filter): filter is BackendObjectQueryFilter => filter != null);
  const sortCapability = state.sort ? capabilityByKey.get(state.sort.columnKey) : undefined;
  return {
    object_type: objectType,
    page,
    page_size: pageSize,
    filters,
    sort: state.sort && (sortCapability?.sort.enabled ?? true)
      ? { key: state.sort.columnKey, dir: state.sort.direction }
      : null,
  };
}

function toInputNumberValue(value: unknown) {
  const numericValue = Number(value);
  return Number.isFinite(numericValue) ? numericValue : null;
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
  kind: HeatCalcFilterKind;
  filter?: HeatCalcColumnFilter;
  enumOptions: { label: string; value: string }[];
  onApply: (filter?: HeatCalcColumnFilter) => void;
  onReset: () => void;
  onClose: () => void;
}) {
  const [textValue, setTextValue] = useState('');
  const [minValue, setMinValue] = useState<number | null>(null);
  const [maxValue, setMaxValue] = useState<number | null>(null);
  const [enumValues, setEnumValues] = useState<string[]>([]);
  const [includeEmpty, setIncludeEmpty] = useState(false);

  useEffect(() => {
    setTextValue(filter?.kind === 'text' ? filter.value : '');
    setMinValue(filter?.kind === 'numberRange' ? toInputNumberValue(filter.min) : null);
    setMaxValue(filter?.kind === 'numberRange' ? toInputNumberValue(filter.max) : null);
    setEnumValues(filter?.kind === 'enum' ? filter.values : []);
    setIncludeEmpty(
      filter?.kind === 'numberRange' || filter?.kind === 'enum'
        ? !!filter.includeEmpty
        : false,
    );
  }, [filter]);

  const invalidRange = kind === 'numberRange'
    && minValue != null
    && maxValue != null
    && minValue > maxValue;

  function applyFilter() {
    if (kind === 'text') {
      const value = textValue.trim();
      onApply(value ? { kind: 'text', value } : undefined);
      onClose();
      return;
    }

    if (kind === 'numberRange') {
      if (invalidRange) return;
      onApply(
        minValue != null || maxValue != null || includeEmpty
          ? {
              kind: 'numberRange',
              min: minValue ?? undefined,
              max: maxValue ?? undefined,
              includeEmpty,
            }
          : undefined,
      );
      onClose();
      return;
    }

    onApply(
      enumValues.length > 0 || includeEmpty
        ? { kind: 'enum', values: enumValues, includeEmpty }
        : undefined,
    );
    onClose();
  }

  function resetFilter() {
    setTextValue('');
    setMinValue(null);
    setMaxValue(null);
    setEnumValues([]);
    setIncludeEmpty(false);
    onReset();
    onClose();
  }

  return (
    <div className="table-filter-dropdown" onKeyDown={(event) => {
      if (event.key === 'Enter') applyFilter();
    }}>
      <div className="table-filter-title">{title}</div>
      {kind === 'text' && (
        <Input
          autoFocus
          allowClear
          size="small"
          value={textValue}
          placeholder="Найти"
          aria-label={`Поиск: ${title}`}
          onChange={(event) => setTextValue(event.target.value)}
        />
      )}
      {kind === 'numberRange' && (
        <div className="table-filter-number-range">
          <InputNumber
            size="small"
            value={minValue}
            placeholder="от"
            aria-label={`Минимум: ${title}`}
            onChange={(value) => setMinValue(toInputNumberValue(value))}
          />
          <InputNumber
            size="small"
            value={maxValue}
            placeholder="до"
            aria-label={`Максимум: ${title}`}
            onChange={(value) => setMaxValue(toInputNumberValue(value))}
          />
          {invalidRange && <Text type="danger">Минимум больше максимума</Text>}
        </div>
      )}
      {kind === 'enum' && (
        <Select
          mode="multiple"
          allowClear
          showSearch
          size="small"
          value={enumValues}
          options={enumOptions}
          placeholder="Значения"
          aria-label={`Значения: ${title}`}
          optionFilterProp="label"
          maxTagCount="responsive"
          onChange={setEnumValues}
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

function insulationEntryLabel(entry: { name: string; density_kg_m3?: number | string }) {
  return entry.density_kg_m3 != null
    ? `${entry.name}, ${entry.density_kg_m3} кг/м³`
    : entry.name;
}

function insulationLayerCount(record: ProjectObject) {
  return String(record.params?.insulation_layer_count ?? (
    Array.isArray(record.params?.insulation_layers) ? record.params.insulation_layers.length : 1
  ));
}

function tankShapeLabel(shape: unknown) {
  if (shape === 'cylindrical') return 'Цилиндр';
  if (shape === 'rectangular') return 'Прямоуг.';
  if (shape === 'spherical') return 'Сфера';
  return '—';
}

function placementLabel(placement: unknown) {
  if (placement === 'indoor') return 'В помещении';
  if (placement === 'underground') return 'Подземно';
  if (placement === 'outdoor') return 'Открыто';
  return '—';
}

function mmParam(record: ProjectObject, key: string) {
  const value = Number(record.params?.[key]);
  return Number.isFinite(value) ? formatNumber(value * 1000, 0) : '—';
}

function formatNumericValue(value: unknown, digits = 0) {
  const numericValue = Number(value);
  return Number.isFinite(numericValue) ? formatNumber(numericValue, digits) : '—';
}

function formatParamNumber(record: ProjectObject, key: string, digits = 0) {
  return formatNumericValue(record.params?.[key], digits);
}

function formatParamMetersAsMm(record: ProjectObject, key: string) {
  const value = Number(record.params?.[key]);
  return Number.isFinite(value) ? formatNumber(value * 1000, 0) : '—';
}

function formatParamText(record: ProjectObject, key: string) {
  const value = record.params?.[key];
  return value == null || value === '' ? '—' : String(value);
}

function insulationLayer(record: ProjectObject, index: number) {
  const layers = record.params?.insulation_layers;
  return Array.isArray(layers) && typeof layers[index] === 'object' && layers[index] !== null
    ? layers[index] as Record<string, unknown>
    : null;
}

function insulationLayerThickness(record: ProjectObject, index: number) {
  const layer = insulationLayer(record, index);
  const value = Number(layer?.thickness);
  return Number.isFinite(value) ? formatNumber(value * 1000, 0) : '—';
}

function insulationLayerMaterial(
  record: ProjectObject,
  index: number,
  materialLabel: (material: unknown) => string,
) {
  return materialLabel(insulationLayer(record, index)?.material);
}

function insulationLayerConductivity(record: ProjectObject, index: number) {
  return formatNumericValue(insulationLayer(record, index)?.conductivity, 3);
}

function lambdaModeLabel(value: unknown) {
  if (value === 'manual') return 'Ручн.';
  if (value === 'reference') return 'Справ.';
  return value == null || value === '' ? '—' : String(value);
}

function environmentLabel(value: unknown) {
  if (value === 'normal') return 'Нормальная';
  if (value === 'aggressive') return 'Агрессивная';
  return value == null || value === '' ? '—' : String(value);
}

function zoneLabel(value: unknown) {
  if (value === 'safe') return 'Безопасная';
  if (value === 'hazardous') return 'Взрывоопасная';
  return value == null || value === '' ? '—' : String(value);
}

function booleanChoiceLabel(value: unknown) {
  if (value === true || value === 'yes') return 'Да';
  if (value === false || value === 'no') return 'Нет';
  return value == null || value === '' ? '—' : String(value);
}

function climateBasisLabel(value: unknown) {
  if (value == null || value === '') return '—';
  const numericValue = Number(value);
  return Number.isFinite(numericValue) ? formatNumber(numericValue, 2) : String(value);
}

function sourceText(source: unknown) {
  if (source === 'climate') return 'из климата';
  if (source === 'manual') return 'вручную';
  return '—';
}

function countParamValue(record: ProjectObject, key: string) {
  if (record.object_type !== 'pipe') return '—';
  const value = Number(record.params?.[key]);
  return Number.isFinite(value) ? formatNumber(value, 0) : '—';
}

function tankDimensions(record: ProjectObject) {
  const shape = record.params?.shape;
  if (shape === 'cylindrical') {
    return `Ø${mmParam(record, 'diameter')} × H${mmParam(record, 'height')} мм`;
  }
  if (shape === 'rectangular') {
    return `${mmParam(record, 'length')} × ${mmParam(record, 'width')} × ${mmParam(record, 'height')} мм`;
  }
  if (shape === 'spherical') {
    return `Ø${mmParam(record, 'diameter')} мм`;
  }
  return '—';
}

interface WizardState {
  type: WizardObjectType;
  editingObject?: ProjectObject;
}

/** Статус-бейдж в левой панели: «N объектов, все рассчитаны» или «не рассчитано M». */
function ObjectCountBadge({
  total,
  valid,
  pipeTotal,
  tankTotal,
}: {
  total: number;
  valid: number;
  pipeTotal: number;
  tankTotal: number;
}) {
  if (pipeTotal + tankTotal === 0) return null;
  return (
    <div className="object-count-badge" aria-label="Статус объектов">
      <span className="object-count-segment">
        Труб: <strong>{pipeTotal}</strong>
      </span>
      <span className="object-count-segment">
        Рез.: <strong>{tankTotal}</strong>
      </span>
      <span className="object-count-segment">
        Объектов: <strong>{total}</strong>
      </span>
      {total === 0 ? (
        <span className="object-count-segment warning">Нет выбранного типа</span>
      ) : valid < total ? (
        <span className="object-count-segment warning">
          Не рассчитано: <strong>{total - valid}</strong>
        </span>
      ) : (
        <span className="object-count-segment success">Все рассчитаны ✓</span>
      )}
    </div>
  );
}

export default function HeatCalcPage() {
  const project = useProjectStore((s) => s.currentProject);
  const role = useAuthStore((s) => s.role);
  const registeredUserId = useAuthStore((s) => s.user?.id ?? null);
  const isRegisteredUser = role === 'employee' || role === 'admin';
  const [wizardState, setWizardState] = useState<WizardState | null>(null);
  const [newWizardRevision, setNewWizardRevision] = useState(0);
  const [activeObjectType, setActiveObjectType] = useState<WizardObjectType>('pipe');
  const [selectedRowKeys, setSelectedRowKeys] = useState<string[]>([]);
  const [tableViewStateByType, setTableViewStateByType] = useState<
    Record<HeatCalcObjectType, HeatCalcTableViewState>
  >(() => ({
    pipe: createEmptyTableViewState(),
    tank: createEmptyTableViewState(),
  }));
  const [tablePageByType, setTablePageByType] = useState<Record<HeatCalcObjectType, number>>({
    pipe: 1,
    tank: 1,
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
  const [columnSettingsOpen, setColumnSettingsOpen] = useState(false);
  const [columnSettingsType, setColumnSettingsType] = useState<HeatCalcObjectType>('pipe');
  const [draftTableColumnSettings, setDraftTableColumnSettings] = useState<HeatCalcTableColumnSettings>(
    () => tableColumnSettings,
  );
  const setWorkspaceHeaderContext = useWorkspaceHeaderStore((s) => s.setContext);

  const { data: objects = [] } = useQuery({
    queryKey: ['project', project?.id, 'objects'],
    queryFn: () => listObjects(project!.id),
    enabled: !!project,
  });
  const activeTableViewState = tableViewStateByType[activeObjectType];
  const activeTablePage = tablePageByType[activeObjectType];

  const { data: objectQueryCapabilities } = useQuery({
    queryKey: ['project', project?.id, 'objects', 'query-capabilities', activeObjectType],
    queryFn: () => getObjectQueryCapabilities(project!.id, activeObjectType),
    enabled: !!project,
    staleTime: 5 * 60_000,
  });

  const { data: insulationMaterials = [] } = useQuery({
    queryKey: ['insulation'],
    queryFn: getInsulation,
    enabled: !!project,
    staleTime: 5 * 60_000,
  });

  const { data: persistedTableColumnPreference } = useQuery({
    queryKey: ['preference', HEATCALC_TABLE_COLUMN_PREF_KEY],
    queryFn: () => getUserPreference<HeatCalcTableColumnSettings>(HEATCALC_TABLE_COLUMN_PREF_KEY),
    enabled: isRegisteredUser,
    staleTime: 30_000,
  });

  const updateTableColumnPreference = useMutation({
    mutationFn: (settings: HeatCalcTableColumnSettings) =>
      updateUserPreference<HeatCalcTableColumnSettings>(
        HEATCALC_TABLE_COLUMN_PREF_KEY,
        normalizeTableColumnSettings(settings),
      ),
    onSuccess: (preference) => {
      const normalized = normalizeTableColumnSettings(preference.value);
      setTableColumnSettings(normalized);
      if (preference.user_id) {
        writeRegisteredTableColumnCache(preference.user_id, normalized);
      }
      setColumnSettingsOpen(false);
      antdMessage.success('Поля таблицы сохранены');
    },
    onError: (error) => {
      antdMessage.error(error instanceof Error ? error.message : 'Не удалось сохранить поля таблицы');
    },
  });

  const visibleObjects = useMemo(
    () => objects.filter((obj) => obj.object_type === activeObjectType),
    [objects, activeObjectType],
  );
  const objectQueryRequest = useMemo(
    () => buildObjectQueryRequest(
      activeObjectType,
      activeTableViewState,
      activeTablePage,
      objectQueryCapabilities?.default_page_size ?? DEFAULT_OBJECT_QUERY_PAGE_SIZE,
      objectQueryCapabilities,
    ),
    [activeObjectType, activeTablePage, activeTableViewState, objectQueryCapabilities],
  );
  const { data: objectQueryResult } = useQuery({
    queryKey: ['project', project?.id, 'objects', 'query', objectQueryRequest],
    queryFn: () => queryObjects(project!.id, objectQueryRequest),
    enabled: !!project && !!objectQueryCapabilities,
    placeholderData: (previous) => previous,
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
      setTableColumnSettings(
        readRegisteredTableColumnCache(registeredUserId) ?? getDefaultTableColumnSettings(),
      );
      return;
    }
    setTableColumnSettings(readGuestTableColumnSettings());
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
      if (!current || current.type === activeObjectType) return current;
      return null;
    });
  }, [activeObjectType]);

  const closeWizard = () => setWizardState(null);
  const openNewObjectMode = (obj?: ProjectObject) => {
    const type =
      obj?.object_type === 'pipe' || obj?.object_type === 'tank'
        ? obj.object_type
        : wizardState?.type ?? activeObjectType;
    if (type !== 'pipe' && type !== 'tank') return;
    setNewWizardRevision((revision) => revision + 1);
    setWizardState({ type });
  };
  const { add, edit, remove, batchCalc } = useHeatCalcMutations(
    project?.id,
    handleObjectSaved,
    handleObjectSaved,
    closeWizard,
  );

  const validCount = visibleObjects.filter((o) => o.is_valid).length;
  const totalCount = visibleObjects.length;
  const pipeCount = objects.filter((o) => o.object_type === 'pipe').length;
  const tankCount = objects.filter((o) => o.object_type === 'tank').length;
  const activeObjectTypeLabel = activeObjectType === 'pipe' ? 'Труба' : 'Резервуар';
  const formCaptionTitle = wizardState
    ? wizardState.editingObject
      ? `Параметры объекта «${String(
          wizardState.editingObject.params?.name ?? OBJECT_TYPE_LABELS[wizardState.type],
        )}»`
      : `Параметры: ${OBJECT_TYPE_LABELS[wizardState.type]}`
    : 'Параметры объекта';
  const formCaptionMode = wizardState?.editingObject ? 'edit' : wizardState ? 'new' : 'idle';
  const formCaptionModeLabel =
    formCaptionMode === 'edit'
      ? 'Режим: редактирование'
      : formCaptionMode === 'new'
        ? 'новая запись'
        : 'выберите строку или нажмите «+»';
  const hasWizard = !!wizardState;
  const hasEditingObject = !!wizardState?.editingObject;
  const submittingObject = add.isPending || edit.isPending;

  useEffect(() => {
    if (!project) {
      setWorkspaceHeaderContext(null);
      return undefined;
    }

    setWorkspaceHeaderContext({
      title: formCaptionTitle,
      mode: formCaptionMode,
      modeLabel: formCaptionModeLabel,
    });

    return () => setWorkspaceHeaderContext(null);
  }, [
    formCaptionMode,
    formCaptionModeLabel,
    formCaptionTitle,
    project,
    setWorkspaceHeaderContext,
  ]);

  function openAddWizard(type: WizardObjectType = activeObjectType) {
    setNewWizardRevision((revision) => revision + 1);
    setWizardState({ type });
  }

  function handleObjectTypeChange(type: WizardObjectType) {
    setActiveObjectType(type);
    setSelectedRowKeys([]);
    const firstObject = objects.find((obj) => obj.object_type === type);
    setWizardState(firstObject ? { type, editingObject: { ...firstObject, object_type: type } } : null);
  }

  function openEditWizard(obj: ProjectObject) {
    // Редактировать можно только те типы, которые умеем — MVP: трубы и резервуары.
    // Другие типы (pump/platform/other) пока не имеют форм мастера.
    if (obj.object_type !== 'pipe' && obj.object_type !== 'tank') return;
    setWizardState({ type: obj.object_type, editingObject: obj });
  }

  function handleWizardSubmit(params: Record<string, unknown>) {
    if (wizardState?.editingObject) {
      const currentState = wizardState;
      const editingObject = currentState.editingObject!;
      const optimisticObject: ProjectObject = {
        ...editingObject,
        params,
      };
      setWizardState({ type: currentState.type, editingObject: optimisticObject });
      edit.mutate({ objectId: editingObject.id, params });
    } else if (wizardState) {
      add.mutate({
        object_type: wizardState.type,
        params,
        sort_order: objects.length,
      });
    }
  }

  function duplicateCurrentObject() {
    const source = wizardState?.editingObject;
    if (!source || (source.object_type !== 'pipe' && source.object_type !== 'tank')) return;
    const sourceName = String(source.params?.name ?? OBJECT_TYPE_LABELS[source.object_type]);
    add.mutate({
      object_type: source.object_type,
      params: {
        ...source.params,
        name: `${sourceName} (копия)`,
      },
      sort_order: objects.length,
    });
  }

  function removeCurrentObject() {
    const source = wizardState?.editingObject;
    if (!source) return;
    remove.mutate(source.id);
  }

  function handleObjectSaved(obj: ProjectObject) {
    setLastSavedObject(obj);
    openNewObjectMode(obj);
  }

  const selectedRowId = wizardState?.editingObject?.id;
  const selectedObject = selectedRowId ? visibleObjects.find((o) => o.id === selectedRowId) : null;
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
    return (
      <div className="calc-assumptions-panel">
        <strong>Расчётные допущения:</strong>
        <span>Tср: {paramValue('ambient_temperature', 0)}°C ({sourceText(selectedParams?.ambient_temperature_source)})</span>
        <span>ветер: {paramValue('wind_speed', 1)} м/с ({sourceText(selectedParams?.wind_speed_source)})</span>
        <span>α: {resultValue('alpha_vnesh', 1)} Вт/м²К</span>
        <span>K: {resultValue('safety_factor', 2)}</span>
        {isPipe ? (
          <>
            <span>Rст: {resultValue('wall_resistance', 4)}</span>
            <span>Rиз: {resultValue('insulation_resistance', 4)}</span>
            <span>{isUnderground ? 'Rгр' : 'Rвнеш'}: {resultValue('external_resistance', 4)}</span>
            <span>Lэфф: {resultValue('effective_length', 1)} м</span>
          </>
        ) : (
          <>
            <span>Rст: {resultValue('wall_resistance', 4)}</span>
            <span>Rиз: {resultValue('insulation_resistance', 4)}</span>
            <span>Rвнеш: {resultValue('external_resistance', 4)}</span>
            {isUnderground && <span>Rгр: {resultValue('ground_resistance', 4)}</span>}
            {isUnderground && <span>Sвозд: {resultValue('air_surface_area', 1)} м²</span>}
            {isUnderground && <span>Sгр: {resultValue('ground_surface_area', 1)} м²</span>}
          </>
        )}
        {isUnderground && <span>λгр: {resultValue('ground_conductivity', 2)} Вт/мК</span>}
      </div>
    );
  }

  const columnRenderers = useMemo<Record<HeatCalcColumnKey, TableColumnRenderSpec>>(() => ({
    index: {
      render: (_: unknown, __: ProjectObject, idx: number) => idx + 1,
      copyValue: (_record, idx) => String(idx + 1),
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
      render: (_: unknown, r: ProjectObject) => formatParamNumber(r, 'q_additional', 0),
      copyValue: (r) => formatParamNumber(r, 'q_additional', 0),
    },
  }), [dnValue, insulationLabel, outerDiameterMm]);

  const sourceColumnMetas = useMemo(
    () => getVisibleTableColumnMetas(activeObjectType, tableColumnSettings),
    [activeObjectType, tableColumnSettings],
  );
  const fieldCapabilityByKey = useMemo(
    () => new Map(objectQueryCapabilities?.fields.map((field) => [field.key, field]) ?? []),
    [objectQueryCapabilities],
  );
  const visibleTableColumnKeys = useMemo(
    () => sourceColumnMetas.map((meta) => meta.key),
    [sourceColumnMetas],
  );
  const visibleTableObjects = useMemo(
    () => objectQueryResult?.items ?? [],
    [objectQueryResult],
  );
  const visibleTableRows = useMemo(
    () => visibleTableObjects.map((record, index) => ({
      record,
      sourceIndex: (objectQueryResult?.page_info.offset ?? 0) + index,
    })),
    [objectQueryResult, visibleTableObjects],
  );
  const currentActiveFilterCount = activeTableFilterCount(activeTableViewState);
  const currentTableViewActive = hasActiveTableViewState(activeTableViewState);
  const activeTypeTotalCount = objectQueryResult?.counts.by_type[activeObjectType] ?? visibleObjects.length;
  const filteredTableCount = objectQueryResult?.counts.filtered ?? visibleTableObjects.length;
  const enumOptionsByColumn = useMemo(() => {
    const result: Record<HeatCalcColumnKey, { label: string; value: string }[]> = {};
    for (const meta of sourceColumnMetas) {
      const capability = fieldCapabilityByKey.get(meta.key);
      if (filterKindForColumn(meta.key, capability) !== 'enum') continue;
      result[meta.key] = (capability?.options?.items ?? []).map((item) => ({
        label: item.label,
        value: String(item.value),
      }));
    }
    return result;
  }, [fieldCapabilityByKey, sourceColumnMetas]);

  useEffect(() => {
    setTableViewStateByType((current) => {
      const cleaned = removeHiddenTableViewState(current[activeObjectType], visibleTableColumnKeys);
      if (
        cleaned.sort === current[activeObjectType].sort
        && Object.keys(cleaned.filters).length === Object.keys(current[activeObjectType].filters).length
      ) {
        return current;
      }
      return { ...current, [activeObjectType]: cleaned };
    });
  }, [activeObjectType, visibleTableColumnKeys]);

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
    if (!lastSavedObject) return;
    if (lastSavedObject.object_type !== activeObjectType) {
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
  }, [activeObjectType, currentTableViewActive, lastSavedObject, visibleTableObjects]);

  const setColumnFilter = useCallback((columnKey: HeatCalcColumnKey, filter?: HeatCalcColumnFilter) => {
    setTablePageByType((current) => ({ ...current, [activeObjectType]: 1 }));
    setTableViewStateByType((current) => {
      const nextFilters = { ...current[activeObjectType].filters };
      if (filter && isColumnFilterActive(filter)) {
        nextFilters[columnKey] = filter;
      } else {
        delete nextFilters[columnKey];
      }
      return {
        ...current,
        [activeObjectType]: {
          ...current[activeObjectType],
          filters: nextFilters,
        },
      };
    });
  }, [activeObjectType]);

  const resetColumnFilter = useCallback((columnKey: HeatCalcColumnKey) => {
    setColumnFilter(columnKey, undefined);
  }, [setColumnFilter]);

  const resetCurrentTableViewState = useCallback(() => {
    setTablePageByType((current) => ({ ...current, [activeObjectType]: 1 }));
    setTableViewStateByType((current) => ({
      ...current,
      [activeObjectType]: createEmptyTableViewState(),
    }));
  }, [activeObjectType]);

  const handleSourceTableChange = useCallback<NonNullable<TableProps<ProjectObject>['onChange']>>((pagination, _filters, sorter, extra) => {
    const nextPage = extra.action === 'sort' ? 1 : pagination.current ?? 1;
    const nextSorter = Array.isArray(sorter)
      ? sorter.find((item) => item.order)
      : sorter;
    const columnKey = typeof nextSorter?.columnKey === 'string' ? nextSorter.columnKey : null;
    const order = nextSorter?.order;
    setTablePageByType((current) => ({ ...current, [activeObjectType]: nextPage }));
    setTableViewStateByType((current) => ({
      ...current,
      [activeObjectType]: {
        ...current[activeObjectType],
        sort: columnKey && order
          ? { columnKey, direction: order === 'ascend' ? 'asc' : 'desc' }
          : undefined,
      },
    }));
  }, [activeObjectType]);

  const sourceColumns: ColumnsType<ProjectObject> = useMemo(
    () => sourceColumnMetas.map((meta) => {
      const renderer = columnRenderers[meta.key];
      const capability = fieldCapabilityByKey.get(meta.key);
      const filterEnabled = capability?.filter.enabled ?? true;
      const sortEnabled = capability?.sort.enabled ?? true;
      const filterKind = filterKindForColumn(meta.key, capability);
      const activeFilter = activeTableViewState.filters[meta.key];
      return {
        key: meta.key,
        title: meta.title,
        width: meta.width,
        ellipsis: meta.ellipsis ?? renderer.ellipsis,
        align: renderer.align,
        render: renderer.render,
        sorter: sortEnabled,
        sortOrder: sortEnabled && activeTableViewState.sort?.columnKey === meta.key
          ? activeTableViewState.sort.direction === 'asc'
            ? 'ascend'
            : 'descend'
          : null,
        showSorterTooltip: false,
        filtered: isColumnFilterActive(activeFilter),
        filterIcon: filterEnabled ? () => (
          <span role="button" aria-label={`Фильтр ${meta.label}`} className="table-filter-trigger">
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
      };
    }),
    [
      activeTableViewState,
      columnRenderers,
      enumOptionsByColumn,
      fieldCapabilityByKey,
      resetColumnFilter,
      setColumnFilter,
      sourceColumnMetas,
    ],
  );
  const tableScrollX = useMemo(
    () => Math.max(640, sourceColumnMetas.reduce((sum, column) => sum + column.width, 36)),
    [sourceColumnMetas],
  );

  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      if (!(e.ctrlKey || e.metaKey) || e.key !== 'c') return;
      if (selectedRowKeys.length === 0) return;
      const active = document.activeElement;
      if (active instanceof HTMLInputElement || active instanceof HTMLTextAreaElement) return;

      const selected = visibleTableRows
        .map((row) => ({ object: row.record, index: row.sourceIndex }))
        .filter(({ object }) => selectedRowKeys.includes(object.id));
      const header = sourceColumnMetas.map((meta) => meta.copyTitle ?? meta.title);
      const rows = selected.map(({ object, index }) =>
        sourceColumnMetas.map((meta) => columnRenderers[meta.key].copyValue(object, index)),
      );

      copyToClipboard(buildTsv([header, ...rows])).then(() => {
        antdMessage.success(`Скопировано строк: ${selected.length}`);
      });
    }

    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [columnRenderers, selectedRowKeys, sourceColumnMetas, visibleTableRows]);

  function openColumnSettings() {
    setColumnSettingsType(activeObjectType);
    setDraftTableColumnSettings(normalizeTableColumnSettings(tableColumnSettings));
    setColumnSettingsOpen(true);
  }

  function updateDraftColumn(type: HeatCalcObjectType, key: HeatCalcColumnKey, checked: boolean) {
    const current = draftTableColumnSettings.table[type];
    const nextKeys = checked ? [...current, key] : current.filter((item) => item !== key);
    setDraftTableColumnSettings((settings) => createTableColumnSettingsPatch(settings, type, nextKeys));
  }

  function resetDraftColumns(type: HeatCalcObjectType) {
    setDraftTableColumnSettings((settings) =>
      createTableColumnSettingsPatch(settings, type, getDefaultVisibleTableColumnKeys(type)),
    );
  }

  function selectAllDraftColumns(type: HeatCalcObjectType) {
    setDraftTableColumnSettings((settings) =>
      createTableColumnSettingsPatch(settings, type, getAvailableTableColumnKeys(type)),
    );
  }

  function applyColumnSettings() {
    const normalized = normalizeTableColumnSettings(draftTableColumnSettings);
    if (isRegisteredUser) {
      clearRegisteredTableColumnCache(registeredUserId);
      updateTableColumnPreference.mutate(normalized);
      return;
    }
    writeGuestTableColumnSettings(normalized);
    setTableColumnSettings(normalized);
    setColumnSettingsOpen(false);
    antdMessage.success('Поля таблицы сохранены');
  }

  function renderColumnSettingsGroups(type: HeatCalcObjectType) {
    const visibleKeys = new Set(draftTableColumnSettings.table[type]);
    const groups = HEATCALC_TABLE_COLUMN_CATALOG[type].reduce<Record<string, typeof HEATCALC_TABLE_COLUMN_CATALOG[HeatCalcObjectType]>>(
      (acc, column) => {
        acc[column.group] = acc[column.group] ?? [];
        acc[column.group].push(column);
        return acc;
      },
      {},
    );
    return Object.entries(groups).map(([group, columns]) => (
      <div className="column-settings-group" key={group}>
        <div className="column-settings-group-title">{group}</div>
        <div className="column-settings-options">
          {columns.map((column) => (
            <Checkbox
              key={column.key}
              checked={visibleKeys.has(column.key)}
              disabled={column.required}
              onChange={(event) => updateDraftColumn(type, column.key, event.target.checked)}
            >
              {column.label}
            </Checkbox>
          ))}
        </div>
      </div>
    ));
  }

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
        <div className="inline-form-shell">
          <div className="inline-form-srs">
            {wizardState ? (
              <ObjectWizard
                key={wizardState.editingObject?.id ?? `${wizardState.type}-new-${newWizardRevision}`}
                objectType={wizardState.type}
                onClose={closeWizard}
                onSubmit={handleWizardSubmit}
                submitting={add.isPending || edit.isPending}
                initialParams={wizardState.editingObject?.params}
              />
            ) : null}
          </div>
        </div>

        <div className="actionbar-srs" aria-label="Действия с объектами">
          <div className="actionbar-group actionbar-context-group">
            <span className="actionbar-context-label">{activeObjectTypeLabel}</span>
            <Segmented<WizardObjectType>
              value={activeObjectType}
              onChange={handleObjectTypeChange}
              options={[
                {
                  label: (
                    <Tooltip title="Трубопровод">
                      <span className="object-type-option" aria-label="Трубопровод">
                        <PipeTypeIcon />
                      </span>
                    </Tooltip>
                  ),
                  value: 'pipe',
                },
                {
                  label: (
                    <Tooltip title="Резервуары">
                      <span className="object-type-option" aria-label="Резервуары">
                        <TankTypeIcon />
                      </span>
                    </Tooltip>
                  ),
                  value: 'tank',
                },
              ]}
            />
          </div>

          <div className="actionbar-group actionbar-edit-group">
            <Tooltip title="Поля таблицы">
              <Button
                className="action-icon-button"
                icon={<TableOutlined />}
                aria-label="Настроить поля таблицы"
                onClick={openColumnSettings}
              />
            </Tooltip>
            {currentTableViewActive && (
              <Tooltip
                title={`Показано ${filteredTableCount} из ${activeTypeTotalCount}. Активных фильтров: ${currentActiveFilterCount}`}
              >
                <Tag color="blue" className="table-filter-status-tag">
                  {filteredTableCount}/{activeTypeTotalCount}
                </Tag>
              </Tooltip>
            )}
            <Tooltip title={currentTableViewActive ? 'Сбросить фильтры и сортировку' : 'Фильтры не активны'}>
              <span className="action-tooltip-wrap">
                <Button
                  className="action-icon-button"
                  icon={<CloseCircleOutlined />}
                  aria-label="Сбросить фильтры таблицы"
                  disabled={!currentTableViewActive}
                  onClick={resetCurrentTableViewState}
                />
              </span>
            </Tooltip>
            <Tooltip title="Добавить">
              <Button
                className="action-icon-button add"
                icon={<PlusOutlined />}
                aria-label="Добавить"
                onClick={() => openAddWizard()}
              />
            </Tooltip>
            <Tooltip title={hasEditingObject ? 'Создать на основании' : 'Выберите строку для копирования'}>
              <span className="action-tooltip-wrap">
                <Button
                  className="action-icon-button"
                  icon={<CopyOutlined />}
                  aria-label="Создать на основании"
                  disabled={!hasEditingObject}
                  loading={add.isPending}
                  onClick={duplicateCurrentObject}
                />
              </span>
            </Tooltip>
            <Tooltip title={hasWizard ? 'Применить к одному' : 'Откройте или создайте объект'}>
              <span className="action-tooltip-wrap">
                <Button
                  className="action-icon-button"
                  icon={<CheckOutlined />}
                  aria-label="Применить к одному"
                  disabled={!hasWizard}
                  loading={submittingObject}
                  onClick={() => document.getElementById('inline-object-save')?.click()}
                />
              </span>
            </Tooltip>
            <Tooltip title="Массовое применение будет доступно после согласования правил переноса параметров">
              <span className="action-tooltip-wrap">
                <Button
                  className="action-icon-button"
                  icon={<CheckSquareOutlined />}
                  aria-label="Применить ко всем"
                  disabled
                />
              </span>
            </Tooltip>
            <Tooltip title={hasEditingObject ? 'Удалить' : 'Выберите строку для удаления'}>
              <span className="action-tooltip-wrap">
                <Popconfirm
                  title="Удалить объект?"
                  okText="Удалить"
                  cancelText="Отмена"
                  disabled={!hasEditingObject}
                  onConfirm={removeCurrentObject}
                >
                  <Button
                    danger
                    className="action-icon-button"
                    icon={<DeleteOutlined />}
                    aria-label="Удалить"
                    loading={remove.isPending}
                    disabled={!hasEditingObject}
                  />
                </Popconfirm>
              </span>
            </Tooltip>
          </div>

          <div className="actionbar-group actionbar-save-group">
            <Tooltip title={hasWizard ? 'Сохранить изменения' : 'Откройте или создайте объект'}>
              <span className="action-tooltip-wrap">
                <Button
                  className="action-icon-button save"
                  icon={<SaveOutlined />}
                  aria-label="Сохранить изменения"
                  disabled={!hasWizard}
                  loading={submittingObject}
                  onClick={() => document.getElementById('inline-object-save')?.click()}
                />
              </span>
            </Tooltip>
            <Tooltip title={hasWizard ? 'Отменить' : 'Нет открытой формы'}>
              <span className="action-tooltip-wrap">
                <Button
                  className="action-icon-button"
                  icon={<CloseOutlined />}
                  aria-label="Отменить"
                  disabled={!hasWizard}
                  onClick={closeWizard}
                />
              </span>
            </Tooltip>
          </div>

          <div className="actionbar-group actionbar-io-group">
            <ImportExcelButton projectId={project.id} />
            {role === 'employee' && (
              <ExportObjectsButton
                projectId={project.id}
                projectName={project.name}
                disabled={objects.length === 0}
              />
            )}
          </div>

          <div className="actionbar-status">
            {selectedRowKeys.length > 0 && (
              <Tag color="blue" className="selection-status-tag">
                Выбрано: {selectedRowKeys.length} · Ctrl+C
              </Tag>
            )}
            <ObjectCountBadge
              total={totalCount}
              valid={validCount}
              pipeTotal={pipeCount}
              tankTotal={tankCount}
            />
          </div>
        </div>

        {renderAssumptionsPanel()}

        <Card size="small" className="workspace-table-card srs-table-wrap">
          <Table<ProjectObject>
            className="calc-spreadsheet"
            rowKey="id"
            size="small"
            pagination={{
              current: objectQueryResult?.page_info.page ?? activeTablePage,
              pageSize: objectQueryResult?.page_info.page_size ?? DEFAULT_OBJECT_QUERY_PAGE_SIZE,
              total: filteredTableCount,
              showSizeChanger: false,
              hideOnSinglePage: true,
              size: 'small',
            }}
            dataSource={visibleTableObjects}
            columns={sourceColumns}
            onChange={handleSourceTableChange}
            scroll={{
              x: tableScrollX,
              y: 'calc(100vh - 500px)',
            }}
            rowSelection={{
              type: 'checkbox',
              selectedRowKeys,
              onChange: (keys) => setSelectedRowKeys(keys as string[]),
              columnWidth: 36,
            }}
            rowClassName={(r) => {
              const classes = [];
              if (!r.is_valid) classes.push('row-invalid');
              if (r.id === selectedRowId) classes.push('row-selected');
              return classes.join(' ');
            }}
            onRow={(record) => ({
              onClick: (e) => {
                // Ignore clicks on checkbox cell
                if ((e.target as HTMLElement).closest('.ant-table-selection-column')) return;
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
                    {activeObjectType === 'pipe'
                      ? 'Трубопроводы не добавлены. Нажмите «+» или импортируйте XLSX/CSV.'
                      : 'Резервуары не добавлены. Нажмите «+» или импортируйте XLSX/CSV.'}
                  </Text>
                )
              ),
            }}
          />
          <div className="legend-row-srs">
            <span>
              ⓘ Клик по строке → форма выше показывает параметры. Красная строка = объект не рассчитан.
            </span>
            <Button
              type="primary"
              icon={<ThunderboltOutlined />}
              loading={batchCalc.isPending}
              disabled={validCount === 0}
              onClick={() => batchCalc.mutate()}
            >
              Электрорасчёт →
            </Button>
          </div>
        </Card>
      </Space>

      <Modal
        title="Поля таблицы"
        open={columnSettingsOpen}
        width={780}
        okText="Применить"
        cancelText="Отмена"
        confirmLoading={updateTableColumnPreference.isPending}
        onOk={applyColumnSettings}
        onCancel={() => setColumnSettingsOpen(false)}
      >
        <div className="column-settings-modal">
          <div className="column-settings-toolbar">
            <Segmented<HeatCalcObjectType>
              value={columnSettingsType}
              onChange={setColumnSettingsType}
              options={[
                { label: TABLE_SETTINGS_TYPE_LABELS.pipe, value: 'pipe' },
                { label: TABLE_SETTINGS_TYPE_LABELS.tank, value: 'tank' },
              ]}
            />
            <Space size={6}>
              <Button size="small" onClick={() => selectAllDraftColumns(columnSettingsType)}>
                Все поля
              </Button>
              <Button size="small" onClick={() => resetDraftColumns(columnSettingsType)}>
                По умолчанию
              </Button>
            </Space>
          </div>
          <div className="column-settings-list">
            {renderColumnSettingsGroups(columnSettingsType)}
          </div>
        </div>
      </Modal>
    </>
  );
}
