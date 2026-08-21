import { useMemo } from 'react';

import type { HeatCalcObjectType, ProjectObject } from '@/types/project';
import {
  getExcelSelectedRowIds,
  type ExcelCellPosition,
  type ExcelSelectionRange,
} from '@/utils/heatCalcExcelMode';
import {
  getActiveExcelLocalRows,
  mergeExcelLocalRows,
  type ExcelLocalProjectObject,
} from '@/utils/heatCalcExcelRows';
import {
  applyColumnFilters,
  applyTableSort,
  type HeatCalcColumnValueAccessors,
  type HeatCalcIndexedTableRow,
  type HeatCalcTableViewState,
} from '@/utils/heatCalcTableFindability';

export type HeatCalcExcelCellRef = {
  objectId: string;
  columnKey: string;
} | null;

interface UseHeatCalcExcelRowsModelOptions {
  excelModeEnabled: boolean;
  allProjectObjects: ProjectObject[];
  activeObjectType: HeatCalcObjectType;
  tableViewState: HeatCalcTableViewState;
  tableValueAccessors: HeatCalcColumnValueAccessors<ProjectObject>;
  localRows: ExcelLocalProjectObject[];
  selectedCell: HeatCalcExcelCellRef;
  selectionRange: ExcelSelectionRange | null;
  editableColumnKeys: string[];
}

export function useHeatCalcExcelRowsModel({
  excelModeEnabled,
  allProjectObjects,
  activeObjectType,
  tableViewState,
  tableValueAccessors,
  localRows,
  selectedCell,
  selectionRange,
  editableColumnKeys,
}: UseHeatCalcExcelRowsModelOptions) {
  const activeIndexedRows = useMemo<HeatCalcIndexedTableRow<ProjectObject>[]>(
    () => allProjectObjects
      .filter((object) => object.object_type === activeObjectType)
      .sort((left, right) => {
        const bySortOrder = left.sort_order - right.sort_order;
        if (bySortOrder !== 0) return bySortOrder;
        return left.created_at.localeCompare(right.created_at);
      })
      .map((record, index) => ({ record, sourceIndex: index })),
    [activeObjectType, allProjectObjects],
  );

  const filteredSortedRows = useMemo(
    () => applyTableSort(
      applyColumnFilters(activeIndexedRows, tableViewState.filters, tableValueAccessors),
      tableViewState.sort,
      tableValueAccessors,
    ),
    [activeIndexedRows, tableValueAccessors, tableViewState],
  );

  const activeLocalRows = useMemo<ExcelLocalProjectObject[]>(
    () => getActiveExcelLocalRows(localRows, activeObjectType),
    [activeObjectType, localRows],
  );

  const baseRows = useMemo(
    () => filteredSortedRows.map(({ record }) => record),
    [filteredSortedRows],
  );

  const rows = useMemo(
    () => (excelModeEnabled ? mergeExcelLocalRows(baseRows, activeLocalRows) : baseRows),
    [activeLocalRows, baseRows, excelModeEnabled],
  );

  const indexedRows = useMemo<HeatCalcIndexedTableRow<ProjectObject>[]>(
    () => rows.map((record, index) => ({ record, sourceIndex: index })),
    [rows],
  );

  const rowIds = useMemo(
    () => rows.map((object) => object.id),
    [rows],
  );

  const activeCell = useMemo<ExcelCellPosition | null>(
    () => (selectedCell
      ? { rowId: selectedCell.objectId, columnKey: selectedCell.columnKey }
      : null),
    [selectedCell],
  );

  const selectedRows = useMemo(() => {
    if (!excelModeEnabled) return [];
    const selectedRowIds = getExcelSelectedRowIds(
      selectionRange,
      activeCell,
      rowIds,
      editableColumnKeys,
    );
    const rowIdSet = new Set(selectedRowIds);
    return indexedRows.filter(({ record }) => rowIdSet.has(record.id));
  }, [activeCell, editableColumnKeys, excelModeEnabled, indexedRows, rowIds, selectionRange]);

  return {
    activeLocalRows,
    baseRows,
    rows,
    indexedRows,
    rowIds,
    activeCell,
    selectedRows,
  };
}
