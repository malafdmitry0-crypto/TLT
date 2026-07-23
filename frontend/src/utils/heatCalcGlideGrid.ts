import {
  CompactSelection,
  type GridSelection,
} from '@glideapps/glide-data-grid';
import type { ReactElement, ReactNode } from 'react';

import type { HeatCalcExcelCellCoordinates } from '@/hooks/useHeatCalcExcelSelection';
import type { ProjectObject } from '@/types/project';
import type {
  ExcelCellPosition,
  ExcelSelectionRange,
} from '@/utils/heatCalcExcelMode';

export type HeatCalcGlideCellAlign = 'left' | 'center' | 'right';
export type HeatCalcGlideEditorKind = 'text' | 'number' | 'select';

export interface HeatCalcGlideGridColumn {
  key: string;
  title: string;
  label?: string;
  width: number;
  minWidthPx?: number;
  resizable?: boolean;
  align?: HeatCalcGlideCellAlign;
  sortable?: boolean;
  filterable?: boolean;
  filterKind?: 'text' | 'numberRange' | 'enum' | 'boolean';
  enumOptions?: { label: string; value: string }[];
}

export interface HeatCalcGlideGridCellState {
  displayValue: string;
  editable: boolean;
  dirty?: boolean;
  error?: string;
  align?: HeatCalcGlideCellAlign;
  editor?: HeatCalcGlideEditorKind;
  options?: { label: string; value: string | number }[];
  step?: number;
  actions?: HeatCalcGlideGridCellAction[];
}

export interface HeatCalcGlideGridCellAction {
  key: string;
  label: string;
  disabled?: boolean;
}

function isReactElementWithProps(value: ReactNode): value is ReactElement<Record<string, unknown>> {
  return value !== null && typeof value === 'object' && 'props' in value;
}

function normalizeExtractedText(value: string) {
  return value.replace(/\s+/g, ' ').trim();
}

export function extractHeatCalcGridText(node: ReactNode): string {
  if (node == null || typeof node === 'boolean') return '';
  if (typeof node === 'string' || typeof node === 'number') return normalizeExtractedText(String(node));
  if (Array.isArray(node)) {
    return normalizeExtractedText(node.map(extractHeatCalcGridText).filter(Boolean).join(' '));
  }
  if (isReactElementWithProps(node)) {
    if (typeof node.props.title === 'string') return normalizeExtractedText(node.props.title);
    if (typeof node.props.label === 'string') return normalizeExtractedText(node.props.label);
    return extractHeatCalcGridText(node.props.children as ReactNode);
  }
  return '';
}

function mapGridCellToExcelCell(
  rows: ProjectObject[],
  columnKeys: readonly string[],
  rowIndex: number,
  columnIndex: number,
): ExcelCellPosition | null {
  const row = rows[rowIndex];
  const columnKey = columnKeys[columnIndex];
  if (!row || !columnKey) return null;
  return { rowId: row.id, columnKey };
}

function compactRowsFromRange(top: number, bottom: number) {
  return CompactSelection.empty().add([top, bottom + 1]);
}

export function buildHeatCalcGlideGridSelection({
  rows,
  columnKeys,
  selectedPosition,
  selectionRange,
}: {
  rows: ProjectObject[];
  columnKeys: readonly string[];
  selectedPosition: HeatCalcExcelCellCoordinates | null;
  selectionRange: ExcelSelectionRange | null;
}): GridSelection {
  const empty = CompactSelection.empty();
  if (!selectionRange || !selectedPosition) {
    return { columns: empty, rows: empty };
  }

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
    return { columns: empty, rows: empty };
  }

  const top = Math.min(anchorRowIndex, focusRowIndex);
  const bottom = Math.max(anchorRowIndex, focusRowIndex);
  const left = Math.min(anchorColumnIndex, focusColumnIndex);
  const right = Math.max(anchorColumnIndex, focusColumnIndex);
  const fullRowSelection = left === 0 && right === columnKeys.length - 1;
  if (fullRowSelection) {
    return {
      columns: empty,
      rows: compactRowsFromRange(top, bottom),
      current: {
        cell: [selectedPosition.columnIndex, selectedPosition.rowIndex],
        range: {
          x: selectedPosition.columnIndex,
          y: selectedPosition.rowIndex,
          width: 1,
          height: 1,
        },
        rangeStack: [],
      },
    };
  }

  return {
    columns: empty,
    rows: empty,
    current: {
      cell: [selectedPosition.columnIndex, selectedPosition.rowIndex],
      range: {
        x: left,
        y: top,
        width: right - left + 1,
        height: bottom - top + 1,
      },
      rangeStack: [],
    },
  };
}

export function heatCalcGlideSelectionToExcelRange({
  rows,
  columnKeys,
  selection,
  forceFullRowSelection = false,
}: {
  rows: ProjectObject[];
  columnKeys: readonly string[];
  selection: GridSelection;
  forceFullRowSelection?: boolean;
}) {
  const selectedRows = selection.rows.toArray();
  if (selectedRows.length > 0 && columnKeys.length > 0) {
    const firstRow = Math.min(...selectedRows);
    const lastRow = Math.max(...selectedRows);
    return {
      anchor: mapGridCellToExcelCell(rows, columnKeys, firstRow, 0),
      focus: mapGridCellToExcelCell(rows, columnKeys, lastRow, columnKeys.length - 1),
      active: mapGridCellToExcelCell(rows, columnKeys, firstRow, 0),
    };
  }

  const selectedColumns = selection.columns.toArray();
  if (selectedColumns.length > 0 && rows.length > 0) {
    const firstColumn = Math.min(...selectedColumns);
    const lastColumn = Math.max(...selectedColumns);
    return {
      anchor: mapGridCellToExcelCell(rows, columnKeys, 0, firstColumn),
      focus: mapGridCellToExcelCell(rows, columnKeys, rows.length - 1, lastColumn),
      active: mapGridCellToExcelCell(rows, columnKeys, 0, firstColumn),
    };
  }

  const current = selection.current;
  if (!current) return null;
  const { range } = current;
  const focusRow = Math.max(range.y, range.y + range.height - 1);
  const focusColumn = forceFullRowSelection && range.x === 0
    ? columnKeys.length - 1
    : Math.max(range.x, range.x + range.width - 1);
  return {
    anchor: mapGridCellToExcelCell(rows, columnKeys, range.y, range.x),
    focus: mapGridCellToExcelCell(rows, columnKeys, focusRow, focusColumn),
    active: mapGridCellToExcelCell(rows, columnKeys, current.cell[1], current.cell[0]),
  };
}

export * from '@/utils/heatCalcNormalGlidePureModel';
