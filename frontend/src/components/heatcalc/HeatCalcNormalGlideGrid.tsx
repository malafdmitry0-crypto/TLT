import {
  memo,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
  type ReactNode,
} from 'react';
import { Pagination, type TableProps } from 'antd';
import {
  DataEditor,
  GridCellKind,
  type DrawCellCallback,
  type CellClickedEventArgs,
  type DataEditorRef,
  type DrawHeaderCallback,
  type EditableGridCell,
  type GridCell,
  type GridColumn,
  type GridMouseEventArgs,
  type GridSelection,
  type HeaderClickedEventArgs,
  type Item,
  type Rectangle,
} from '@glideapps/glide-data-grid';
import '@glideapps/glide-data-grid/dist/index.css';

import ColumnFilterDropdown from '@/components/heatcalc/HeatCalcColumnFilterDropdown';
import type { ProjectObject } from '@/types/project';
import {
  NORMAL_DIRTY_ROW_BG,
  NORMAL_ERROR_ROW_BG,
  NORMAL_GLIDE_HIDDEN_COLUMN_KEYS,
  NORMAL_GLIDE_MAX_COLUMN_WIDTH,
  NORMAL_GLIDE_MIN_COLUMN_WIDTH,
  NORMAL_HEADER_CONTROL_BG,
  NORMAL_HEADER_FILTER_HIT_WIDTH,
  NORMAL_INFINITE_LOAD_THRESHOLD_ROWS,
  NORMAL_ROW_MARKER_WIDTH,
  NORMAL_STATUS_COLUMN_KEYS,
  buildRowSelection,
  clampNormalGlideColumnWidth,
  drawActiveNormalRowBorder,
  drawNormalCellActions,
  drawNormalStatusBadge,
  findNormalCellActionAt,
  getGridCellEditedValue,
  glideRowHeight,
  normalRowMarkerStartIndex,
  normalRowThemeOverride,
  normalStatusVisualFromValue,
  paginationConfig,
  selectedOptionValue,
  type HeatCalcGlideGridCellState,
  type HeatCalcGlideGridColumn,
} from '@/utils/heatCalcGlideGrid';
import { resolveTableFontSizeByKey } from '@/utils/heatCalcTableViewSettings';
import {
  isColumnFilterActive,
  type HeatCalcColumnFilter,
  type HeatCalcTableViewState,
} from '@/utils/heatCalcTableFindability';
import {
  blankCell,
  drawFilterIndicator,
  drawSortIndicator,
  headerControlWidth,
  isDirtyRowClassName,
  isErrorRowClassName,
  nextSortDirection,
} from '@/utils/glideGridPrimitives';

interface HeatCalcNormalGlideGridProps {
  className?: string;
  rows: ProjectObject[];
  gridColumns: HeatCalcGlideGridColumn[];
  tableScrollX: number;
  tableScrollY: string;
  fontSizeKey: string;
  activeRowId?: string | null;
  selectedRowKeys: string[];
  tableViewState: HeatCalcTableViewState;
  infiniteLoading: HeatCalcNormalInfiniteLoading | null;
  pagination: TableProps<ProjectObject>['pagination'];
  emptyContent: ReactNode;
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
  onSetColumnFilter: (columnKey: string, filter?: HeatCalcColumnFilter) => void;
  onResetColumnFilter: (columnKey: string) => void;
  onSetSort: (columnKey: string, direction?: 'asc' | 'desc') => void;
  onColumnResize?: (columnKey: string, widthPx: number) => void;
  onColumnResizeEnd?: (columnKey: string, widthPx: number) => void;
  onPageChange: (page: number) => void;
  onLoadMore: () => void;
  onCellAction?: (record: ProjectObject, columnKey: string, actionKey: string) => void;
  onRegisterDraftInvalidator?: (invalidateRows: HeatCalcNormalGlideDraftInvalidator) => () => void;
  /** PDF-HEAT-08: Glide row drag → new visual order indices (visible rows). */
  onRowMoved?: (startIndex: number, endIndex: number) => void;
  fillAvailableWidth?: boolean;
  renderFilterDropdown?: (props: {
    column: HeatCalcGlideGridColumn;
    filter?: HeatCalcColumnFilter;
    onApply: (filter?: HeatCalcColumnFilter) => void;
    onReset: () => void;
    onClose: () => void;
  }) => ReactNode;
}

