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
import { Pagination, Typography, type TableProps } from 'antd';
import {
  CompactSelection,
  DataEditor,
  GridCellKind,
  type CellClickedEventArgs,
  type DrawHeaderCallback,
  type GridCell,
  type GridColumn,
  type GridSelection,
  type HeaderClickedEventArgs,
  type Item,
} from '@glideapps/glide-data-grid';
import '@glideapps/glide-data-grid/dist/index.css';

import ColumnFilterDropdown from '@/pages/heatcalc/HeatCalcColumnFilterDropdown';
import type { ProjectObject } from '@/types/project';
import type {
  HeatCalcGlideGridCellState,
  HeatCalcGlideGridColumn,
} from '@/utils/heatCalcGlideGrid';
import {
  isColumnFilterActive,
  type HeatCalcColumnFilter,
  type HeatCalcTableViewState,
} from '@/utils/heatCalcTableFindability';

const { Text } = Typography;
const NORMAL_ROW_MARKER_WIDTH = 52;
const NORMAL_GLIDE_HIDDEN_COLUMN_KEYS = new Set(['index']);
const NORMAL_HEADER_FILTER_HIT_WIDTH = 28;
const NORMAL_HEADER_CONTROL_PADDING = 6;
const NORMAL_HEADER_CONTROL_BG = '#f3f6f4';
const NORMAL_HEADER_CONTROL_MUTED = '#7a8b99';
const NORMAL_HEADER_CONTROL_FAINT = '#b8c2cc';
const NORMAL_HEADER_CONTROL_ACTIVE = '#1a5276';

interface HeatCalcNormalGlideGridProps {
  rows: ProjectObject[];
  gridColumns: HeatCalcGlideGridColumn[];
  tableScrollX: number;
  tableScrollY: string;
  fontSizeKey: string;
  selectedRowKeys: string[];
  tableViewState: HeatCalcTableViewState;
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
  onSetColumnFilter: (columnKey: string, filter?: HeatCalcColumnFilter) => void;
  onResetColumnFilter: (columnKey: string) => void;
  onSetSort: (columnKey: string, direction?: 'asc' | 'desc') => void;
  onPageChange: (page: number) => void;
}

interface FilterPopupState {
  columnIndex: number;
  left: number;
  top: number;
}

function isErrorRowClassName(className: string) {
  return className.includes('row-invalid')
    || className.includes('row-excel-error')
    || className.includes('row-error');
}

