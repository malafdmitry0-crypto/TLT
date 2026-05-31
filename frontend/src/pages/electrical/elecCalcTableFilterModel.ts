import type { ObjectQueryFieldCapability } from '@/types/project';
import type { ElectricalCandidateColumnKey } from '@/utils/electricalCandidateTableColumns';
import type { ElectricalColumnKey } from '@/utils/electricalTableColumns';
import {
  isColumnFilterActive,
  type HeatCalcColumnFilter,
  type HeatCalcTableViewState,
} from '@/utils/heatCalcTableFindability';

export type ElectricalFilterKind = 'text' | 'numberRange' | 'enum' | 'boolean';
export type ElectricalTableViewColumnKey = ElectricalColumnKey | ElectricalCandidateColumnKey;
export type ElectricalTableSortDirection = 'asc' | 'desc';

export const CANDIDATE_NUMERIC_FILTER_KEYS = new Set<ElectricalCandidateColumnKey>([
  'winding_pitch_mm',
  'number_of_threads',
  'laying_step',
  'heating_height',
  'supply_voltage',
  'winding_coefficient',
  'vapor_temperature',
  'maintain_temperature',
  'installed_cable_length',
  'order_cable_length',
  'total_power',
  'power_per_meter',
  'installed_power_per_meter',
  'current',
  'voltage',
  'price_per_meter',
  'required_order_length',
  'total_cost',
  'lead_time_days',
]);

export const CANDIDATE_ENUM_FILTER_KEYS = new Set<ElectricalCandidateColumnKey>([
  'mode',
  'cable_type',
  'connection_type',
  'selection_policy',
  'applied_selection_policy',
  'stock_status',
]);

export const CANDIDATE_BOOLEAN_FILTER_KEYS = new Set<ElectricalCandidateColumnKey>([
  'marked',
  'aggressive_product',
]);

const ELECTRICAL_NUMERIC_FILTER_KEYS = new Set<ElectricalColumnKey>([
  'installed_cable_length',
  'order_cable_length',
  'total_power',
  'power_per_meter',
  'installed_power_per_meter',
  'current',
  'voltage',
]);

const ELECTRICAL_ENUM_FILTER_KEYS = new Set<ElectricalColumnKey>([
  'electrical_status',
  'object_type',
  'heat_loss_status',
  'cable_type',
]);

export function filterKindForElectricalColumn(
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
  if (ELECTRICAL_NUMERIC_FILTER_KEYS.has(key)) return 'numberRange';
  if (ELECTRICAL_ENUM_FILTER_KEYS.has(key)) return 'enum';
  return 'text';
}

export function filterKindForCandidateColumn(key: ElectricalCandidateColumnKey): ElectricalFilterKind {
  if (CANDIDATE_BOOLEAN_FILTER_KEYS.has(key)) return 'boolean';
  if (CANDIDATE_NUMERIC_FILTER_KEYS.has(key)) return 'numberRange';
  if (CANDIDATE_ENUM_FILTER_KEYS.has(key)) return 'enum';
  return 'text';
}

export function toInputNumberValue(value: unknown) {
  const numericValue = Number(value);
  return Number.isFinite(numericValue) ? numericValue : null;
}

export function updateTableViewColumnFilter(
  state: HeatCalcTableViewState,
  columnKey: ElectricalTableViewColumnKey,
  filter?: HeatCalcColumnFilter,
): HeatCalcTableViewState {
  const nextFilters = { ...state.filters };
  if (filter && isColumnFilterActive(filter)) {
    nextFilters[columnKey] = filter;
  } else {
    delete nextFilters[columnKey];
  }
  return {
    ...state,
    filters: nextFilters,
  };
}

export function updateTableViewSort(
  state: HeatCalcTableViewState,
  columnKey: ElectricalTableViewColumnKey,
  direction?: ElectricalTableSortDirection,
): HeatCalcTableViewState {
  return {
    ...state,
    sort: direction ? { columnKey, direction } : undefined,
  };
}
