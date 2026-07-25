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
import {
  clampExcelGridIndices,
  computeMovedExcelSelectionIndices,
  excelCellPositionAt,
  excelSelectedCoordinates,
  type HeatCalcExcelCellCoordinates,
  type HeatCalcExcelCellRef,
} from '@/utils/heatCalcExcelSelectionNav';

export type { HeatCalcExcelCellCoordinates, HeatCalcExcelCellRef } from '@/utils/heatCalcExcelSelectionNav';

interface UseHeatCalcExcelSelectionOptions {
  excelModeEnabled: boolean;
  rows: ProjectObject[];
  editableColumnKeys: string[];
  selectedCell: HeatCalcExcelCellRef;
  setSelectedCell: Dispatch<SetStateAction<HeatCalcExcelCellRef>>;
  selectionRange: ExcelSelectionRange | null;
  setSelectionRange: Dispatch<SetStateAction<ExcelSelectionRange | null>>;
  setActiveInlineCell: Dispatch<SetStateAction<HeatCalcExcelCellRef>>;
  focusedRowId?: string | null;
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
  focusedRowId,
  onSelectRecord,
  openContextMenu,
}: UseHeatCalcExcelSelectionOptions) {
  const selectionDragRef = useRef<{ mode: 'cells' | 'rows' | 'columns'; anchor: ExcelCellPosition } | null>(null);
  const lastCellPointerDownRef = useRef<{ rowIndex: number; columnIndex: number; at: number } | null>(null);
  const rowIds = useMemo(() => rows.map((row) => row.id), [rows]);

  const cellPositionAt = useCallback(
    (rowIndex: number, columnIndex: number): ExcelCellPosition | null => (
      excelCellPositionAt(rowIds, editableColumnKeys, rowIndex, columnIndex)
    ),
    [editableColumnKeys, rowIds],
  );

  const selectedPosition = useMemo<HeatCalcExcelCellCoordinates | null>(
    () => excelSelectedCoordinates(rows, editableColumnKeys, selectedCell),
    [editableColumnKeys, rows, selectedCell],
  );

  const clearSelectionState = useCallback(() => {
    setSelectedCell(null);
    setSelectionRange(null);
    setActiveInlineCell(null);
  }, [setActiveInlineCell, setSelectedCell, setSelectionRange]);

  const focusRecordIfNeeded = useCallback((record: ProjectObject) => {
    if (!onSelectRecord || record.id === focusedRowId) return;
    onSelectRecord(record);
  }, [focusedRowId, onSelectRecord]);

  const selectCellByPosition = useCallback((
    rowIndex: number,
    editableColumnIndex: number,
    extend = false,
  ) => {
    if (!excelModeEnabled || rows.length === 0 || editableColumnKeys.length === 0) return;
    const clamped = clampExcelGridIndices(
      rowIndex,
      editableColumnIndex,
      rows.length,
      editableColumnKeys.length,
    );
    if (!clamped) return;
    const { rowIndex: nextRowIndex, columnIndex: nextColumnIndex } = clamped;
    const record = rows[nextRowIndex];
    const columnKey = editableColumnKeys[nextColumnIndex];
    if (!record || !columnKey) return;
    const focus = { rowId: record.id, columnKey };
    setSelectedCell({ objectId: record.id, columnKey });
    focusRecordIfNeeded(record);
    setSelectionRange((current) => (
      extend && current
        ? { anchor: current.anchor, focus }
        : createExcelSelectionRange(focus)
    ));
    setActiveInlineCell(null);
  }, [
    editableColumnKeys,
    excelModeEnabled,
    focusRecordIfNeeded,
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
    const activeRowIndex = rowIds.indexOf(active.rowId);
    const activeColumnIndex = editableColumnKeys.indexOf(active.columnKey);
    if (activeRowIndex < 0 || activeColumnIndex < 0) return;
    const record = rows[activeRowIndex];
    const columnKey = editableColumnKeys[activeColumnIndex];
    if (!record || !columnKey) return;
    setSelectedCell({ objectId: record.id, columnKey });
    focusRecordIfNeeded(record);
    setSelectionRange(createExcelSelectionRange(anchor, focus));
    setActiveInlineCell(null);
  }, [
    editableColumnKeys,
    excelModeEnabled,
    focusRecordIfNeeded,
    rowIds,
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
    const next = computeMovedExcelSelectionIndices(
      selectedPosition,
      rowDelta,
      columnDelta,
      editableColumnKeys.length,
      wrap,
    );
    selectCellByPosition(next.rowIndex, next.columnIndex, extend);
  }, [
    editableColumnKeys.length,
    excelModeEnabled,
    selectedPosition,
    selectCellByPosition,
  ]);

  const selectAllCells = useCallback(() => {
    if (!excelModeEnabled || rows.length === 0 || editableColumnKeys.length === 0) return;
    const start = cellPositionAt(0, 0);
    const end = cellPositionAt(rows.length - 1, editableColumnKeys.length - 1);
    if (!start || !end) return;
    setRangeSelection(
      start,
      end,
      start,
    );
  }, [cellPositionAt, editableColumnKeys.length, excelModeEnabled, rows.length, setRangeSelection]);

  const collapseSelectionToActiveCell = useCallback(() => {
    if (!selectedPosition) return;
    const selectedCellPosition = cellPositionAt(selectedPosition.rowIndex, selectedPosition.columnIndex);
    if (!selectedCellPosition) return;
    setActiveInlineCell(null);
    setSelectionRange(createExcelSelectionRange(selectedCellPosition));
  }, [cellPositionAt, selectedPosition, setActiveInlineCell, setSelectionRange]);

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
    const anchor = event.shiftKey && selectionRange
      ? selectionRange.anchor
      : cellPositionAt(rowIndex, columnIndex);
    if (!anchor) return;
    selectionDragRef.current = {
      mode: 'cells',
      anchor,
    };
    selectCellByPosition(rowIndex, columnIndex, event.shiftKey);
    if (repeatedCellClick) {
      const record = rows[rowIndex];
      const columnKey = editableColumnKeys[columnIndex];
      if (record && columnKey) setActiveInlineCell({ objectId: record.id, columnKey });
    }
  }, [
    editableColumnKeys,
    cellPositionAt,
    excelModeEnabled,
    rows,
    selectCellByPosition,
    selectionRange,
    setActiveInlineCell,
  ]);

  const extendCellSelection = useCallback((rowIndex: number, columnIndex: number) => {
    const drag = selectionDragRef.current;
    if (!excelModeEnabled || !drag || drag.mode !== 'cells') return;
    const focus = cellPositionAt(rowIndex, columnIndex);
    if (!focus) return;
    setRangeSelection(drag.anchor, focus, focus);
  }, [cellPositionAt, excelModeEnabled, setRangeSelection]);

  const beginRowSelection = useCallback((rowIndex: number, event: ReactPointerEvent<HTMLElement>) => {
    if (!excelModeEnabled || editableColumnKeys.length === 0) return;
    const start = cellPositionAt(rowIndex, 0);
    const end = cellPositionAt(rowIndex, editableColumnKeys.length - 1);
    if (!start || !end) return;
    const firstColumnKey = editableColumnKeys[0];
    if (!firstColumnKey) return;
    const anchor = event.shiftKey && selectionRange
      ? { rowId: selectionRange.anchor.rowId, columnKey: firstColumnKey }
      : start;
    selectionDragRef.current = { mode: 'rows', anchor };
    setRangeSelection(
      anchor,
      end,
      start,
    );
  }, [cellPositionAt, editableColumnKeys, excelModeEnabled, selectionRange, setRangeSelection]);

  const extendRowSelection = useCallback((rowIndex: number) => {
    const drag = selectionDragRef.current;
    if (!excelModeEnabled || !drag || drag.mode !== 'rows' || editableColumnKeys.length === 0) return;
    const start = cellPositionAt(rowIndex, 0);
    const end = cellPositionAt(rowIndex, editableColumnKeys.length - 1);
    if (!start || !end) return;
    setRangeSelection(
      drag.anchor,
      end,
      start,
    );
  }, [cellPositionAt, editableColumnKeys.length, excelModeEnabled, setRangeSelection]);

  const beginColumnSelection = useCallback((columnIndex: number, event: ReactPointerEvent<HTMLElement>) => {
    if (!excelModeEnabled || rows.length === 0) return;
    const start = cellPositionAt(0, columnIndex);
    const end = cellPositionAt(rows.length - 1, columnIndex);
    if (!start || !end) return;
    const firstRowId = rowIds[0];
    if (!firstRowId) return;
    const anchor = event.shiftKey && selectionRange
      ? { rowId: firstRowId, columnKey: selectionRange.anchor.columnKey }
      : start;
    selectionDragRef.current = { mode: 'columns', anchor };
    setRangeSelection(
      anchor,
      end,
      start,
    );
  }, [cellPositionAt, excelModeEnabled, rowIds, rows.length, selectionRange, setRangeSelection]);

  const extendColumnSelection = useCallback((columnIndex: number) => {
    const drag = selectionDragRef.current;
    if (!excelModeEnabled || !drag || drag.mode !== 'columns' || rows.length === 0) return;
    const start = cellPositionAt(0, columnIndex);
    const end = cellPositionAt(rows.length - 1, columnIndex);
    if (!start || !end) return;
    setRangeSelection(
      drag.anchor,
      end,
      start,
    );
  }, [cellPositionAt, excelModeEnabled, rows.length, setRangeSelection]);

  const openCellContextMenu = useCallback((
    rowIndex: number,
    columnIndex: number,
    event: ReactMouseEvent<HTMLElement>,
  ) => {
    if (!excelModeEnabled) return;
    const cell = cellPositionAt(rowIndex, columnIndex);
    if (!cell) return;
    if (!isExcelCellInRange(selectionRange, cell.rowId, cell.columnKey, rowIds, editableColumnKeys)) {
      setRangeSelection(
        cell,
        cell,
        cell,
      );
    }
    openContextMenu?.(event);
  }, [cellPositionAt, editableColumnKeys, excelModeEnabled, openContextMenu, rowIds, selectionRange, setRangeSelection]);

  const openRowContextMenu = useCallback((rowIndex: number, event: ReactMouseEvent<HTMLElement>) => {
    if (!excelModeEnabled || editableColumnKeys.length === 0) return;
    const normalizedRange = selectionRange ? normalizeExcelSelectionRange(selectionRange, rowIds, editableColumnKeys) : null;
    const rowAlreadySelected = !!normalizedRange
      && rowIndex >= normalizedRange.top
      && rowIndex <= normalizedRange.bottom;
    if (!rowAlreadySelected) {
      const start = cellPositionAt(rowIndex, 0);
      const end = cellPositionAt(rowIndex, editableColumnKeys.length - 1);
      if (!start || !end) return;
      setRangeSelection(
        start,
        end,
        start,
      );
    }
    openContextMenu?.(event);
  }, [cellPositionAt, editableColumnKeys, excelModeEnabled, openContextMenu, rowIds, selectionRange, setRangeSelection]);

  const openRecordContextMenu = useCallback((record: ProjectObject, event: ReactMouseEvent<HTMLElement>) => {
    if (!excelModeEnabled || editableColumnKeys.length === 0) return;
    event.preventDefault();
    event.stopPropagation();
    const rowIndex = rows.findIndex((object) => object.id === record.id);
    if (rowIndex < 0) return;
    if (selectedPosition?.rowIndex !== rowIndex) {
      const cell = cellPositionAt(rowIndex, 0);
      if (!cell) return;
      setRangeSelection(
        cell,
        cell,
        cell,
      );
    }
    openContextMenu?.(event);
  }, [
    editableColumnKeys.length,
    cellPositionAt,
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
