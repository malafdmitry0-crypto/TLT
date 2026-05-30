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
  CompactSelection,
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

import ColumnFilterDropdown from '@/pages/heatcalc/HeatCalcColumnFilterDropdown';
import type { ProjectObject } from '@/types/project';
import type {
  HeatCalcGlideGridCellAction,
  HeatCalcGlideGridCellState,
  HeatCalcGlideGridColumn,
} from '@/utils/heatCalcGlideGrid';
import { resolveTableFontSizeByKey } from '@/utils/heatCalcTableViewSettings';
import {
  isColumnFilterActive,
  type HeatCalcColumnFilter,
  type HeatCalcTableViewState,
} from '@/utils/heatCalcTableFindability';

const NORMAL_ROW_MARKER_WIDTH = 52;
const NORMAL_GLIDE_HIDDEN_COLUMN_KEYS = new Set(['index']);
const NORMAL_INFINITE_LOAD_THRESHOLD_ROWS = 12;
const NORMAL_HEADER_FILTER_HIT_WIDTH = 28;
const NORMAL_HEADER_CONTROL_PADDING = 6;
const NORMAL_HEADER_CONTROL_BG = '#f3f6f4';
const NORMAL_HEADER_CONTROL_MUTED = '#7a8b99';
const NORMAL_HEADER_CONTROL_FAINT = '#b8c2cc';
const NORMAL_HEADER_CONTROL_ACTIVE = '#1a5276';
const NORMAL_STATUS_COLUMN_KEYS = new Set(['heat_loss_status', 'electrical_status']);
const NORMAL_STATUS_BADGE_MIN_RADIUS = 6;
const NORMAL_STATUS_BADGE_MAX_RADIUS = 8;
const NORMAL_GLIDE_MIN_COLUMN_WIDTH = 48;
const NORMAL_GLIDE_MAX_COLUMN_WIDTH = 600;
const NORMAL_ACTIVE_ROW_BG = '#d6e9f5';
const NORMAL_ACTIVE_ROW_BORDER = '#1a5276';
const NORMAL_ERROR_ROW_BG = '#fff1f0';
const NORMAL_DIRTY_ROW_BG = '#fffbe6';
const NORMAL_CELL_ACTION_HEIGHT = 21;
const NORMAL_CELL_ACTION_GAP = 4;
const NORMAL_CELL_ACTION_PADDING = 6;
const NORMAL_CELL_ACTION_MIN_WIDTH = 46;
const NORMAL_CELL_ACTION_MAX_WIDTH = 68;
const NORMAL_CELL_ACTION_TEXT_WIDTH = 6.8;
const NORMAL_CELL_ACTION_BG = '#ffffff';
const NORMAL_CELL_ACTION_BORDER = '#b8c8d6';
const NORMAL_CELL_ACTION_TEXT = '#1a5276';
const NORMAL_CELL_ACTION_DISABLED_BG = '#f5f5f5';
const NORMAL_CELL_ACTION_DISABLED_BORDER = '#d9d9d9';
const NORMAL_CELL_ACTION_DISABLED_TEXT = '#8c8c8c';

type NormalStatusVisual = 'calculated' | 'error' | 'unsupported' | 'stale' | 'not_calculated';

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

function isErrorRowClassName(className: string) {
  return className.includes('row-invalid')
    || className.includes('row-excel-error')
    || className.includes('row-error');
}

function isDirtyRowClassName(className: string) {
  return className.includes('row-excel-dirty') || className.includes('row-dirty');
}

function isActiveRowClassName(className: string) {
  return className.includes('row-selected');
}

