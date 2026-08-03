import type { ObjectQueryFieldCapability } from '@/types/project';
import type {
  ElectricalColumnKey,
  ElectricalResolvedColumnMeta,
} from '@/utils/electricalTableColumns';
import type { HeatCalcGlideGridColumn } from '@/utils/heatCalcGlideGrid';
import type { HeatCalcTableViewState } from '@/utils/heatCalcTableFindability';

export type ElectricalGlideFilterKind = 'text' | 'numberRange' | 'enum' | 'boolean';

export function electricalGlideFilterKindForCapability(
  key: ElectricalColumnKey,
  capability?: ObjectQueryFieldCapability,
): ElectricalGlideFilterKind {
  if (capability?.filter.enabled) {
    if (capability.filter.ops.includes('range')) return 'numberRange';
    if (capability.filter.ops.includes('in')) return 'enum';
    if (capability.filter.ops.includes('equals') && capability.data_type === 'boolean') return 'boolean';
    return 'text';
  }
  if (['installed_cable_length', 'order_cable_length', 'required_installed_length_m', 'section_l_max_m', 'section_l_tok_m', 'section_l_ogr_m', 'section_l_excess_m', 'total_power', 'current', 'voltage'].includes(key)) {
    return 'numberRange';
  }
  if (['electrical_status', 'object_type', 'heat_loss_status', 'cable_type'].includes(key)) {
    return 'enum';
  }
  return 'text';
}

export function buildElectricalGlideColumns({
  columns,
  capabilitiesByKey,
  enumOptionsByColumn,
  getAlign,
}: {
  columns: ElectricalResolvedColumnMeta[];
  capabilitiesByKey: Map<string, ObjectQueryFieldCapability>;
  enumOptionsByColumn: Record<string, Array<{ value: string; label: string }>>;
  getAlign?: (key: ElectricalColumnKey) => HeatCalcGlideGridColumn['align'];
}): HeatCalcGlideGridColumn[] {
  return columns.map((column) => {
    const capability = capabilitiesByKey.get(column.key);
    const filterEnabled = column.key !== 'index' && (capability?.filter.enabled ?? false);
    const sortEnabled = column.key !== 'index' && (capability?.sort.enabled ?? false);
    return {
      key: column.key,
      title: column.title,
      label: column.label,
      width: Math.max(column.width, column.minWidthPx),
      minWidthPx: column.minWidthPx,
      resizable: true,
      align: getAlign?.(column.key),
      sortable: sortEnabled,
      filterable: filterEnabled,
      filterKind: electricalGlideFilterKindForCapability(column.key, capability),
      enumOptions: enumOptionsByColumn[column.key] ?? [],
    };
  });
}

export function nextElectricalGlideSortDirection(
  tableViewState: HeatCalcTableViewState,
  columnKey: ElectricalColumnKey,
): 'asc' | 'desc' | undefined {
  if (tableViewState.sort?.columnKey !== columnKey) return 'asc';
  if (tableViewState.sort.direction === 'asc') return 'desc';
  return undefined;
}
