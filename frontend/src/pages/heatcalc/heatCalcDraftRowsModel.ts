/**
 * @module heatcalc/draft-rows-model
 * @owner heat
 * @depends utils/heatCalcInlineEdit (types only)
 * @does-not electrical, api
 */
import type { DraftRowsById } from '@/utils/heatCalcInlineEdit';

/** Row ids whose draft reference changed between two draft maps (identity, not deep equal). */
export function changedDraftRowIds(previous: DraftRowsById, next: DraftRowsById): string[] {
  const ids = new Set([...Object.keys(previous), ...Object.keys(next)]);
  const changed: string[] = [];
  ids.forEach((id) => {
    if (previous[id] !== next[id]) changed.push(id);
  });
  return changed;
}
