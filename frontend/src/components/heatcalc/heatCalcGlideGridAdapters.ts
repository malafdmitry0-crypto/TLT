/**
 * Pure Glide adapters for HeatCalc excel grid (no React).
 */
import type { CellClickedEventArgs, EditableGridCell } from '@glideapps/glide-data-grid';
import { GridCellKind } from '@glideapps/glide-data-grid';
import type { HeatCalcContextMenuTrigger } from '@/components/heatcalc/HeatCalcContextMenuTrigger';
import type {
  HeatCalcGlideCellAlign,
  HeatCalcGlideGridCellState,
  HeatCalcGlideGridColumn,
} from '@/utils/heatCalcGlideGrid';
import { resolveTableFontSizeByKey } from '@/utils/heatCalcTableViewSettings';
import { GLIDE_THEME } from '@/utils/glideGridPrimitives';

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
