import { act, renderHook } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import {
  applyAntTableSorter,
  parseAntTableSorter,
  useElecCalcAntTableHandlers,
} from '@/pages/electrical/useElecCalcAntTableHandlers';
import type { HeatCalcTableViewState } from '@/utils/heatCalcTableFindability';

describe('parseAntTableSorter', () => {
  it('reads sorter order from columnKey or column.key', () => {
    expect(parseAntTableSorter({ order: 'ascend', columnKey: 'current' })).toEqual({
      columnKey: 'current',
      direction: 'asc',
    });
    expect(parseAntTableSorter({ order: 'descend', column: { key: 'cable_mark' } })).toEqual({
      columnKey: 'cable_mark',
      direction: 'desc',
    });
  });

  it('uses the ordered sorter from Ant multi-sort arrays', () => {
    expect(parseAntTableSorter([
      { order: null, columnKey: 'current' },
      { order: 'descend', columnKey: 'total_power' },
    ])).toEqual({
      columnKey: 'total_power',
      direction: 'desc',
    });
  });

  it('clears sort for empty order or non-string keys', () => {
    expect(parseAntTableSorter({ order: null, columnKey: 'current' })).toBeUndefined();
    expect(parseAntTableSorter({ order: 'ascend', columnKey: 12 })).toBeUndefined();

    const state: HeatCalcTableViewState = {
      filters: {
        object_name: { kind: 'text', value: 'Насос' },
      },
      sort: { columnKey: 'current', direction: 'desc' },
    };

    expect(applyAntTableSorter(state, { order: null, columnKey: 'current' })).toEqual({
      filters: {
        object_name: { kind: 'text', value: 'Насос' },
      },
      sort: undefined,
    });
  });
});

describe('useElecCalcAntTableHandlers', () => {
  it('adapts main Ant table pagination and sorter to page/table state', () => {
    const setTablePage = vi.fn();
    const setTablePageSize = vi.fn();
    const setTableViewState = vi.fn();
    const { result } = renderHook(() => useElecCalcAntTableHandlers({
      setTablePage,
      setTablePageSize,
      setTableViewState,
    }));

    act(() => {
      result.current.handleElectricalTableChange(
        { current: 4, pageSize: 100 },
        {},
        { order: 'descend', columnKey: 'total_power' },
        { action: 'paginate', currentDataSource: [] },
      );
    });

    expect(setTablePage).toHaveBeenCalledWith(4);
    expect(setTablePageSize).toHaveBeenCalledWith(100);
    expect(setTableViewState).toHaveBeenCalledTimes(1);

    const update = setTableViewState.mock.calls[0][0] as (
      state: HeatCalcTableViewState,
    ) => HeatCalcTableViewState;
    expect(update({ filters: {} })).toEqual({
      filters: {},
      sort: { columnKey: 'total_power', direction: 'desc' },
    });
  });

  it('resets main table page on Ant sort actions', () => {
    const setTablePage = vi.fn();
    const { result } = renderHook(() => useElecCalcAntTableHandlers({
      setTablePage,
      setTablePageSize: vi.fn(),
      setTableViewState: vi.fn(),
    }));

    act(() => {
      result.current.handleElectricalTableChange(
        { current: 4, pageSize: 50 },
        {},
        { order: 'ascend', columnKey: 'object_name' },
        { action: 'sort', currentDataSource: [] },
      );
    });

    expect(setTablePage).toHaveBeenCalledWith(1);
  });
});
