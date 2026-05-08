import type { HeatCalcColumnKey } from '@/utils/heatCalcTableColumns';

export type HeatCalcColumnFilter =
  | { kind: 'text'; value: string }
  | { kind: 'numberRange'; min?: number; max?: number; includeEmpty?: boolean }
  | { kind: 'enum'; values: string[]; includeEmpty?: boolean }
  | { kind: 'boolean'; value?: boolean | 'empty' };

export interface HeatCalcTableSort {
  columnKey: HeatCalcColumnKey;
  direction: 'asc' | 'desc';
}

export interface HeatCalcTableViewState {
  filters: Partial<Record<HeatCalcColumnKey, HeatCalcColumnFilter>>;
  sort?: HeatCalcTableSort;
}

export interface HeatCalcIndexedTableRow<T> {
  record: T;
  sourceIndex: number;
}

export type HeatCalcColumnValueAccessor<T> = (
  record: T,
  sourceIndex: number,
) => unknown;

export type HeatCalcColumnValueAccessors<T> = Partial<
  Record<HeatCalcColumnKey, HeatCalcColumnValueAccessor<T>>
>;

const collator = new Intl.Collator('ru', {
  numeric: true,
  sensitivity: 'base',
});

export function createEmptyTableViewState(): HeatCalcTableViewState {
  return { filters: {} };
}

export function isEmptyTableCellValue(value: unknown) {
  return value == null || value === '' || value === '—';
}

function toSearchText(value: unknown) {
  if (isEmptyTableCellValue(value)) return '';
  return String(value).trim().toLocaleLowerCase('ru');
}

function toFiniteNumber(value: unknown) {
  if (typeof value === 'number') return Number.isFinite(value) ? value : null;
  if (typeof value !== 'string') return null;
  const normalized = value.replace(/\s/g, '').replace(',', '.');
  const parsed = Number(normalized);
  return Number.isFinite(parsed) ? parsed : null;
}

export function isColumnFilterActive(filter: HeatCalcColumnFilter | undefined) {
  if (!filter) return false;
  if (filter.kind === 'text') return filter.value.trim().length > 0;
  if (filter.kind === 'numberRange') {
    return Number.isFinite(filter.min) || Number.isFinite(filter.max) || !!filter.includeEmpty;
  }
  if (filter.kind === 'enum') return filter.values.length > 0 || !!filter.includeEmpty;
  return filter.value !== undefined;
}

export function activeTableFilterCount(state: HeatCalcTableViewState) {
  return Object.values(state.filters).filter(isColumnFilterActive).length;
}

export function hasActiveTableViewState(state: HeatCalcTableViewState) {
  return activeTableFilterCount(state) > 0 || !!state.sort;
}

export function removeHiddenTableViewState(
  state: HeatCalcTableViewState,
  visibleKeys: HeatCalcColumnKey[],
): HeatCalcTableViewState {
  const visibleSet = new Set(visibleKeys);
  const filters = Object.fromEntries(
    Object.entries(state.filters).filter(
      ([key, filter]) => visibleSet.has(key) && isColumnFilterActive(filter),
    ),
  ) as Partial<Record<HeatCalcColumnKey, HeatCalcColumnFilter>>;
  const sort = state.sort && visibleSet.has(state.sort.columnKey) ? state.sort : undefined;
  return { filters, sort };
}

function valueMatchesFilter(value: unknown, filter: HeatCalcColumnFilter) {
  if (!isColumnFilterActive(filter)) return true;

  if (filter.kind === 'text') {
    return toSearchText(value).includes(toSearchText(filter.value));
  }

  if (filter.kind === 'numberRange') {
    if (Number.isFinite(filter.min) && Number.isFinite(filter.max) && Number(filter.min) > Number(filter.max)) {
      return true;
    }
    if (isEmptyTableCellValue(value)) return !!filter.includeEmpty;
    const numericValue = toFiniteNumber(value);
    if (numericValue == null) return false;
    if (Number.isFinite(filter.min) && numericValue < Number(filter.min)) return false;
    if (Number.isFinite(filter.max) && numericValue > Number(filter.max)) return false;
    return true;
  }

  if (filter.kind === 'enum') {
    if (isEmptyTableCellValue(value)) return !!filter.includeEmpty;
    return filter.values.includes(String(value));
  }

  if (isEmptyTableCellValue(value)) return filter.value === 'empty';
  return Boolean(value) === filter.value;
}

export function applyColumnFilters<T>(
  rows: HeatCalcIndexedTableRow<T>[],
  filters: HeatCalcTableViewState['filters'],
  accessors: HeatCalcColumnValueAccessors<T>,
) {
  const activeFilters = Object.entries(filters).filter((entry): entry is [HeatCalcColumnKey, HeatCalcColumnFilter] =>
    isColumnFilterActive(entry[1]),
  );
  if (activeFilters.length === 0) return rows;

  return rows.filter((row) =>
    activeFilters.every(([columnKey, filter]) => {
      const accessor = accessors[columnKey];
      if (!accessor) return true;
      return valueMatchesFilter(accessor(row.record, row.sourceIndex), filter);
    }),
  );
}

function compareCellValues(left: unknown, right: unknown, direction: 'asc' | 'desc') {
  const leftEmpty = isEmptyTableCellValue(left);
  const rightEmpty = isEmptyTableCellValue(right);
  if (leftEmpty && rightEmpty) return 0;
  if (leftEmpty) return 1;
  if (rightEmpty) return -1;

  const leftNumber = toFiniteNumber(left);
  const rightNumber = toFiniteNumber(right);
  const comparison = leftNumber != null && rightNumber != null
    ? leftNumber - rightNumber
    : collator.compare(String(left), String(right));

  return direction === 'asc' ? comparison : -comparison;
}

export function applyTableSort<T>(
  rows: HeatCalcIndexedTableRow<T>[],
  sort: HeatCalcTableSort | undefined,
  accessors: HeatCalcColumnValueAccessors<T>,
) {
  if (!sort) return rows;
  const accessor = accessors[sort.columnKey];
  if (!accessor) return rows;

  return [...rows].sort((left, right) => {
    const comparison = compareCellValues(
      accessor(left.record, left.sourceIndex),
      accessor(right.record, right.sourceIndex),
      sort.direction,
    );
    return comparison === 0 ? left.sourceIndex - right.sourceIndex : comparison;
  });
}
