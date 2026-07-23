/**
 * Layout + width memos for HeatCalcNormalGlideGrid (visible columns, stretch, selection).
 */
import {
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import type { TableProps } from 'antd';
import type { GridColumn, Item } from '@glideapps/glide-data-grid';
import type { ProjectObject } from '@/types/project';
import {
  NORMAL_GLIDE_HIDDEN_COLUMN_KEYS,
  NORMAL_ROW_MARKER_WIDTH,
  buildRowSelection,
  glideRowHeight,
  normalRowMarkerStartIndex,
  type HeatCalcGlideGridColumn,
} from '@/utils/heatCalcGlideGrid';
import { resolveTableFontSizeByKey } from '@/utils/heatCalcTableViewSettings';
import {
  isColumnFilterActive,
  type HeatCalcTableViewState,
} from '@/utils/heatCalcTableFindability';
export interface UseHeatCalcNormalGlideLayoutOptions {
  rows: ProjectObject[];
  gridColumns: HeatCalcGlideGridColumn[];
  tableScrollX: number;
  fontSizeKey: string;
  selectedRowKeys: string[];
  tableViewState: HeatCalcTableViewState;
  infiniteLoading: {
    loaded: number;
    total: number;
    hasNextPage: boolean;
    loading?: boolean;
  } | null;
  pagination: TableProps<ProjectObject>['pagination'];
  fillAvailableWidth: boolean;
  activeCell: Item | null;
}

export function useHeatCalcNormalGlideLayout({
  rows,
  gridColumns,
  tableScrollX,
  fontSizeKey,
  selectedRowKeys,
  tableViewState,
  infiniteLoading,
  pagination,
  fillAvailableWidth,
  activeCell,
}: UseHeatCalcNormalGlideLayoutOptions) {
  const [containerWidth, setContainerWidth] = useState(0);
  const rootRef = useRef<HTMLDivElement | null>(null);

  const fontSize = useMemo(() => resolveTableFontSizeByKey(fontSizeKey), [fontSizeKey]);
  const rowHeight = useMemo(() => glideRowHeight(fontSizeKey), [fontSizeKey]);
  const visibleGridColumns = useMemo(
    () => gridColumns.filter((column) => !NORMAL_GLIDE_HIDDEN_COLUMN_KEYS.has(column.key)),
    [gridColumns],
  );
  const rowIndexById = useMemo(() => {
    const result = new Map<string, number>();
    rows.forEach((row, index) => result.set(row.id, index));
    return result;
  }, [rows]);
  const hiddenColumnWidth = useMemo(
    () => gridColumns.reduce(
      (sum, column) => (NORMAL_GLIDE_HIDDEN_COLUMN_KEYS.has(column.key) ? sum + column.width : sum),
      0,
    ),
    [gridColumns],
  );
  const rowMarkerStartIndex = useMemo(
    () => (infiniteLoading ? 1 : normalRowMarkerStartIndex(pagination)),
    [infiniteLoading, pagination],
  );
  const visibleColumnsWidth = useMemo(
    () => visibleGridColumns.reduce((sum, column) => sum + column.width, 0),
    [visibleGridColumns],
  );
  const targetDataWidth = Math.max(
    640,
    tableScrollX - hiddenColumnWidth,
    fillAvailableWidth && containerWidth > 0 ? containerWidth - NORMAL_ROW_MARKER_WIDTH : 0,
  );
  const stretchedColumnWidths = useMemo(() => {
    const extraWidth = fillAvailableWidth ? Math.max(0, targetDataWidth - visibleColumnsWidth) : 0;
    if (extraWidth <= 0 || visibleGridColumns.length === 0) return new Map<string, number>();

    const stretchableColumns = visibleGridColumns.filter((column) => column.resizable !== false);
    const targets = stretchableColumns.length > 0 ? stretchableColumns : visibleGridColumns;
    const targetWidthSum = targets.reduce((sum, column) => sum + Math.max(1, column.width), 0);
    const widths = new Map<string, number>();
    let assignedExtra = 0;

    targets.forEach((column, index) => {
      const columnExtra = index === targets.length - 1
        ? extraWidth - assignedExtra
        : Math.floor((extraWidth * Math.max(1, column.width)) / targetWidthSum);
      assignedExtra += columnExtra;
      widths.set(column.key, column.width + columnExtra);
    });
    return widths;
  }, [fillAvailableWidth, targetDataWidth, visibleColumnsWidth, visibleGridColumns]);
  const editorWidth = fillAvailableWidth && containerWidth > 0
    ? Math.max(targetDataWidth + NORMAL_ROW_MARKER_WIDTH, containerWidth)
    : targetDataWidth + NORMAL_ROW_MARKER_WIDTH;
  const editorColumns = useMemo<GridColumn[]>(
    () => visibleGridColumns.map((column) => ({
      id: column.key,
      title: column.title || column.key,
      width: stretchedColumnWidths.get(column.key) ?? column.width,
      hasMenu: false,
      style: isColumnFilterActive(tableViewState.filters[column.key]) ? 'highlight' : 'normal',
    })),
    [stretchedColumnWidths, tableViewState.filters, visibleGridColumns],
  );
  const visibleColumnWidthSignature = useMemo(
    () => visibleGridColumns
      .map((column) => `${column.key}:${Math.round(stretchedColumnWidths.get(column.key) ?? column.width)}`)
      .join('|'),
    [stretchedColumnWidths, visibleGridColumns],
  );
  const gridSelection = useMemo(
    () => buildRowSelection(rows, selectedRowKeys, activeCell),
    [activeCell, rows, selectedRowKeys],
  );

  useEffect(() => {
    if (!fillAvailableWidth) {
      setContainerWidth(0);
      return undefined;
    }
    const element = rootRef.current;
    if (!element) return undefined;
    let frameId: number | null = null;
    const updateContainerWidth = () => {
      if (frameId != null) return;
      frameId = window.requestAnimationFrame(() => {
        frameId = null;
        const nextWidth = Math.floor(element.getBoundingClientRect().width);
        setContainerWidth((current) => (current === nextWidth ? current : nextWidth));
      });
    };
    updateContainerWidth();
    if (typeof ResizeObserver === 'undefined') {
      window.addEventListener('resize', updateContainerWidth);
      return () => {
        window.removeEventListener('resize', updateContainerWidth);
        if (frameId != null) window.cancelAnimationFrame(frameId);
      };
    }
    const observer = new ResizeObserver(updateContainerWidth);
    observer.observe(element);
    return () => {
      observer.disconnect();
      if (frameId != null) window.cancelAnimationFrame(frameId);
    };
  }, [fillAvailableWidth]);

  return {
    rootRef,
    fontSize,
    rowHeight,
    visibleGridColumns,
    rowIndexById,
    rowMarkerStartIndex,
    editorWidth,
    editorColumns,
    visibleColumnWidthSignature,
    gridSelection,
  };
}
