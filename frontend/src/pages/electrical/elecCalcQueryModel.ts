import type { CableSource } from '@/api/calculations';
import type {
  ElectricalCalcSummary,
  ElectricalQueryRequest,
  ElectricalQueryResponse,
} from '@/types/calculation';
import type {
  ObjectQueryFieldCapability,
  ObjectQueryFilter,
  ProjectObjectsPageCursor,
} from '@/types/project';
import {
  isColumnFilterActive,
  type HeatCalcColumnFilter,
  type HeatCalcTableViewState,
} from '@/utils/heatCalcTableFindability';

export function backendFilterFromElectricalColumnFilter(
  key: string,
  filter: HeatCalcColumnFilter,
  capability?: ObjectQueryFieldCapability,
): ObjectQueryFilter | null {
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

export function buildElectricalQueryRequest(
  projectId: string,
  electricalVariantId: string,
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
    .filter((filter): filter is ObjectQueryFilter => filter != null);
  const sortCapability = state.sort ? capabilityByKey.get(state.sort.columnKey) : undefined;
  return {
    project_id: projectId,
    electrical_variant_id: electricalVariantId,
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

export function updateElectricalQueryPageCalculation(
  page: ElectricalQueryResponse,
  calculation: ElectricalCalcSummary,
): ElectricalQueryResponse {
  const pageContainsObject = page.items.some((object) => object.id === calculation.object_id);
  if (!pageContainsObject) return page;

  const hasCurrentCalculation = page.calculations.some((current) =>
    current.object_id === calculation.object_id
    && current.variant_number === calculation.variant_number,
  );
  const calculations = hasCurrentCalculation
    ? page.calculations.map((current) =>
        current.object_id === calculation.object_id
        && current.variant_number === calculation.variant_number
          ? calculation
          : current)
    : [...page.calculations, calculation];
  return { ...page, calculations };
}
