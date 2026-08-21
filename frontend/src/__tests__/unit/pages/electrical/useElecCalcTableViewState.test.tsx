import { act, renderHook } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import { useElecCalcTableViewState } from '@/pages/electrical/useElecCalcTableViewState';
import type { ElectricalCandidateColumnKey } from '@/utils/electricalCandidateTableColumns';
import type { ElectricalColumnKey } from '@/utils/electricalTableColumns';

type HookProps = {
  visibleElectricalColumnKeys: ElectricalColumnKey[];
  visibleCandidateColumnKeys: ElectricalCandidateColumnKey[];
};

function setup(initialProps: HookProps) {
  const resetElectricalTablePage = vi.fn();
  return {
    resetElectricalTablePage,
    ...renderHook((props: HookProps) => useElecCalcTableViewState({
      ...props,
      resetElectricalTablePage,
    }), {
      initialProps,
    }),
  };
}

describe('useElecCalcTableViewState', () => {
  it('updates main table filters and sort while resetting main pagination', () => {
    const { result, resetElectricalTablePage } = setup({
      visibleElectricalColumnKeys: ['object_name', 'current'],
      visibleCandidateColumnKeys: ['cable_type'],
    });

    act(() => {
      result.current.setColumnFilter('object_name', { kind: 'text', value: 'Насос' });
    });

    expect(resetElectricalTablePage).toHaveBeenCalledTimes(1);
    expect(result.current.tableViewState.filters.object_name).toEqual({ kind: 'text', value: 'Насос' });
    expect(result.current.currentTableViewActive).toBe(true);

    act(() => {
      result.current.setElectricalTableSort('current', 'desc');
    });

    expect(resetElectricalTablePage).toHaveBeenCalledTimes(2);
    expect(result.current.tableViewState.sort).toEqual({
      columnKey: 'current',
      direction: 'desc',
    });

    act(() => {
      result.current.resetCurrentTableViewState();
    });

    expect(resetElectricalTablePage).toHaveBeenCalledTimes(3);
    expect(result.current.tableViewState).toEqual({ filters: {} });
    expect(result.current.currentTableViewActive).toBe(false);
  });

  it('updates candidate table filters and sort without resetting main pagination', () => {
    const { result, resetElectricalTablePage } = setup({
      visibleElectricalColumnKeys: ['object_name'],
      visibleCandidateColumnKeys: ['cable_type', 'total_power'],
    });

    act(() => {
      result.current.setCandidateColumnFilter('cable_type', { kind: 'enum', values: ['self_regulating'] });
      result.current.setCandidateTableSort('total_power', 'asc');
    });

    expect(resetElectricalTablePage).not.toHaveBeenCalled();
    expect(result.current.candidateTableViewState.filters.cable_type).toEqual({
      kind: 'enum',
      values: ['self_regulating'],
    });
    expect(result.current.candidateTableViewState.sort).toEqual({
      columnKey: 'total_power',
      direction: 'asc',
    });
    expect(result.current.candidateTableViewActive).toBe(true);

    act(() => {
      result.current.resetCandidateColumnFilter('cable_type');
      result.current.resetCandidateTableViewState();
    });

    expect(resetElectricalTablePage).not.toHaveBeenCalled();
    expect(result.current.candidateTableViewState).toEqual({ filters: {} });
    expect(result.current.candidateTableViewActive).toBe(false);
  });

  it('removes filters and sort for hidden main and candidate columns', () => {
    const { result, rerender } = setup({
      visibleElectricalColumnKeys: ['object_name', 'current'],
      visibleCandidateColumnKeys: ['cable_type', 'total_power'],
    });

    act(() => {
      result.current.setColumnFilter('object_name', { kind: 'text', value: 'Насос' });
      result.current.setElectricalTableSort('current', 'asc');
      result.current.setCandidateColumnFilter('cable_type', { kind: 'enum', values: ['self_regulating'] });
      result.current.setCandidateTableSort('total_power', 'desc');
    });

    rerender({
      visibleElectricalColumnKeys: ['object_name'],
      visibleCandidateColumnKeys: ['cable_type'],
    });

    expect(result.current.tableViewState).toEqual({
      filters: {
        object_name: { kind: 'text', value: 'Насос' },
      },
      sort: undefined,
    });
    expect(result.current.candidateTableViewState).toEqual({
      filters: {
        cable_type: { kind: 'enum', values: ['self_regulating'] },
      },
      sort: undefined,
    });
  });
});
