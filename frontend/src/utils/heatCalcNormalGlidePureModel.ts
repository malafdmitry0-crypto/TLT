/**
 * @module heatcalc/normal-glide-pure-model
 * @owner heat
 * Pure drawing / hit-testing / selection math for HeatCalcNormalGlideGrid (GRID1).
 */
import {
  CompactSelection,
  GridCellKind,
  type CellClickedEventArgs,
  type EditableGridCell,
  type GridSelection,
  type Item,
} from '@glideapps/glide-data-grid';
import type { TableProps } from 'antd';
import type { ProjectObject } from '@/types/project';
import type {
  HeatCalcGlideGridCellAction,
  HeatCalcGlideGridCellState,
  HeatCalcGlideGridColumn,
} from '@/utils/heatCalcGlideGrid';
import { resolveTableFontSizeByKey } from '@/utils/heatCalcTableViewSettings';
import {
  isDirtyRowClassName,
  isErrorRowClassName,
} from '@/utils/glideGridPrimitives';

export const NORMAL_ROW_MARKER_WIDTH = 52;
export const NORMAL_GLIDE_HIDDEN_COLUMN_KEYS = new Set(['index']);
export const NORMAL_INFINITE_LOAD_THRESHOLD_ROWS = 12;
export const NORMAL_HEADER_FILTER_HIT_WIDTH = 28;
export const NORMAL_HEADER_CONTROL_BG = '#f3f6f4';
export const NORMAL_STATUS_COLUMN_KEYS = new Set(['heat_loss_status', 'electrical_status']);
export const NORMAL_STATUS_BADGE_MIN_RADIUS = 6;
export const NORMAL_STATUS_BADGE_MAX_RADIUS = 8;
export const NORMAL_GLIDE_MIN_COLUMN_WIDTH = 48;
export const NORMAL_GLIDE_MAX_COLUMN_WIDTH = 600;
export const NORMAL_ACTIVE_ROW_BG = '#d6e9f5';
export const NORMAL_ACTIVE_ROW_BORDER = '#1a5276';
export const NORMAL_ERROR_ROW_BG = '#fff1f0';
export const NORMAL_DIRTY_ROW_BG = '#fffbe6';
export const NORMAL_CELL_ACTION_HEIGHT = 21;
export const NORMAL_CELL_ACTION_GAP = 4;
export const NORMAL_CELL_ACTION_PADDING = 6;
export const NORMAL_CELL_ACTION_MIN_WIDTH = 46;
export const NORMAL_CELL_ACTION_MAX_WIDTH = 68;
export const NORMAL_CELL_ACTION_TEXT_WIDTH = 6.8;
export const NORMAL_CELL_ACTION_BG = '#ffffff';
export const NORMAL_CELL_ACTION_BORDER = '#b8c8d6';
export const NORMAL_CELL_ACTION_TEXT = '#1a5276';
export const NORMAL_CELL_ACTION_DISABLED_BG = '#f5f5f5';
export const NORMAL_CELL_ACTION_DISABLED_BORDER = '#d9d9d9';
export const NORMAL_CELL_ACTION_DISABLED_TEXT = '#8c8c8c';

export type NormalStatusVisual =
  | 'calculated'
  | 'error'
  | 'not_calculated'
  | 'stale'
  | 'unsupported';

export function isActiveRowClassName(className: string) {
  return className.includes('row-selected');
}

export function clampNormalGlideColumnWidth(column: HeatCalcGlideGridColumn, widthPx: number) {
  return Math.max(column.minWidthPx ?? NORMAL_GLIDE_MIN_COLUMN_WIDTH, widthPx);
}

export function getGridCellEditedValue(newValue: EditableGridCell): unknown {
  if (newValue.kind === GridCellKind.Number) return newValue.data;
  if ('data' in newValue) return newValue.data;
  return undefined;
}

