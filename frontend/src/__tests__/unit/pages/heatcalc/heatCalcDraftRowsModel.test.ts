import { describe, expect, it } from 'vitest';

import { changedDraftRowIds } from '@/pages/heatcalc/heatCalcDraftRowsModel';
import type { DraftRowState, DraftRowsById } from '@/utils/heatCalcInlineEdit';

/** Minimal typed draft row for identity-only comparisons in changedDraftRowIds. */
function draftRow(objectId: string): DraftRowState {
  return {
    objectId,
    objectType: 'pipe',
    baseVersion: 1,
    baseFormValues: {},
    draftFormValues: {},
    dirtyFields: {},
    errors: {},
    saving: false,
    sourceParams: {},
  };
}

describe('changedDraftRowIds', () => {
  it('returns empty when maps are empty', () => {
    expect(changedDraftRowIds({}, {})).toEqual([]);
  });

  it('detects added, removed and replaced row drafts by reference', () => {
    const rowA = draftRow('a');
    const rowA2 = draftRow('a');
    const rowB = draftRow('b');
    const previous: DraftRowsById = { a: rowA, b: rowB };
    const next: DraftRowsById = { a: rowA2, c: rowB };

    const changed = changedDraftRowIds(previous, next).sort();
    expect(changed).toEqual(['a', 'b', 'c']);
  });

  it('ignores unchanged identity', () => {
    const rowA = draftRow('a');
    expect(changedDraftRowIds({ a: rowA }, { a: rowA })).toEqual([]);
  });
});

