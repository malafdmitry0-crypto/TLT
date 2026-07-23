import { describe, expect, it } from 'vitest';

import { changedDraftRowIds } from '@/pages/heatcalc/heatCalcDraftRowsModel';
import type { DraftRowsById } from '@/utils/heatCalcInlineEdit';

describe('changedDraftRowIds', () => {
  it('returns empty when maps are empty', () => {
    expect(changedDraftRowIds({}, {})).toEqual([]);
  });

  it('detects added, removed and replaced row drafts by reference', () => {
    const rowA = { id: 'a' } as DraftRowsById[string];
    const rowA2 = { id: 'a' } as DraftRowsById[string];
    const rowB = { id: 'b' } as DraftRowsById[string];
    const previous: DraftRowsById = { a: rowA, b: rowB };
    const next: DraftRowsById = { a: rowA2, c: rowB };

    const changed = changedDraftRowIds(previous, next).sort();
    expect(changed).toEqual(['a', 'b', 'c']);
  });

  it('ignores unchanged identity', () => {
    const rowA = { id: 'a' } as DraftRowsById[string];
    expect(changedDraftRowIds({ a: rowA }, { a: rowA })).toEqual([]);
  });
});