function isDirtyRowClassName(className: string) {
  return className.includes('row-excel-dirty') || className.includes('row-dirty');
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

function paginationConfig(pagination: TableProps<ProjectObject>['pagination']) {
  return typeof pagination === 'object' ? pagination : null;
}

function buildRowSelection(rows: ProjectObject[], selectedRowKeys: string[]): GridSelection {
  const selected = new Set(selectedRowKeys);
  let rowSelection = CompactSelection.empty();
  rows.forEach((row, index) => {
    if (selected.has(row.id)) rowSelection = rowSelection.add(index);
  });
  return {
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

function HeatCalcNormalGlideGrid({
  rows,
  gridColumns,
  tableScrollX,
  tableScrollY,
  fontSizeKey,
  selectedRowKeys,
  tableViewState,
  pagination,
  emptyContent,
  rowClassName,
  getCellState,
  onOpenEditWizard,
  onSelectedRowKeysChange,
  onSetColumnFilter,
  onResetColumnFilter,
  onSetSort,
  onPageChange,
}: HeatCalcNormalGlideGridProps) {
  const [filterPopup, setFilterPopup] = useState<FilterPopupState | null>(null);
  const filterPopupRef = useRef<HTMLDivElement | null>(null);
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
  const rowMarkerStartIndex = useMemo(() => normalRowMarkerStartIndex(pagination), [pagination]);
  const normalTableScrollX = Math.max(640, tableScrollX - hiddenColumnWidth);
  const editorColumns = useMemo<GridColumn[]>(
    () => visibleGridColumns.map((column) => ({
      id: column.key,
      title: column.title || column.key,
      width: column.width,
      hasMenu: false,
      style: isColumnFilterActive(tableViewState.filters[column.key]) ? 'highlight' : 'normal',
    })),
    [tableViewState, visibleGridColumns],
  );
  const gridSelection = useMemo(
    () => buildRowSelection(rows, selectedRowKeys),
    [rows, selectedRowKeys],
  );
  const getCellContent = useCallback((cell: Item): GridCell => {
    const [columnIndex, rowIndex] = cell;
    const column = visibleGridColumns[columnIndex];
    const record = rows[rowIndex];
    if (!column || !record) return blankCell();
    const state = getCellState(record, column.key, rowIndex);
    const rowClasses = rowClassName(record);
    const bgCell = state.error || isErrorRowClassName(rowClasses)
      ? '#fff1f0'
      : state.dirty || isDirtyRowClassName(rowClasses)
        ? '#fffbe6'
        : undefined;
    return {
      kind: GridCellKind.Text,
      allowOverlay: false,
      readonly: true,
      data: state.displayValue,
      displayData: state.displayValue,
      copyData: state.displayValue,
      contentAlign: state.align ?? column.align ?? (state.editor === 'number' ? 'right' : 'left'),
      themeOverride: bgCell ? { bgCell } : undefined,
    };
  }, [getCellState, rowClassName, rows, visibleGridColumns]);
  const handleGridSelectionChange = useCallback((nextSelection: GridSelection) => {
    const keys = nextSelection.rows
      .toArray()
      .map((rowIndex) => rows[rowIndex]?.id)
      .filter((id): id is string => Boolean(id));
    onSelectedRowKeysChange(keys);
  }, [onSelectedRowKeysChange, rows]);
  const handleCellClicked = useCallback((cell: Item, event: CellClickedEventArgs) => {
    if (cell[0] < 0) return;
    event.preventDefault();
    const record = rows[cell[1]];
    if (record) onOpenEditWizard(record);
  }, [onOpenEditWizard, rows]);
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
  }, [tableViewState, visibleGridColumns]);
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
  const pageConfig = paginationConfig(pagination);
  const showPagination = !!pageConfig
    && !(pageConfig.hideOnSinglePage && Number(pageConfig.total ?? 0) <= Number(pageConfig.pageSize ?? 0));

  if (rows.length === 0) {
    return (
      <div className={`calc-spreadsheet calc-spreadsheet--${fontSizeKey} calc-spreadsheet--glide calc-spreadsheet--normal-glide`}>
        <div className="excel-virtual-empty">
          {emptyContent}
        </div>
      </div>
    );
  }

  return (
    <div className={`calc-spreadsheet calc-spreadsheet--${fontSizeKey} calc-spreadsheet--glide calc-spreadsheet--normal-glide`}>
      <DataEditor
        className="heatcalc-glide-editor"
        width={normalTableScrollX + NORMAL_ROW_MARKER_WIDTH}
        height={tableScrollY}
        columns={editorColumns}
        rows={rows.length}
        rowMarkers="clickable-number"
        rowMarkerWidth={NORMAL_ROW_MARKER_WIDTH}
        rowMarkerStartIndex={rowMarkerStartIndex}
        rowHeight={30}
        headerHeight={38}
        smoothScrollX
        smoothScrollY
        verticalBorder
        getCellContent={getCellContent}
        drawHeader={drawHeader}
        gridSelection={gridSelection}
        onGridSelectionChange={handleGridSelectionChange}
        onCellClicked={handleCellClicked}
        onHeaderClicked={handleHeaderClicked}
        onHeaderContextMenu={openFilterPopup}
        rowSelect="multi"
        rangeSelect="cell"
        columnSelect="none"
        getRowThemeOverride={(rowIndex) => {
          const record = rows[rowIndex];
          if (!record) return undefined;
          const className = rowClassName(record);
          if (isErrorRowClassName(className)) return { bgCell: '#fff1f0' };
          if (isDirtyRowClassName(className)) return { bgCell: '#fffbe6' };
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
      {showPagination && (
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
          <ColumnFilterDropdown
            title={activeFilterColumn.label ?? activeFilterColumn.title}
            kind={activeFilterColumn.filterKind ?? 'text'}
            filter={tableViewState.filters[activeFilterColumn.key]}
            enumOptions={activeFilterColumn.enumOptions ?? []}
            onApply={(filter) => onSetColumnFilter(activeFilterColumn.key, filter)}
            onReset={() => onResetColumnFilter(activeFilterColumn.key)}
            onClose={() => setFilterPopup(null)}
          />
        </div>
      )}
      <Text className="heatcalc-glide-engine-badge">Glide table</Text>
    </div>
  );
}

export default memo(HeatCalcNormalGlideGrid);
