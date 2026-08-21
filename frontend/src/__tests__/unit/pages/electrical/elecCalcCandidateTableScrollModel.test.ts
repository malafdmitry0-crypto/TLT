// @vitest-environment node
import { describe, expect, it } from 'vitest';
import {
  CABLE_SIZING_CANDIDATE_TABLE_MIN_SCROLL_X,
  buildCableSizingCandidateTableScrollX,
} from '@/pages/electrical/elecCalcCandidateTableScrollModel';

describe('buildCableSizingCandidateTableScrollX', () => {
  it('returns the baseline minimum when columns are empty', () => {
    expect(buildCableSizingCandidateTableScrollX([])).toBe(
      CABLE_SIZING_CANDIDATE_TABLE_MIN_SCROLL_X,
    );
  });

  it('uses max(width, minWidthPx) per column and clamps to baseline', () => {
    expect(
      buildCableSizingCandidateTableScrollX([
        { width: 100, minWidthPx: 120 },
        { width: 200, minWidthPx: 80 },
      ]),
    ).toBe(CABLE_SIZING_CANDIDATE_TABLE_MIN_SCROLL_X); // 120+200=320 < 920

    expect(
      buildCableSizingCandidateTableScrollX([
        { width: 400, minWidthPx: 100 },
        { width: 300, minWidthPx: 350 },
        { width: 250, minWidthPx: 200 },
      ]),
    ).toBe(400 + 350 + 250); // 1000
  });
});
