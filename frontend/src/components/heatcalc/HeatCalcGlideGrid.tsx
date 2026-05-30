import {
  memo,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type MouseEvent,
  type PointerEvent,
} from 'react';
import {
  DataEditor,
  GridCellKind,
  type CellClickedEventArgs,
  type DataEditorRef,
  type EditableGridCell,
  type GridCell,
  type GridColumn,
  type GridSelection,
  type Item,
  type Rectangle,
} from '@glideapps/glide-data-grid';
import '@glideapps/glide-data-grid/dist/index.css';

import type { HeatCalcExcelGridProps } from '@/components/heatcalc/HeatCalcExcelGrid';
import type { ProjectObject } from '@/types/project';
import type { ExcelCellPosition, ExcelSelectionRange } from '@/utils/heatCalcExcelMode';
import type { HeatCalcExcelCellCoordinates } from '@/hooks/useHeatCalcExcelSelection';
import {
  buildHeatCalcGlideGridSelection,
  heatCalcGlideSelectionToExcelRange,
  type HeatCalcGlideCellAlign,
  type HeatCalcGlideGridCellState,
  type HeatCalcGlideGridColumn,
} from '@/utils/heatCalcGlideGrid';
import { resolveTableFontSizeByKey } from '@/utils/heatCalcTableViewSettings';

const GLIDE_ROW_MARKER_WIDTH = 50;
const GLIDE_MIN_COLUMN_WIDTH = 48;
const GLIDE_MAX_COLUMN_WIDTH = 600;
const GLIDE_SELECTED_ROW_BG = '#dbeeff';
const GLIDE_SELECTED_ROW_BORDER = '#1a5276';

type GlideEditingCell = {
  cell: Item;
  value: string;
  bounds: {
    x: number;
    y: number;
    width: number;
    height: number;
  };
};

export interface HeatCalcGlideGridProps extends HeatCalcExcelGridProps {
  gridColumns: HeatCalcGlideGridColumn[];
  selectedPosition: HeatCalcExcelCellCoordinates | null;
  selectionRange: ExcelSelectionRange | null;
  getCellState: (
    record: ProjectObject,
    columnKey: string,
    rowIndex: number,
  ) => HeatCalcGlideGridCellState;
  onSetRangeSelection: (
    anchor: ExcelCellPosition,
    focus: ExcelCellPosition,
    active?: ExcelCellPosition,
  ) => void;
  onColumnResize?: (columnKey: string, widthPx: number) => void;
  onColumnResizeEnd?: (columnKey: string, widthPx: number) => void;
  onStartCellEdit: (record: ProjectObject, columnKey: string) => void;
  onCommitCell: (record: ProjectObject, columnKey: string, value: unknown) => string | null;
}

function getGridCellEditedValue(newValue: EditableGridCell): unknown {
  if (newValue.kind === GridCellKind.Number) return newValue.data;
  if ('data' in newValue) return newValue.data;
  return undefined;
}

function toSyntheticMouseEvent(event: CellClickedEventArgs): MouseEvent<HTMLElement> {
  return {
    button: event.button,
    clientX: event.bounds.x + event.bounds.width / 2,
    clientY: event.bounds.y + event.bounds.height / 2,
    preventDefault: event.preventDefault,
    stopPropagation: () => undefined,
  } as unknown as MouseEvent<HTMLElement>;
}

function blankCell(): GridCell {
  return {
    kind: GridCellKind.Text,
    allowOverlay: false,
    readonly: true,
    data: '',
    displayData: '',
    copyData: '',
  };
}

function contentAlign(
  column: HeatCalcGlideGridColumn,
  state: HeatCalcGlideGridCellState,
): HeatCalcGlideCellAlign {
  if (state.align) return state.align;
  if (column.align) return column.align;
  return state.editor === 'number' ? 'right' : 'left';
}

function isErrorRowClassName(className: string) {
  return className.includes('row-invalid')
    || className.includes('row-excel-error')
    || className.includes('row-error');
}

function isDirtyRowClassName(className: string) {
  return className.includes('row-excel-dirty') || className.includes('row-dirty');
}

function clampGlideColumnWidth(column: HeatCalcGlideGridColumn, widthPx: number) {
  return Math.max(column.minWidthPx ?? GLIDE_MIN_COLUMN_WIDTH, widthPx);
}

