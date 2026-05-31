import type { ElectricalCandidate } from '@/types/calculation';
import {
  applyColumnFilters,
  applyTableSort,
  type HeatCalcColumnValueAccessors,
  type HeatCalcTableViewState,
} from '@/utils/heatCalcTableFindability';

export function buildDisplayedCandidateRows(
  candidates: readonly ElectricalCandidate[],
  tableViewState: HeatCalcTableViewState,
  valueAccessors: HeatCalcColumnValueAccessors<ElectricalCandidate>,
): ElectricalCandidate[] {
  const rows = candidates.map((record, sourceIndex) => ({ record, sourceIndex }));
  const sortedRows = applyTableSort(
    applyColumnFilters(
      rows,
      tableViewState.filters,
      valueAccessors,
    ),
    tableViewState.sort,
    valueAccessors,
  );
  const appliedRows = sortedRows.filter((row) => row.record.is_applied);
  const otherRows = sortedRows.filter((row) => !row.record.is_applied);
  return [...appliedRows, ...otherRows].map((row) => row.record);
}

export function filterMarkedCandidateRows(
  candidates: readonly ElectricalCandidate[],
  markedCandidateIds: ReadonlySet<string>,
): ElectricalCandidate[] {
  if (markedCandidateIds.size === 0) return [];
  return candidates.filter((candidate) => markedCandidateIds.has(candidate.id));
}
