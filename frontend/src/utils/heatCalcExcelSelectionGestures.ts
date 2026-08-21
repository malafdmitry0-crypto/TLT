/**
 * Pure Excel selection gesture helpers (P9-CORRECTIVE).
 * Keeps drag/double-click/range geometry out of the React owner hook.
 */
import type { ExcelCellPosition, ExcelSelectionRange } from '@/utils/heatCalcExcelMode';
import { normalizeExcelSelectionRange } from '@/utils/heatCalcExcelMode';
import type { HeatCalcExcelCellRef } from '@/utils/heatCalcExcelSelectionNav';
import { excelCellPositionAt } from '@/utils/heatCalcExcelSelectionNav';

export const EXCEL_CELL_DOUBLE_CLICK_MS = 450;

export type ExcelSelectionDragMode = 'cells' | 'rows' | 'columns';

export type ExcelSelectionDragState = {
  mode: ExcelSelectionDragMode;
  anchor: ExcelCellPosition;
};

export type ExcelCellPointerStamp = {
  rowIndex: number;
  columnIndex: number;
  at: number;
};

export function isRepeatedExcelCellClick(
  previous: ExcelCellPointerStamp | null,
  rowIndex: number,
  columnIndex: number,
  now: number,
  thresholdMs = EXCEL_CELL_DOUBLE_CLICK_MS,
): boolean {
  return !!previous
    && previous.rowIndex === rowIndex
    && previous.columnIndex === columnIndex
    && now - previous.at < thresholdMs;
}

export function excelFullRowEndpoints(
  rowIds: readonly string[],
  editableColumnKeys: readonly string[],
  rowIndex: number,
): { start: ExcelCellPosition; end: ExcelCellPosition } | null {
  if (editableColumnKeys.length === 0) return null;
  const start = excelCellPositionAt(rowIds, editableColumnKeys, rowIndex, 0);
  const end = excelCellPositionAt(
    rowIds,
    editableColumnKeys,
    rowIndex,
    editableColumnKeys.length - 1,
  );
  return start && end ? { start, end } : null;
}

export function excelFullColumnEndpoints(
  rowIds: readonly string[],
  editableColumnKeys: readonly string[],
  columnIndex: number,
): { start: ExcelCellPosition; end: ExcelCellPosition } | null {
  if (rowIds.length === 0) return null;
  const start = excelCellPositionAt(rowIds, editableColumnKeys, 0, columnIndex);
  const end = excelCellPositionAt(
    rowIds,
    editableColumnKeys,
    rowIds.length - 1,
    columnIndex,
  );
  return start && end ? { start, end } : null;
}

export function excelShiftRowAnchor(
  selectionRange: ExcelSelectionRange | null,
  firstColumnKey: string,
  fallbackStart: ExcelCellPosition,
  shiftKey: boolean,
): ExcelCellPosition {
  if (shiftKey && selectionRange) {
    return { rowId: selectionRange.anchor.rowId, columnKey: firstColumnKey };
  }
  return fallbackStart;
}

export function excelShiftColumnAnchor(
  selectionRange: ExcelSelectionRange | null,
  firstRowId: string,
  fallbackStart: ExcelCellPosition,
  shiftKey: boolean,
): ExcelCellPosition {
  if (shiftKey && selectionRange) {
    return { rowId: firstRowId, columnKey: selectionRange.anchor.columnKey };
  }
  return fallbackStart;
}

export function isExcelRowIndexSelected(
  selectionRange: ExcelSelectionRange | null,
  rowIds: readonly string[],
  editableColumnKeys: readonly string[],
  rowIndex: number,
): boolean {
  if (!selectionRange) return false;
  const normalized = normalizeExcelSelectionRange(
    selectionRange,
    rowIds,
    editableColumnKeys,
  );
  if (!normalized) return false;
  return rowIndex >= normalized.top && rowIndex <= normalized.bottom;
}

export function isExcelSelectionStale(
  selectedCell: HeatCalcExcelCellRef,
  rows: readonly { id: string }[],
  editableColumnKeys: readonly string[],
): boolean {
  if (!selectedCell) return false;
  return (
    !rows.some((object) => object.id === selectedCell.objectId)
    || !editableColumnKeys.includes(selectedCell.columnKey)
  );
}
