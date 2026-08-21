/**
 * @module electrical/candidate-glide-pure-model
 * @owner electrical
 * Pure drawing / hit-testing math for ElectricalCandidateGlideGrid.
 */
import type { CellClickedEventArgs } from '@glideapps/glide-data-grid';

import type {
  HeatCalcGlideGridCellAction,
  HeatCalcGlideGridColumn,
} from '@/utils/heatCalcGlideGrid';
import { resolveTableFontSizeByKey } from '@/utils/heatCalcTableViewSettings';
import {
  GLIDE_HEADER_CONTROL_FAINT,
  GLIDE_THEME,
} from '@/utils/glideGridPrimitives';

export const CANDIDATE_GLIDE_MIN_COLUMN_WIDTH = 48;
export const CANDIDATE_GLIDE_MAX_COLUMN_WIDTH = 620;
export const CANDIDATE_HEADER_FILTER_HIT_WIDTH = 28;
export const CANDIDATE_HEADER_CONTROL_BG = GLIDE_THEME.bgHeader;
export const CANDIDATE_ERROR_ROW_BG = GLIDE_THEME.errorRowBg;
export const CANDIDATE_COMPARED_ROW_BG = GLIDE_THEME.comparedRowBg;
export const CANDIDATE_DIFF_CELL_BG = GLIDE_THEME.diffCellBg;
export const CANDIDATE_ACTION_HEIGHT = 20;
export const CANDIDATE_ACTION_GAP = 3;
export const CANDIDATE_ACTION_PADDING = 5;
export const CANDIDATE_ACTION_MIN_WIDTH = 28;
export const CANDIDATE_ACTION_MAX_WIDTH = 58;
export const CANDIDATE_ACTION_TEXT_WIDTH = 6.2;
export const CANDIDATE_CHECKBOX_SIZE = 13;

export function isErrorRowClassName(className: string) {
  return className.includes('row--error') || className.includes('row-error');
}

export function isComparedRowClassName(className: string) {
  return className.includes('row--compared') || className.includes('row-compared');
}

export function candidateRowHeight(fontSizeKey: string) {
  const fontSize = resolveTableFontSizeByKey(fontSizeKey);
  return Math.max(24, Math.round(fontSize.fontSizePx * fontSize.lineHeight + fontSize.cellPaddingY * 2 + 7));
}

export function candidateActionWidth(action: HeatCalcGlideGridCellAction) {
  return Math.max(
    CANDIDATE_ACTION_MIN_WIDTH,
    Math.min(CANDIDATE_ACTION_MAX_WIDTH, Math.ceil(action.label.length * CANDIDATE_ACTION_TEXT_WIDTH + 16)),
  );
}

export function candidateActionRects(
  actions: HeatCalcGlideGridCellAction[] | undefined,
  width: number,
  height: number,
) {
  if (!actions?.length) return [];
  const widths = actions.map(candidateActionWidth);
  const totalWidth = widths.reduce((sum, current) => sum + current, 0)
    + CANDIDATE_ACTION_GAP * Math.max(0, widths.length - 1);
  let left = Math.max(CANDIDATE_ACTION_PADDING, width - CANDIDATE_ACTION_PADDING - totalWidth);
  const top = Math.max(2, Math.floor((height - CANDIDATE_ACTION_HEIGHT) / 2));
  return actions.map((action, index) => {
    const widthPx = widths[index];
    const rect = {
      action,
      x: left,
      y: top,
      width: widthPx,
      height: CANDIDATE_ACTION_HEIGHT,
    };
    left += widthPx + CANDIDATE_ACTION_GAP;
    return rect;
  });
}

export function findCandidateActionAt(
  actions: HeatCalcGlideGridCellAction[] | undefined,
  event: CellClickedEventArgs,
) {
  if (!actions?.length) return undefined;
  const bounds = (event as { bounds?: { x?: number; y?: number; width: number; height: number } }).bounds;
  if (!bounds) return undefined;
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
  return candidateActionRects(actions, bounds.width, bounds.height)
    .find((rect) =>
      localX >= rect.x
      && localX <= rect.x + rect.width
      && localY >= rect.y
      && localY <= rect.y + rect.height,
    )?.action;
}

export function drawCandidateActions(
  ctx: CanvasRenderingContext2D,
  rect: { x: number; y: number; width: number; height: number },
  actions: HeatCalcGlideGridCellAction[] | undefined,
) {
  const rects = candidateActionRects(actions, rect.width, rect.height);
  if (rects.length === 0) return;
  ctx.save();
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.font = '11px inherit';
  for (const actionRect of rects) {
    const left = Math.floor(rect.x + actionRect.x) + 0.5;
    const top = Math.floor(rect.y + actionRect.y) + 0.5;
    const disabled = actionRect.action.disabled;
    ctx.fillStyle = disabled ? GLIDE_THEME.surfaceDisabled : GLIDE_THEME.bgCell;
    ctx.strokeStyle = disabled ? GLIDE_THEME.border : GLIDE_THEME.actionBorder;
    ctx.lineWidth = 1;
    ctx.fillRect(left, top, actionRect.width, actionRect.height);
    ctx.strokeRect(left, top, actionRect.width, actionRect.height);
    ctx.fillStyle = disabled ? GLIDE_THEME.textMuted : GLIDE_THEME.accent;
    ctx.fillText(actionRect.action.label, left + actionRect.width / 2, top + actionRect.height / 2 + 0.5);
  }
  ctx.restore();
}

export function drawCandidateCheckbox(
  ctx: CanvasRenderingContext2D,
  rect: { x: number; y: number; width: number; height: number },
  checked: boolean,
) {
  const left = Math.floor(rect.x + rect.width / 2 - CANDIDATE_CHECKBOX_SIZE / 2) + 0.5;
  const top = Math.floor(rect.y + rect.height / 2 - CANDIDATE_CHECKBOX_SIZE / 2) + 0.5;
  ctx.save();
  ctx.fillStyle = checked ? GLIDE_THEME.accent : GLIDE_THEME.bgCell;
  ctx.strokeStyle = checked ? GLIDE_THEME.accent : GLIDE_HEADER_CONTROL_FAINT;
  ctx.lineWidth = 1.2;
  ctx.fillRect(left, top, CANDIDATE_CHECKBOX_SIZE, CANDIDATE_CHECKBOX_SIZE);
  ctx.strokeRect(left, top, CANDIDATE_CHECKBOX_SIZE, CANDIDATE_CHECKBOX_SIZE);
  if (checked) {
    ctx.beginPath();
    ctx.lineWidth = 1.7;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    ctx.strokeStyle = GLIDE_THEME.bgCell;
    ctx.moveTo(left + 3, top + 7);
    ctx.lineTo(left + 5.5, top + 9.5);
    ctx.lineTo(left + 10.5, top + 3.5);
    ctx.stroke();
  }
  ctx.restore();
}

export function clampCandidateColumnWidth(column: HeatCalcGlideGridColumn, widthPx: number) {
  return Math.max(column.minWidthPx ?? CANDIDATE_GLIDE_MIN_COLUMN_WIDTH, widthPx);
}
