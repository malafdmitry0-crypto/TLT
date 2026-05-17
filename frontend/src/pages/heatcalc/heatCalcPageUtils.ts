import type { BatchHeatLossResponse } from '@/types/calculation';
import type {
  ObjectQueryCapabilities,
  ObjectQueryFieldCapability,
  ObjectQueryFilter as BackendObjectQueryFilter,
  ProjectObject,
  ProjectObjectsQueryRequest,
} from '@/types/project';
import { formatNumber } from '@/utils/formatters';
import {
  HEATCALC_TABLE_COLUMN_CATALOG,
  type HeatCalcColumnKey,
  type HeatCalcObjectType,
} from '@/utils/heatCalcTableColumns';
import {
  isColumnFilterActive,
  type HeatCalcColumnFilter,
  type HeatCalcTableViewState,
} from '@/utils/heatCalcTableFindability';

export type HeatCalcFilterKind = 'text' | 'numberRange' | 'enum';
export type HeatLossCalcStatus = 'calculated' | 'error' | 'unsupported' | 'not_calculated';

export const DEFAULT_OBJECT_QUERY_PAGE_SIZE = 50;
export const INAPPLICABLE_TABLE_VALUE = '—';

const PIPE_TABLE_COLUMN_KEYS = new Set<HeatCalcColumnKey>(
  HEATCALC_TABLE_COLUMN_CATALOG.pipe.map((column) => column.key),
);
const TANK_TABLE_COLUMN_KEYS = new Set<HeatCalcColumnKey>(
  HEATCALC_TABLE_COLUMN_CATALOG.tank.map((column) => column.key),
);

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
  'vapor_temperature',
  'valve_count',
  'flange_count',
  'support_count',
  'local_element_equiv_length',
  'heat_loss_per_meter',
  'heat_loss_per_m2',
  'total_heat_loss',
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

export function isBatchHeatLossResponse(result: unknown): result is BatchHeatLossResponse {
  return typeof result === 'object' && result !== null && 'updated' in result && 'failed' in result;
}

export function heatLossCalcStatus(record: ProjectObject): HeatLossCalcStatus {
  if (record.is_valid && record.results != null) return 'calculated';
  if (record.validation_errors?.category === 'unsupported') return 'unsupported';
  if (record.validation_errors) return 'error';
  return 'not_calculated';
}

export function heatLossStatusLabel(status: HeatLossCalcStatus) {
  if (status === 'calculated') return 'Рассчитан';
  if (status === 'error') return 'Ошибка';
  if (status === 'unsupported') return 'Не применимо';
  return 'Не рассчитан';
}

export function heatLossErrorText(record: ProjectObject) {
  const errors = record.validation_errors;
  if (!errors) return 'Ошибка расчёта';
  if (typeof errors === 'object' && errors !== null) {
    const message = (errors as { message?: unknown }).message;
    if (typeof message === 'string' && message.trim()) return message;
    const error = (errors as { error?: unknown }).error;
    if (error != null) return String(error);
  }
  return JSON.stringify(errors);
}

