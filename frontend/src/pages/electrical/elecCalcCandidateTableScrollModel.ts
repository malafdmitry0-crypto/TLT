/**
 * @module electrical/candidate-table-scroll-model
 * @owner electrical
 * Pure width math for candidate sizing table horizontal scroll.
 */

export type CandidateColumnWidthMeta = {
  width: number;
  minWidthPx: number;
};

/** Minimum scroll width for candidate table (matches workspace baseline). */
export const CABLE_SIZING_CANDIDATE_TABLE_MIN_SCROLL_X = 920;

/**
 * Sum column widths (max of width/minWidth) and clamp to the minimum baseline.
 */
export function buildCableSizingCandidateTableScrollX(
  visibleCandidateColumnMetas: readonly CandidateColumnWidthMeta[],
): number {
  const sum = visibleCandidateColumnMetas.reduce(
    (total, column) => total + Math.max(column.width, column.minWidthPx),
    0,
  );
  return Math.max(CABLE_SIZING_CANDIDATE_TABLE_MIN_SCROLL_X, sum);
}
