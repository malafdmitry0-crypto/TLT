/**
 * Interaction controller for HeatCalcNormalGlideGrid.
 * Owns local UI state, grid callbacks, and composes layout + cell model.
 */
import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
} from 'react';
import type { TableProps } from 'antd';
import {
  type CellClickedEventArgs,
  type DataEditorRef,
  type EditableGridCell,
  type GridColumn,
  type GridMouseEventArgs,
  type GridSelection,
  type HeaderClickedEventArgs,
  type Item,
  type Rectangle,
} from '@glideapps/glide-data-grid';
import type { ProjectObject } from '@/types/project';
import {
  NORMAL_INFINITE_LOAD_THRESHOLD_ROWS,
  clampNormalGlideColumnWidth,
  findNormalCellActionAt,
  getGridCellEditedValue,
  normalRowThemeOverride,
  type HeatCalcGlideGridCellState,
  type HeatCalcGlideGridColumn,
} from '@/utils/heatCalcGlideGrid';
import type { HeatCalcTableViewState } from '@/utils/heatCalcTableFindability';
import { nextSortDirection } from '@/utils/glideGridPrimitives';
import {
  createNormalDrawCell,
  createNormalDrawHeader,
} from '@/utils/heatCalcNormalGlideDraw';
import {
  activeCellForRowId,
  isNormalHeaderFilterHit,
  nextKeysFromRowClick,
  shouldShowOffsetPagination,
} from '@/utils/heatCalcNormalGlideControllerHelpers';
import { useHeatCalcNormalGlideLayout } from '@/hooks/useHeatCalcNormalGlideLayout';
import {
  useHeatCalcNormalGlideCellModel,
  type HeatCalcNormalGlideDraftInvalidator,
} from '@/hooks/useHeatCalcNormalGlideCellModel';
import type { NormalGlideInfiniteLoading } from '@/components/shared/normalGlideTypes';
import { useHeatCalcNormalGlideEditorController } from '@/hooks/useHeatCalcNormalGlideEditorController';

export type { HeatCalcNormalGlideDraftInvalidator } from '@/hooks/useHeatCalcNormalGlideCellModel';

/** @deprecated Prefer NormalGlideInfiniteLoading from shared. */
export type HeatCalcNormalInfiniteLoading = NormalGlideInfiniteLoading;

interface FilterPopupState {
  columnIndex: number;
  left: number;
  top: number;
}

export interface UseHeatCalcNormalGlideControllerOptions {
  rows: ProjectObject[];
  gridColumns: HeatCalcGlideGridColumn[];
  tableScrollX: number;
  fontSizeKey: string;
  activeRowId?: string | null;
  selectedRowKeys: string[];
  tableViewState: HeatCalcTableViewState;
  infiniteLoading: HeatCalcNormalInfiniteLoading | null;
  pagination: TableProps<ProjectObject>['pagination'];
  rowClassName: (record: ProjectObject) => string;
  getCellState: (
    record: ProjectObject,
    columnKey: string,
    rowIndex: number,
  ) => HeatCalcGlideGridCellState;
  onOpenEditWizard: (record: ProjectObject) => void;
  onSelectedRowKeysChange: (keys: string[]) => void;
  onStartCellEdit: (record: ProjectObject, columnKey: string) => void;
  onCommitCell: (record: ProjectObject, columnKey: string, value: unknown) => string | null;
  onSetSort: (columnKey: string, direction?: 'asc' | 'desc') => void;
  onColumnResize?: (columnKey: string, widthPx: number) => void;
  onColumnResizeEnd?: (columnKey: string, widthPx: number) => void;
  onLoadMore: () => void;
  onCellAction?: (record: ProjectObject, columnKey: string, actionKey: string) => void;
  onRegisterDraftInvalidator?: (invalidateRows: HeatCalcNormalGlideDraftInvalidator) => () => void;
  fillAvailableWidth?: boolean;
}

