/**
 * Pure Excel selection / range helpers for heat-calc spreadsheet mode.
 */

export interface ExcelCellPosition {
  rowId: string;
  columnKey: string;
}

export interface ExcelSelectionRange {
  anchor: ExcelCellPosition;
  focus: ExcelCellPosition;
}

export interface NormalizedExcelSelectionRange {
  top: number;
  bottom: number;
  left: number;
  right: number;
}

export interface ExcelContextMenuDisabledState {
  copy: boolean;
  cut: boolean;
  paste: boolean;
  clear: boolean;
  deleteRows: boolean;
  resetRows: boolean;
}

function cellIndex(
  cell: ExcelCellPosition,
  rowIds: readonly string[],
  columnKeys: readonly string[],
) {
  return {
    rowIndex: rowIds.indexOf(cell.rowId),
    columnIndex: columnKeys.indexOf(cell.columnKey),
  };
}

export function createExcelSelectionRange(
  anchor: ExcelCellPosition,
  focus: ExcelCellPosition = anchor,
): ExcelSelectionRange {
  return { anchor, focus };
}

export function normalizeExcelSelectionRange(
  range: ExcelSelectionRange,
  rowIds: readonly string[],
  columnKeys: readonly string[],
): NormalizedExcelSelectionRange | null {
  const anchor = cellIndex(range.anchor, rowIds, columnKeys);
  const focus = cellIndex(range.focus, rowIds, columnKeys);
  if (
    anchor.rowIndex < 0
    || focus.rowIndex < 0
    || anchor.columnIndex < 0
    || focus.columnIndex < 0
  ) {
    return null;
  }
  return {
    top: Math.min(anchor.rowIndex, focus.rowIndex),
    bottom: Math.max(anchor.rowIndex, focus.rowIndex),
    left: Math.min(anchor.columnIndex, focus.columnIndex),
    right: Math.max(anchor.columnIndex, focus.columnIndex),
  };
}

export function getExcelSelectionRangeOrActiveCell(
  range: ExcelSelectionRange | null | undefined,
  activeCell: ExcelCellPosition | null | undefined,
) {
  return range ?? (activeCell ? createExcelSelectionRange(activeCell) : null);
}

export function getExcelSelectedCellPositions(
  range: ExcelSelectionRange | null | undefined,
  activeCell: ExcelCellPosition | null | undefined,
  rowIds: readonly string[],
  columnKeys: readonly string[],
): ExcelCellPosition[] {
  const selectedRange = getExcelSelectionRangeOrActiveCell(range, activeCell);
  if (!selectedRange || rowIds.length === 0 || columnKeys.length === 0) return [];
  const normalized = normalizeExcelSelectionRange(selectedRange, rowIds, columnKeys);
  if (!normalized) return [];
  const top = Math.max(0, normalized.top);
  const bottom = Math.min(rowIds.length - 1, normalized.bottom);
  const left = Math.max(0, normalized.left);
  const right = Math.min(columnKeys.length - 1, normalized.right);
  if (top > bottom || left > right) return [];

  const cells: ExcelCellPosition[] = [];
  for (let rowIndex = top; rowIndex <= bottom; rowIndex += 1) {
    for (let columnIndex = left; columnIndex <= right; columnIndex += 1) {
      cells.push({
        rowId: rowIds[rowIndex],
        columnKey: columnKeys[columnIndex],
      });
    }
  }
  return cells;
}

export function getExcelInsertAfterRowIndex(
  range: ExcelSelectionRange | null | undefined,
  activeCell: ExcelCellPosition | null | undefined,
  rowIds: readonly string[],
  columnKeys: readonly string[],
) {
  if (rowIds.length <= 0) return null;
  const selectedRange = getExcelSelectionRangeOrActiveCell(range, activeCell);
  if (!selectedRange) return null;
  const normalized = normalizeExcelSelectionRange(selectedRange, rowIds, columnKeys);
  if (!normalized) return null;
  return Math.min(Math.max(normalized.bottom, 0), rowIds.length - 1);
}

export function getExcelContextMenuDisabledState(options: {
  hasSelection: boolean;
  selectedRowCount: number;
  dirtySelectedRowCount: number;
  clipboardReadAvailable: boolean;
}): ExcelContextMenuDisabledState {
  const selectionDisabled = !options.hasSelection;
  return {
    copy: selectionDisabled,
    cut: selectionDisabled,
    clear: selectionDisabled,
    paste: selectionDisabled || !options.clipboardReadAvailable,
    deleteRows: options.selectedRowCount === 0,
    resetRows: options.dirtySelectedRowCount === 0,
  };
}

export function isExcelCellInRange(
  range: ExcelSelectionRange | null | undefined,
  rowId: string,
  columnKey: string,
  rowIds: readonly string[],
  columnKeys: readonly string[],
) {
  if (!range) return false;
  const normalized = normalizeExcelSelectionRange(range, rowIds, columnKeys);
  if (!normalized) return false;
  const rowIndex = rowIds.indexOf(rowId);
  const columnIndex = columnKeys.indexOf(columnKey);
  if (rowIndex < 0 || columnIndex < 0) return false;
  return (
    rowIndex >= normalized.top
    && rowIndex <= normalized.bottom
    && columnIndex >= normalized.left
    && columnIndex <= normalized.right
  );
}

export function isExcelCellActive(
  active: ExcelCellPosition | null | undefined,
  rowId: string,
  columnKey: string,
) {
  return !!active && active.rowId === rowId && active.columnKey === columnKey;
}

export function getExcelSelectionOrigin(
  range: ExcelSelectionRange | null | undefined,
  fallback: ExcelCellPosition | null | undefined,
  rowIds: readonly string[],
  columnKeys: readonly string[],
): ExcelCellPosition | null {
  if (!range) return fallback ?? null;
  const normalized = normalizeExcelSelectionRange(range, rowIds, columnKeys);
  if (!normalized) return fallback ?? null;
  const rowId = rowIds[normalized.top];
  const columnKey = columnKeys[normalized.left];
  return rowId && columnKey ? { rowId, columnKey } : fallback ?? null;
}

export function getExcelSelectedRowIds(
  range: ExcelSelectionRange | null | undefined,
  active: ExcelCellPosition | null | undefined,
  rowIds: readonly string[],
  columnKeys: readonly string[],
) {
  if (rowIds.length <= 0) return [];
  if (!range) {
    if (!active) return [];
    return rowIds.includes(active.rowId) ? [active.rowId] : [];
  }
  const normalized = normalizeExcelSelectionRange(range, rowIds, columnKeys);
  if (!normalized) return [];
  const top = Math.min(Math.max(normalized.top, 0), rowIds.length - 1);
  const bottom = Math.min(Math.max(normalized.bottom, 0), rowIds.length - 1);
  if (bottom < top) return [];
  return rowIds.slice(top, bottom + 1);
}
