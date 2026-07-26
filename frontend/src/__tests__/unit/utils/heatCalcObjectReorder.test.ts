// @vitest-environment node
import { describe, expect, it } from 'vitest';

import { rebuildObjectOrderAfterVisibleMove } from '@/utils/heatCalcObjectReorder';

describe('rebuildObjectOrderAfterVisibleMove (PDF-HEAT-08)', () => {
  it('moves within full visible list', () => {
    const full = ['a', 'b', 'c', 'd'];
    expect(rebuildObjectOrderAfterVisibleMove(full, full, 0, 2)).toEqual(['b', 'c', 'a', 'd']);
  });

  it('preserves filtered-out ids in place while reordering visible subset', () => {
    const full = ['a', 'b', 'c', 'd', 'e'];
    const visible = ['b', 'd']; // filter hides a,c,e
    // move d before b among visible
    expect(rebuildObjectOrderAfterVisibleMove(full, visible, 1, 0)).toEqual([
      'a',
      'd',
      'c',
      'b',
      'e',
    ]);
  });

  it('no-ops on same index', () => {
    const full = ['a', 'b'];
    expect(rebuildObjectOrderAfterVisibleMove(full, full, 1, 1)).toEqual(['a', 'b']);
  });
});
