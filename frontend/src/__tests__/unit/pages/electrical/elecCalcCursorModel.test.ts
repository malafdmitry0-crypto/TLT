import { describe, expect, it } from 'vitest';

import { projectObjectsPageCursorsEqual } from '@/pages/electrical/elecCalcCursorModel';
import type { ProjectObjectsPageCursor } from '@/types/project';

const baseCursor: ProjectObjectsPageCursor = {
  sort_order: 10,
  id: 'object-1',
  key: 'object_name',
  value: 'Pipe',
  value_is_null: false,
};

describe('elecCalcCursorModel', () => {
  it('treats nullish cursor pairs as equal only when both are nullish', () => {
    expect(projectObjectsPageCursorsEqual(null, null)).toBe(true);
    expect(projectObjectsPageCursorsEqual(undefined, null)).toBe(true);
    expect(projectObjectsPageCursorsEqual(baseCursor, null)).toBe(false);
    expect(projectObjectsPageCursorsEqual(undefined, baseCursor)).toBe(false);
  });

  it('compares every cursor field used for stable pagination', () => {
    expect(projectObjectsPageCursorsEqual(baseCursor, { ...baseCursor })).toBe(true);
    expect(projectObjectsPageCursorsEqual(baseCursor, { ...baseCursor, id: 'object-2' })).toBe(false);
    expect(projectObjectsPageCursorsEqual(baseCursor, { ...baseCursor, sort_order: 11 })).toBe(false);
    expect(projectObjectsPageCursorsEqual(baseCursor, { ...baseCursor, key: 'total_power' })).toBe(false);
    expect(projectObjectsPageCursorsEqual(baseCursor, { ...baseCursor, value: 'Tank' })).toBe(false);
    expect(projectObjectsPageCursorsEqual(baseCursor, { ...baseCursor, value_is_null: true })).toBe(false);
  });
});
