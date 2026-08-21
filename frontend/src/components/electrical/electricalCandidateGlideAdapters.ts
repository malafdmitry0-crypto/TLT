/**
 * Pure Glide data adapters for ElectricalCandidateGlideGrid (no React).
 * Grid chrome (DataEditor wiring, overlays) stays on the component owner.
 */
import {
  GridCellKind,
  type GridCell,
  type GridColumn,
} from '@glideapps/glide-data-grid';

import type {
  HeatCalcGlideGridCellState,
  HeatCalcGlideGridColumn,
} from '@/utils/heatCalcGlideGrid';
import {
  isColumnFilterActive,
  type HeatCalcColumnFilter,
  type HeatCalcTableViewState,
} from '@/utils/heatCalcTableFindability';
import { GLIDE_THEME } from '@/utils/glideGridPrimitives';
import {
  CANDIDATE_COMPARED_ROW_BG,
  CANDIDATE_DIFF_CELL_BG,
  CANDIDATE_ERROR_ROW_BG,
  CANDIDATE_HEADER_FILTER_HIT_WIDTH,
  isComparedRowClassName,
  isErrorRowClassName,
} from '@/utils/electricalCandidateGlidePureModel';

export function buildCandidateEditorColumns(
  gridColumns: HeatCalcGlideGridColumn[],
  filters: HeatCalcTableViewState['filters'],
): GridColumn[] {
  return gridColumns.map((column) => ({
    id: column.key,
    title: column.title || column.key,
    width: column.width,
    hasMenu: false,
    style: isColumnFilterActive(filters[column.key]) ? 'highlight' : 'normal',
  }));
}

export function resolveCandidateCellBg(
  state: HeatCalcGlideGridCellState,
  rowClassName: string,
): string | undefined {
  if (state.error || isErrorRowClassName(rowClassName)) return CANDIDATE_ERROR_ROW_BG;
  if (state.dirty) return CANDIDATE_DIFF_CELL_BG;
  return undefined;
}

export function buildCandidateGridCell(
  column: HeatCalcGlideGridColumn,
  state: HeatCalcGlideGridCellState,
  rowClassName: string,
): GridCell {
  const bgCell = resolveCandidateCellBg(state, rowClassName);
  return {
    kind: GridCellKind.Text,
    allowOverlay: false,
    readonly: true,
    data: state.displayValue,
    displayData: column.key === 'marked' || column.key === 'actions' ? '' : state.displayValue,
    copyData: state.displayValue,
    contentAlign: state.align ?? column.align ?? 'left',
    themeOverride: bgCell ? { bgCell } : undefined,
  };
}

export function resolveCandidateRowTheme(rowClassName: string): { bgCell: string } | undefined {
  if (isErrorRowClassName(rowClassName)) return { bgCell: CANDIDATE_ERROR_ROW_BG };
  if (isComparedRowClassName(rowClassName)) return { bgCell: CANDIDATE_COMPARED_ROW_BG };
  return undefined;
}

export function buildCandidateGlideTheme(fontSizePx: number) {
  return {
    accentColor: GLIDE_THEME.accent,
    accentLight: GLIDE_THEME.accentLight,
    bgCell: GLIDE_THEME.bgCell,
    bgHeader: GLIDE_THEME.bgHeader,
    borderColor: GLIDE_THEME.border,
    fontFamily: 'inherit',
    baseFontStyle: `${fontSizePx}px inherit`,
    headerFontStyle: `600 ${fontSizePx}px inherit`,
    textHeader: GLIDE_THEME.text,
    textDark: GLIDE_THEME.text,
  };
}

export function isCandidateHeaderFilterHit(
  column: HeatCalcGlideGridColumn,
  localEventX: number,
  boundsWidth: number,
): boolean {
  return Boolean(
    column.filterable
    && localEventX >= Math.max(0, boundsWidth - CANDIDATE_HEADER_FILTER_HIT_WIDTH),
  );
}

export function isCandidateHeaderControlsVisible(args: {
  columnIndex: number;
  hoveredHeaderColumnIndex: number | null;
  filterPopupColumnIndex?: number;
  sortDirection?: 'asc' | 'desc';
  filter?: HeatCalcColumnFilter;
}): boolean {
  return (
    args.hoveredHeaderColumnIndex === args.columnIndex
    || args.filterPopupColumnIndex === args.columnIndex
    || !!args.sortDirection
    || isColumnFilterActive(args.filter)
  );
}