function clampNormalGlideColumnWidth(column: HeatCalcGlideGridColumn, widthPx: number) {
  return Math.max(column.minWidthPx ?? NORMAL_GLIDE_MIN_COLUMN_WIDTH, widthPx);
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

function getGridCellEditedValue(newValue: EditableGridCell): unknown {
  if (newValue.kind === GridCellKind.Number) return newValue.data;
  if ('data' in newValue) return newValue.data;
  return undefined;
}

function glideRowHeight(fontSizeKey: string) {
  const fontSize = resolveTableFontSizeByKey(fontSizeKey);
  return Math.max(26, Math.round(fontSize.fontSizePx * fontSize.lineHeight + fontSize.cellPaddingY * 2 + 11));
}

function selectedOptionValue(
  value: string,
  options: HeatCalcGlideGridCellState['options'],
) {
  return options?.find((option) => String(option.value) === value)?.value ?? value;
}

function paginationConfig(pagination: TableProps<ProjectObject>['pagination']) {
  return typeof pagination === 'object' ? pagination : null;
}

function buildRowSelection(
  rows: ProjectObject[],
  selectedRowKeys: string[],
  activeCell: Item | null,
): GridSelection {
  const selected = new Set(selectedRowKeys);
  let rowSelection = CompactSelection.empty();
  rows.forEach((row, index) => {
    if (selected.has(row.id)) rowSelection = rowSelection.add(index);
  });
  const current = activeCell && rows[activeCell[1]]
    ? {
      cell: activeCell,
      range: {
        x: activeCell[0],
        y: activeCell[1],
        width: 1,
        height: 1,
      },
      rangeStack: [],
    }
    : undefined;
  return {
    current,
    columns: CompactSelection.empty(),
    rows: rowSelection,
  };
}

function normalRowMarkerStartIndex(pagination: TableProps<ProjectObject>['pagination']) {
  const pageConfig = paginationConfig(pagination);
  const current = Number(pageConfig?.current ?? 1);
  const pageSize = Number(pageConfig?.pageSize ?? 0);
  if (!Number.isFinite(current) || current < 1 || !Number.isFinite(pageSize) || pageSize < 1) return 1;
  return (current - 1) * pageSize + 1;
}

function nextSortDirection(
  tableViewState: HeatCalcTableViewState,
  columnKey: string,
): 'asc' | 'desc' | undefined {
  if (tableViewState.sort?.columnKey !== columnKey) return 'asc';
  if (tableViewState.sort.direction === 'asc') return 'desc';
  return undefined;
}

function headerControlWidth(column: HeatCalcGlideGridColumn) {
  if (!column.sortable && !column.filterable) return 0;
  return NORMAL_HEADER_CONTROL_PADDING
    + (column.sortable ? 18 : 0)
    + (column.filterable ? 22 : 0);
}

function drawTriangle(
  ctx: CanvasRenderingContext2D,
  centerX: number,
  centerY: number,
  direction: 'up' | 'down',
  color: string,
) {
  ctx.beginPath();
  if (direction === 'up') {
    ctx.moveTo(centerX, centerY - 4);
    ctx.lineTo(centerX - 4, centerY + 2);
    ctx.lineTo(centerX + 4, centerY + 2);
  } else {
    ctx.moveTo(centerX, centerY + 4);
    ctx.lineTo(centerX - 4, centerY - 2);
    ctx.lineTo(centerX + 4, centerY - 2);
  }
  ctx.closePath();
  ctx.fillStyle = color;
  ctx.fill();
}

function drawSortIndicator(
  ctx: CanvasRenderingContext2D,
  centerX: number,
  centerY: number,
  direction?: 'asc' | 'desc',
) {
  drawTriangle(
    ctx,
    centerX,
    centerY - 4,
    'up',
    direction === 'asc' ? NORMAL_HEADER_CONTROL_ACTIVE : NORMAL_HEADER_CONTROL_FAINT,
  );
  drawTriangle(
    ctx,
    centerX,
    centerY + 4,
    'down',
    direction === 'desc' ? NORMAL_HEADER_CONTROL_ACTIVE : NORMAL_HEADER_CONTROL_FAINT,
  );
}

function drawFilterIndicator(
  ctx: CanvasRenderingContext2D,
  centerX: number,
  centerY: number,
  active: boolean,
) {
  const color = active ? NORMAL_HEADER_CONTROL_ACTIVE : NORMAL_HEADER_CONTROL_MUTED;
  ctx.beginPath();
  ctx.moveTo(centerX - 6, centerY - 6);
  ctx.lineTo(centerX + 6, centerY - 6);
  ctx.lineTo(centerX + 2, centerY - 1);
  ctx.lineTo(centerX + 2, centerY + 5);
  ctx.lineTo(centerX - 2, centerY + 5);
  ctx.lineTo(centerX - 2, centerY - 1);
  ctx.closePath();
  ctx.lineWidth = 1.4;
  ctx.strokeStyle = color;
  ctx.stroke();
}

function normalStatusVisualFromValue(value: unknown): NormalStatusVisual | null {
  if (value === 'Рассчитан') return 'calculated';
  if (value === 'Ошибка') return 'error';
  if (value === 'Не применимо') return 'unsupported';
  if (value === 'Требуется пересчёт') return 'stale';
  if (value === 'Не рассчитан' || value === '—' || value === '') return 'not_calculated';
  return null;
}

function normalStatusPalette(status: NormalStatusVisual) {
  if (status === 'calculated') {
    return { fill: '#f6ffed', stroke: '#95de64', glyph: '#389e0d' };
  }
  if (status === 'error') {
    return { fill: '#fff1f0', stroke: '#ffccc7', glyph: '#cf1322' };
  }
  if (status === 'stale') {
    return { fill: '#fffbe6', stroke: '#ffe58f', glyph: '#d48806' };
  }
  if (status === 'unsupported') {
    return { fill: '#fffbe6', stroke: '#ffe58f', glyph: '#d48806' };
  }
  return { fill: '#fafafa', stroke: '#d9d9d9', glyph: '#8c8c8c' };
}

function drawNormalStatusBadge(
  ctx: CanvasRenderingContext2D,
  rect: { x: number; y: number; width: number; height: number },
  status: NormalStatusVisual,
) {
  const palette = normalStatusPalette(status);
  const centerX = rect.x + rect.width / 2;
  const centerY = rect.y + rect.height / 2;
  const radius = Math.max(
    NORMAL_STATUS_BADGE_MIN_RADIUS,
    Math.min(NORMAL_STATUS_BADGE_MAX_RADIUS, rect.height / 2 - 7),
  );
  const glyphWideOffset = radius * 0.55;
  const glyphMediumOffset = radius * 0.45;
  const checkStartOffset = radius * 0.42;
  const checkMiddleXOffset = radius * 0.12;
  const checkMiddleYOffset = radius * 0.34;

  ctx.save();
  ctx.beginPath();
  ctx.arc(centerX, centerY, radius, 0, Math.PI * 2);
  ctx.fillStyle = palette.fill;
  ctx.fill();
  ctx.lineWidth = Math.max(1.2, radius * 0.16);
  ctx.strokeStyle = palette.stroke;
  ctx.stroke();

  ctx.beginPath();
  ctx.lineWidth = Math.max(1.5, radius * 0.22);
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  ctx.strokeStyle = palette.glyph;
  if (status === 'calculated') {
    ctx.moveTo(centerX - checkStartOffset, centerY);
    ctx.lineTo(centerX - checkMiddleXOffset, centerY + checkMiddleYOffset);
    ctx.lineTo(centerX + glyphWideOffset, centerY - glyphMediumOffset);
  } else if (status === 'error') {
    ctx.moveTo(centerX - glyphMediumOffset, centerY - glyphMediumOffset);
    ctx.lineTo(centerX + glyphMediumOffset, centerY + glyphMediumOffset);
    ctx.moveTo(centerX + glyphMediumOffset, centerY - glyphMediumOffset);
    ctx.lineTo(centerX - glyphMediumOffset, centerY + glyphMediumOffset);
  } else if (status === 'stale') {
    ctx.arc(centerX, centerY, radius * 0.45, -Math.PI * 0.15, Math.PI * 1.35);
    ctx.moveTo(centerX + radius * 0.14, centerY - radius * 0.62);
    ctx.lineTo(centerX + radius * 0.58, centerY - radius * 0.55);
    ctx.lineTo(centerX + radius * 0.42, centerY - radius * 0.15);
  } else {
    ctx.moveTo(centerX - glyphWideOffset, centerY);
    ctx.lineTo(centerX + glyphWideOffset, centerY);
  }
  ctx.stroke();
  ctx.restore();
}

function normalRowThemeOverride(className: string, active: boolean) {
  const baseTheme = {
    accentColor: NORMAL_ACTIVE_ROW_BORDER,
    accentLight: '#dbeeff',
  };
  if (isErrorRowClassName(className)) {
    return active ? { ...baseTheme, bgCell: NORMAL_ERROR_ROW_BG } : { bgCell: NORMAL_ERROR_ROW_BG };
  }
  if (isDirtyRowClassName(className)) {
    return active ? { ...baseTheme, bgCell: NORMAL_DIRTY_ROW_BG } : { bgCell: NORMAL_DIRTY_ROW_BG };
  }
  if (active || isActiveRowClassName(className)) {
    return { ...baseTheme, bgCell: NORMAL_ACTIVE_ROW_BG };
  }
  return undefined;
}

function drawActiveNormalRowBorder(
  ctx: CanvasRenderingContext2D,
  rect: { x: number; y: number; width: number; height: number },
  columnIndex: number,
  columnCount: number,
) {
  const top = Math.floor(rect.y) + 0.5;
  const bottom = Math.floor(rect.y + rect.height) - 0.5;
  const left = Math.floor(rect.x) + 0.5;
  const right = Math.floor(rect.x + rect.width) - 0.5;

  ctx.save();
  ctx.strokeStyle = NORMAL_ACTIVE_ROW_BORDER;
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(left, top);
  ctx.lineTo(right, top);
  ctx.moveTo(left, bottom);
  ctx.lineTo(right, bottom);
  if (columnIndex === 0) {
    ctx.moveTo(left, top);
    ctx.lineTo(left, bottom);
  }
  if (columnIndex === columnCount - 1) {
    ctx.moveTo(right, top);
    ctx.lineTo(right, bottom);
  }
  ctx.stroke();
  ctx.restore();
}

function normalCellActionWidth(action: HeatCalcGlideGridCellAction) {
  return Math.max(
    NORMAL_CELL_ACTION_MIN_WIDTH,
    Math.min(NORMAL_CELL_ACTION_MAX_WIDTH, Math.ceil(action.label.length * NORMAL_CELL_ACTION_TEXT_WIDTH + 18)),
  );
}

function normalCellActionRects(
  actions: HeatCalcGlideGridCellAction[] | undefined,
  width: number,
  height: number,
) {
  if (!actions?.length) return [];
  const widths = actions.map(normalCellActionWidth);
  const totalWidth = widths.reduce((sum, actionWidth) => sum + actionWidth, 0)
    + NORMAL_CELL_ACTION_GAP * Math.max(0, widths.length - 1);
  let left = Math.max(
    NORMAL_CELL_ACTION_PADDING,
    width - NORMAL_CELL_ACTION_PADDING - totalWidth,
  );
  const top = Math.max(2, Math.floor((height - NORMAL_CELL_ACTION_HEIGHT) / 2));
  return actions.map((action, index) => {
    const actionWidth = widths[index];
    const rect = {
      action,
      x: left,
      y: top,
      width: actionWidth,
      height: NORMAL_CELL_ACTION_HEIGHT,
    };
    left += actionWidth + NORMAL_CELL_ACTION_GAP;
    return rect;
  });
}

function findNormalCellActionAt(
  actions: HeatCalcGlideGridCellAction[] | undefined,
  event: CellClickedEventArgs,
) {
  if (!actions?.length) return undefined;
  const bounds = (event as { bounds?: { x?: number; y?: number; width: number; height: number } }).bounds;
  if (!bounds || bounds.width <= 0 || bounds.height <= 0) return undefined;
  const rawLocalX = typeof (event as { localEventX?: unknown }).localEventX === 'number'
    ? (event as { localEventX: number }).localEventX
    : null;
  const rawLocalY = typeof (event as { localEventY?: unknown }).localEventY === 'number'
    ? (event as { localEventY: number }).localEventY
    : null;
  const localX = rawLocalX == null
    ? bounds.width / 2
    : rawLocalX >= 0 && rawLocalX <= bounds.width
      ? rawLocalX
      : bounds.x != null && rawLocalX >= bounds.x && rawLocalX <= bounds.x + bounds.width
        ? rawLocalX - bounds.x
        : rawLocalX - (bounds.x ?? 0);
  const localY = rawLocalY == null
    ? bounds.height / 2
    : rawLocalY >= 0 && rawLocalY <= bounds.height
      ? rawLocalY
      : bounds.y != null && rawLocalY >= bounds.y && rawLocalY <= bounds.y + bounds.height
        ? rawLocalY - bounds.y
        : rawLocalY - (bounds.y ?? 0);

  return normalCellActionRects(actions, bounds.width, bounds.height)
    .find((rect) =>
      localX >= rect.x
      && localX <= rect.x + rect.width
      && localY >= rect.y
      && localY <= rect.y + rect.height,
    )?.action;
}

function drawNormalCellActions(
  ctx: CanvasRenderingContext2D,
  rect: { x: number; y: number; width: number; height: number },
  actions: HeatCalcGlideGridCellAction[] | undefined,
) {
  const actionRects = normalCellActionRects(actions, rect.width, rect.height);
  if (actionRects.length === 0) return;

  ctx.save();
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.font = '11px inherit';
  for (const actionRect of actionRects) {
    const left = Math.floor(rect.x + actionRect.x) + 0.5;
    const top = Math.floor(rect.y + actionRect.y) + 0.5;
    const disabled = actionRect.action.disabled;
    ctx.fillStyle = disabled ? NORMAL_CELL_ACTION_DISABLED_BG : NORMAL_CELL_ACTION_BG;
    ctx.strokeStyle = disabled ? NORMAL_CELL_ACTION_DISABLED_BORDER : NORMAL_CELL_ACTION_BORDER;
    ctx.lineWidth = 1;
    ctx.fillRect(left, top, actionRect.width, actionRect.height);
    ctx.strokeRect(left, top, actionRect.width, actionRect.height);
    ctx.fillStyle = disabled ? NORMAL_CELL_ACTION_DISABLED_TEXT : NORMAL_CELL_ACTION_TEXT;
    ctx.fillText(
      actionRect.action.label,
      left + actionRect.width / 2,
      top + actionRect.height / 2 + 0.5,
    );
  }
  ctx.restore();
}

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
    [stretchedColumnWidths, tableViewState, visibleGridColumns],
  );
  const gridSelection = useMemo(
    () => buildRowSelection(rows, selectedRowKeys, activeCell),
    [activeCell, rows, selectedRowKeys],
  );
  const setCellEditorElement = useCallback((element: HTMLInputElement | HTMLSelectElement | null) => {
    cellEditorElementRef.current = element;
  }, []);
  const getModelCell = useCallback((columnIndex: number, rowIndex: number) => {
    const column = visibleGridColumns[columnIndex];
    const record = rows[rowIndex];
    if (!column || !record) return null;
    return {
      column,
      record,
      state: getCellState(record, column.key, rowIndex),
    };
  }, [getCellState, rows, visibleGridColumns]);
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
      syncActiveRecordFromCell(currentCell);
    }
  }, [onSelectedRowKeysChange, rows, syncActiveRecordFromCell]);
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
  }, [filterPopup?.columnIndex, hoveredHeaderColumnIndex, tableViewState, visibleGridColumns]);
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

    const updateContainerWidth = () => {
      setContainerWidth(Math.floor(element.getBoundingClientRect().width));
    };

    updateContainerWidth();
    if (typeof ResizeObserver === 'undefined') {
      window.addEventListener('resize', updateContainerWidth);
      return () => window.removeEventListener('resize', updateContainerWidth);
    }

    const observer = new ResizeObserver(updateContainerWidth);
    observer.observe(element);
    return () => observer.disconnect();
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
    <div ref={rootRef} className={`calc-spreadsheet heatcalc-spreadsheet calc-spreadsheet--${fontSizeKey} calc-spreadsheet--glide calc-spreadsheet--normal-glide${className ? ` ${className}` : ''}`}>
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
