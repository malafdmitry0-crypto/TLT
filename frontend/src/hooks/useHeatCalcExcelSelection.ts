import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  type Dispatch,
  type MouseEvent as ReactMouseEvent,
  type PointerEvent as ReactPointerEvent,
  type SetStateAction,
} from 'react';

import type { ProjectObject } from '@/types/project';
import {
  createExcelSelectionRange,
  isExcelCellInRange,
  normalizeExcelSelectionRange,
  type ExcelCellPosition,
  type ExcelSelectionRange,
} from '@/utils/heatCalcExcelMode';

export type HeatCalcExcelCellRef = {
  objectId: string;
  columnKey: string;
} | null;

interface UseHeatCalcExcelSelectionOptions {
  excelModeEnabled: boolean;
  rows: ProjectObject[];
  editableColumnKeys: string[];
  selectedCell: HeatCalcExcelCellRef;
  setSelectedCell: Dispatch<SetStateAction<HeatCalcExcelCellRef>>;
  selectionRange: ExcelSelectionRange | null;
  setSelectionRange: Dispatch<SetStateAction<ExcelSelectionRange | null>>;
  setActiveInlineCell: Dispatch<SetStateAction<HeatCalcExcelCellRef>>;
  onSelectRecord?: (record: ProjectObject) => void;
  openContextMenu?: (event: ReactMouseEvent<HTMLElement>) => void;
}

