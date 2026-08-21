import { useCallback, useEffect, useState } from 'react';

import {
  updateTableViewColumnFilter,
  updateTableViewSort,
} from '@/domain/electrical/elecCalcTableFilterModel';
import type { ElectricalCandidateColumnKey } from '@/utils/electricalCandidateTableColumns';
import type { ElectricalColumnKey } from '@/utils/electricalTableColumns';
import {
  createEmptyTableViewState,
  hasActiveTableViewState,
  removeHiddenTableViewState,
  type HeatCalcColumnFilter,
  type HeatCalcTableViewState,
} from '@/utils/heatCalcTableFindability';

type UseElecCalcTableViewStateOptions = {
  visibleElectricalColumnKeys: ElectricalColumnKey[];
  visibleCandidateColumnKeys: ElectricalCandidateColumnKey[];
  resetElectricalTablePage: () => void;
};

function cleanHiddenColumns(
  state: HeatCalcTableViewState,
  visibleColumnKeys: ElectricalColumnKey[] | ElectricalCandidateColumnKey[],
) {
  const cleaned = removeHiddenTableViewState(state, visibleColumnKeys);
  if (
    cleaned.sort === state.sort
    && Object.keys(cleaned.filters).length === Object.keys(state.filters).length
  ) {
    return state;
  }
  return cleaned;
}

export function useElecCalcTableViewState({
  visibleElectricalColumnKeys,
  visibleCandidateColumnKeys,
  resetElectricalTablePage,
}: UseElecCalcTableViewStateOptions) {
  const [tableViewState, setTableViewState] =
    useState<HeatCalcTableViewState>(() => createEmptyTableViewState());
  const [candidateTableViewState, setCandidateTableViewState] =
    useState<HeatCalcTableViewState>(() => createEmptyTableViewState());

  useEffect(() => {
    setTableViewState((current) => cleanHiddenColumns(current, visibleElectricalColumnKeys));
  }, [visibleElectricalColumnKeys]);

  useEffect(() => {
    setCandidateTableViewState((current) => cleanHiddenColumns(current, visibleCandidateColumnKeys));
  }, [visibleCandidateColumnKeys]);

  const setColumnFilter = useCallback((columnKey: ElectricalColumnKey, filter?: HeatCalcColumnFilter) => {
    resetElectricalTablePage();
    setTableViewState((current) => updateTableViewColumnFilter(current, columnKey, filter));
  }, [resetElectricalTablePage]);

  const resetColumnFilter = useCallback((columnKey: ElectricalColumnKey) => {
    setColumnFilter(columnKey, undefined);
  }, [setColumnFilter]);

  const resetCurrentTableViewState = useCallback(() => {
    resetElectricalTablePage();
    setTableViewState(createEmptyTableViewState());
  }, [resetElectricalTablePage]);

  const setElectricalTableSort = useCallback((
    columnKey: ElectricalColumnKey,
    direction?: 'asc' | 'desc',
  ) => {
    resetElectricalTablePage();
    setTableViewState((current) => updateTableViewSort(current, columnKey, direction));
  }, [resetElectricalTablePage]);

  const setCandidateColumnFilter = useCallback((
    columnKey: ElectricalCandidateColumnKey,
    filter?: HeatCalcColumnFilter,
  ) => {
    setCandidateTableViewState((current) => updateTableViewColumnFilter(current, columnKey, filter));
  }, []);

  const resetCandidateColumnFilter = useCallback((columnKey: ElectricalCandidateColumnKey) => {
    setCandidateColumnFilter(columnKey, undefined);
  }, [setCandidateColumnFilter]);

  const resetCandidateTableViewState = useCallback(() => {
    setCandidateTableViewState(createEmptyTableViewState());
  }, []);

  const setCandidateTableSort = useCallback((
    columnKey: ElectricalCandidateColumnKey,
    direction?: 'asc' | 'desc',
  ) => {
    setCandidateTableViewState((current) => updateTableViewSort(current, columnKey, direction));
  }, []);

  return {
    tableViewState,
    candidateTableViewState,
    setTableViewState,
    setCandidateTableViewState,
    currentTableViewActive: hasActiveTableViewState(tableViewState),
    candidateTableViewActive: hasActiveTableViewState(candidateTableViewState),
    setColumnFilter,
    resetColumnFilter,
    resetCurrentTableViewState,
    setElectricalTableSort,
    setCandidateColumnFilter,
    resetCandidateColumnFilter,
    resetCandidateTableViewState,
    setCandidateTableSort,
  };
}
