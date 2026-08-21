/**
 * Electrical table column width clamp / pct↔px conversion helpers.
 */

export const ELECTRICAL_TABLE_COLUMN_WIDTH_BASE_PX = 1000;
export const ELECTRICAL_TABLE_COLUMN_MIN_WIDTH_PCT = 3;
export const ELECTRICAL_TABLE_COLUMN_MAX_WIDTH_PCT = 60;

function roundWidthPct(value: number) {
  return Math.round(value * 10) / 10;
}

export function clampElectricalTableColumnWidthPct(value: unknown) {
  const numericValue = Number(value);
  if (!Number.isFinite(numericValue)) return ELECTRICAL_TABLE_COLUMN_MIN_WIDTH_PCT;
  return roundWidthPct(
    Math.min(
      ELECTRICAL_TABLE_COLUMN_MAX_WIDTH_PCT,
      Math.max(ELECTRICAL_TABLE_COLUMN_MIN_WIDTH_PCT, numericValue),
    ),
  );
}

export function electricalTableColumnWidthPctToPx(widthPct: number) {
  return Math.round(
    (clampElectricalTableColumnWidthPct(widthPct) / 100) *
      ELECTRICAL_TABLE_COLUMN_WIDTH_BASE_PX,
  );
}

export function electricalTableColumnWidthPxToPct(widthPx: number) {
  return clampElectricalTableColumnWidthPct(
    (widthPx / ELECTRICAL_TABLE_COLUMN_WIDTH_BASE_PX) * 100,
  );
}
