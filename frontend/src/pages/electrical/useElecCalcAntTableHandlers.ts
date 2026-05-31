import { useCallback, type Dispatch, type SetStateAction } from 'react';
import type { TableProps } from 'antd';

import type { ElectricalCandidate } from '@/types/calculation';
import type { ProjectObject } from '@/types/project';
import type { HeatCalcTableViewState } from '@/utils/heatCalcTableFindability';

type TableViewStateSetter = Dispatch<SetStateAction<HeatCalcTableViewState>>;

type AntSorterLike = {
  order?: unknown;
  columnKey?: unknown;
  column?: {
    key?: unknown;
  } | null;
};

type UseElecCalcAntTableHandlersOptions = {
  setTablePage: (page: number) => void;
  setTablePageSize: (pageSize: number) => void;
  setTableViewState: TableViewStateSetter;
  setCandidateTableViewState: TableViewStateSetter;
};

function isAntSorterLike(value: unknown): value is AntSorterLike {
  return value != null && typeof value === 'object';
}

function antSorterColumnKey(sorter: AntSorterLike) {
  if (typeof sorter.columnKey === 'string') return sorter.columnKey;
  if (typeof sorter.column?.key === 'string') return sorter.column.key;
  return null;
}

export function parseAntTableSorter(sorter: unknown): HeatCalcTableViewState['sort'] {
  const selectedSorter = Array.isArray(sorter)
    ? sorter.find((item) => isAntSorterLike(item) && item.order)
    : sorter;
  if (!isAntSorterLike(selectedSorter)) return undefined;

  const columnKey = antSorterColumnKey(selectedSorter);
  if (!columnKey) return undefined;
  if (selectedSorter.order === 'ascend') return { columnKey, direction: 'asc' };
  if (selectedSorter.order === 'descend') return { columnKey, direction: 'desc' };
  return undefined;
}

export function applyAntTableSorter(
  state: HeatCalcTableViewState,
  sorter: unknown,
): HeatCalcTableViewState {
  return {
    ...state,
    sort: parseAntTableSorter(sorter),
  };
}

export function useElecCalcAntTableHandlers({
  setTablePage,
  setTablePageSize,
  setTableViewState,
  setCandidateTableViewState,
}: UseElecCalcAntTableHandlersOptions) {
  const handleElectricalTableChange = useCallback<NonNullable<TableProps<ProjectObject>['onChange']>>(
    (pagination, _filters, sorter, extra) => {
      const nextPage = extra.action === 'sort' ? 1 : pagination.current ?? 1;
      setTablePage(nextPage);
      if (pagination.pageSize) setTablePageSize(pagination.pageSize);
      setTableViewState((current) => applyAntTableSorter(current, sorter));
    },
    [setTablePage, setTablePageSize, setTableViewState],
  );

  const handleCandidateTableChange = useCallback<NonNullable<TableProps<ElectricalCandidate>['onChange']>>(
    (_pagination, _filters, sorter) => {
      setCandidateTableViewState((current) => applyAntTableSorter(current, sorter));
    },
    [setCandidateTableViewState],
  );

  return {
    handleElectricalTableChange,
    handleCandidateTableChange,
  };
}
