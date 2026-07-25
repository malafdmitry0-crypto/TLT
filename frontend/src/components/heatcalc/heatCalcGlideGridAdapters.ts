/**
 * Pure Glide adapters for HeatCalc excel grid (no React).
 * Grid chrome (DataEditor wiring, overlay editor) stays on HeatCalcGlideGrid.
 */
import type { CellClickedEventArgs, EditableGridCell, GridCell, GridColumn } from '@glideapps/glide-data-grid';
import { GridCellKind } from '@glideapps/glide-data-grid';
import type { HeatCalcContextMenuTrigger } from '@/components/heatcalc/HeatCalcContextMenuTrigger';
import type { ProjectObject } from '@/types/project';
import type { ExcelSelectionRange } from '@/utils/heatCalcExcelMode';
import type {
  HeatCalcGlideCellAlign,
  HeatCalcGlideGridCellState,
  HeatCalcGlideGridColumn,
} from '@/utils/heatCalcGlideGrid';
import { resolveTableFontSizeByKey } from '@/utils/heatCalcTableViewSettings';
import {
  GLIDE_THEME,
  isDirtyRowClassName,
  isErrorRowClassName,
} from '@/utils/glideGridPrimitives';

export const GLIDE_ROW_MARKER_WIDTH = 50;
export const GLIDE_MIN_COLUMN_WIDTH = 48;
export const GLIDE_MAX_COLUMN_WIDTH = 600;
export const GLIDE_SELECTED_ROW_BG = GLIDE_THEME.accentLight;
export const GLIDE_SELECTED_ROW_BORDER = GLIDE_THEME.accent;

export function getGridCellEditedValue(newValue: EditableGridCell): unknown {
  if (newValue.kind === GridCellKind.Number) return newValue.data;
  if ('data' in newValue) return newValue.data;
  return undefined;
}

/** Map Glide cell bounds to the owner-neutral context-menu trigger (cell center). */
export function toContextMenuTrigger(event: CellClickedEventArgs): HeatCalcContextMenuTrigger {
  return {
    clientX: event.bounds.x + event.bounds.width / 2,
    clientY: event.bounds.y + event.bounds.height / 2,
    preventDefault: event.preventDefault,
    stopPropagation: () => undefined,
  };
}

export function contentAlign(
  column: HeatCalcGlideGridColumn,
  state: HeatCalcGlideGridCellState,
): HeatCalcGlideCellAlign {
  if (state.align) return state.align;
  if (column.align) return column.align;
  return state.editor === 'number' ? 'right' : 'left';
}

export function clampGlideColumnWidth(column: HeatCalcGlideGridColumn, widthPx: number) {
  return Math.max(column.minWidthPx ?? GLIDE_MIN_COLUMN_WIDTH, widthPx);
}

export function glideRowHeight(fontSizeKey: string) {
  const fontSize = resolveTableFontSizeByKey(fontSizeKey);
  return Math.max(26, Math.round(fontSize.fontSizePx * fontSize.lineHeight + fontSize.cellPaddingY * 2 + 11));
}

export function buildHeatEditorColumns(gridColumns: HeatCalcGlideGridColumn[]): GridColumn[] {
  return gridColumns.map((column) => ({
    id: column.key,
    title: column.title || column.key,
    width: column.width,
  }));
}

export function resolveHeatCellBg(
  state: HeatCalcGlideGridCellState,
  rowClassName: string,
): string | undefined {
  if (state.error || isErrorRowClassName(rowClassName)) return GLIDE_THEME.errorRowBg;
  if (state.dirty || isDirtyRowClassName(rowClassName)) return GLIDE_THEME.dirtyRowBg;
  return undefined;
}

export function buildHeatGridCell(
  column: HeatCalcGlideGridColumn,
  state: HeatCalcGlideGridCellState,
  rowClassName: string,
): GridCell {
  const text = state.displayValue;
  const bgCell = resolveHeatCellBg(state, rowClassName);
  return {
    kind: GridCellKind.Text,
    allowOverlay: false,
    readonly: !state.editable,
    data: text,
    displayData: text,
    copyData: text,
    contentAlign: contentAlign(column, state),
    themeOverride: bgCell ? { bgCell } : undefined,
  };
}

export type FullRowSelectionBounds = {
  top: number;
  bottom: number;
};

/** Bounds only when the Excel range spans every column (full-row marker selection). */
export function resolveFullRowSelectionBounds(args: {
  rows: Array<Pick<ProjectObject, 'id'>>;
  columnKeys: string[];
  selectionRange: ExcelSelectionRange | null;
}): FullRowSelectionBounds | null {
  const { rows, columnKeys, selectionRange } = args;
  if (!selectionRange || rows.length === 0 || columnKeys.length === 0) return null;
  const rowIdToIndex = new Map(rows.map((row, index) => [row.id, index]));
  const columnKeyToIndex = new Map(columnKeys.map((columnKey, index) => [columnKey, index]));
  const anchorRowIndex = rowIdToIndex.get(selectionRange.anchor.rowId);
  const focusRowIndex = rowIdToIndex.get(selectionRange.focus.rowId);
  const anchorColumnIndex = columnKeyToIndex.get(selectionRange.anchor.columnKey);
  const focusColumnIndex = columnKeyToIndex.get(selectionRange.focus.columnKey);
  if (
    anchorRowIndex == null
    || focusRowIndex == null
    || anchorColumnIndex == null
    || focusColumnIndex == null
  ) {
    return null;
  }
  const left = Math.min(anchorColumnIndex, focusColumnIndex);
  const right = Math.max(anchorColumnIndex, focusColumnIndex);
  if (left !== 0 || right !== columnKeys.length - 1) return null;
  return {
    top: Math.min(anchorRowIndex, focusRowIndex),
    bottom: Math.max(anchorRowIndex, focusRowIndex),
  };
}

export function resolveHeatRowTheme(args: {
  rowClassName: string;
  rowIndex: number;
  fullRowSelectionBounds: FullRowSelectionBounds | null;
}): {
  bgCell?: string;
  accentColor?: string;
  accentLight?: string;
} | undefined {
  const { rowClassName, rowIndex, fullRowSelectionBounds } = args;
  if (isErrorRowClassName(rowClassName)) {
    return { bgCell: GLIDE_THEME.errorRowBg };
  }
  if (isDirtyRowClassName(rowClassName)) {
    return { bgCell: GLIDE_THEME.dirtyRowBg };
  }
  if (
    fullRowSelectionBounds
    && rowIndex >= fullRowSelectionBounds.top
    && rowIndex <= fullRowSelectionBounds.bottom
  ) {
    return {
      accentColor: GLIDE_SELECTED_ROW_BORDER,
      accentLight: GLIDE_SELECTED_ROW_BG,
      bgCell: GLIDE_SELECTED_ROW_BG,
    };
  }
  return undefined;
}

export function buildHeatGlideTheme(fontSizePx: number) {
  return {
    accentColor: GLIDE_THEME.accent,
    accentLight: GLIDE_THEME.accentLight,
    bgCell: GLIDE_THEME.bgCell,
    bgHeader: GLIDE_THEME.bgHeader,
    borderColor: GLIDE_THEME.border,
    fontFamily: 'inherit',
    baseFontStyle: `${fontSizePx}px inherit`,
    headerFontStyle: `600 ${fontSizePx}px inherit`,
  };
}

export function isNearScrollEnd(range: { y: number; height: number }, rowCount: number) {
  return range.y + range.height >= rowCount - 4;
}