export function glideRowHeight(fontSizeKey: string) {
  const fontSize = resolveTableFontSizeByKey(fontSizeKey);
  return Math.max(26, Math.round(fontSize.fontSizePx * fontSize.lineHeight + fontSize.cellPaddingY * 2 + 11));
}

export function selectedOptionValue(
  value: string,
  options: HeatCalcGlideGridCellState['options'],
) {
  return options?.find((option) => String(option.value) === value)?.value ?? value;
}

export function paginationConfig(pagination: TableProps<ProjectObject>['pagination']) {
  return typeof pagination === 'object' ? pagination : null;
}

export function buildRowSelection(
  rows: ProjectObject[],
  selectedRowKeys: string[],
  activeCell: Item | null,
): GridSelection {
  const selected = new Set(selectedRowKeys);
  let rowSelection = CompactSelection.empty();
  rows.forEach((row, index) => {
    if (selected.has(row.id)) rowSelection = rowSelection.add(index);
  });
  const current = activeCell && rows[activeCell[1]]
    ? {
      cell: activeCell,
      range: {
        x: activeCell[0],
        y: activeCell[1],
        width: 1,
        height: 1,
      },
      rangeStack: [],
    }
    : undefined;
  return {
    current,
    columns: CompactSelection.empty(),
    rows: rowSelection,
  };
}

export function normalRowMarkerStartIndex(pagination: TableProps<ProjectObject>['pagination']) {
  const pageConfig = paginationConfig(pagination);
  const current = Number(pageConfig?.current ?? 1);
  const pageSize = Number(pageConfig?.pageSize ?? 0);
  if (!Number.isFinite(current) || current < 1 || !Number.isFinite(pageSize) || pageSize < 1) return 1;
  return (current - 1) * pageSize + 1;
}

export function normalStatusVisualFromValue(value: unknown): NormalStatusVisual | null {
  if (value === 'Рассчитан') return 'calculated';
  if (value === 'Ошибка') return 'error';
  if (value === 'Не применимо') return 'unsupported';
  if (value === 'Требуется пересчёт') return 'stale';
  if (value === 'Не рассчитан' || value === '—' || value === '') return 'not_calculated';
  return null;
}

export function normalStatusPalette(status: NormalStatusVisual) {
  if (status === 'calculated') {
    return { fill: '#f6ffed', stroke: '#95de64', glyph: '#389e0d' };
  }
  if (status === 'error') {
    return { fill: '#fff1f0', stroke: '#ffccc7', glyph: '#cf1322' };
  }
  if (status === 'stale') {
    return { fill: '#fffbe6', stroke: '#ffe58f', glyph: '#d48806' };
  }
  if (status === 'unsupported') {
    return { fill: '#fffbe6', stroke: '#ffe58f', glyph: '#d48806' };
  }
  return { fill: '#fafafa', stroke: '#d9d9d9', glyph: '#8c8c8c' };
}

