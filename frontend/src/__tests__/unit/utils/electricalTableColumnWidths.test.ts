// @vitest-environment node
import { describe, expect, it } from 'vitest';
import {
  ELECTRICAL_TABLE_COLUMN_MAX_WIDTH_PCT,
  ELECTRICAL_TABLE_COLUMN_MIN_WIDTH_PCT,
  clampElectricalTableColumnWidthPct,
  electricalTableColumnWidthPctToPx,
  electricalTableColumnWidthPxToPct,
} from '@/utils/electricalTableColumnWidths';

describe('electricalTableColumnWidths', () => {
  it('clamps width pct to configured bounds', () => {
    expect(clampElectricalTableColumnWidthPct(1)).toBe(ELECTRICAL_TABLE_COLUMN_MIN_WIDTH_PCT);
    expect(clampElectricalTableColumnWidthPct(99)).toBe(ELECTRICAL_TABLE_COLUMN_MAX_WIDTH_PCT);
    expect(clampElectricalTableColumnWidthPct('not-a-number')).toBe(
      ELECTRICAL_TABLE_COLUMN_MIN_WIDTH_PCT,
    );
  });

  it('round-trips pct ↔ px within clamp', () => {
    const px = electricalTableColumnWidthPctToPx(12.5);
    expect(px).toBeGreaterThan(0);
    expect(electricalTableColumnWidthPxToPct(px)).toBe(12.5);
  });
});
