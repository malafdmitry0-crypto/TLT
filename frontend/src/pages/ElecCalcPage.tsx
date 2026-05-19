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
  CloseCircleFilled,
  CloseCircleOutlined,
  CopyOutlined,
  FilterFilled,
  MinusCircleFilled,
  ReloadOutlined,
  StopOutlined,
  TableOutlined,
  ThunderboltOutlined,
} from '@ant-design/icons';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useLocation, useNavigate } from 'react-router-dom';
import type { ColumnsType } from 'antd/es/table';

import {
  batchCalcElectrical,
  cancelCalcTask,
  copyElectricalVariant,
  enqueueElectricalBatchJob,
  getElectricalQueryCapabilities,
  getCalcTask,
  listCables,
  queryElectrical,
  selectCableManual,
  type CableSource,
  type CopyElectricalVariantResponse,
  type SelectionPolicy,
} from '@/api/calculations';
import type { ApiError } from '@/api/client';
import { getUserPreference, updateUserPreference } from '@/api/preferences';
import { referenceQueryKeys, referenceQueryOptions } from '@/api/referenceQueries';
import { getCablesTt, getResistiveCables } from '@/api/references';
import { useAuthStore } from '@/store/authStore';
import {
  normalizeCalculationVariant,
  useCalculationVariantStore,
} from '@/store/calculationVariantStore';
import { useProjectStore } from '@/store/projectStore';
import { useElectricalStats } from '@/hooks/useElectricalStats';
import { useFocusableTableScrollRegions } from '@/hooks/useFocusableTableScrollRegions';
import {
  electricalCalcError,
  electricalCalcErrorCode,
  electricalCalcGuidanceContext,
  electricalCalcHint,
  electricalCalcSuggestedActions,
  isElectricalCalcStale,
  isElectricalCalcSuccess,
  isElectricalCalcUnsupported,
} from '@/utils/calcStatus';
import { getCalcJobRefetchInterval, isActiveCalcJobStatus } from '@/utils/calcJobPolling';
import { buildTsv, copyToClipboard } from '@/utils/clipboard';
import { getElectricalErrorGuidance } from '@/utils/electricalErrorGuidance';
import { formatNumber, formatPower } from '@/utils/formatters';

import EmptyProjectState from '@/components/common/EmptyProjectState';
import ElectricalColumnSettingsModal from '@/components/electrical/ElectricalColumnSettingsModal';
import { ROUTES } from '@/routes/routes';
import type { ProjectObject, ProjectObjectsPageCursor } from '@/types/project';
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
  externalLabelSourceForCableRow,
  type CableCatalogRow,
  visibleCableRowsForSource,
} from '@/utils/cableCatalogSourceLabels';
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

function isApiError(error: unknown): error is ApiError {
  return error instanceof Error;
}