export function useHeatCalcNormalGlideController({
  rows,
  gridColumns,
  tableScrollX,
  fontSizeKey,
  activeRowId,
  selectedRowKeys,
  tableViewState,
  infiniteLoading,
  pagination,
  rowClassName,
  getCellState,
  onOpenEditWizard,
  onSelectedRowKeysChange,
  onStartCellEdit,
  onCommitCell,
  onSetSort,
  onColumnResize,
  onColumnResizeEnd,
  onLoadMore,
  onCellAction,
  onRegisterDraftInvalidator,
  fillAvailableWidth = false,
}: UseHeatCalcNormalGlideControllerOptions) {
  const [filterPopup, setFilterPopup] = useState<FilterPopupState | null>(null);
  const [hoveredHeaderColumnIndex, setHoveredHeaderColumnIndex] = useState<number | null>(null);
  const [activeCell, setActiveCell] = useState<Item | null>(null);
  const editorRef = useRef<DataEditorRef | null>(null);
  const filterPopupRef = useRef<HTMLDivElement | null>(null);
  const rowSelectionAnchorRef = useRef<number | null>(null);

  const {
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
  } = useHeatCalcNormalGlideLayout({
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
  });

  const { getModelCell, getCellContent } = useHeatCalcNormalGlideCellModel({
    rows,
    visibleGridColumns,
    rowIndexById,
    rowClassName,
    getCellState,
    editorRef,
    onRegisterDraftInvalidator,
  });

  const {
    editingCell,
    cellEditorElementRef,
    setCellEditorElement,
    openEditorForCell,
    commitNormalEditor,
    handleSelectEditorChange,
    handleTextEditorChange,
    handleEditorKeyDown,
  } = useHeatCalcNormalGlideEditorController({
    editorRef,
    getModelCell,
    onStartCellEdit,
    onCommitCell,
  });
  const syncActiveRecordFromCell = useCallback((cell: Item) => {
    if (cell[0] < 0 || cell[1] < 0) return null;
    const record = rows[cell[1]];
    if (!record) return null;
    if (record.id !== activeRowId) onOpenEditWizard(record);
    return record;
  }, [activeRowId, onOpenEditWizard, rows]);
  const drawCell = useMemo(
    () => createNormalDrawCell({ rows, activeRowId, visibleGridColumns, getModelCell }),
    [activeRowId, getModelCell, rows, visibleGridColumns],
  );
  const handleGridSelectionChange = useCallback((nextSelection: GridSelection) => {
    const currentCell = nextSelection.current?.cell;
    const rowIndexes = nextSelection.rows.toArray();
    if (rowIndexes.length > 0 || !currentCell) {
      onSelectedRowKeysChange(rowIndexes
        .map((rowIndex) => rows[rowIndex]?.id)
        .filter((id): id is string => Boolean(id)));
    }
    if (currentCell) setActiveCell(currentCell);
  }, [onSelectedRowKeysChange, rows]);
  const updateRowSelectionFromClick = useCallback((
    rowIndex: number,
    event: Pick<CellClickedEventArgs, 'ctrlKey' | 'metaKey' | 'shiftKey'>,
  ) => {
    const { nextKeys, nextAnchor } = nextKeysFromRowClick({
      rows,
      selectedRowKeys,
      rowIndex,
      ctrlKey: event.ctrlKey,
      metaKey: event.metaKey,
      shiftKey: event.shiftKey,
      anchorRow: rowSelectionAnchorRef.current,
      activeCellRowIndex: activeCell?.[1] ?? null,
    });
    rowSelectionAnchorRef.current = nextAnchor;
    onSelectedRowKeysChange(nextKeys);
  }, [activeCell, onSelectedRowKeysChange, rows, selectedRowKeys]);
  const handleCellClicked = useCallback((cell: Item, event: CellClickedEventArgs) => {
    if (cell[0] < 0) {
      event.preventDefault();
      return;
    }
    if (event.ctrlKey || event.metaKey || event.shiftKey) {
      event.preventDefault();
      setActiveCell(cell);
      updateRowSelectionFromClick(cell[1], event);
      return;
    }
    event.preventDefault();
    setActiveCell(cell);
    syncActiveRecordFromCell(cell);
    const modelCell = getModelCell(cell[0], cell[1]);
    const action = modelCell ? findNormalCellActionAt(modelCell.state.actions, event) : undefined;
    if (modelCell && action) {
      if (!action.disabled) onCellAction?.(modelCell.record, modelCell.column.key, action.key);
      return;
    }
    openEditorForCell(cell, event.bounds);
  }, [getModelCell, onCellAction, openEditorForCell, syncActiveRecordFromCell, updateRowSelectionFromClick]);
  const handleCellActivated = useCallback((cell: Item) => {
    if (cell[0] < 0) return;
    setActiveCell(cell);
    syncActiveRecordFromCell(cell);
    const modelCell = getModelCell(cell[0], cell[1]);
    const action = modelCell?.state.actions?.find((candidate) => !candidate.disabled);
    if (modelCell && action) {
      onCellAction?.(modelCell.record, modelCell.column.key, action.key);
      return;
    }
    openEditorForCell(cell);
  }, [getModelCell, onCellAction, openEditorForCell, syncActiveRecordFromCell]);
  const handleCellEdited = useCallback((cell: Item, newValue: EditableGridCell) => {
    const modelCell = getModelCell(cell[0], cell[1]);
    if (!modelCell?.state.editable) return;
    onCommitCell(modelCell.record, modelCell.column.key, getGridCellEditedValue(newValue));
  }, [getModelCell, onCommitCell]);
  const openFilterPopup = useCallback((columnIndex: number, event: HeaderClickedEventArgs) => {
    const column = visibleGridColumns[columnIndex];
    if (!column?.filterable) return;
    event.preventDefault();
    setFilterPopup({
      columnIndex,
      left: event.bounds.x,
      top: event.bounds.y + event.bounds.height,
    });
  }, [visibleGridColumns]);
  const handleHeaderClicked = useCallback((columnIndex: number, event: HeaderClickedEventArgs) => {
    const column = visibleGridColumns[columnIndex];
    if (!column) return;
    if (isNormalHeaderFilterHit(column, event.localEventX, event.bounds.width)) {
      openFilterPopup(columnIndex, event);
      return;
    }
    if (!column.sortable) return;
    event.preventDefault();
    setFilterPopup(null);
    onSetSort(column.key, nextSortDirection(tableViewState, column.key));
  }, [onSetSort, openFilterPopup, tableViewState, visibleGridColumns]);
  const handleItemHovered = useCallback((args: GridMouseEventArgs) => {
    setHoveredHeaderColumnIndex(args.kind === 'header' ? args.location[0] : null);
  }, []);
  const drawHeader = useMemo(
    () => createNormalDrawHeader({
      visibleGridColumns,
      tableViewState,
      hoveredHeaderColumnIndex,
      filterPopupColumnIndex: filterPopup?.columnIndex,
    }),
    [filterPopup?.columnIndex, hoveredHeaderColumnIndex, tableViewState, visibleGridColumns],
  );
  const handleVisibleRegionChanged = useCallback((range: Rectangle) => {
    if (!infiniteLoading?.hasNextPage || infiniteLoading.loading || rows.length === 0) return;
    if (range.y + range.height >= rows.length - NORMAL_INFINITE_LOAD_THRESHOLD_ROWS) onLoadMore();
  }, [infiniteLoading?.hasNextPage, infiniteLoading?.loading, onLoadMore, rows.length]);
  const handleColumnResize = useCallback((
    _column: GridColumn,
    widthPx: number,
    columnIndex: number,
  ) => {
    const column = visibleGridColumns[columnIndex];
    if (!column || column.resizable === false) return;
    onColumnResize?.(column.key, clampNormalGlideColumnWidth(column, widthPx));
  }, [onColumnResize, visibleGridColumns]);
  const handleColumnResizeEnd = useCallback((
    _column: GridColumn,
    widthPx: number,
    columnIndex: number,
  ) => {
    const column = visibleGridColumns[columnIndex];
    if (!column || column.resizable === false) return;
    onColumnResizeEnd?.(column.key, clampNormalGlideColumnWidth(column, widthPx));
  }, [onColumnResizeEnd, visibleGridColumns]);
  const getRowThemeOverride = useCallback((rowIndex: number) => {
    const record = rows[rowIndex];
    if (!record) return undefined;
    return normalRowThemeOverride(rowClassName(record), record.id === activeRowId);
  }, [activeRowId, rowClassName, rows]);

  const activeFilterColumn = filterPopup ? visibleGridColumns[filterPopup.columnIndex] : undefined;
  const filterPopupStyle = useMemo<CSSProperties | undefined>(() => (
    filterPopup ? { left: filterPopup.left, top: filterPopup.top } : undefined
  ), [filterPopup]);

  const closeFilterPopup = useCallback(() => setFilterPopup(null), []);

  useEffect(() => {
    if (!filterPopup) return undefined;
    function handlePointerDown(event: PointerEvent) {
      const popup = filterPopupRef.current;
      if (popup && event.target instanceof Node && popup.contains(event.target)) return;
      setFilterPopup(null);
    }
    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === 'Escape') setFilterPopup(null);
    }
    document.addEventListener('pointerdown', handlePointerDown, true);
    document.addEventListener('keydown', handleKeyDown);
    return () => {
      document.removeEventListener('pointerdown', handlePointerDown, true);
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, [filterPopup]);
  useEffect(() => {
    setActiveCell((current) => activeCellForRowId({
      activeRowId,
      rows,
      current,
      visibleColumnCount: visibleGridColumns.length,
    }));
  }, [activeRowId, rows, visibleGridColumns.length]);
  useEffect(() => {
    if (!editingCell) return undefined;
    const frameId = window.requestAnimationFrame(() => {
      const editor = cellEditorElementRef.current;
      editor?.focus({ preventScroll: true });
      if (editor instanceof HTMLInputElement) editor.select();
    });
    return () => window.cancelAnimationFrame(frameId);
  }, [cellEditorElementRef, editingCell]);

  const { showOffsetPagination, pageConfig } = shouldShowOffsetPagination(infiniteLoading, pagination);

  return {
    rootRef,
    editorRef,
    filterPopupRef,
    setCellEditorElement,
    fontSize,
    rowHeight,
    editorWidth,
    editorColumns,
    rowMarkerStartIndex,
    visibleColumnWidthSignature,
    getCellContent,
    drawCell,
    drawHeader,
    gridSelection,
    handleGridSelectionChange,
    handleCellClicked,
    handleCellActivated,
    handleCellEdited,
    handleHeaderClicked,
    openFilterPopup,
    handleItemHovered,
    handleVisibleRegionChanged,
    handleColumnResize: onColumnResize ? handleColumnResize : undefined,
    handleColumnResizeEnd: onColumnResizeEnd ? handleColumnResizeEnd : undefined,
    getRowThemeOverride,
    editingCell,
    commitNormalEditor,
    handleSelectEditorChange,
    handleTextEditorChange,
    handleEditorKeyDown,
    showOffsetPagination,
    pageConfig,
    filterPopup,
    activeFilterColumn,
    filterPopupStyle,
    closeFilterPopup,
  };
}