export function drawNormalStatusBadge(
  ctx: CanvasRenderingContext2D,
  rect: { x: number; y: number; width: number; height: number },
  status: NormalStatusVisual,
) {
  const palette = normalStatusPalette(status);
  const centerX = rect.x + rect.width / 2;
  const centerY = rect.y + rect.height / 2;
  const radius = Math.max(
    NORMAL_STATUS_BADGE_MIN_RADIUS,
    Math.min(NORMAL_STATUS_BADGE_MAX_RADIUS, rect.height / 2 - 7),
  );
  const glyphWideOffset = radius * 0.55;
  const glyphMediumOffset = radius * 0.45;
  const checkStartOffset = radius * 0.42;
  const checkMiddleXOffset = radius * 0.12;
  const checkMiddleYOffset = radius * 0.34;

  ctx.save();
  ctx.beginPath();
  ctx.arc(centerX, centerY, radius, 0, Math.PI * 2);
  ctx.fillStyle = palette.fill;
  ctx.fill();
  ctx.lineWidth = Math.max(1.2, radius * 0.16);
  ctx.strokeStyle = palette.stroke;
  ctx.stroke();

  ctx.beginPath();
  ctx.lineWidth = Math.max(1.5, radius * 0.22);
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  ctx.strokeStyle = palette.glyph;
  if (status === 'calculated') {
    ctx.moveTo(centerX - checkStartOffset, centerY);
    ctx.lineTo(centerX - checkMiddleXOffset, centerY + checkMiddleYOffset);
    ctx.lineTo(centerX + glyphWideOffset, centerY - glyphMediumOffset);
  } else if (status === 'error') {
    ctx.moveTo(centerX - glyphMediumOffset, centerY - glyphMediumOffset);
    ctx.lineTo(centerX + glyphMediumOffset, centerY + glyphMediumOffset);
    ctx.moveTo(centerX + glyphMediumOffset, centerY - glyphMediumOffset);
    ctx.lineTo(centerX - glyphMediumOffset, centerY + glyphMediumOffset);
  } else if (status === 'stale') {
    ctx.arc(centerX, centerY, radius * 0.45, -Math.PI * 0.15, Math.PI * 1.35);
    ctx.moveTo(centerX + radius * 0.14, centerY - radius * 0.62);
    ctx.lineTo(centerX + radius * 0.58, centerY - radius * 0.55);
    ctx.lineTo(centerX + radius * 0.42, centerY - radius * 0.15);
  } else {
    ctx.moveTo(centerX - glyphWideOffset, centerY);
    ctx.lineTo(centerX + glyphWideOffset, centerY);
  }
  ctx.stroke();
  ctx.restore();
}

export function normalRowThemeOverride(className: string, active: boolean) {
  const baseTheme = {
    accentColor: NORMAL_ACTIVE_ROW_BORDER,
    accentLight: '#dbeeff',
  };
  if (isErrorRowClassName(className)) {
    return active ? { ...baseTheme, bgCell: NORMAL_ERROR_ROW_BG } : { bgCell: NORMAL_ERROR_ROW_BG };
  }
  if (isDirtyRowClassName(className)) {
    return active ? { ...baseTheme, bgCell: NORMAL_DIRTY_ROW_BG } : { bgCell: NORMAL_DIRTY_ROW_BG };
  }
  if (active || isActiveRowClassName(className)) {
    return { ...baseTheme, bgCell: NORMAL_ACTIVE_ROW_BG };
  }
  return undefined;
}

export function drawActiveNormalRowBorder(
  ctx: CanvasRenderingContext2D,
  rect: { x: number; y: number; width: number; height: number },
  columnIndex: number,
  columnCount: number,
) {
  const top = Math.floor(rect.y) + 0.5;
  const bottom = Math.floor(rect.y + rect.height) - 0.5;
  const left = Math.floor(rect.x) + 0.5;
  const right = Math.floor(rect.x + rect.width) - 0.5;

  ctx.save();
  ctx.strokeStyle = NORMAL_ACTIVE_ROW_BORDER;
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(left, top);
  ctx.lineTo(right, top);
  ctx.moveTo(left, bottom);
  ctx.lineTo(right, bottom);
  if (columnIndex === 0) {
    ctx.moveTo(left, top);
    ctx.lineTo(left, bottom);
  }
  if (columnIndex === columnCount - 1) {
    ctx.moveTo(right, top);
    ctx.lineTo(right, bottom);
  }
  ctx.stroke();
  ctx.restore();
}

export function normalCellActionWidth(action: HeatCalcGlideGridCellAction) {
  return Math.max(
    NORMAL_CELL_ACTION_MIN_WIDTH,
    Math.min(NORMAL_CELL_ACTION_MAX_WIDTH, Math.ceil(action.label.length * NORMAL_CELL_ACTION_TEXT_WIDTH + 18)),
  );
}