function isTargetVariantNotEmptyError(error: unknown): error is ApiError {
  return isApiError(error) && error.status === 409 && error.code === 'target_not_empty';
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
const SHOW_COMMERCIAL_CABLE_BASE_UI = false;
const SELECTION_POLICY_LABEL: Record<SelectionPolicy, string> = {
  technical_minimum: 'Технический',
  lowest_cost: 'Дешевле',
  fastest_delivery: 'Быстрее',
  in_stock: 'В наличии',
  preferred_supplier: 'Приоритет',
  balanced: 'Баланс',
};
const SELECTION_POLICY_OPTIONS = (Object.keys(SELECTION_POLICY_LABEL) as SelectionPolicy[]).map(
  (value) => ({
    value,
    label: SELECTION_POLICY_LABEL[value],
  }),
);
const isResistiveCableType = (type: CableTypeKey) => type === 'single_core' || type === 'three_core';
type CatalogStatusColor = 'default' | 'success' | 'warning' | 'error';
type CatalogStatus = { label: string; color: CatalogStatusColor };
type CableStatusRow = CableCatalogRow & {
  technical_data_complete?: boolean;
  price_per_meter?: number | null;
  stock_quantity_m?: number | null;
  stock_status?: string | null;
  lead_time_days?: number | null;
  supplier_priority?: number | null;
  is_preferred?: boolean;
};
type CableMarkSelectOption = {
  value: string;
  label: ReactNode;
  searchLabel: string;
  mark: string | null;
  optionSource: CableMarkOptionSource;
  cableSource?: CableSource;
  disabled?: boolean;
};
type CableMarkOptionSource = CableSource | 'project';

function hasCommercialData(row: CableStatusRow) {
  return row.price_per_meter != null
    || row.stock_quantity_m != null
    || (row.stock_status != null && row.stock_status !== 'unknown')
    || row.lead_time_days != null
    || row.supplier_priority != null
    || row.is_preferred === true;
}

function commercialStatus(rows: CableStatusRow[]): CatalogStatus {
  if (rows.length === 0) return { label: 'Нет коммерческих данных', color: 'default' };
  const completeCount = rows.filter(hasCommercialData).length;
  if (completeCount === 0) return { label: 'Нет коммерческих данных', color: 'default' };
  if (completeCount < rows.length) return { label: 'Коммерческие данные неполные', color: 'warning' };
  return { label: 'Коммерческие данные есть', color: 'success' };
}

function hasValue(value: unknown) {
  return value !== null && value !== undefined;
}

function hasTechnicalData(type: CableTypeKey, row: CableStatusRow) {
  if (typeof row.technical_data_complete === 'boolean') return row.technical_data_complete;
  if (type === 'self_regulating') {
    return hasValue(row.power_per_meter)
      && hasValue(row.max_temperature)
      && hasValue(row.min_temperature);
  }
  if (type === 'self_regulating_tt') {
    return hasValue(row.q1)
      && hasValue(row.q2)
      && hasValue(row.max_product_temp)
      && hasValue(row.max_vapor_temp);
  }
  if (type === 'single_core' || type === 'three_core') {
    return hasValue(row.resistance_ohm_km)
      && (hasValue(row.conductor_section_mm2) || hasValue(row.conductor_cross_section));
  }
  return false;
}

function technicalStatus(type: CableTypeKey | null, rows: CableStatusRow[]): CatalogStatus {
  if (!type) return { label: 'Техданные: несколько типов', color: 'default' };
  if (rows.length === 0) return { label: 'Нет техданных', color: 'error' };
  const completeCount = rows.filter((row) => hasTechnicalData(type, row)).length;
  if (completeCount === rows.length) return { label: 'Техданные полные', color: 'success' };
  if (completeCount > 0) return { label: 'Техданные неполные', color: 'warning' };
  return { label: 'Нет техданных', color: 'error' };
}

const ELECTRICAL_TABLE_PAGE_SIZE = 50;
type ElectricalBatchScope = 'all' | 'selected';
type ElectricalBatchMutationArgs = {
  scope: ElectricalBatchScope;
  objectIds?: string[];
  skipManual?: boolean;
};
type CopyElectricalVariantMutationArgs = {
  targetVariant: number;
  overwrite?: boolean;
};
const EMPTY_OBJECTS: ProjectObject[] = [];
const EMPTY_ELECTRICAL_CALCS: ElectricalCalcSummary[] = [];
const THREAD_OPTIONS = [
  { value: 1, label: '1' },
  { value: 2, label: '2' },
  { value: 3, label: '3' },
];
const TT_THREAD_OPTIONS = Array.from({ length: 100 }, (_, index) => {
  const value = index + 1;
  return { value, label: String(value) };
});

type CableLayoutDraft = {
  windingPitchMm?: number | null;
  numberOfThreads?: number | null;
};

type CableMarkSource = 'auto' | 'manual';
type ThreadSource = 'auto' | 'manual' | 'default' | 'previous_result';

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

const AUTO_CABLE_MARK_VALUE = '__auto__';
const CABLE_MARK_OPTION_SEPARATOR = '::';

function normalizeCableSource(value: unknown): CableSource | null {
  return value === 'builtin'
    || value === 'commercial'
    || value === 'extended'
    || value === 'all'
    ? value
    : null;
}

function normalizeCableMarkOptionSource(value: unknown): CableMarkOptionSource {
  if (value === 'project') return 'project';
  return normalizeCableSource(value) ?? 'builtin';
}

function cableMarkOptionValue(source: CableMarkOptionSource, mark: string) {
  return `${source}${CABLE_MARK_OPTION_SEPARATOR}${encodeURIComponent(mark)}`;
}

function catalogSourceFromSnapshot(calc: ElectricalCalcSummary | undefined): CableSource | null {
  const snapshot = calc?.cable_snapshot;
  if (!snapshot || typeof snapshot !== 'object' || Array.isArray(snapshot)) return null;
  return normalizeCableSource(snapshot.actual_catalog_source)
    ?? normalizeCableSource(snapshot.requested_catalog_source);
}

function externalCableOptionLabelSource(
  row: CableStatusRow,
  rows: CableStatusRow[],
  builtinRows: CableStatusRow[],
  source: CableSource,
): CableMarkOptionSource | null {
  return externalLabelSourceForCableRow(row, rows, builtinRows, source);
}

function getCableMark(calc: ElectricalCalcSummary | undefined) {
  const selectedCable = calc?.results?.selected_cable;
  return calc?.cable_mark ?? (typeof selectedCable === 'string' ? selectedCable : undefined);
}

function getCableMarkSource(calc: ElectricalCalcSummary | undefined): CableMarkSource {
  const value = calc?.cable_mark_source ?? calc?.params?.cable_mark_source;
  return value === 'manual' ? 'manual' : 'auto';
}

function cableMarkSourceTag(source: CableMarkSource) {
  if (source === 'manual') {
    return {
      color: 'purple',
      label: 'ручн.',
      tooltip: 'Марка кабеля выбрана вручную',
    };
  }
  return null;
}

function cableSnapshotStatusTag(calc: ElectricalCalcSummary | undefined) {
  if (!calc) return null;
  const status = calc.cable_snapshot_status;
  if (!status) return null;
  const technicalStatus = status.technical_status;
  const commercialStatus = status.commercial_status;
  if (technicalStatus === 'missing' || commercialStatus === 'missing') {
    return {
      color: 'orange',
      label: 'нет в базе',
      tooltip: status.message || 'Кабель сохранён в проекте, но отсутствует в текущей базе.',
    };
  }
  if (technicalStatus === 'changed') {
    const fields = Array.isArray(status.changed_fields) ? status.changed_fields.join(', ') : '';
    return {
      color: 'red',
      label: 'техн. изм.',
      tooltip: `${status.message || 'Технические параметры кабеля изменились.'}${fields ? ` Поля: ${fields}` : ''}`,
    };
  }
  if (commercialStatus === 'changed') {
    const fields = Array.isArray(status.changed_fields) ? status.changed_fields.join(', ') : '';
    return {
      color: 'gold',
      label: 'комм. изм.',
      tooltip: `${status.message || 'Коммерческие данные кабеля изменились.'}${fields ? ` Поля: ${fields}` : ''}`,
    };
  }
  if (technicalStatus === 'unknown' || commercialStatus === 'unknown') {
    return {
      color: 'default',
      label: 'стар.',
      tooltip: status.message || 'Расчёт создан без сохранённого снимка кабеля.',
    };
  }
  return null;
}

function shouldShowProjectCableOption(calc: ElectricalCalcSummary | undefined) {
  if (!calc?.cable_snapshot) return false;
  const technicalStatus = calc.cable_snapshot_status?.technical_status;
  return technicalStatus === 'missing' || technicalStatus === 'changed';
}

function getThreadSource(calc: ElectricalCalcSummary | undefined): ThreadSource | null {
  const value = calc?.results?.number_of_threads_source ?? calc?.params?.number_of_threads_source;
  return value === 'auto'
    || value === 'manual'
    || value === 'default'
    || value === 'previous_result'
    ? value
    : null;
}

function threadSourceTag(source: ThreadSource | null) {
  if (source === 'manual') {
    return { color: 'purple', label: 'ручн.', tooltip: 'Количество ниток задано вручную' };
  }
  if (source === 'auto') {
    return { color: 'blue', label: 'авто', tooltip: 'Количество ниток подобрано алгоритмом' };
  }
  if (source === 'previous_result') {
    return { color: 'gold', label: 'пред.', tooltip: 'Количество ниток взято из предыдущего результата' };
  }
  if (source === 'default') {
    return { color: 'default', label: 'по ум.', tooltip: 'Использовано значение по умолчанию' };
  }
  return null;
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

const STOCK_STATUS_LABEL: Record<string, string> = {
  in_stock: 'В наличии',
  limited: 'Ограничено',
  on_order: 'Под заказ',
  unknown: 'Неизвестно',
};

type ElectricalFilterKind = 'text' | 'numberRange' | 'enum' | 'boolean';

function valueText(value: unknown) {
  if (value === null || value === undefined || value === '') return '—';
  if (typeof value === 'boolean') return value ? 'Да' : 'Нет';
  return String(value);
}

function objectDisplayName(obj: ProjectObject) {
  return String(obj.params?.name ?? `${obj.object_type} ${obj.id}`);
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

function orderCableLengthValue(calc: ElectricalCalcSummary | undefined) {
  if (!calc?.results) return undefined;
  const explicitRaw = calc.results.order_cable_length;
  if (explicitRaw !== null && explicitRaw !== undefined && explicitRaw !== '') {
    const explicitLength = Number(explicitRaw);
    if (Number.isFinite(explicitLength)) return explicitLength;
  }
  return undefined;
}

function commercialValue(calc: ElectricalCalcSummary | undefined, key: string) {
  const commercial = calc?.results?.commercial;
  if (typeof commercial !== 'object' || commercial === null || Array.isArray(commercial)) return undefined;
  return (commercial as Record<string, unknown>)[key];
}

function commercialNumber(calc: ElectricalCalcSummary | undefined, key: string, digits = 2) {
  return numberText(commercialValue(calc, key), digits);
}

function selectionPolicyText(value: unknown) {
  if (typeof value !== 'string') return '—';
  return SELECTION_POLICY_LABEL[value as SelectionPolicy] ?? (value === 'manual_selection' ? 'Ручной' : value);
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
  if (['installed_cable_length', 'order_cable_length', 'total_power', 'current', 'voltage'].includes(key)) {
    return 'numberRange';
  }
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
  cableSource: CableSource,
  state: HeatCalcTableViewState,
  page: number,
  pageSize: number,
  capabilities?: { fields: ObjectQueryFieldCapability[] },
  cursor?: ProjectObjectsPageCursor | null,
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
    cable_source: cableSource,
    page,
    page_size: pageSize,
    after_sort_order: cursor?.sort_order,
    after_id: cursor?.id,
    after_key: cursor?.key,
    after_value: cursor?.value,
    after_value_is_null: cursor?.value_is_null,
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

export default function ElecCalcPage() {
  const project = useProjectStore((s) => s.currentProject);
  const role = useAuthStore((s) => s.role);
  const registeredUserId = useAuthStore((s) => s.user?.id ?? null);
  const isEmployee = role === 'employee' || role === 'admin';
  const isRegisteredUser = isEmployee;
  const location = useLocation();
  const navigationActiveJobId =
    (location.state as ElectricalNavigationState)?.activeJobId ?? null;
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

  const [cableSource, setCableSource] = useState<CableSource>('builtin');
  const [selectionPolicy, setSelectionPolicy] = useState<SelectionPolicy>('technical_minimum');
  const [defaultCableType, setDefaultCableType] =
    useState<CableTypeKey>('self_regulating');
  const [cableTypeDraftByObjectId, setCableTypeDraftByObjectId] =
    useState<Record<string, CableTypeKey>>({});
  const [supplyVoltage, setSupplyVoltage] = useState<number | null>(220);
  const [connectionType, setConnectionType] = useState<string>('line_1ph');
  const [windingCoefficient, setWindingCoefficient] = useState<number | null>(1);
  const [heatingHeight, setHeatingHeight] = useState<number | null>(null);
  const [layingStep, setLayingStep] = useState<number | null>(0.1);
  const [maintainTemperature, setMaintainTemperature] = useState<number | null>(null);
  const [vaporTemperature, setVaporTemperature] = useState<number | null>(null);
  const [aggressiveProduct, setAggressiveProduct] = useState(false);
  const [layoutDrafts, setLayoutDrafts] = useState<Record<string, CableLayoutDraft>>({});
  const [tablePage, setTablePage] = useState(1);
  const [tablePageSize, setTablePageSize] = useState(ELECTRICAL_TABLE_PAGE_SIZE);
  const [activeRowId, setActiveRowId] = useState<string | null>(null);
  const [cableMarkModalObjectId, setCableMarkModalObjectId] = useState<string | null>(null);
  const [cableMarkModalCableType, setCableMarkModalCableType] = useState<CableTypeKey | null>(null);
  const [cableMarkModalValue, setCableMarkModalValue] = useState<string | null>(null);
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
  const [electricalPageCursors, setElectricalPageCursors] =
    useState<Record<number, ProjectObjectsPageCursor | null>>({ 1: null });
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
    setElectricalPageCursors({ 1: null });
  }, [cableSource, project?.id, variant, tablePageSize, tableViewState]);

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
  const electricalPageCursor = electricalPageCursors[tablePage] ?? null;
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
  const nextElectricalPageCursor = pageInfo?.next_cursor;
  const stats = useElectricalStats(objects, elecCalcs);

  useEffect(() => {
    if (isElectricalPageFetching) return;
    const nextCursor = nextElectricalPageCursor;
    if (!nextCursor) return;
    setElectricalPageCursors((current) => {
      const nextPage = tablePage + 1;
      const existing = current[nextPage];
      if (
        existing?.id === nextCursor.id &&
        existing.sort_order === nextCursor.sort_order &&
        existing.key === nextCursor.key &&
        existing.value === nextCursor.value &&
        existing.value_is_null === nextCursor.value_is_null
      ) {
        return current;
      }
      return { ...current, [nextPage]: nextCursor };
    });
  }, [
    isElectricalPageFetching,
    nextElectricalPageCursor,
    tablePage,
  ]);

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
  const cableTypeForRecalculation = selectedCableTypesMixed
    ? defaultCableType
    : selectedCableType ?? defaultCableType;
  const visibleCableTypeControl = selectedCableTypesMixed ? null : cableTypeForRecalculation;

  const objectOverridesForIds = useCallback((objectIds: string[]) =>
    objectIds
      .map((objectId) => {
        const draftType = cableTypeDraftByObjectId[objectId];
        return draftType
          ? {
              object_id: objectId,
              cable_type: draftType,
            }
          : null;
      })
      .filter((item): item is { object_id: string; cable_type: CableTypeKey } => item != null),
  [cableTypeDraftByObjectId]);

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

  const effectiveSource: CableSource = cableSource;
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
    enabled: !!project,
    ...referenceQueryOptions,
  });
  const { data: resistiveCables } = useQuery({
    queryKey: referenceQueryKeys.resistiveCables(effectiveSource),
    queryFn: () => getResistiveCables(effectiveSource),
    enabled: !!project,
    ...referenceQueryOptions,
  });
  const { data: builtinResistiveCables } = useQuery({
    queryKey: referenceQueryKeys.resistiveCables('builtin'),
    queryFn: () => getResistiveCables('builtin'),
    enabled: !!project,
    ...referenceQueryOptions,
  });
  const visibleCableCatalog = useMemo<CableStatusRow[]>(() => {
    if (visibleCableTypeControl === 'self_regulating') {
      return visibleCableRowsForSource(cables, builtinCables, effectiveSource);
    }
    if (visibleCableTypeControl === 'self_regulating_tt') return ttCables;
    if (visibleCableTypeControl === 'single_core') {
      return visibleCableRowsForSource(
        resistiveCables?.single_core ?? [],
        builtinResistiveCables?.single_core ?? [],
        effectiveSource,
      );
    }
    if (visibleCableTypeControl === 'three_core') {
      return visibleCableRowsForSource(
        resistiveCables?.three_core ?? [],
        builtinResistiveCables?.three_core ?? [],
        effectiveSource,
      );
    }
    return [];
  }, [
    builtinCables,
    builtinResistiveCables,
    cables,
    effectiveSource,
    resistiveCables,
    ttCables,
    visibleCableTypeControl,
  ]);
  const commercialDataStatus = useMemo(
    () => commercialStatus(visibleCableCatalog),
    [visibleCableCatalog],
  );
  const technicalDataStatus = useMemo(
    () => technicalStatus(visibleCableTypeControl, visibleCableCatalog),
    [visibleCableCatalog, visibleCableTypeControl],
  );

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
    mutationFn: ({ scope, objectIds, skipManual = true }: ElectricalBatchMutationArgs) => {
      const selectedObjectIds = objectIds ?? [];
      const objectOverrides = scope === 'selected'
        ? objectOverridesForIds(selectedObjectIds)
        : [];
      const fallbackCableType = scope === 'selected'
        ? selectedCableType ?? defaultCableType
        : cableTypeForRecalculation;
      const selectionMode = isResistiveCableType(fallbackCableType) ? 'auto' : undefined;
      return enqueueElectricalBatchJob(
        project!.id,
        effectiveSource,
        variant,
        fallbackCableType,
        {
          supplyVoltage,
          selectionMode,
          selectionPolicy,
          connectionType,
          windingCoefficient,
          heatingHeight,
          layingStep,
          maintainTemperature,
          vaporTemperature,
          aggressiveProduct,
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
      setTablePage(1);
      setElectricalPageCursors({ 1: null });
      setSelectedRowKeys([]);
      setCableTypeDraftByObjectId({});
      setVariant(res.target_variant_number);
      qc.invalidateQueries({ queryKey: ['project', project?.id, 'electrical-query'] });
      qc.invalidateQueries({ queryKey: ['project', project?.id, 'electrical-query-capabilities'] });
      qc.invalidateQueries({ queryKey: ['spec', project?.id, res.target_variant_number] });
      qc.invalidateQueries({ queryKey: ['report-preview', project?.id, res.target_variant_number] });
      message.success(
        `СО${res.target_variant_number} создан на основании СО${res.source_variant_number}: ` +
        `скопировано ${res.copied_count}`,
      );
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

  const optionWithSourceLabel = useCallback((label: string, source?: CableMarkOptionSource | null) => {
    if (source !== 'extended' && source !== 'project') return label;
    const tag = source === 'extended'
      ? { color: 'blue', label: 'внеш.' }
      : { color: 'green', label: 'проект' };
    return (
      <Space size={6}>
        <span>{label}</span>
        <Tag color={tag.color} style={{ marginInlineEnd: 0 }}>{tag.label}</Tag>
      </Space>
    );
  }, []);
  const cableMarkOption = useCallback((
    mark: string,
    text: string,
    source?: string | null,
    disabled?: boolean,
    cableSource?: CableSource | null,
    displaySource?: CableMarkOptionSource | null,
  ): CableMarkSelectOption => ({
    value: cableMarkOptionValue(normalizeCableMarkOptionSource(source), mark),
    label: optionWithSourceLabel(
      text,
      displaySource === undefined ? normalizeCableMarkOptionSource(source) : displaySource,
    ),
    searchLabel: text,
    mark,
    optionSource: normalizeCableMarkOptionSource(source),
    cableSource: cableSource ?? normalizeCableSource(source) ?? undefined,
    disabled,
  }), [optionWithSourceLabel]);
  const autoCableMarkOption = useCallback((): CableMarkSelectOption => ({
    value: AUTO_CABLE_MARK_VALUE,
    label: 'Авто',
    searchLabel: 'Авто',
    mark: null,
    optionSource: 'builtin',
  }), []);
  const cableOptions = useMemo(
    () => visibleCableRowsForSource(cables, builtinCables, effectiveSource).map((c) => {
      const label = `${c.model} · ${c.power_per_meter ?? '—'} Вт/м`;
      return cableMarkOption(
        c.model ?? label,
        label,
        c.source,
        false,
        normalizeCableSource(c.source) ?? undefined,
        externalCableOptionLabelSource(c, cables, builtinCables, effectiveSource),
      );
    }),
    [builtinCables, cableMarkOption, cables, effectiveSource],
  );
  const manualCableOptionsForType = useCallback((type: CableTypeKey): CableMarkSelectOption[] => {
    if (type === 'self_regulating') return cableOptions;
    if (type === 'self_regulating_tt') {
      const suffix = aggressiveProduct ? 'СТ' : 'СР';
      return ttCables.map((c) => {
        const value = `${c.model}-${suffix}`;
        return cableMarkOption(
          value,
          `${value} · ${c.series} · ${c.nominal_power} Вт/м`,
          (c as { source?: string | null }).source,
        );
      });
    }
    if (type === 'single_core') {
      const rows = resistiveCables?.single_core ?? [];
      const builtinRows = builtinResistiveCables?.single_core ?? [];
      return visibleCableRowsForSource(rows, builtinRows, effectiveSource)
        .filter((c) => typeof c.model === 'string')
        .map((c) => {
          const row = c as CableStatusRow & { model: string };
          return cableMarkOption(
            row.model,
            `${row.model} · ${row.resistance_ohm_km ?? '—'} Ом/км`,
            row.source,
            false,
            normalizeCableSource(row.source) ?? undefined,
            externalCableOptionLabelSource(
              row,
              rows,
              builtinRows,
              effectiveSource,
            ),
          );
        });
    }
    if (type === 'three_core') {
      const rows = resistiveCables?.three_core ?? [];
      const builtinRows = builtinResistiveCables?.three_core ?? [];
      return visibleCableRowsForSource(rows, builtinRows, effectiveSource)
        .filter((c) => typeof c.model === 'string')
        .map((c) => {
          const row = c as CableStatusRow & { model: string };
          return cableMarkOption(
            row.model,
            `${row.model} · ${row.resistance_ohm_km ?? '—'} Ом/км · ${row.nominal_size_mm ?? '—'}`,
            row.source,
            false,
            normalizeCableSource(row.source) ?? undefined,
            externalCableOptionLabelSource(
              row,
              rows,
              builtinRows,
              effectiveSource,
            ),
          );
        });
    }
    return [];
  }, [
    aggressiveProduct,
    builtinResistiveCables,
    cableMarkOption,
    cableOptions,
    effectiveSource,
    resistiveCables,
    ttCables,
  ]);
  const cableMarkOptionsFor = useCallback((
    type: CableTypeKey,
    mark?: string,
    calc?: ElectricalCalcSummary,
  ) => {
    const manualOptions = manualCableOptionsForType(type);
    const savedSource = catalogSourceFromSnapshot(calc);
    const matchingCatalogOption = mark
      ? manualOptions.find((option) =>
          option.mark === mark && (!savedSource || option.cableSource === savedSource))
        ?? manualOptions.find((option) => option.mark === mark)
      : undefined;
    const projectOption = mark && shouldShowProjectCableOption(calc)
      ? cableMarkOption(
          mark,
          `${mark} · сохранён в проекте`,
          'project',
          false,
          savedSource ?? matchingCatalogOption?.cableSource ?? effectiveSource,
        )
      : null;
    return [
      autoCableMarkOption(),
      ...(projectOption ? [projectOption] : []),
      ...manualOptions,
    ];
  }, [autoCableMarkOption, cableMarkOption, effectiveSource, manualCableOptionsForType]);

  const manualCableMut = useMutation({
    mutationFn: ({
      objectId,
      mark,
      cableType,
      cableSource,
    }: {
      objectId: string;
      mark: string;
      cableType: CableTypeKey;
      cableSource?: CableSource;
    }) =>
      selectCableManual(objectId, mark, cableSource ?? effectiveSource, variant, cableType, {
        supplyVoltage,
        selectionMode: isResistiveCableType(cableType) ? 'auto' : undefined,
        selectionPolicy,
        connectionType,
        windingCoefficient,
        heatingHeight,
        layingStep,
        maintainTemperature,
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

  const autoCableMut = useMutation({
    mutationFn: ({
      objectId,
      cableType,
    }: {
      objectId: string;
      cableType: CableTypeKey;
    }) =>
      batchCalcElectrical(project!.id, effectiveSource, variant, cableType, {
        supplyVoltage,
        selectionMode: isResistiveCableType(cableType) ? 'auto' : undefined,
        selectionPolicy,
        connectionType,
        windingCoefficient,
        heatingHeight,
        layingStep,
        maintainTemperature,
        vaporTemperature,
        aggressiveProduct,
        objectIds: [objectId],
        forceCableType: true,
        skipManual: false,
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['project', project?.id, 'electrical-query'] });
      qc.invalidateQueries({ queryKey: ['project', project?.id, 'electrical-query-capabilities'] });
      qc.invalidateQueries({ queryKey: ['project', project?.id, 'objects', 'summary'] });
      message.success('Автоподбор выполнен');
    },
    onError: (e: Error) => message.error(e.message),
  });

  const layoutMut = useMutation({
    mutationFn: ({
      objectId,
      mark,
      cableType,
      cableSource,
      windingPitchMm,
      numberOfThreads,
    }: {
      objectId: string;
      mark: string;
      cableType: CableTypeKey;
      cableSource?: CableSource;
      windingPitchMm: number;
      numberOfThreads: number;
    }) =>
      selectCableManual(objectId, mark, cableSource ?? effectiveSource, variant, cableType, {
        supplyVoltage,
        selectionMode: isResistiveCableType(cableType) ? 'manual' : undefined,
        connectionType,
        windingCoefficient,
        windingPitchMm,
        numberOfThreads,
        heatingHeight,
        layingStep,
        maintainTemperature,
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
  const autoCableMutate = autoCableMut.mutate;
  const isCableMarkPending = manualCableMut.isPending || autoCableMut.isPending;
  const layoutMutate = layoutMut.mutate;
  const isLayoutPending = layoutMut.isPending;
  const cableMarkModalObject = cableMarkModalObjectId
    ? objects.find((object) => object.id === cableMarkModalObjectId) ?? null
    : null;
  const cableMarkModalCalc = cableMarkModalObject
    ? stats.calcByObjectId[cableMarkModalObject.id]
    : undefined;
  const cableMarkModalSavedType = cableMarkModalObject
    ? getSavedCableTypeForObject(cableMarkModalObject.id)
    : null;
  const cableMarkModalCurrentMark = cableMarkModalCableType === cableMarkModalSavedType
    ? getCableMark(cableMarkModalCalc)
    : undefined;
  const cableMarkModalOptions = useMemo(
    () => (
      cableMarkModalCableType
        ? cableMarkOptionsFor(cableMarkModalCableType, cableMarkModalCurrentMark, cableMarkModalCalc)
        : []
    ),
    [
      cableMarkModalCableType,
      cableMarkModalCalc,
      cableMarkModalCurrentMark,
      cableMarkOptionsFor,
    ],
  );
  const cableMarkModalOptionByValue = useMemo(
    () => new Map(cableMarkModalOptions.map((option) => [option.value, option])),
    [cableMarkModalOptions],
  );
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
  const closeCableMarkModal = useCallback(() => {
    setCableMarkModalObjectId(null);
    setCableMarkModalCableType(null);
    setCableMarkModalValue(null);
  }, []);
  const openCableMarkModal = useCallback((obj: ProjectObject) => {
    const calc = stats.calcByObjectId[obj.id];
    const type = getSavedCableTypeForObject(obj.id);
    setActiveRowId(obj.id);
    setCableMarkModalObjectId(obj.id);
    setCableMarkModalCableType(type);
    const mark = getCableMark(calc);
    setCableMarkModalValue(cableMarkValueForCalc(type, mark, calc));
  }, [cableMarkValueForCalc, getSavedCableTypeForObject, stats.calcByObjectId]);
  const changeCableMarkModalCableType = useCallback((nextType: CableTypeKey) => {
    setCableMarkModalCableType(nextType);
    setCableMarkModalValue(AUTO_CABLE_MARK_VALUE);
    setConnectionType('line_1ph');
  }, []);
  const applyCableMarkModal = useCallback(() => {
    if (!cableMarkModalObject || !cableMarkModalCableType) return;
    const selectedMark = cableMarkModalValue ?? AUTO_CABLE_MARK_VALUE;
    if (selectedMark === AUTO_CABLE_MARK_VALUE) {
      autoCableMutate({
        objectId: cableMarkModalObject.id,
        cableType: cableMarkModalCableType,
      });
    } else {
      const selectedOption = cableMarkModalOptionByValue.get(selectedMark);
      if (!selectedOption?.mark) return;
      manualCableMutate({
        objectId: cableMarkModalObject.id,
        mark: selectedOption.mark,
        cableType: cableMarkModalCableType,
        cableSource: selectedOption.cableSource,
      });
    }
    closeCableMarkModal();
  }, [
    autoCableMutate,
    cableMarkModalCableType,
    cableMarkModalObject,
    cableMarkModalOptionByValue,
    cableMarkModalValue,
    closeCableMarkModal,
    manualCableMutate,
  ]);

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
      cableSource: catalogSourceFromSnapshot(calc) ?? undefined,
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
        const type = getSavedCableTypeForObject(obj.id);
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
        const mark = getCableMark(calc);
        const sourceMeta = cableMarkSourceTag(getCableMarkSource(calc));
        const snapshotMeta = cableSnapshotStatusTag(calc);
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
        const snapshotTag = snapshotMeta ? (
          <Tooltip title={snapshotMeta.tooltip}>
            <Tag
              color={snapshotMeta.color}
              style={{ marginInlineEnd: 0, fontSize: 10, lineHeight: '16px' }}
            >
              {snapshotMeta.label}
            </Tag>
          </Tooltip>
        ) : null;
        const isActive = activeRowId === obj.id;

        if (!isActive) {
          return (
            <Space size={4} wrap={false}>
              <Text style={{ fontSize: 12 }} type={mark ? undefined : 'secondary'}>
                {mark ?? 'Авто'}
              </Text>
              {snapshotTag}
              {sourceTag}
            </Space>
          );
        }

        return (
          <div style={{ display: 'flex', alignItems: 'center', gap: 4, minWidth: 0 }}>
            <Button
              size="small"
              disabled={!obj.is_valid || !project}
              loading={isCableMarkPending}
              style={{ flex: 1, minWidth: 0 }}
              onClick={() => openCableMarkModal(obj)}
            >
              <span
                style={{
                  display: 'block',
                  overflow: 'hidden',
                  textOverflow: 'ellipsis',
                  whiteSpace: 'nowrap',
                }}
              >
                {mark ?? 'Авто'}
              </span>
            </Button>
            {snapshotTag}
            {sourceTag}
          </div>
        );
      },
    },
    cable_snapshot_status: {
      render: (_: unknown, obj) => {
        const meta = cableSnapshotStatusTag(stats.calcByObjectId[obj.id]);
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
    variant_number: {
      align: 'right',
      render: (_: unknown, obj) => stats.calcByObjectId[obj.id]?.variant_number ?? variant,
    },
    selection_policy: {
      render: (_: unknown, obj) =>
        selectionPolicyText(stats.calcByObjectId[obj.id]?.results?.selection_policy),
    },
    applied_selection_policy: {
      render: (_: unknown, obj) => {
        const calc = stats.calcByObjectId[obj.id];
        const requested = calc?.results?.selection_policy;
        const applied = calc?.results?.applied_selection_policy;
        const label = selectionPolicyText(applied);
        const changed = typeof requested === 'string' && typeof applied === 'string' && requested !== applied;
        return changed ? <Tag color="warning">{label}</Tag> : label;
      },
    },
    selection_reason: {
      ellipsis: true,
      render: (_: unknown, obj) => {
        const reason = stats.calcByObjectId[obj.id]?.results?.selection_reason;
        return (
          <Tooltip title={valueText(reason)}>
            <Text style={{ fontSize: 12 }} ellipsis>
              {valueText(reason)}
            </Text>
          </Tooltip>
        );
      },
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
        const rowCableType = getSavedCableTypeForObject(obj.id);
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

        if (!isActive || !obj.is_valid || !mark) {
          return (
            <Space size={4} wrap={false}>
              <Text style={{ fontSize: 12 }} type={mark ? undefined : 'secondary'}>
                {mark ? values.numberOfThreads : '—'}
              </Text>
              {mark ? sourceTag : null}
            </Space>
          );
        }

        return (
          <Select
            size="small"
            value={values.numberOfThreads}
            disabled={isLayoutPending}
            options={rowCableType === 'self_regulating_tt' ? TT_THREAD_OPTIONS : THREAD_OPTIONS}
            style={{ width: '100%' }}
            onChange={(v) => {
              updateLayoutDraft(obj.id, { numberOfThreads: v });
              layoutMutate({
                objectId: obj.id,
                mark,
                cableType: rowCableType,
                cableSource: catalogSourceFromSnapshot(calc) ?? undefined,
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
    maintain_temperature: {
      align: 'right',
      render: (_: unknown, obj) =>
        numberText(
          stats.calcByObjectId[obj.id]?.params?.maintain_temperature ?? maintainTemperature,
          1,
        ),
    },
    aggressive_product: {
      align: 'center',
      render: (_: unknown, obj) =>
        valueText(stats.calcByObjectId[obj.id]?.params?.aggressive_product ?? aggressiveProduct),
    },
    installed_cable_length: {
      align: 'right',
      render: (_: unknown, obj) =>
        resultNumber(stats.calcByObjectId[obj.id], 'installed_cable_length', 1),
    },
    order_cable_length: {
      align: 'right',
      render: (_: unknown, obj) =>
        numberText(orderCableLengthValue(stats.calcByObjectId[obj.id]), 1),
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
    price_per_meter: {
      align: 'right',
      render: (_: unknown, obj) => commercialNumber(stats.calcByObjectId[obj.id], 'price_per_meter', 2),
    },
    required_order_length: {
      align: 'right',
      render: (_: unknown, obj) =>
        commercialNumber(stats.calcByObjectId[obj.id], 'required_order_length', 1),
    },
    total_cost: {
      align: 'right',
      render: (_: unknown, obj) => commercialNumber(stats.calcByObjectId[obj.id], 'total_cost', 2),
    },
    stock_status: {
      render: (_: unknown, obj) => {
        const value = commercialValue(stats.calcByObjectId[obj.id], 'stock_status');
        return typeof value === 'string' ? STOCK_STATUS_LABEL[value] ?? value : '—';
      },
    },
    lead_time_days: {
      align: 'right',
      render: (_: unknown, obj) => commercialNumber(stats.calcByObjectId[obj.id], 'lead_time_days', 0),
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
    aggressiveProduct,
    commitLayout,
    connectionType,
    getSavedCableTypeForObject,
    heatingHeight,
    isCableMarkPending,
    isLayoutPending,
    layingStep,
    layoutDrafts,
    layoutMutate,
    maintainTemperature,
    openCableMarkModal,
    pageInfo?.offset,
    project,
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
        return objectDisplayName(obj);
      case 'object_type':
        return OBJECT_TYPE_LABEL[obj.object_type] ?? obj.object_type;
      case 'heat_loss_status':
        return obj.is_valid
          ? 'Рассчитан'
          : obj.validation_errors?.category === 'unsupported'
            ? 'Не применимо'
            : obj.validation_errors
              ? 'Ошибка'
              : 'Не рассчитан';
      case 'electrical_status':
        return isElectricalCalcSuccess(calc)
          ? 'Рассчитан'
          : isElectricalCalcUnsupported(calc)
            ? 'Не применимо'
            : isElectricalCalcStale(calc)
              ? 'Требуется пересчёт'
            : electricalCalcError(calc)
              ? 'Ошибка'
            : 'Не рассчитан';
      case 'cable_type':
        return CABLE_TYPE_LABEL[getSavedCableTypeForObject(obj.id)]
          ?? getSavedCableTypeForObject(obj.id);
      case 'cable_mark':
        {
          const label = getCableMark(calc) ?? 'Авто';
          const details = [
            getCableMarkSource(calc) === 'manual' ? 'ручной выбор' : null,
            cableSnapshotStatusTag(calc)?.label ?? null,
          ].filter(Boolean);
          return details.length > 0 ? `${label} (${details.join(', ')})` : label;
        }
      case 'cable_snapshot_status':
        return cableSnapshotStatusTag(calc)?.label ?? '—';
      case 'variant_number':
        return calc?.variant_number ?? variant;
      case 'selection_policy':
        return selectionPolicyText(calc?.results?.selection_policy);
      case 'applied_selection_policy':
        return selectionPolicyText(calc?.results?.applied_selection_policy);
      case 'selection_reason':
        return valueText(calc?.results?.selection_reason);
      case 'winding_pitch_mm':
        return valueText(calc?.results?.winding_pitch);
      case 'number_of_threads':
        {
          const source = threadSourceTag(getThreadSource(calc));
          const value = valueText(calc?.results?.num_circuits);
          return source ? `${value} (${source.label})` : value;
        }
      case 'laying_step':
      case 'heating_height':
      case 'connection_type':
      case 'supply_voltage':
      case 'winding_coefficient':
      case 'vapor_temperature':
      case 'maintain_temperature':
      case 'aggressive_product':
        return valueText(calc?.params?.[key]);
      case 'order_cable_length':
        return valueText(orderCableLengthValue(calc));
      case 'installed_cable_length':
      case 'total_power':
      case 'current':
      case 'voltage':
        return valueText(calc?.results?.[key]);
      case 'price_per_meter':
      case 'required_order_length':
      case 'total_cost':
      case 'lead_time_days':
        return valueText(commercialValue(calc, key));
      case 'stock_status':
        {
          const value = commercialValue(calc, key);
          return typeof value === 'string' ? STOCK_STATUS_LABEL[value] ?? value : '—';
        }
      case 'heat_loss_per_meter':
      case 'heat_loss_per_m2':
      case 'total_heat_loss':
        return valueText(obj.results?.[key]);
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

  const totalObjects = pageSummary?.total_objects ?? objects.length;
  const filteredTableCount = electricalPage?.counts?.filtered ?? totalObjects;
  const validObjectsCount = pageSummary?.valid_objects ?? stats.validObjects.length;
  const selectedObjectsCount = selectedRowKeys.length;
  const selectedObjects = useMemo(
    () => objects.filter((object) => selectedRowKeys.includes(object.id)),
    [objects, selectedRowKeys],
  );
  const selectedValidObjectsCount = useMemo(
    () => selectedObjects.filter((object) => object.is_valid).length,
    [selectedObjects],
  );
  const selectedHeatLossFailedCount = selectedObjectsCount - selectedValidObjectsCount;
  const calculatedCount = pageSummary?.calculated_count ?? stats.calcedCount;
  const failedCount = pageSummary?.failed_count ?? stats.failedCount;
  const totalCableLength = pageSummary?.total_cable_length ?? stats.totalCableLength;
  const totalPower = pageSummary?.total_power ?? stats.totalPower;
  const totalCurrent = pageSummary?.total_current ?? stats.totalCurrent;
  const visibleManualCableCount = useMemo(
    () => objects.reduce(
      (count, object) =>
        count + (getCableMarkSource(stats.calcByObjectId[object.id]) === 'manual' ? 1 : 0),
      0,
    ),
    [objects, stats.calcByObjectId],
  );
  const manualCableCount = pageSummary?.manual_cable_mark_count ?? visibleManualCableCount;
  const selectedManualCableCount = useMemo(
    () => selectedRowKeys.reduce(
      (count, objectId) =>
        count + (getCableMarkSource(stats.calcByObjectId[objectId]) === 'manual' ? 1 : 0),
      0,
    ),
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
  const electricalErrorItems = useMemo(() => objects
    .map((obj, index) => {
      const calc = stats.calcByObjectId[obj.id];
      const error = electricalCalcError(calc);
      if (!error || isElectricalCalcUnsupported(calc) || isElectricalCalcStale(calc)) return null;
      return {
        objectId: obj.id,
        rowNumber: (pageInfo?.offset ?? 0) + index + 1,
        objectName: objectDisplayName(obj),
        error,
        cableType: calc?.cable_type ?? null,
        errorContext: electricalCalcGuidanceContext(calc),
        errorCode: electricalCalcErrorCode(calc),
        suggestedActions: electricalCalcSuggestedActions(calc),
      };
    })
    .filter((item): item is {
      objectId: string;
      rowNumber: number;
      objectName: string;
      error: string;
      cableType: string;
      errorContext: Record<string, unknown> | null;
      errorCode: string | null;
      suggestedActions: string[] | null;
    } => item != null),
  [objects, pageInfo?.offset, stats.calcByObjectId]);
  const activeElectricalErrorItem = useMemo(() => {
    if (activeRowId) {
      const activeIndex = objects.findIndex((obj) => obj.id === activeRowId);
      const activeObject = activeIndex >= 0 ? objects[activeIndex] : null;
      if (activeObject) {
        const calc = stats.calcByObjectId[activeObject.id];
        const error = isElectricalCalcUnsupported(calc) || isElectricalCalcStale(calc)
          ? null
          : electricalCalcError(calc);
        if (!error) {
          const firstError = electricalErrorItems[0];
          return firstError ? { ...firstError, fallback: true } : null;
        }
        return {
          objectId: activeObject.id,
          rowNumber: (pageInfo?.offset ?? 0) + activeIndex + 1,
          objectName: objectDisplayName(activeObject),
          error,
          cableType: calc?.cable_type ?? null,
          errorContext: electricalCalcGuidanceContext(calc),
          errorCode: electricalCalcErrorCode(calc),
          suggestedActions: electricalCalcSuggestedActions(calc),
          fallback: false,
        };
      }
    }
    const firstError = electricalErrorItems[0];
    return firstError ? { ...firstError, fallback: true } : null;
  }, [activeRowId, electricalErrorItems, objects, pageInfo?.offset, stats.calcByObjectId]);
  const activeElectricalErrorGuidance = activeElectricalErrorItem?.error
    ? getElectricalErrorGuidance({
        error: activeElectricalErrorItem.error,
        cableType: activeElectricalErrorItem.cableType,
        errorContext: activeElectricalErrorItem.errorContext,
        errorCode: activeElectricalErrorItem.errorCode,
        suggestedActions: activeElectricalErrorItem.suggestedActions,
      })
    : null;
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
  const selectedRecalcTooltip =
    selectedObjectsCount > 0 && selectedValidObjectsCount === 0
      ? 'Сначала рассчитайте теплопотери для выбранных объектов'
      : undefined;
  const selectedRecalcCountLabel =
    selectedHeatLossFailedCount > 0
      ? `${selectedValidObjectsCount}/${selectedObjectsCount}`
      : String(selectedObjectsCount);
  const jobProgress = activeJob?.progress;
  const jobProgressLabel = jobProgress?.total
    ? `${jobProgress.current}/${jobProgress.total}`
    : activeJobStatus ?? '';
  const bannerCableTypeLabel = selectedCableTypesMixed
    ? 'смешанные типы'
    : selectedCableType
      ? CABLE_TYPE_LABEL[selectedCableType]
      : 'тип по объектам';
  const cableTypeControlLabel = 'Тип для пересчёта:';

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
  const cableSourceOptions: Array<{ label: string; value: CableSource }> = [
    { label: 'Встроенная', value: 'builtin' },
    ...(SHOW_COMMERCIAL_CABLE_BASE_UI
      ? [{ label: 'Коммерческая', value: 'commercial' as CableSource }]
      : []),
    ...(isEmployee
      ? [
          { label: 'Внешняя', value: 'extended' as CableSource },
          { label: 'Все', value: 'all' as CableSource },
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
            Копирование не запускает новый подбор кабеля.
          </Text>
        </Space>
      ),
      okText: 'Создать',
      cancelText: 'Отмена',
      onOk: () => copyVariantMut.mutate({ targetVariant }),
    });
  }

  function renderElectricalTypeControls(
    cableType: CableTypeKey | null = visibleCableTypeControl,
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
            value={vaporTemperature}
            onChange={setVaporTemperature}
            style={{ width: 92 }}
          />
          <Text style={{ fontSize: 11, color: '#607080', alignSelf: 'center' }}>T3, °C:</Text>
          <InputNumber<number>
            aria-label="T3 поддержания"
            size="small"
            value={maintainTemperature}
            onChange={setMaintainTemperature}
            style={{ width: 92 }}
          />
          <Checkbox
            checked={aggressiveProduct}
            onChange={(e) => setAggressiveProduct(e.target.checked)}
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
            value={connectionType}
            onChange={setConnectionType}
            options={connectionOptions}
            style={{ width: 118 }}
          />
          <Text style={{ fontSize: 11, color: '#607080', alignSelf: 'center' }}>U:</Text>
          <InputNumber<number> size="small" min={1} value={supplyVoltage} onChange={setSupplyVoltage} style={{ width: 76 }} />
          <Text style={{ fontSize: 11, color: '#607080', alignSelf: 'center' }}>w:</Text>
          <InputNumber<number> size="small" min={1} max={1.5} step={0.05} value={windingCoefficient} onChange={setWindingCoefficient} style={{ width: 72 }} />
          <Text style={{ fontSize: 11, color: '#607080', alignSelf: 'center' }}>h:</Text>
          <InputNumber<number> size="small" min={0} step={0.1} value={heatingHeight} onChange={setHeatingHeight} style={{ width: 76 }} />
          <Text style={{ fontSize: 11, color: '#607080', alignSelf: 'center' }}>шаг:</Text>
          <InputNumber<number> size="small" min={0.05} max={0.5} step={0.01} value={layingStep} onChange={setLayingStep} style={{ width: 76 }} />
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
        <Tooltip title="Используется только при новом пересчёте или новом ручном выборе. Уже рассчитанные строки хранят снимок кабеля в проекте.">
          <Text className="table-view-settings-label">
            База для пересчёта:
          </Text>
        </Tooltip>
        <Segmented<CableSource>
          aria-label="База для пересчёта"
          size="small"
          value={cableSource}
          onChange={setCableSource}
          options={cableSourceOptions}
        />
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
              value={selectionPolicy}
              onChange={setSelectionPolicy}
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
                  setTablePage(1);
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
              value={visibleCableTypeControl ?? undefined}
              placeholder="Несколько типов"
              disabled={isJobActive}
              onChange={(next) => {
                if (selectedRowKeys.length === 0) {
                  setDefaultCableType(next);
                } else {
                  setCableTypeDraftByObjectId((prev) => {
                    const nextDrafts = { ...prev };
                    for (const objectId of selectedRowKeys) {
                      if (next === getSavedCableTypeForObject(objectId)) {
                        delete nextDrafts[objectId];
                      } else {
                        nextDrafts[objectId] = next;
                      }
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
                  «{CABLE_TYPE_LABEL[cableTypeForRecalculation]}». Тип кабеля у пересчитываемых
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
              scroll={{ x: electricalTableScrollX }}
              rowClassName={(obj) => {
                const calc = stats.calcByObjectId[obj.id];
                return [
                  electricalCalcError(calc) && !isElectricalCalcUnsupported(calc)
                    ? 'row-invalid'
                    : '',
                  activeRowId === obj.id ? 'electrical-row-active' : '',
                ].filter(Boolean).join(' ');
              }}
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
        title="Выбор марки кабеля"
        okText="Применить"
        cancelText="Отмена"
        confirmLoading={isCableMarkPending}
        okButtonProps={{
          disabled: !cableMarkModalObject?.is_valid || !cableMarkModalValue,
        }}
        onOk={applyCableMarkModal}
        onCancel={closeCableMarkModal}
      >
        <Space direction="vertical" size={12} style={{ width: '100%' }}>
          {cableMarkModalObject && (
            <div>
              <Text type="secondary">Объект</Text>
              <div>
                <Text strong>{objectDisplayName(cableMarkModalObject)}</Text>
              </div>
            </div>
          )}
          {cableMarkModalCableType && (
            <div>
              <Text type="secondary">Тип кабеля</Text>
              <Select<CableTypeKey>
                aria-label="Тип кабеля для выбора марки"
                size="small"
                value={cableMarkModalCableType}
                disabled={isCableMarkPending}
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
          <Text type="secondary" style={{ fontSize: 12 }}>
            «Авто» запустит автоподбор для этой записи. Выбор конкретной марки сохранит ручной
            подбор.
          </Text>
        </Space>
      </Modal>
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
