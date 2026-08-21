// @vitest-environment node
import { describe, expect, it } from 'vitest';

import {
  activeCellForRowId,
  isNormalHeaderFilterHit,
  nextKeysFromRowClick,
  shouldShowOffsetPagination,
} from '@/utils/heatCalcNormalGlideControllerHelpers';

describe('heatCalcNormalGlideControllerHelpers', () => {
  const rows = [{ id: 'a' }, { id: 'b' }, { id: 'c' }];

  it('detects header filter hit zone', () => {
    expect(isNormalHeaderFilterHit(
      { key: 'name', title: 'Name', width: 180, filterable: true },
      170,
      180,
    )).toBe(true);
    expect(isNormalHeaderFilterHit(
      { key: 'name', title: 'Name', width: 180, filterable: true },
      10,
      180,
    )).toBe(false);
  });

  it('computes multi-select / shift-range row keys', () => {
    expect(nextKeysFromRowClick({
      rows,
      selectedRowKeys: [],
      rowIndex: 1,
      ctrlKey: false,
      metaKey: false,
      shiftKey: false,
      anchorRow: null,
      activeCellRowIndex: null,
    })).toEqual({ nextKeys: ['b'], nextAnchor: 1 });

    expect(nextKeysFromRowClick({
      rows,
      selectedRowKeys: ['b'],
      rowIndex: 0,
      ctrlKey: true,
      metaKey: false,
      shiftKey: false,
      anchorRow: 1,
      activeCellRowIndex: 1,
    }).nextKeys.sort()).toEqual(['a', 'b']);

    expect(nextKeysFromRowClick({
      rows,
      selectedRowKeys: [],
      rowIndex: 2,
      ctrlKey: false,
      metaKey: false,
      shiftKey: true,
      anchorRow: 0,
      activeCellRowIndex: 0,
    })).toEqual({ nextKeys: ['a', 'b', 'c'], nextAnchor: 0 });
  });

  it('syncs active cell to active row id and offset pagination visibility', () => {
    expect(activeCellForRowId({
      activeRowId: 'c',
      rows,
      current: [1, 0],
      visibleColumnCount: 4,
    })).toEqual([1, 2]);

    expect(activeCellForRowId({
      activeRowId: null,
      rows,
      current: [0, 0],
      visibleColumnCount: 4,
    })).toBeNull();

    expect(shouldShowOffsetPagination(null, {
      current: 1,
      pageSize: 50,
      total: 120,
    }).showOffsetPagination).toBe(true);

    expect(shouldShowOffsetPagination({ hasNextPage: true }, {
      current: 1,
      pageSize: 50,
      total: 20,
      hideOnSinglePage: true,
    }).showOffsetPagination).toBe(false);
  });
});
