/**
 * Draw helpers for HeatCalcNormalGlideGrid (cell chrome + header controls).
 */
import {
  GridCellKind,
  type DrawCellCallback,
  type DrawHeaderCallback,
} from '@glideapps/glide-data-grid';
import type { ProjectObject } from '@/types/project';
import {
  NORMAL_HEADER_CONTROL_BG,
  NORMAL_STATUS_COLUMN_KEYS,
  drawActiveNormalRowBorder,
  drawNormalCellActions,
  drawNormalStatusBadge,
  normalStatusVisualFromValue,
  type HeatCalcGlideGridCellState,
  type HeatCalcGlideGridColumn,
} from '@/utils/heatCalcGlideGrid';
import { isColumnFilterActive, type HeatCalcTableViewState } from '@/utils/heatCalcTableFindability';
import {
  drawFilterIndicator,
  drawSortIndicator,
  headerControlWidth,
} from '@/utils/glideGridPrimitives';

export function createNormalDrawCell(options: {
  rows: ProjectObject[];
  activeRowId?: string | null;
  visibleGridColumns: HeatCalcGlideGridColumn[];
  getModelCell: (columnIndex: number, rowIndex: number) => {
    state: HeatCalcGlideGridCellState;
  } | null;
}): DrawCellCallback {
  const { rows, activeRowId, visibleGridColumns, getModelCell } = options;
  return (args, drawContent) => {
    drawContent();
    const record = rows[args.row];
    if (record && record.id === activeRowId) {
      drawActiveNormalRowBorder(args.ctx, args.rect, args.col, visibleGridColumns.length);
    }
    const column = visibleGridColumns[args.col];
    const state = column ? getModelCell(args.col, args.row)?.state : undefined;
    drawNormalCellActions(args.ctx, args.rect, state?.actions);
    if (!column || !NORMAL_STATUS_COLUMN_KEYS.has(column.key)) return;
    const status = normalStatusVisualFromValue(args.cell.kind === GridCellKind.Text ? args.cell.data : null);
    if (!status) return;
    drawNormalStatusBadge(args.ctx, args.rect, status);
  };
}

export function createNormalDrawHeader(options: {
  visibleGridColumns: HeatCalcGlideGridColumn[];
  tableViewState: HeatCalcTableViewState;
  hoveredHeaderColumnIndex: number | null;
  filterPopupColumnIndex: number | null | undefined;
}): DrawHeaderCallback {
  const {
    visibleGridColumns,
    tableViewState,
    hoveredHeaderColumnIndex,
    filterPopupColumnIndex,
  } = options;
  return (args, drawContent) => {
    drawContent();
    const column = visibleGridColumns[args.columnIndex];
    if (!column) return;
    const controlWidth = headerControlWidth(column);
    if (controlWidth <= 0) return;
    const { ctx, rect } = args;
    const right = rect.x + rect.width;
    const controlLeft = Math.max(rect.x + 1, right - controlWidth);
    const centerY = rect.y + rect.height / 2;
    const sortDirection = tableViewState.sort?.columnKey === column.key
      ? tableViewState.sort.direction
      : undefined;
    const filterActive = isColumnFilterActive(tableViewState.filters[column.key]);
    const controlsVisible = hoveredHeaderColumnIndex === args.columnIndex
      || filterPopupColumnIndex === args.columnIndex
      || !!sortDirection
      || filterActive;
    if (!controlsVisible) return;
    ctx.save();
    ctx.fillStyle = args.theme.bgHeader ?? NORMAL_HEADER_CONTROL_BG;
    ctx.fillRect(controlLeft, rect.y + 1, Math.max(0, right - controlLeft - 1), Math.max(0, rect.height - 2));
    let cursorX = right - 12;
    if (column.filterable) {
      drawFilterIndicator(ctx, cursorX, centerY, filterActive);
      cursorX -= 22;
    }
    if (column.sortable) drawSortIndicator(ctx, cursorX, centerY, sortDirection);
    ctx.restore();
  };
}
