import { describe, expect, it } from 'vitest';
import { filterVisibleRowsBySelectedKeys } from '@/pages/heatcalc/heatCalcVisibleSelectionModel';

describe('filterVisibleRowsBySelectedKeys', () => {
  const rows = [
    { record: { id: 'a' }, kind: 1 },
    { record: { id: 'b' }, kind: 2 },
    { record: { id: 'c' }, kind: 3 },
  ];

  it('returns empty when nothing selected or no rows', () => {
    expect(filterVisibleRowsBySelectedKeys(rows, [])).toEqual([]);
    expect(filterVisibleRowsBySelectedKeys([], ['a'])).toEqual([]);
  });

  it('filters by selected ids preserving order', () => {
    expect(filterVisibleRowsBySelectedKeys(rows, ['c', 'a'])).toEqual([
      { record: { id: 'a' }, kind: 1 },
      { record: { id: 'c' }, kind: 3 },
    ]);
  });
});
