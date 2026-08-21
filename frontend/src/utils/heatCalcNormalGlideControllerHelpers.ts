/**
 * Pure helpers for useHeatCalcNormalGlideController (no React).
 */
import type { TableProps } from 'antd';
import type { Item } from '@glideapps/glide-data-grid';
import type { ProjectObject } from '@/types/project';
import {
  NORMAL_HEADER_FILTER_HIT_WIDTH,
  paginationConfig,
  type HeatCalcGlideGridColumn,
} from '@/utils/heatCalcGlideGrid';

export function isNormalHeaderFilterHit(
  column: HeatCalcGlideGridColumn,
  localEventX: number,
  boundsWidth: number,
): boolean {
  return Boolean(
    column.filterable
    && localEventX >= Math.max(0, boundsWidth - NORMAL_HEADER_FILTER_HIT_WIDTH),
  );
}

export function nextKeysFromRowClick(args: {
  rows: Array<Pick<ProjectObject, 'id'>>;
  selectedRowKeys: string[];
  rowIndex: number;
  ctrlKey: boolean;
  metaKey: boolean;
  shiftKey: boolean;
  anchorRow: number | null;
  activeCellRowIndex: number | null;
}): { nextKeys: string[]; nextAnchor: number } {
  const {
    rows,
    selectedRowKeys,
    rowIndex,
    ctrlKey,
    metaKey,
    shiftKey,
    anchorRow,
    activeCellRowIndex,
  } = args;
  const record = rows[rowIndex];
  if (!record) {
    return { nextKeys: selectedRowKeys, nextAnchor: anchorRow ?? rowIndex };
  }
  const selected = new Set(selectedRowKeys);
  const multiKey = ctrlKey || metaKey;
  if (shiftKey) {
    const rangeAnchor = anchorRow ?? activeCellRowIndex ?? rowIndex;
    for (let index = Math.min(rangeAnchor, rowIndex); index <= Math.max(rangeAnchor, rowIndex); index += 1) {
      const row = rows[index];
      if (row) selected.add(row.id);
    }
    return {
      nextKeys: rows.filter((row) => selected.has(row.id)).map((row) => row.id),
      nextAnchor: rangeAnchor,
    };
  }
  if (multiKey) {
    if (selected.has(record.id)) selected.delete(record.id);
    else selected.add(record.id);
    return {
      nextKeys: rows.filter((row) => selected.has(row.id)).map((row) => row.id),
      nextAnchor: rowIndex,
    };
  }
  return { nextKeys: [record.id], nextAnchor: rowIndex };
}

export function activeCellForRowId(args: {
  activeRowId: string | null | undefined;
  rows: Array<Pick<ProjectObject, 'id'>>;
  current: Item | null;
  visibleColumnCount: number;
}): Item | null {
  const { activeRowId, rows, current, visibleColumnCount } = args;
  if (!activeRowId) return null;
  const currentRow = current ? rows[current[1]] : undefined;
  if (currentRow?.id === activeRowId) return current;
  const rowIndex = rows.findIndex((row) => row.id === activeRowId);
  if (rowIndex < 0 || visibleColumnCount === 0) return current;
  return [
    Math.min(Math.max(current?.[0] ?? 0, 0), visibleColumnCount - 1),
    rowIndex,
  ] as Item;
}

export function shouldShowOffsetPagination(
  infiniteLoading: { hasNextPage?: boolean } | null | undefined,
  pagination: TableProps<ProjectObject>['pagination'],
): { showOffsetPagination: boolean; pageConfig: ReturnType<typeof paginationConfig> } {
  const pageConfig = paginationConfig(pagination);
  const showOffsetPagination = !infiniteLoading && !!pageConfig
    && !(pageConfig.hideOnSinglePage && Number(pageConfig.total ?? 0) <= Number(pageConfig.pageSize ?? 0));
  return { showOffsetPagination, pageConfig };
}
