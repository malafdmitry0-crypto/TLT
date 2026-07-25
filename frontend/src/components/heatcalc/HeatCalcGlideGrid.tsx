import {
  memo,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type PointerEvent,
} from 'react';
import {
  DataEditor,
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
  type HeatCalcGlideGridCellState,
  type HeatCalcGlideGridColumn,
} from '@/utils/heatCalcGlideGrid';
import { resolveTableFontSizeByKey } from '@/utils/heatCalcTableViewSettings';
import { blankCell } from '@/utils/glideGridPrimitives';

import {
  GLIDE_MAX_COLUMN_WIDTH,
  GLIDE_MIN_COLUMN_WIDTH,
  GLIDE_ROW_MARKER_WIDTH,
  buildHeatEditorColumns,
  buildHeatGlideTheme,
  buildHeatGridCell,
  clampGlideColumnWidth,
  getGridCellEditedValue,
  glideRowHeight,
  isNearScrollEnd,
  resolveFullRowSelectionBounds,
  resolveHeatRowTheme,
  toContextMenuTrigger,
} from '@/components/heatcalc/heatCalcGlideGridAdapters';

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
  const editorColumns = useMemo(
    () => buildHeatEditorColumns(gridColumns),
    [gridColumns],
  );
  const glideTheme = useMemo(
    () => buildHeatGlideTheme(fontSize.fontSizePx),
    [fontSize.fontSizePx],
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
  const fullRowSelectionBounds = useMemo(
    () => resolveFullRowSelectionBounds({ rows, columnKeys, selectionRange }),
    [columnKeys, rows, selectionRange],
  );
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
    const modelCell = getModelCell(cell[0], cell[1]);
    if (!modelCell) return blankCell();
    return buildHeatGridCell(modelCell.column, modelCell.state, rowClassName(modelCell.record));
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
    onRowSecondaryAction(record, toContextMenuTrigger(event));
  }, [onRowSecondaryAction, rows]);
  const handleVisibleRegionChanged = useCallback((range: Rectangle) => {
    setEditingCell(null);
    if (!onReachScrollEnd || rows.length === 0) return;
    if (!isNearScrollEnd(range, rows.length) || lastScrollEndRowsRef.current === rows.length) return;
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
          return resolveHeatRowTheme({
            rowClassName: rowClassName(record),
            rowIndex,
            fullRowSelectionBounds,
          });
        }}
        theme={glideTheme}
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