interface FilterPopupState {
  columnIndex: number;
  left: number;
  top: number;
}

export interface HeatCalcNormalInfiniteLoading {
  loaded: number;
  total: number;
  hasNextPage: boolean;
  loading?: boolean;
}

export type HeatCalcNormalGlideDraftInvalidator = (rowIds?: readonly string[] | null) => void;

type NormalGlideEditingCell = {
  cell: Item;
  value: string;
  bounds: {
    x: number;
    y: number;
    width: number;
    height: number;
  };
  editor?: HeatCalcGlideGridCellState['editor'];
  options?: HeatCalcGlideGridCellState['options'];
  step?: number;
  error?: string | null;
};

type NormalModelCell = {
  column: HeatCalcGlideGridColumn;
  record: ProjectObject;
  state: HeatCalcGlideGridCellState;
};

type NormalModelCellCacheEntry = NormalModelCell & {
  version: object;
};

function HeatCalcNormalGlideGrid({
  className,
  rows,
  gridColumns,
  tableScrollX,
  tableScrollY,
  fontSizeKey,
  activeRowId,
  selectedRowKeys,
  tableViewState,
  infiniteLoading,
  pagination,
  emptyContent,
  rowClassName,
  getCellState,
  onOpenEditWizard,
  onSelectedRowKeysChange,
  onStartCellEdit,
  onCommitCell,
  onSetColumnFilter,
  onResetColumnFilter,
  onSetSort,
  onColumnResize,
  onColumnResizeEnd,
  onPageChange,
  onLoadMore,
  onCellAction,
  onRegisterDraftInvalidator,
  onRowMoved,
  fillAvailableWidth = false,
  renderFilterDropdown,
}: HeatCalcNormalGlideGridProps) {
  const [filterPopup, setFilterPopup] = useState<FilterPopupState | null>(null);
  const [editingCell, setEditingCell] = useState<NormalGlideEditingCell | null>(null);
  const [hoveredHeaderColumnIndex, setHoveredHeaderColumnIndex] = useState<number | null>(null);
  const [activeCell, setActiveCell] = useState<Item | null>(null);
  const [containerWidth, setContainerWidth] = useState(0);
  const rootRef = useRef<HTMLDivElement | null>(null);
  const editorRef = useRef<DataEditorRef | null>(null);
  const cellEditorElementRef = useRef<HTMLInputElement | HTMLSelectElement | null>(null);
  const filterPopupRef = useRef<HTMLDivElement | null>(null);
  const rowSelectionAnchorRef = useRef<number | null>(null);
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
    fillAvailableWidth && containerWidth > 0
      ? containerWidth - NORMAL_ROW_MARKER_WIDTH
      : 0,
  );
  const stretchedColumnWidths = useMemo(() => {
    const extraWidth = fillAvailableWidth
      ? Math.max(0, targetDataWidth - visibleColumnsWidth)
      : 0;
    if (extraWidth <= 0 || visibleGridColumns.length === 0) {
      return new Map<string, number>();
    }

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
    // Зависит только от filters (sort здесь не читается); filters сохраняет ссылку
    // при смене sort, поэтому сортировка не пересобирает колонки.
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
  const rowsRef = useRef(rows);
  const rowIndexByIdRef = useRef(rowIndexById);
  const visibleGridColumnsRef = useRef(visibleGridColumns);
  rowsRef.current = rows;
  rowIndexByIdRef.current = rowIndexById;
  visibleGridColumnsRef.current = visibleGridColumns;
  // `rows` is intentionally NOT part of the cache scope: a new `rows` reference
  // (infinite-scroll append, row reorder, optimistic row swap) must not wipe the
  // whole per-cell cache. Reuse is driven per-entry by record/column identity
  // below; `getCellState` stays the correctness version guard (its identity
  // changes when cell computation changes), so the scope-clear effect only fires
  // on a genuine "everything changed" signal.
  const modelCellCacheScope = useMemo(() => ({
    getCellState,
    version: {},
    visibleGridColumns,
  }), [getCellState, visibleGridColumns]);
  const modelCellCacheRef = useRef(new Map<string, NormalModelCellCacheEntry>());
  useEffect(() => {
    modelCellCacheRef.current.clear();
  }, [modelCellCacheScope]);
  const setCellEditorElement = useCallback((element: HTMLInputElement | HTMLSelectElement | null) => {
    cellEditorElementRef.current = element;
  }, []);
  const getModelCell = useCallback((columnIndex: number, rowIndex: number) => {
    const column = modelCellCacheScope.visibleGridColumns[columnIndex];
    const record = rowsRef.current[rowIndex];
    if (!column || !record) return null;
    const cacheKey = `${columnIndex}:${rowIndex}`;
    const cached = modelCellCacheRef.current.get(cacheKey);
    if (cached?.version === modelCellCacheScope.version && cached.column === column && cached.record === record) {
      return cached;
    }
    const modelCell: NormalModelCell = {
      column,
      record,
      state: modelCellCacheScope.getCellState(record, column.key, rowIndex),
    };
    modelCellCacheRef.current.set(cacheKey, { ...modelCell, version: modelCellCacheScope.version });
    return modelCell;
  }, [modelCellCacheScope]);
  const invalidateDraftRows = useCallback<HeatCalcNormalGlideDraftInvalidator>((rowIds) => {
    modelCellCacheRef.current.clear();
    const editor = editorRef.current;
    if (!editor) return;
    const columns = visibleGridColumnsRef.current;
    if (columns.length === 0) return;
    const targetRowIndexes = rowIds && rowIds.length > 0
      ? Array.from(new Set(rowIds
        .map((rowId) => rowIndexByIdRef.current.get(rowId))
        .filter((rowIndex): rowIndex is number => rowIndex != null)))
      : rowsRef.current.map((_row, rowIndex) => rowIndex);
    if (targetRowIndexes.length === 0) return;
    editor.updateCells(targetRowIndexes.flatMap((rowIndex) => (
      columns.map((_column, columnIndex) => ({ cell: [columnIndex, rowIndex] as Item }))
    )));
  }, []);
  useEffect(() => {
    if (!onRegisterDraftInvalidator) return undefined;
    return onRegisterDraftInvalidator(invalidateDraftRows);
  }, [invalidateDraftRows, onRegisterDraftInvalidator]);
  const getCellContent = useCallback((cell: Item): GridCell => {
    const [columnIndex, rowIndex] = cell;
    const modelCell = getModelCell(columnIndex, rowIndex);
    if (!modelCell) return blankCell();
    const { column, record, state } = modelCell;
    const rowClasses = rowClassName(record);
    const bgCell = state.error || isErrorRowClassName(rowClasses)
      ? NORMAL_ERROR_ROW_BG
      : state.dirty || isDirtyRowClassName(rowClasses)
        ? NORMAL_DIRTY_ROW_BG
        : undefined;
    return {
      kind: GridCellKind.Text,
      allowOverlay: false,
      readonly: !state.editable,
      data: state.displayValue,
      displayData: NORMAL_STATUS_COLUMN_KEYS.has(column.key) ? '' : state.displayValue,
      copyData: state.displayValue,
      contentAlign: state.align ?? column.align ?? (state.editor === 'number' ? 'right' : 'left'),
      themeOverride: bgCell ? { bgCell } : undefined,
    };
  }, [getModelCell, rowClassName]);
  const syncActiveRecordFromCell = useCallback((cell: Item) => {
    if (cell[0] < 0 || cell[1] < 0) return null;
    const record = rows[cell[1]];
    if (!record) return null;
    if (record.id !== activeRowId) {
      onOpenEditWizard(record);
    }
    return record;
  }, [activeRowId, onOpenEditWizard, rows]);
  const drawCell = useCallback<DrawCellCallback>((args, drawContent) => {
    drawContent();
    const record = rows[args.row];
    const isActiveRow = !!record && record.id === activeRowId;
    if (isActiveRow) {
      drawActiveNormalRowBorder(args.ctx, args.rect, args.col, visibleGridColumns.length);
    }
    const column = visibleGridColumns[args.col];
    const state = column ? getModelCell(args.col, args.row)?.state : undefined;
    drawNormalCellActions(args.ctx, args.rect, state?.actions);
    if (!column || !NORMAL_STATUS_COLUMN_KEYS.has(column.key)) return;
    const status = normalStatusVisualFromValue(args.cell.kind === GridCellKind.Text ? args.cell.data : null);
    if (!status) return;
    drawNormalStatusBadge(args.ctx, args.rect, status);
  }, [activeRowId, getModelCell, rows, visibleGridColumns]);
  const handleGridSelectionChange = useCallback((nextSelection: GridSelection) => {
    const currentCell = nextSelection.current?.cell;
    const rowIndexes = nextSelection.rows.toArray();
    if (rowIndexes.length > 0 || !currentCell) {
      const keys = rowIndexes
        .map((rowIndex) => rows[rowIndex]?.id)
        .filter((id): id is string => Boolean(id));
      onSelectedRowKeysChange(keys);
    }
    if (currentCell) {
      setActiveCell(currentCell);
    }
  }, [onSelectedRowKeysChange, rows]);
  const updateRowSelectionFromClick = useCallback((
    rowIndex: number,
    event: Pick<CellClickedEventArgs, 'ctrlKey' | 'metaKey' | 'shiftKey'>,
  ) => {
    const record = rows[rowIndex];
    if (!record) return;
    const selected = new Set(selectedRowKeys);
    const multiKey = event.ctrlKey || event.metaKey;
    if (event.shiftKey) {
      const anchorRow = rowSelectionAnchorRef.current ?? activeCell?.[1] ?? rowIndex;
      const top = Math.min(anchorRow, rowIndex);
      const bottom = Math.max(anchorRow, rowIndex);
      for (let index = top; index <= bottom; index += 1) {
        const row = rows[index];
        if (row) selected.add(row.id);
      }
      rowSelectionAnchorRef.current = anchorRow;
      onSelectedRowKeysChange(rows.filter((row) => selected.has(row.id)).map((row) => row.id));
      return;
    }
    rowSelectionAnchorRef.current = rowIndex;
    if (multiKey) {
      if (selected.has(record.id)) selected.delete(record.id);
      else selected.add(record.id);
      onSelectedRowKeysChange(rows.filter((row) => selected.has(row.id)).map((row) => row.id));
      return;
    }
    onSelectedRowKeysChange([record.id]);
  }, [activeCell, onSelectedRowKeysChange, rows, selectedRowKeys]);
  const openEditorForCell = useCallback((cell: Item, fallbackBounds?: NormalGlideEditingCell['bounds']) => {
    const modelCell = getModelCell(cell[0], cell[1]);
    if (!modelCell?.state.editable) return false;
    onStartCellEdit(modelCell.record, modelCell.column.key);
    const bounds = editorRef.current?.getBounds(cell[0], cell[1]) ?? fallbackBounds;
    if (!bounds) return true;
    setEditingCell({
      cell,
      value: modelCell.state.displayValue,
      bounds,
      editor: modelCell.state.editor,
      options: modelCell.state.options,
      step: modelCell.state.step,
      error: modelCell.state.error ?? null,
    });
    return true;
  }, [getModelCell, onStartCellEdit]);
  const commitNormalEditor = useCallback(() => {
    if (!editingCell) return;
    const modelCell = getModelCell(editingCell.cell[0], editingCell.cell[1]);
    if (!modelCell?.state.editable) {
      setEditingCell(null);
      return;
    }
    const value = editingCell.editor === 'select'
      ? selectedOptionValue(editingCell.value, editingCell.options)
      : editingCell.value;
    const error = onCommitCell(modelCell.record, modelCell.column.key, value);
    if (error) {
      setEditingCell((current) => (current ? { ...current, error } : current));
      return;
    }
    setEditingCell(null);
  }, [editingCell, getModelCell, onCommitCell]);
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
    if (openEditorForCell(cell, event.bounds)) return;
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
    if (column.filterable && event.localEventX >= Math.max(0, event.bounds.width - NORMAL_HEADER_FILTER_HIT_WIDTH)) {
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
  const drawHeader = useCallback<DrawHeaderCallback>((args, drawContent) => {
    drawContent();
    const column = visibleGridColumns[args.columnIndex];
    if (!column) return;
    const controlWidth = headerControlWidth(column);
    if (controlWidth <= 0) return;

    const { ctx, rect } = args;
    const right = rect.x + rect.width;
    const controlLeft = Math.max(rect.x + 1, right - controlWidth);
    const centerY = rect.y + rect.height / 2;
    const sortDirection = tableViewState.sort?.columnKey === column.key
      ? tableViewState.sort.direction
      : undefined;
    const filterActive = isColumnFilterActive(tableViewState.filters[column.key]);
    const controlsVisible = hoveredHeaderColumnIndex === args.columnIndex
      || filterPopup?.columnIndex === args.columnIndex
      || !!sortDirection
      || filterActive;

    if (!controlsVisible) return;

    ctx.save();
    ctx.fillStyle = args.theme.bgHeader ?? NORMAL_HEADER_CONTROL_BG;
    ctx.fillRect(controlLeft, rect.y + 1, Math.max(0, right - controlLeft - 1), Math.max(0, rect.height - 2));

    let cursorX = right - 12;
    if (column.filterable) {
      drawFilterIndicator(ctx, cursorX, centerY, filterActive);
      cursorX -= 22;
    }
    if (column.sortable) {
      drawSortIndicator(ctx, cursorX, centerY, sortDirection);
    }
    ctx.restore();
  }, [filterPopup?.columnIndex, hoveredHeaderColumnIndex, tableViewState.filters, tableViewState.sort, visibleGridColumns]);
  const handleVisibleRegionChanged = useCallback((range: Rectangle) => {
    if (!infiniteLoading?.hasNextPage || infiniteLoading.loading || rows.length === 0) return;
    const visibleRowEnd = range.y + range.height;
    if (visibleRowEnd >= rows.length - NORMAL_INFINITE_LOAD_THRESHOLD_ROWS) {
      onLoadMore();
    }
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
  const activeFilterColumn = filterPopup ? visibleGridColumns[filterPopup.columnIndex] : undefined;
  const filterPopupStyle = useMemo<CSSProperties | undefined>(() => {
    if (!filterPopup) return undefined;
    return {
      left: filterPopup.left,
      top: filterPopup.top,
    };
  }, [filterPopup]);
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
  useEffect(() => {
    if (!activeRowId) {
      setActiveCell(null);
      return;
    }
    setActiveCell((current) => {
      const currentRow = current ? rows[current[1]] : undefined;
      if (currentRow?.id === activeRowId) return current;
      const rowIndex = rows.findIndex((row) => row.id === activeRowId);
      if (rowIndex < 0 || visibleGridColumns.length === 0) return current;
      const columnIndex = Math.min(
        Math.max(current?.[0] ?? 0, 0),
        visibleGridColumns.length - 1,
      );
      return [columnIndex, rowIndex] as Item;
    });
  }, [activeRowId, rows, visibleGridColumns.length]);
  useEffect(() => {
    if (!editingCell) return undefined;
    const frameId = window.requestAnimationFrame(() => {
      const editor = cellEditorElementRef.current;
      editor?.focus({ preventScroll: true });
      if (editor instanceof HTMLInputElement) editor.select();
    });
    return () => window.cancelAnimationFrame(frameId);
  }, [editingCell]);
  const pageConfig = paginationConfig(pagination);
  const showOffsetPagination = !infiniteLoading && !!pageConfig
    && !(pageConfig.hideOnSinglePage && Number(pageConfig.total ?? 0) <= Number(pageConfig.pageSize ?? 0));

  if (rows.length === 0) {
    return (
      <div ref={rootRef} className={`calc-spreadsheet heatcalc-spreadsheet calc-spreadsheet--${fontSizeKey} calc-spreadsheet--glide calc-spreadsheet--normal-glide${className ? ` ${className}` : ''}`}>
        <div className="excel-virtual-empty">
          {emptyContent}
        </div>
      </div>
    );
  }

  return (
    <div
      ref={rootRef}
      className={`calc-spreadsheet heatcalc-spreadsheet calc-spreadsheet--${fontSizeKey} calc-spreadsheet--glide calc-spreadsheet--normal-glide${className ? ` ${className}` : ''}`}
      data-glide-row-marker-width={NORMAL_ROW_MARKER_WIDTH}
      data-glide-row-height={rowHeight}
      data-glide-visible-columns={visibleColumnWidthSignature}
    >
      <DataEditor
        className="heatcalc-glide-editor"
        ref={editorRef}
        width={editorWidth}
        height={tableScrollY}
        columns={editorColumns}
        rows={rows.length}
        rowMarkers={{
          kind: 'checkbox-visible',
          checkboxStyle: 'square',
          width: NORMAL_ROW_MARKER_WIDTH,
          startIndex: rowMarkerStartIndex,
        }}
        rowHeight={rowHeight}
        headerHeight={rowHeight + 8}
        minColumnWidth={NORMAL_GLIDE_MIN_COLUMN_WIDTH}
        maxColumnWidth={NORMAL_GLIDE_MAX_COLUMN_WIDTH}
        smoothScrollX
        smoothScrollY
        verticalBorder
        getCellContent={getCellContent}
        drawCell={drawCell}
        drawHeader={drawHeader}
        gridSelection={gridSelection}
        onGridSelectionChange={handleGridSelectionChange}
        onCellClicked={handleCellClicked}
        onCellActivated={handleCellActivated}
        onCellEdited={handleCellEdited}
        onHeaderClicked={handleHeaderClicked}
        onHeaderContextMenu={openFilterPopup}
        onItemHovered={handleItemHovered}
        onVisibleRegionChanged={handleVisibleRegionChanged}
        onColumnResize={onColumnResize ? handleColumnResize : undefined}
        onColumnResizeEnd={onColumnResizeEnd ? handleColumnResizeEnd : undefined}
        rowSelect="multi"
        rowSelectionMode="multi"
        rangeSelect="cell"
        columnSelect="none"
        onRowMoved={onRowMoved}
        getRowThemeOverride={(rowIndex) => {
          const record = rows[rowIndex];
          if (!record) return undefined;
          const className = rowClassName(record);
          return normalRowThemeOverride(className, record.id === activeRowId);
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
        editingCell.editor === 'select' && editingCell.options?.length ? (
          <select
            ref={setCellEditorElement}
            data-testid="heatcalc-normal-glide-cell-editor"
            className="heatcalc-glide-cell-editor"
            value={editingCell.value}
            style={{
              left: editingCell.bounds.x,
              top: editingCell.bounds.y,
              width: editingCell.bounds.width,
              height: editingCell.bounds.height,
            }}
            aria-invalid={editingCell.error ? true : undefined}
            title={editingCell.error ?? undefined}
            onPointerDown={(event) => event.stopPropagation()}
            onClick={(event) => event.stopPropagation()}
            onChange={(event) => {
              const value = event.target.value;
              setEditingCell((current) => (current ? { ...current, value, error: null } : current));
              const modelCell = getModelCell(editingCell.cell[0], editingCell.cell[1]);
              if (modelCell?.state.editable) {
                const error = onCommitCell(
                  modelCell.record,
                  modelCell.column.key,
                  selectedOptionValue(value, editingCell.options),
                );
                setEditingCell((current) => (current ? { ...current, error } : current));
              }
            }}
            onBlur={commitNormalEditor}
            onKeyDown={(event) => {
              if (event.key === 'Enter') {
                event.preventDefault();
                event.stopPropagation();
                commitNormalEditor();
              }
              if (event.key === 'Escape') {
                event.preventDefault();
                event.stopPropagation();
                setEditingCell(null);
              }
            }}
          >
            {editingCell.options.map((option) => (
              <option key={String(option.value)} value={String(option.value)}>
                {option.label}
              </option>
            ))}
          </select>
        ) : (
          <input
            ref={setCellEditorElement}
            data-testid="heatcalc-normal-glide-cell-editor"
            className="heatcalc-glide-cell-editor"
            type={editingCell.editor === 'number' ? 'number' : 'text'}
            inputMode={editingCell.editor === 'number' ? 'decimal' : undefined}
            step={editingCell.step ?? (editingCell.editor === 'number' ? 'any' : undefined)}
            value={editingCell.value}
            style={{
              left: editingCell.bounds.x,
              top: editingCell.bounds.y,
              width: editingCell.bounds.width,
              height: editingCell.bounds.height,
            }}
            aria-invalid={editingCell.error ? true : undefined}
            title={editingCell.error ?? undefined}
            onPointerDown={(event) => event.stopPropagation()}
            onClick={(event) => event.stopPropagation()}
            onChange={(event) => {
              const value = event.target.value;
              setEditingCell((current) => (current ? { ...current, value, error: null } : current));
            }}
            onBlur={commitNormalEditor}
            onKeyDown={(event) => {
              if (event.key === 'Enter') {
                event.preventDefault();
                event.stopPropagation();
                commitNormalEditor();
              }
              if (event.key === 'Escape') {
                event.preventDefault();
                event.stopPropagation();
                setEditingCell(null);
              }
            }}
          />
        )
      )}
      {showOffsetPagination && pageConfig && (
        <div className="heatcalc-normal-glide-pagination">
          <Pagination
            size={pageConfig.size === 'small' ? 'small' : 'default'}
            current={pageConfig.current}
            pageSize={pageConfig.pageSize}
            total={pageConfig.total}
            showSizeChanger={false}
            onChange={onPageChange}
          />
        </div>
      )}
      {filterPopup && activeFilterColumn && activeFilterColumn.filterable && (
        <div ref={filterPopupRef} className="heatcalc-normal-glide-filter-popup" style={filterPopupStyle}>
          {renderFilterDropdown ? renderFilterDropdown({
            column: activeFilterColumn,
            filter: tableViewState.filters[activeFilterColumn.key],
            onApply: (filter) => onSetColumnFilter(activeFilterColumn.key, filter),
            onReset: () => onResetColumnFilter(activeFilterColumn.key),
            onClose: () => setFilterPopup(null),
          }) : (
            <ColumnFilterDropdown
              title={activeFilterColumn.label ?? activeFilterColumn.title}
              kind={activeFilterColumn.filterKind === 'boolean'
                ? 'enum'
                : activeFilterColumn.filterKind ?? 'text'}
              filter={tableViewState.filters[activeFilterColumn.key]}
              enumOptions={activeFilterColumn.enumOptions ?? []}
              onApply={(filter) => onSetColumnFilter(activeFilterColumn.key, filter)}
              onReset={() => onResetColumnFilter(activeFilterColumn.key)}
              onClose={() => setFilterPopup(null)}
            />
          )}
        </div>
      )}
    </div>
  );
}

export default memo(HeatCalcNormalGlideGrid);