function glideRowHeight(fontSizeKey: string) {
  const fontSize = resolveTableFontSizeByKey(fontSizeKey);
  return Math.max(26, Math.round(fontSize.fontSizePx * fontSize.lineHeight + fontSize.cellPaddingY * 2 + 11));
}

function HeatCalcGlideGrid({
  rows,
  tableScrollX,
  tableScrollY,
  fontSizeKey,
  gridColumns,
  selectedPosition,
  selectionRange,
  emptyContent,
  rowClassName,
  getCellState,
  onRowSecondaryAction,
  onReachScrollEnd,
  onSetRangeSelection,
  onColumnResize,
  onColumnResizeEnd,
  onStartCellEdit,
  onCommitCell,
}: HeatCalcGlideGridProps) {
  const editorRef = useRef<DataEditorRef | null>(null);
  const lastScrollEndRowsRef = useRef(0);
  const rowMarkerPointerActiveRef = useRef(false);
  const [editingCell, setEditingCell] = useState<GlideEditingCell | null>(null);
  const fontSize = useMemo(() => resolveTableFontSizeByKey(fontSizeKey), [fontSizeKey]);
  const rowHeight = useMemo(() => glideRowHeight(fontSizeKey), [fontSizeKey]);
  const columnKeys = useMemo(
    () => gridColumns.map((column) => column.key),
    [gridColumns],
  );
  const editorColumns = useMemo<GridColumn[]>(
    () => gridColumns.map((column) => ({
      id: column.key,
      title: column.title || column.key,
      width: column.width,
    })),
    [gridColumns],
  );
  const gridSelection = useMemo(
    () => buildHeatCalcGlideGridSelection({
      rows,
      columnKeys,
      selectedPosition,
      selectionRange,
    }),
    [columnKeys, rows, selectedPosition, selectionRange],
  );
  const fullRowSelectionBounds = useMemo(() => {
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
  }, [columnKeys, rows, selectionRange]);
  const getModelCell = useCallback((columnIndex: number, rowIndex: number) => {
    const column = gridColumns[columnIndex];
    const record = rows[rowIndex];
    if (!column || !record) return null;
    return {
      column,
      record,
      state: getCellState(record, column.key, rowIndex),
    };
  }, [getCellState, gridColumns, rows]);
  const getCellContent = useCallback((cell: Item): GridCell => {
    const [columnIndex, rowIndex] = cell;
    const modelCell = getModelCell(columnIndex, rowIndex);
    if (!modelCell) return blankCell();
    const text = modelCell.state.displayValue;
    const rowClasses = rowClassName(modelCell.record);
    const bgCell = modelCell.state.error || isErrorRowClassName(rowClasses)
      ? '#fff1f0'
      : modelCell.state.dirty || isDirtyRowClassName(rowClasses)
        ? '#fffbe6'
        : undefined;
    return {
      kind: GridCellKind.Text,
      allowOverlay: false,
      readonly: !modelCell.state.editable,
      data: text,
      displayData: text,
      copyData: text,
      contentAlign: contentAlign(modelCell.column, modelCell.state),
      themeOverride: bgCell ? { bgCell } : undefined,
    };
  }, [getModelCell, rowClassName]);
  const openEditorForCell = useCallback((cell: Item, fallbackBounds?: GlideEditingCell['bounds']) => {
    const modelCell = getModelCell(cell[0], cell[1]);
    if (!modelCell?.state.editable) return;
    onStartCellEdit(modelCell.record, modelCell.column.key);
    const bounds = editorRef.current?.getBounds(cell[0], cell[1]) ?? fallbackBounds;
    if (!bounds) return;
    setEditingCell({
      cell,
      value: modelCell.state.displayValue,
      bounds,
    });
  }, [getModelCell, onStartCellEdit]);
  const commitGlideEditor = useCallback((valueOverride?: string) => {
    if (!editingCell) return;
    const modelCell = getModelCell(editingCell.cell[0], editingCell.cell[1]);
    if (!modelCell?.state.editable) {
      setEditingCell(null);
      return;
    }
    const error = onCommitCell(
      modelCell.record,
      modelCell.column.key,
      valueOverride ?? editingCell.value,
    );
    if (!error) setEditingCell(null);
  }, [editingCell, getModelCell, onCommitCell]);
  useEffect(() => {
    function handleKeyDown(event: KeyboardEvent) {
      if (!selectedPosition || editingCell) return;
      if (event.target instanceof HTMLInputElement || event.target instanceof HTMLTextAreaElement) return;
      if (event.key !== 'Enter' && event.key !== 'F2') return;
      event.preventDefault();
      openEditorForCell([selectedPosition.columnIndex, selectedPosition.rowIndex]);
    }

    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [editingCell, openEditorForCell, selectedPosition]);
  const getCellsForSelection = useCallback((range: Rectangle) => {
    const result: GridCell[][] = [];
    for (let rowIndex = range.y; rowIndex < range.y + range.height; rowIndex += 1) {
      const row: GridCell[] = [];
      for (let columnIndex = range.x; columnIndex < range.x + range.width; columnIndex += 1) {
        row.push(getCellContent([columnIndex, rowIndex]));
      }
      result.push(row);
    }
    return result;
  }, [getCellContent]);
  const handleGridSelectionChange = useCallback((nextSelection: GridSelection) => {
    const nextRange = heatCalcGlideSelectionToExcelRange({
      rows,
      columnKeys,
      selection: nextSelection,
      forceFullRowSelection: rowMarkerPointerActiveRef.current,
    });
    if (!nextRange?.anchor || !nextRange.focus) return;
    onSetRangeSelection(nextRange.anchor, nextRange.focus, nextRange.active ?? nextRange.focus);
  }, [columnKeys, onSetRangeSelection, rows]);
  const handlePointerDownCapture = useCallback((event: PointerEvent<HTMLDivElement>) => {
    const target = event.currentTarget;
    const rect = target.getBoundingClientRect();
    rowMarkerPointerActiveRef.current = event.clientX - rect.left <= GLIDE_ROW_MARKER_WIDTH;
  }, []);
  const clearRowMarkerPointer = useCallback(() => {
    rowMarkerPointerActiveRef.current = false;
  }, []);
  const handleCellActivated = useCallback((cell: Item) => {
    openEditorForCell(cell);
  }, [openEditorForCell]);
  const handleCellClicked = useCallback((cell: Item, event: CellClickedEventArgs) => {
    if (!event.isDoubleClick) return;
    event.preventDefault();
    openEditorForCell(cell, event.bounds);
  }, [openEditorForCell]);
  const handleCellEdited = useCallback((cell: Item, newValue: EditableGridCell) => {
    const modelCell = getModelCell(cell[0], cell[1]);
    if (!modelCell?.state.editable) return;
    onCommitCell(modelCell.record, modelCell.column.key, getGridCellEditedValue(newValue));
  }, [getModelCell, onCommitCell]);
  const handleCellContextMenu = useCallback((cell: Item, event: CellClickedEventArgs) => {
    const record = rows[cell[1]];
    if (!record) return;
    event.preventDefault();
    onRowSecondaryAction(record, toSyntheticMouseEvent(event));
  }, [onRowSecondaryAction, rows]);
  const handleVisibleRegionChanged = useCallback((range: Rectangle) => {
    setEditingCell(null);
    if (!onReachScrollEnd || rows.length === 0) return;
    const nearBottom = range.y + range.height >= rows.length - 4;
    if (!nearBottom || lastScrollEndRowsRef.current === rows.length) return;
    lastScrollEndRowsRef.current = rows.length;
    onReachScrollEnd();
  }, [onReachScrollEnd, rows.length]);
  const handleColumnResize = useCallback((
    _column: GridColumn,
    widthPx: number,
    columnIndex: number,
  ) => {
    const gridColumn = gridColumns[columnIndex];
    if (!gridColumn || gridColumn.resizable === false) return;
    onColumnResize?.(gridColumn.key, clampGlideColumnWidth(gridColumn, widthPx));
  }, [gridColumns, onColumnResize]);
  const handleColumnResizeEnd = useCallback((
    _column: GridColumn,
    widthPx: number,
    columnIndex: number,
  ) => {
    const gridColumn = gridColumns[columnIndex];
    if (!gridColumn || gridColumn.resizable === false) return;
    onColumnResizeEnd?.(gridColumn.key, clampGlideColumnWidth(gridColumn, widthPx));
  }, [gridColumns, onColumnResizeEnd]);

  if (rows.length === 0) {
    return (
      <div className={`calc-spreadsheet heatcalc-spreadsheet calc-spreadsheet--${fontSizeKey} calc-spreadsheet--excel-mode calc-spreadsheet--glide`}>
        <div className="excel-virtual-empty">
          {emptyContent}
        </div>
      </div>
    );
  }

  return (
    <div
      className={`calc-spreadsheet heatcalc-spreadsheet calc-spreadsheet--${fontSizeKey} calc-spreadsheet--excel-mode calc-spreadsheet--glide`}
      onPointerDownCapture={handlePointerDownCapture}
      onPointerUpCapture={clearRowMarkerPointer}
      onPointerCancelCapture={clearRowMarkerPointer}
    >
      <DataEditor
        ref={editorRef}
        className="heatcalc-glide-editor"
        width={tableScrollX + GLIDE_ROW_MARKER_WIDTH}
        height={tableScrollY}
        columns={editorColumns}
        rows={rows.length}
        rowMarkers="clickable-number"
        rowMarkerWidth={GLIDE_ROW_MARKER_WIDTH}
        rowHeight={rowHeight}
        headerHeight={rowHeight + 8}
        minColumnWidth={GLIDE_MIN_COLUMN_WIDTH}
        maxColumnWidth={GLIDE_MAX_COLUMN_WIDTH}
        smoothScrollX
        smoothScrollY
        verticalBorder
        freezeColumns={0}
        getCellContent={getCellContent}
        getCellsForSelection={getCellsForSelection}
        gridSelection={gridSelection}
        onGridSelectionChange={handleGridSelectionChange}
        onCellClicked={handleCellClicked}
        onCellActivated={handleCellActivated}
        onCellEdited={handleCellEdited}
        onCellContextMenu={handleCellContextMenu}
        onVisibleRegionChanged={handleVisibleRegionChanged}
        onColumnResize={onColumnResize ? handleColumnResize : undefined}
        onColumnResizeEnd={onColumnResizeEnd ? handleColumnResizeEnd : undefined}
        onPaste={false}
        rowSelect="multi"
        cellActivationBehavior="double-click"
        keybindings={{
          copy: false,
          paste: false,
        }}
        getRowThemeOverride={(rowIndex) => {
          const record = rows[rowIndex];
          if (!record) return undefined;
          const className = rowClassName(record);
          if (isErrorRowClassName(className)) {
            return { bgCell: '#fff1f0' };
          }
          if (isDirtyRowClassName(className)) {
            return { bgCell: '#fffbe6' };
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
        }}
        theme={{
          accentColor: '#1a5276',
          accentLight: '#dbeeff',
          bgCell: '#ffffff',
          bgHeader: '#f3f6f4',
          borderColor: '#d9d9d9',
          fontFamily: 'inherit',
          baseFontStyle: `${fontSize.fontSizePx}px inherit`,
          headerFontStyle: `600 ${fontSize.fontSizePx}px inherit`,
        }}
      />
      {editingCell && (
        <input
          data-testid="heatcalc-glide-cell-editor"
          className="heatcalc-glide-cell-editor"
          value={editingCell.value}
          style={{
            left: editingCell.bounds.x,
            top: editingCell.bounds.y,
            width: editingCell.bounds.width,
            height: editingCell.bounds.height,
          }}
          autoFocus
          onFocus={(event) => event.currentTarget.select()}
          onPointerDown={(event) => event.stopPropagation()}
          onClick={(event) => event.stopPropagation()}
          onChange={(event) => {
            const value = event.target.value;
            setEditingCell((current) => (current ? { ...current, value } : current));
          }}
          onBlur={(event) => commitGlideEditor(event.currentTarget.value)}
          onKeyDown={(event) => {
            if (event.key === 'Enter') {
              event.preventDefault();
              event.stopPropagation();
              commitGlideEditor(event.currentTarget.value);
              return;
            }
            if (event.key === 'Escape') {
              event.preventDefault();
              event.stopPropagation();
              setEditingCell(null);
            }
          }}
        />
      )}
      <span className="heatcalc-glide-engine-badge">Glide canvas</span>
    </div>
  );
}

export default memo(HeatCalcGlideGrid);
