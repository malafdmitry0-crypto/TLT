// @vitest-environment node
import { describe, expect, it } from 'vitest';

import { buildHeatCalcTableCounts } from '@/pages/heatcalc/heatCalcTableCountsModel';

describe('buildHeatCalcTableCounts', () => {
  it('uses project total for all-scope', () => {
    expect(buildHeatCalcTableCounts({
      isAllObjectScope: true,
      projectObjectCount: 10,
      totalCount: 9,
      activeTableObjectType: 'pipe',
      objectQueryCounts: { by_type: { pipe: 4, tank: 6 }, filtered: 3 },
      excelModeEnabled: false,
      allFilteredSortedTableRowsLength: 7,
      visibleTableObjectsLength: 2,
      baseVisibleTableObjectsLength: 5,
    })).toEqual({
      activeTypeTotalCount: 10,
      filteredTableCount: 7,
    });
  });

  it('uses query type count and filtered for typed normal table', () => {
    expect(buildHeatCalcTableCounts({
      isAllObjectScope: false,
      projectObjectCount: 10,
      totalCount: 9,
      activeTableObjectType: 'tank',
      objectQueryCounts: { by_type: { pipe: 4, tank: 6 }, filtered: 3 },
      excelModeEnabled: false,
      allFilteredSortedTableRowsLength: 7,
      visibleTableObjectsLength: 2,
      baseVisibleTableObjectsLength: 5,
    })).toEqual({
      activeTypeTotalCount: 6,
      filteredTableCount: 3,
    });
  });

  it('falls back to totalCount and base visible rows when query partial', () => {
    expect(buildHeatCalcTableCounts({
      isAllObjectScope: false,
      projectObjectCount: 10,
      totalCount: 8,
      activeTableObjectType: 'pipe',
      objectQueryCounts: { by_type: {} },
      excelModeEnabled: false,
      allFilteredSortedTableRowsLength: 0,
      visibleTableObjectsLength: 2,
      baseVisibleTableObjectsLength: 5,
    })).toEqual({
      activeTypeTotalCount: 8,
      filteredTableCount: 5,
    });
  });

  it('uses visible objects length in excel mode', () => {
    expect(buildHeatCalcTableCounts({
      isAllObjectScope: false,
      projectObjectCount: 10,
      totalCount: 9,
      activeTableObjectType: 'pipe',
      objectQueryCounts: { by_type: { pipe: 4 }, filtered: 1 },
      excelModeEnabled: true,
      allFilteredSortedTableRowsLength: 0,
      visibleTableObjectsLength: 12,
      baseVisibleTableObjectsLength: 5,
    })).toEqual({
      activeTypeTotalCount: 4,
      filteredTableCount: 12,
    });
  });
});
