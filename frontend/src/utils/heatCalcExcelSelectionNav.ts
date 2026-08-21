/**
 * Pure Excel-selection navigation helpers for HeatCalc.
 * Owner: useHeatCalcExcelSelection (P9 extract — coordinate/nav only).
 */
import type { ExcelCellPosition } from '@/utils/heatCalcExcelMode';

export type HeatCalcExcelCellRef = {
  objectId: string;
  columnKey: string;
} | null;

export interface HeatCalcExcelCellCoordinates {
  rowIndex: number;
  columnIndex: number;
}

export function excelCellPositionAt(
  rowIds: readonly string[],
  editableColumnKeys: readonly string[],
  rowIndex: number,
  columnIndex: number,
): ExcelCellPosition | null {
  const rowId = rowIds[rowIndex];
  const columnKey = editableColumnKeys[columnIndex];
  return rowId && columnKey ? { rowId, columnKey } : null;
}

export function excelSelectedCoordinates(
  rows: readonly { id: string }[],
  editableColumnKeys: readonly string[],
  selectedCell: HeatCalcExcelCellRef,
): HeatCalcExcelCellCoordinates | null {
  if (!selectedCell) return null;
  const rowIndex = rows.findIndex((object) => object.id === selectedCell.objectId);
  const columnIndex = editableColumnKeys.indexOf(selectedCell.columnKey);
  return rowIndex >= 0 && columnIndex >= 0 ? { rowIndex, columnIndex } : null;
}

/** Next indices for keyboard-style move; optional wrap across columns. */
export function computeMovedExcelSelectionIndices(
  selected: HeatCalcExcelCellCoordinates,
  rowDelta: number,
  columnDelta: number,
  columnCount: number,
  wrap = false,
): HeatCalcExcelCellCoordinates {
  let nextRowIndex = selected.rowIndex + rowDelta;
  let nextColumnIndex = selected.columnIndex + columnDelta;
  if (wrap && columnCount > 0) {
    if (nextColumnIndex >= columnCount) {
      nextColumnIndex = 0;
      nextRowIndex += 1;
    } else if (nextColumnIndex < 0) {
      nextColumnIndex = columnCount - 1;
      nextRowIndex -= 1;
    }
  }
  return { rowIndex: nextRowIndex, columnIndex: nextColumnIndex };
}

export function clampExcelGridIndices(
  rowIndex: number,
  columnIndex: number,
  rowCount: number,
  columnCount: number,
): HeatCalcExcelCellCoordinates | null {
  if (rowCount <= 0 || columnCount <= 0) return null;
  return {
    rowIndex: Math.min(Math.max(rowIndex, 0), rowCount - 1),
    columnIndex: Math.min(Math.max(columnIndex, 0), columnCount - 1),
  };
}
