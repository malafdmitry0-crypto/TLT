/**
 * Pure Excel selection lookup model for heat-calc table columns.
 */
import type {
  ExcelSelectionRange,
  NormalizedExcelSelectionRange,
} from '@/utils/heatCalcExcelMode';

export interface ExcelSelectionLookup {
  normalizedRange: NormalizedExcelSelectionRange | null;
  rowIdToIndex: Map<string, number>;
  columnKeyToIndex: Map<string, number>;
}

export function buildExcelSelectionLookup(
  range: ExcelSelectionRange | null,
  rowIds: readonly string[],
  columnKeys: readonly string[],
): ExcelSelectionLookup {
  const rowIdToIndex = new Map<string, number>();
  rowIds.forEach((rowId, index) => rowIdToIndex.set(rowId, index));

  const columnKeyToIndex = new Map<string, number>();
  columnKeys.forEach((columnKey, index) => columnKeyToIndex.set(columnKey, index));

  const anchorRowIndex = range ? rowIdToIndex.get(range.anchor.rowId) : undefined;
  const focusRowIndex = range ? rowIdToIndex.get(range.focus.rowId) : undefined;
  const anchorColumnIndex = range ? columnKeyToIndex.get(range.anchor.columnKey) : undefined;
  const focusColumnIndex = range ? columnKeyToIndex.get(range.focus.columnKey) : undefined;
  const normalizedRange = (
    anchorRowIndex != null
    && focusRowIndex != null
    && anchorColumnIndex != null
    && focusColumnIndex != null
  )
    ? {
      top: Math.min(anchorRowIndex, focusRowIndex),
      bottom: Math.max(anchorRowIndex, focusRowIndex),
      left: Math.min(anchorColumnIndex, focusColumnIndex),
      right: Math.max(anchorColumnIndex, focusColumnIndex),
    }
    : null;

  return {
    normalizedRange,
    rowIdToIndex,
    columnKeyToIndex,
  };
}

export function isExcelCellSelectedByLookup(
  lookup: ExcelSelectionLookup,
  rowId: string,
  columnKey: string,
) {
  const { normalizedRange } = lookup;
  if (!normalizedRange) return false;
  const rowIndex = lookup.rowIdToIndex.get(rowId);
  const columnIndex = lookup.columnKeyToIndex.get(columnKey);
  if (rowIndex == null || columnIndex == null) return false;
  return (
    rowIndex >= normalizedRange.top
    && rowIndex <= normalizedRange.bottom
    && columnIndex >= normalizedRange.left
    && columnIndex <= normalizedRange.right
  );
}
