/**
 * Общие примитивы для гридов на glide-data-grid.
 *
 * Раньше эти функции/константы были скопированы между HeatCalcNormalGlideGrid,
 * HeatCalcGlideGrid и ElectricalCandidateGlideGrid. Здесь собрано только то,
 * что провабельно идентично между потребителями (сверено по md5/значениям).
 * Доменно-специфичные варианты (например candidate-версия isErrorRowClassName
 * с классом `row--error`) остаются локальными в своих компонентах.
 */
import { type GridCell, GridCellKind } from '@glideapps/glide-data-grid';

import type { HeatCalcGlideGridColumn } from '@/utils/heatCalcGlideGrid';
import type { HeatCalcTableViewState } from '@/utils/heatCalcTableFindability';

export const GLIDE_HEADER_CONTROL_PADDING = 6;
export const GLIDE_HEADER_CONTROL_MUTED = '#7a8b99';
export const GLIDE_HEADER_CONTROL_FAINT = '#b8c2cc';
export const GLIDE_HEADER_CONTROL_ACTIVE = '#1a5276';

/** Shared canvas palette for all glide-data-grid consumers (owner of hex literals). */
export const GLIDE_THEME = {
  accent: '#1a5276',
  accentLight: '#dbeeff',
  bgCell: '#ffffff',
  bgHeader: '#f3f6f4',
  border: '#d9d9d9',
  text: '#2b2f33',
  textMuted: '#8c8c8c',
  surfaceMuted: '#fafafa',
  surfaceDisabled: '#f5f5f5',
  actionBorder: '#b8c8d6',
  activeRowBg: '#d6e9f5',
  errorRowBg: '#fff1f0',
  dirtyRowBg: '#fffbe6',
  comparedRowBg: '#f7fbff',
  diffCellBg: '#fff7d6',
  statusOkFill: '#f6ffed',
  statusOkStroke: '#95de64',
  statusOkGlyph: '#389e0d',
  statusErrorStroke: '#ffccc7',
  statusErrorGlyph: '#cf1322',
  statusWarnStroke: '#ffe58f',
  statusWarnGlyph: '#d48806',
} as const;

/** Класс строки «ошибка/не рассчитано» (используется normal- и excel-гридами теплопотерь). */
export function isErrorRowClassName(className: string) {
  return className.includes('row-invalid')
    || className.includes('row-excel-error')
    || className.includes('row-error');
}

/** Класс «грязной» (несохранённой) строки. */
export function isDirtyRowClassName(className: string) {
  return className.includes('row-excel-dirty') || className.includes('row-dirty');
}

/** Пустая read-only ячейка-заглушка. */
export function blankCell(): GridCell {
  return {
    kind: GridCellKind.Text,
    allowOverlay: false,
    readonly: true,
    data: '',
    displayData: '',
    copyData: '',
  };
}

/** Ширина зоны контролов в заголовке (сортировка/фильтр). */
export function headerControlWidth(column: HeatCalcGlideGridColumn) {
  if (!column.sortable && !column.filterable) return 0;
  return GLIDE_HEADER_CONTROL_PADDING
    + (column.sortable ? 18 : 0)
    + (column.filterable ? 22 : 0);
}

/** Следующее направление сортировки при клике по заголовку: asc → desc → none. */
export function nextSortDirection(
  tableViewState: HeatCalcTableViewState,
  columnKey: string,
): 'asc' | 'desc' | undefined {
  if (tableViewState.sort?.columnKey !== columnKey) return 'asc';
  if (tableViewState.sort.direction === 'asc') return 'desc';
  return undefined;
}

export function drawTriangle(
  ctx: CanvasRenderingContext2D,
  centerX: number,
  centerY: number,
  direction: 'up' | 'down',
  color: string,
) {
  ctx.beginPath();
  if (direction === 'up') {
    ctx.moveTo(centerX, centerY - 4);
    ctx.lineTo(centerX - 4, centerY + 2);
    ctx.lineTo(centerX + 4, centerY + 2);
  } else {
    ctx.moveTo(centerX, centerY + 4);
    ctx.lineTo(centerX - 4, centerY - 2);
    ctx.lineTo(centerX + 4, centerY - 2);
  }
  ctx.closePath();
  ctx.fillStyle = color;
  ctx.fill();
}

export function drawSortIndicator(
  ctx: CanvasRenderingContext2D,
  centerX: number,
  centerY: number,
  direction?: 'asc' | 'desc',
) {
  drawTriangle(
    ctx,
    centerX,
    centerY - 4,
    'up',
    direction === 'asc' ? GLIDE_HEADER_CONTROL_ACTIVE : GLIDE_HEADER_CONTROL_FAINT,
  );
  drawTriangle(
    ctx,
    centerX,
    centerY + 4,
    'down',
    direction === 'desc' ? GLIDE_HEADER_CONTROL_ACTIVE : GLIDE_HEADER_CONTROL_FAINT,
  );
}

export function drawFilterIndicator(
  ctx: CanvasRenderingContext2D,
  centerX: number,
  centerY: number,
  active: boolean,
) {
  const color = active ? GLIDE_HEADER_CONTROL_ACTIVE : GLIDE_HEADER_CONTROL_MUTED;
  ctx.beginPath();
  ctx.moveTo(centerX - 6, centerY - 6);
  ctx.lineTo(centerX + 6, centerY - 6);
  ctx.lineTo(centerX + 2, centerY - 1);
  ctx.lineTo(centerX + 2, centerY + 5);
  ctx.lineTo(centerX - 2, centerY + 5);
  ctx.lineTo(centerX - 2, centerY - 1);
  ctx.closePath();
  ctx.lineWidth = 1.4;
  ctx.strokeStyle = color;
  ctx.stroke();
}