export function useHeatCalcExcelSelection({
  excelModeEnabled,
  rows,
  editableColumnKeys,
  selectedCell,
  setSelectedCell,
  selectionRange,
  setSelectionRange,
  setActiveInlineCell,
  onSelectRecord,
  openContextMenu,
}: UseHeatCalcExcelSelectionOptions) {
  const selectionDragRef = useRef<{ mode: 'cells' | 'rows' | 'columns'; anchor: ExcelCellPosition } | null>(null);
  const lastCellPointerDownRef = useRef<{ rowIndex: number; columnIndex: number; at: number } | null>(null);

  const selectedPosition = useMemo<ExcelCellPosition | null>(() => {
    if (!selectedCell) return null;
    const rowIndex = rows.findIndex((object) => object.id === selectedCell.objectId);
    const columnIndex = editableColumnKeys.indexOf(selectedCell.columnKey);
    return rowIndex >= 0 && columnIndex >= 0 ? { rowIndex, columnIndex } : null;
  }, [editableColumnKeys, rows, selectedCell]);

  const clearSelectionState = useCallback(() => {
    setSelectedCell(null);
    setSelectionRange(null);
    setActiveInlineCell(null);
  }, [setActiveInlineCell, setSelectedCell, setSelectionRange]);

  const selectCellByPosition = useCallback((
    rowIndex: number,
    editableColumnIndex: number,
    extend = false,
  ) => {
    if (!excelModeEnabled || rows.length === 0 || editableColumnKeys.length === 0) return;
    const nextRowIndex = Math.min(Math.max(rowIndex, 0), rows.length - 1);
    const nextColumnIndex = Math.min(Math.max(editableColumnIndex, 0), editableColumnKeys.length - 1);
    const record = rows[nextRowIndex];
    const columnKey = editableColumnKeys[nextColumnIndex];
    if (!record || !columnKey) return;
    const focus = { rowIndex: nextRowIndex, columnIndex: nextColumnIndex };
    setSelectedCell({ objectId: record.id, columnKey });
    onSelectRecord?.(record);
    setSelectionRange((current) => (
      extend && current
        ? { anchor: current.anchor, focus }
        : createExcelSelectionRange(focus)
    ));
    setActiveInlineCell(null);
  }, [
    editableColumnKeys,
    excelModeEnabled,
    onSelectRecord,
    rows,
    setActiveInlineCell,
    setSelectedCell,
    setSelectionRange,
  ]);

  const setRangeSelection = useCallback((
    anchor: ExcelCellPosition,
    focus: ExcelCellPosition,
    active: ExcelCellPosition = focus,
  ) => {
    if (!excelModeEnabled || rows.length === 0 || editableColumnKeys.length === 0) return;
    const activeRowIndex = Math.min(Math.max(active.rowIndex, 0), rows.length - 1);
    const activeColumnIndex = Math.min(Math.max(active.columnIndex, 0), editableColumnKeys.length - 1);
    const record = rows[activeRowIndex];
    const columnKey = editableColumnKeys[activeColumnIndex];
    if (!record || !columnKey) return;
    setSelectedCell({ objectId: record.id, columnKey });
    onSelectRecord?.(record);
    setSelectionRange(createExcelSelectionRange(anchor, focus));
    setActiveInlineCell(null);
  }, [
    editableColumnKeys,
    excelModeEnabled,
    onSelectRecord,
    rows,
    setActiveInlineCell,
    setSelectedCell,
    setSelectionRange,
  ]);

  const moveSelection = useCallback((
    rowDelta: number,
    columnDelta: number,
    wrap = false,
    extend = false,
  ) => {
    if (!excelModeEnabled || !selectedPosition) return;
    let nextRowIndex = selectedPosition.rowIndex + rowDelta;
    let nextColumnIndex = selectedPosition.columnIndex + columnDelta;
    if (wrap) {
      if (nextColumnIndex >= editableColumnKeys.length) {
        nextColumnIndex = 0;
        nextRowIndex += 1;
      } else if (nextColumnIndex < 0) {
        nextColumnIndex = editableColumnKeys.length - 1;
        nextRowIndex -= 1;
      }
    }
    selectCellByPosition(nextRowIndex, nextColumnIndex, extend);
  }, [
    editableColumnKeys.length,
    excelModeEnabled,
    selectedPosition,
    selectCellByPosition,
  ]);

  const selectAllCells = useCallback(() => {
    if (!excelModeEnabled || rows.length === 0 || editableColumnKeys.length === 0) return;
    setRangeSelection(
      { rowIndex: 0, columnIndex: 0 },
      { rowIndex: rows.length - 1, columnIndex: editableColumnKeys.length - 1 },
      { rowIndex: 0, columnIndex: 0 },
    );
  }, [editableColumnKeys.length, excelModeEnabled, rows.length, setRangeSelection]);

  const collapseSelectionToActiveCell = useCallback(() => {
    if (!selectedPosition) return;
    setActiveInlineCell(null);
    setSelectionRange(createExcelSelectionRange(selectedPosition));
  }, [selectedPosition, setActiveInlineCell, setSelectionRange]);

  const beginCellSelection = useCallback((
    rowIndex: number,
    columnIndex: number,
    event: ReactPointerEvent<HTMLElement>,
  ) => {
    if (!excelModeEnabled) return;
    const now = Date.now();
    const previous = lastCellPointerDownRef.current;
    const repeatedCellClick = !!previous
      && previous.rowIndex === rowIndex
      && previous.columnIndex === columnIndex
      && now - previous.at < 450;
    lastCellPointerDownRef.current = { rowIndex, columnIndex, at: now };
    selectionDragRef.current = {
      mode: 'cells',
      anchor: event.shiftKey && selectionRange ? selectionRange.anchor : { rowIndex, columnIndex },
    };
    selectCellByPosition(rowIndex, columnIndex, event.shiftKey);
    if (repeatedCellClick) {
      const record = rows[rowIndex];
      const columnKey = editableColumnKeys[columnIndex];
      if (record && columnKey) setActiveInlineCell({ objectId: record.id, columnKey });
    }
  }, [
    editableColumnKeys,
    excelModeEnabled,
    rows,
    selectCellByPosition,
    selectionRange,
    setActiveInlineCell,
  ]);

  const extendCellSelection = useCallback((rowIndex: number, columnIndex: number) => {
    const drag = selectionDragRef.current;
    if (!excelModeEnabled || !drag || drag.mode !== 'cells') return;
    setRangeSelection(drag.anchor, { rowIndex, columnIndex }, { rowIndex, columnIndex });
  }, [excelModeEnabled, setRangeSelection]);

  const beginRowSelection = useCallback((rowIndex: number, event: ReactPointerEvent<HTMLElement>) => {
    if (!excelModeEnabled || editableColumnKeys.length === 0) return;
    const anchor = event.shiftKey && selectionRange
      ? { rowIndex: selectionRange.anchor.rowIndex, columnIndex: 0 }
      : { rowIndex, columnIndex: 0 };
    selectionDragRef.current = { mode: 'rows', anchor };
    setRangeSelection(
      anchor,
      { rowIndex, columnIndex: editableColumnKeys.length - 1 },
      { rowIndex, columnIndex: 0 },
    );
  }, [editableColumnKeys.length, excelModeEnabled, selectionRange, setRangeSelection]);

  const extendRowSelection = useCallback((rowIndex: number) => {
    const drag = selectionDragRef.current;
    if (!excelModeEnabled || !drag || drag.mode !== 'rows' || editableColumnKeys.length === 0) return;
    setRangeSelection(
      drag.anchor,
      { rowIndex, columnIndex: editableColumnKeys.length - 1 },
      { rowIndex, columnIndex: 0 },
    );
  }, [editableColumnKeys.length, excelModeEnabled, setRangeSelection]);

  const beginColumnSelection = useCallback((columnIndex: number, event: ReactPointerEvent<HTMLElement>) => {
    if (!excelModeEnabled || rows.length === 0) return;
    const anchor = event.shiftKey && selectionRange
      ? { rowIndex: 0, columnIndex: selectionRange.anchor.columnIndex }
      : { rowIndex: 0, columnIndex };
    selectionDragRef.current = { mode: 'columns', anchor };
    setRangeSelection(
      anchor,
      { rowIndex: rows.length - 1, columnIndex },
      { rowIndex: 0, columnIndex },
    );
  }, [excelModeEnabled, rows.length, selectionRange, setRangeSelection]);

  const extendColumnSelection = useCallback((columnIndex: number) => {
    const drag = selectionDragRef.current;
    if (!excelModeEnabled || !drag || drag.mode !== 'columns' || rows.length === 0) return;
    setRangeSelection(
      drag.anchor,
      { rowIndex: rows.length - 1, columnIndex },
      { rowIndex: 0, columnIndex },
    );
  }, [excelModeEnabled, rows.length, setRangeSelection]);

  const openCellContextMenu = useCallback((
    rowIndex: number,
    columnIndex: number,
    event: ReactMouseEvent<HTMLElement>,
  ) => {
    if (!excelModeEnabled) return;
    if (!isExcelCellInRange(selectionRange, rowIndex, columnIndex)) {
      setRangeSelection(
        { rowIndex, columnIndex },
        { rowIndex, columnIndex },
        { rowIndex, columnIndex },
      );
    }
    openContextMenu?.(event);
  }, [excelModeEnabled, openContextMenu, selectionRange, setRangeSelection]);

  const openRowContextMenu = useCallback((rowIndex: number, event: ReactMouseEvent<HTMLElement>) => {
    if (!excelModeEnabled || editableColumnKeys.length === 0) return;
    const normalizedRange = selectionRange ? normalizeExcelSelectionRange(selectionRange) : null;
    const rowAlreadySelected = !!normalizedRange
      && rowIndex >= normalizedRange.top
      && rowIndex <= normalizedRange.bottom;
    if (!rowAlreadySelected) {
      setRangeSelection(
        { rowIndex, columnIndex: 0 },
        { rowIndex, columnIndex: editableColumnKeys.length - 1 },
        { rowIndex, columnIndex: 0 },
      );
    }
    openContextMenu?.(event);
  }, [editableColumnKeys.length, excelModeEnabled, openContextMenu, selectionRange, setRangeSelection]);

  const openRecordContextMenu = useCallback((record: ProjectObject, event: ReactMouseEvent<HTMLElement>) => {
    if (!excelModeEnabled || editableColumnKeys.length === 0) return;
    event.preventDefault();
    event.stopPropagation();
    const rowIndex = rows.findIndex((object) => object.id === record.id);
    if (rowIndex < 0) return;
    if (selectedPosition?.rowIndex !== rowIndex) {
      setRangeSelection(
        { rowIndex, columnIndex: 0 },
        { rowIndex, columnIndex: 0 },
        { rowIndex, columnIndex: 0 },
      );
    }
    openContextMenu?.(event);
  }, [
    editableColumnKeys.length,
    excelModeEnabled,
    openContextMenu,
    rows,
    selectedPosition?.rowIndex,
    setRangeSelection,
  ]);

  useEffect(() => {
    if (!selectedCell) return;
    if (
      !rows.some((object) => object.id === selectedCell.objectId)
      || !editableColumnKeys.includes(selectedCell.columnKey)
    ) {
      clearSelectionState();
    }
  }, [clearSelectionState, editableColumnKeys, rows, selectedCell]);

  useEffect(() => {
    function clearSelectionDrag() {
      selectionDragRef.current = null;
    }

    window.addEventListener('pointerup', clearSelectionDrag);
    window.addEventListener('pointercancel', clearSelectionDrag);
    return () => {
      window.removeEventListener('pointerup', clearSelectionDrag);
      window.removeEventListener('pointercancel', clearSelectionDrag);
    };
  }, []);

  return {
    selectedPosition,
    clearSelectionState,
    selectCellByPosition,
    setRangeSelection,
    moveSelection,
    selectAllCells,
    collapseSelectionToActiveCell,
    beginCellSelection,
    extendCellSelection,
    beginRowSelection,
    extendRowSelection,
    beginColumnSelection,
    extendColumnSelection,
    openCellContextMenu,
    openRowContextMenu,
    openRecordContextMenu,
  };
}
