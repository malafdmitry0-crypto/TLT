/**
 * @module heatcalc/table-counts-model
 * @owner heat
 * @depends none
 * @does-not electrical, api
 *
 * Aggregates toolbar/scope counters from query + client-side table state.
 */

export type HeatCalcObjectQueryCounts = {
  by_type: Partial<Record<'pipe' | 'tank', number>>;
  filtered?: number;
};

export type HeatCalcTableCountsInput = {
  isAllObjectScope: boolean;
  projectObjectCount: number;
  /** Fallback when query type count is missing (matches objects data model totalCount). */
  totalCount: number;
  activeTableObjectType: 'pipe' | 'tank';
  objectQueryCounts: HeatCalcObjectQueryCounts | null | undefined;
  excelModeEnabled: boolean;
  allFilteredSortedTableRowsLength: number;
  visibleTableObjectsLength: number;
  baseVisibleTableObjectsLength: number;
};

export type HeatCalcTableCounts = {
  activeTypeTotalCount: number;
  filteredTableCount: number;
};

export function buildHeatCalcTableCounts({
  isAllObjectScope,
  projectObjectCount,
  totalCount,
  activeTableObjectType,
  objectQueryCounts,
  excelModeEnabled,
  allFilteredSortedTableRowsLength,
  visibleTableObjectsLength,
  baseVisibleTableObjectsLength,
}: HeatCalcTableCountsInput): HeatCalcTableCounts {
  const activeTypeTotalCount = isAllObjectScope
    ? projectObjectCount
    : objectQueryCounts?.by_type[activeTableObjectType] ?? totalCount;

  const filteredTableCount = isAllObjectScope
    ? allFilteredSortedTableRowsLength
    : excelModeEnabled
      ? visibleTableObjectsLength
      : objectQueryCounts?.filtered ?? baseVisibleTableObjectsLength;

  return {
    activeTypeTotalCount,
    filteredTableCount,
  };
}