export function normalCellActionRects(
  actions: HeatCalcGlideGridCellAction[] | undefined,
  width: number,
  height: number,
) {
  if (!actions?.length) return [];
  const widths = actions.map(normalCellActionWidth);
  const totalWidth = widths.reduce((sum, actionWidth) => sum + actionWidth, 0)
    + NORMAL_CELL_ACTION_GAP * Math.max(0, widths.length - 1);
  let left = Math.max(
    NORMAL_CELL_ACTION_PADDING,
    width - NORMAL_CELL_ACTION_PADDING - totalWidth,
  );
  const top = Math.max(2, Math.floor((height - NORMAL_CELL_ACTION_HEIGHT) / 2));
  return actions.map((action, index) => {
    const actionWidth = widths[index];
    const rect = {
      action,
      x: left,
      y: top,
      width: actionWidth,
      height: NORMAL_CELL_ACTION_HEIGHT,
    };
    left += actionWidth + NORMAL_CELL_ACTION_GAP;
    return rect;
  });
}

export function findNormalCellActionAt(
  actions: HeatCalcGlideGridCellAction[] | undefined,
  event: CellClickedEventArgs,
) {
  if (!actions?.length) return undefined;
  const bounds = (event as { bounds?: { x?: number; y?: number; width: number; height: number } }).bounds;
  if (!bounds || bounds.width <= 0 || bounds.height <= 0) return undefined;
  const rawLocalX = typeof (event as { localEventX?: unknown }).localEventX === 'number'
    ? (event as { localEventX: number }).localEventX
    : null;
  const rawLocalY = typeof (event as { localEventY?: unknown }).localEventY === 'number'
    ? (event as { localEventY: number }).localEventY
    : null;
  const localX = rawLocalX == null
    ? bounds.width / 2
    : rawLocalX >= 0 && rawLocalX <= bounds.width
      ? rawLocalX
      : bounds.x != null && rawLocalX >= bounds.x && rawLocalX <= bounds.x + bounds.width
        ? rawLocalX - bounds.x
        : rawLocalX - (bounds.x ?? 0);
  const localY = rawLocalY == null
    ? bounds.height / 2
    : rawLocalY >= 0 && rawLocalY <= bounds.height
      ? rawLocalY
      : bounds.y != null && rawLocalY >= bounds.y && rawLocalY <= bounds.y + bounds.height
        ? rawLocalY - bounds.y
        : rawLocalY - (bounds.y ?? 0);

  return normalCellActionRects(actions, bounds.width, bounds.height)
    .find((rect) =>
      localX >= rect.x
      && localX <= rect.x + rect.width
      && localY >= rect.y
      && localY <= rect.y + rect.height,
    )?.action;
}

export function drawNormalCellActions(
  ctx: CanvasRenderingContext2D,
  rect: { x: number; y: number; width: number; height: number },
  actions: HeatCalcGlideGridCellAction[] | undefined,
) {
  const actionRects = normalCellActionRects(actions, rect.width, rect.height);
  if (actionRects.length === 0) return;

  ctx.save();
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.font = '11px inherit';
  for (const actionRect of actionRects) {
    const left = Math.floor(rect.x + actionRect.x) + 0.5;
    const top = Math.floor(rect.y + actionRect.y) + 0.5;
    const disabled = actionRect.action.disabled;
    ctx.fillStyle = disabled ? NORMAL_CELL_ACTION_DISABLED_BG : NORMAL_CELL_ACTION_BG;
    ctx.strokeStyle = disabled ? NORMAL_CELL_ACTION_DISABLED_BORDER : NORMAL_CELL_ACTION_BORDER;
    ctx.lineWidth = 1;
    ctx.fillRect(left, top, actionRect.width, actionRect.height);
    ctx.strokeRect(left, top, actionRect.width, actionRect.height);
    ctx.fillStyle = disabled ? NORMAL_CELL_ACTION_DISABLED_TEXT : NORMAL_CELL_ACTION_TEXT;
    ctx.fillText(
      actionRect.action.label,
      left + actionRect.width / 2,
      top + actionRect.height / 2 + 0.5,
    );
  }
  ctx.restore();
}
