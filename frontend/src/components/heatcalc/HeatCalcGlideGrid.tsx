import {
  memo,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type MouseEvent,
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

const GLIDE_ROW_MARKER_WIDTH = 50;

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
  onStartCellEdit,
  onCommitCell,
}: HeatCalcGlideGridProps) {
  const editorRef = useRef<DataEditorRef | null>(null);
  const lastScrollEndRowsRef = useRef(0);
  const [editingCell, setEditingCell] = useState<GlideEditingCell | null>(null);
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
  const openEditorForCell = useCallback((cell: Item) => {
    const modelCell = getModelCell(cell[0], cell[1]);
    if (!modelCell?.state.editable) return;
    onStartCellEdit(modelCell.record, modelCell.column.key);
    const bounds = editorRef.current?.getBounds(cell[0], cell[1]);
    if (!bounds) return;
    setEditingCell({
      cell,
      value: modelCell.state.displayValue,
      bounds,
    });
  }, [getModelCell, onStartCellEdit]);
  const commitGlideEditor = useCallback(() => {
    if (!editingCell) return;
    const modelCell = getModelCell(editingCell.cell[0], editingCell.cell[1]);
    if (!modelCell?.state.editable) {
      setEditingCell(null);
      return;
    }
    const error = onCommitCell(modelCell.record, modelCell.column.key, editingCell.value);
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
    });
    if (!nextRange?.anchor || !nextRange.focus) return;
    onSetRangeSelection(nextRange.anchor, nextRange.focus, nextRange.active ?? nextRange.focus);
  }, [columnKeys, onSetRangeSelection, rows]);
  const handleCellActivated = useCallback((cell: Item) => {
    openEditorForCell(cell);
  }, [openEditorForCell]);
  const handleCellClicked = useCallback((cell: Item, event: CellClickedEventArgs) => {
    if (!event.isDoubleClick) return;
    event.preventDefault();
    openEditorForCell(cell);
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

  if (rows.length === 0) {
    return (
      <div className={`calc-spreadsheet calc-spreadsheet--${fontSizeKey} calc-spreadsheet--excel-mode calc-spreadsheet--glide`}>
        <div className="excel-virtual-empty">
          {emptyContent}
        </div>
      </div>
    );
  }

  return (
    <div className={`calc-spreadsheet calc-spreadsheet--${fontSizeKey} calc-spreadsheet--excel-mode calc-spreadsheet--glide`}>
      <DataEditor
        ref={editorRef}
        className="heatcalc-glide-editor"
        width={tableScrollX + GLIDE_ROW_MARKER_WIDTH}
        height={tableScrollY}
        columns={editorColumns}
        rows={rows.length}
        rowMarkers="clickable-number"
        rowMarkerWidth={GLIDE_ROW_MARKER_WIDTH}
        rowHeight={30}
        headerHeight={38}
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
          return undefined;
        }}
        theme={{
          accentColor: '#1a5276',
          accentLight: '#dbeeff',
          bgCell: '#ffffff',
          bgHeader: '#f3f6f4',
          borderColor: '#d9d9d9',
          fontFamily: 'inherit',
          baseFontStyle: '12px inherit',
          headerFontStyle: '600 12px inherit',
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
          onBlur={commitGlideEditor}
          onKeyDown={(event) => {
            if (event.key === 'Enter') {
              event.preventDefault();
              event.stopPropagation();
              commitGlideEditor();
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