export function filterKindForColumn(
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

export function isColumnApplicableToObjectType(
  key: HeatCalcColumnKey,
  objectType: ProjectObject['object_type'],
) {
  if (objectType === 'pipe') return PIPE_TABLE_COLUMN_KEYS.has(key);
  if (objectType === 'tank') return TANK_TABLE_COLUMN_KEYS.has(key);
  return false;
}

export function backendFilterFromColumnFilter(
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

export function buildObjectQueryRequest(
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

export function toInputNumberValue(value: unknown) {
  const numericValue = Number(value);
  return Number.isFinite(numericValue) ? numericValue : null;
}

export function insulationEntryLabel(entry: { name: string; density_kg_m3?: number | string }) {
  return entry.density_kg_m3 != null
    ? `${entry.name}, ${entry.density_kg_m3} кг/м³`
    : entry.name;
}

export function insulationLayerCount(record: ProjectObject) {
  return String(record.params?.insulation_layer_count ?? (
    Array.isArray(record.params?.insulation_layers) ? record.params.insulation_layers.length : 1
  ));
}

export function tankShapeLabel(shape: unknown) {
  if (shape === 'cylindrical') return 'Цилиндр';
  if (shape === 'rectangular') return 'Прямоуг.';
  if (shape === 'spherical') return 'Сфера';
  return '—';
}

export function placementLabel(placement: unknown) {
  if (placement === 'indoor') return 'В помещении';
  if (placement === 'underground') return 'Подземно';
  if (placement === 'outdoor') return 'Открыто';
  return '—';
}

export function mmParam(record: ProjectObject, key: string) {
  const value = Number(record.params?.[key]);
  return Number.isFinite(value) ? formatNumber(value * 1000, 0) : '—';
}

export function formatNumericValue(value: unknown, digits = 0) {
  const numericValue = Number(value);
  return Number.isFinite(numericValue) ? formatNumber(numericValue, digits) : '—';
}

export function formatParamNumber(record: ProjectObject, key: string, digits = 0) {
  return formatNumericValue(record.params?.[key], digits);
}

export function formatParamMetersAsMm(record: ProjectObject, key: string) {
  const value = Number(record.params?.[key]);
  return Number.isFinite(value) ? formatNumber(value * 1000, 0) : '—';
}

export function formatParamText(record: ProjectObject, key: string) {
  const value = record.params?.[key];
  return value == null || value === '' ? '—' : String(value);
}

function insulationLayer(record: ProjectObject, index: number) {
  const layers = record.params?.insulation_layers;
  return Array.isArray(layers) && typeof layers[index] === 'object' && layers[index] !== null
    ? layers[index] as Record<string, unknown>
    : null;
}

export function insulationLayerThickness(record: ProjectObject, index: number) {
  const layer = insulationLayer(record, index);
  const value = Number(layer?.thickness);
  return Number.isFinite(value) ? formatNumber(value * 1000, 0) : '—';
}

export function insulationLayerMaterial(
  record: ProjectObject,
  index: number,
  materialLabel: (material: unknown) => string,
) {
  return materialLabel(insulationLayer(record, index)?.material);
}

export function insulationLayerConductivity(record: ProjectObject, index: number) {
  return formatNumericValue(insulationLayer(record, index)?.conductivity, 3);
}

export function lambdaModeLabel(value: unknown) {
  if (value === 'manual') return 'Ручн.';
  if (value === 'reference') return 'Справ.';
  return value == null || value === '' ? '—' : String(value);
}

export function environmentLabel(value: unknown) {
  if (value === 'normal') return 'Нормальная';
  if (value === 'aggressive') return 'Агрессивная';
  return value == null || value === '' ? '—' : String(value);
}

export function zoneLabel(value: unknown) {
  if (value === 'safe') return 'Безопасная';
  if (value === 'hazardous') return 'Взрывоопасная';
  return value == null || value === '' ? '—' : String(value);
}

export function booleanChoiceLabel(value: unknown) {
  if (value === true || value === 'yes') return 'Да';
  if (value === false || value === 'no') return 'Нет';
  return value == null || value === '' ? '—' : String(value);
}

export function climateBasisLabel(value: unknown) {
  if (value == null || value === '') return '—';
  const numericValue = Number(value);
  return Number.isFinite(numericValue) ? formatNumber(numericValue, 2) : String(value);
}

export function sourceText(source: unknown) {
  if (source === 'climate') return 'из климата';
  if (source === 'manual') return 'вручную';
  return '—';
}

export function sourceSuffix(source: unknown) {
  const text = sourceText(source);
  return text === '—' ? '' : ` ${text}`;
}

export function formatResultNumber(record: ProjectObject, key: string, digits = 0) {
  return formatNumericValue(record.results?.[key], digits);
}

export function formatDeltaTemperature(record: ProjectObject, digits = 0) {
  const processTemperature = Number(record.params?.process_temperature);
  const ambientTemperature = Number(record.params?.ambient_temperature);
  return Number.isFinite(processTemperature) && Number.isFinite(ambientTemperature)
    ? formatNumber(processTemperature - ambientTemperature, digits)
    : '—';
}

export function countParamValue(record: ProjectObject, key: string) {
  if (record.object_type !== 'pipe') return '—';
  const value = Number(record.params?.[key]);
  return Number.isFinite(value) ? formatNumber(value, 0) : '—';
}

export function tankDimensions(record: ProjectObject) {
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
