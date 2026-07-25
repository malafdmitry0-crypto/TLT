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
import { Menu, Spin, type MenuProps } from 'antd';
import {
  CompactSelection,
  DataEditor,
  GridCellKind,
  type CellClickedEventArgs,
  type DrawCellCallback,
  type DrawHeaderCallback,
  type GridCell,
  type GridColumn,
  type GridMouseEventArgs,
  type GridSelection,
  type HeaderClickedEventArgs,
  type Item,
} from '@glideapps/glide-data-grid';
import '@glideapps/glide-data-grid/dist/index.css';

import ElectricalGlideColumnFilterDropdown from '@/components/electrical/ElectricalGlideColumnFilterDropdown';
import type { ElectricalCandidate } from '@/types/calculation';
import type {
  HeatCalcGlideGridCellState,
  HeatCalcGlideGridColumn,
} from '@/utils/heatCalcGlideGrid';
import {
  isColumnFilterActive,
  type HeatCalcColumnFilter,
  type HeatCalcTableViewState,
} from '@/utils/heatCalcTableFindability';
import { resolveTableFontSizeByKey } from '@/utils/heatCalcTableViewSettings';
import {
  blankCell,
  drawFilterIndicator,
  drawSortIndicator,
  GLIDE_THEME,
  headerControlWidth,
  nextSortDirection,
} from '@/utils/glideGridPrimitives';
import {
  CANDIDATE_COMPARED_ROW_BG,
  CANDIDATE_DIFF_CELL_BG,
  CANDIDATE_ERROR_ROW_BG,
  CANDIDATE_GLIDE_MAX_COLUMN_WIDTH,
  CANDIDATE_GLIDE_MIN_COLUMN_WIDTH,
  CANDIDATE_HEADER_CONTROL_BG,
  CANDIDATE_HEADER_FILTER_HIT_WIDTH,
  candidateRowHeight,
  clampCandidateColumnWidth,
  drawCandidateActions,
  drawCandidateCheckbox,
  findCandidateActionAt,
  isComparedRowClassName,
  isErrorRowClassName,
} from '@/utils/electricalCandidateGlidePureModel';

interface ElectricalCandidateGlideGridProps {
  rows: ElectricalCandidate[];
  gridColumns: HeatCalcGlideGridColumn[];
  tableScrollX: number;
  tableScrollY: string;
  fontSizeKey: string;
  loading?: boolean;
  tableViewState: HeatCalcTableViewState;
  emptyContent: ReactNode;
  rowClassName: (candidate: ElectricalCandidate) => string;
  getCellState: (
    candidate: ElectricalCandidate,
    columnKey: string,
    rowIndex: number,
  ) => HeatCalcGlideGridCellState;
  onToggleMarked: (candidate: ElectricalCandidate, checked: boolean) => void;
  onCellAction: (candidate: ElectricalCandidate, columnKey: string, actionKey: string) => void;
  getActionMenuItems?: (
    candidate: ElectricalCandidate,
    columnKey: string,
    actionKey: string,
  ) => MenuProps['items'] | null | undefined;
  onSetColumnFilter: (columnKey: string, filter?: HeatCalcColumnFilter) => void;
  onResetColumnFilter: (columnKey: string) => void;
  onSetSort: (columnKey: string, direction?: 'asc' | 'desc') => void;
  onColumnResize?: (columnKey: string, widthPx: number) => void;
  onColumnResizeEnd?: (columnKey: string, widthPx: number) => void;
}

interface CandidateFilterPopupState {
  columnIndex: number;
  left: number;
  top: number;
}

interface CandidateActionMenuState {
  items: MenuProps['items'];
  left: number;
  top: number;
}

function ElectricalCandidateGlideGrid({
  rows,
  gridColumns,
  tableScrollX,
  tableScrollY,
  fontSizeKey,
  loading,
  tableViewState,
  emptyContent,
  rowClassName,
  getCellState,
  onToggleMarked,
  onCellAction,
  getActionMenuItems,
  onSetColumnFilter,
  onResetColumnFilter,
  onSetSort,
  onColumnResize,
  onColumnResizeEnd,
}: ElectricalCandidateGlideGridProps) {
  const [filterPopup, setFilterPopup] = useState<CandidateFilterPopupState | null>(null);
  const [actionMenu, setActionMenu] = useState<CandidateActionMenuState | null>(null);
  const [hoveredHeaderColumnIndex, setHoveredHeaderColumnIndex] = useState<number | null>(null);
  const filterPopupRef = useRef<HTMLDivElement | null>(null);
  const actionMenuRef = useRef<HTMLDivElement | null>(null);
  const fontSize = useMemo(() => resolveTableFontSizeByKey(fontSizeKey), [fontSizeKey]);
  const rowHeight = useMemo(() => candidateRowHeight(fontSizeKey), [fontSizeKey]);
  const editorColumns = useMemo<GridColumn[]>(
    () => gridColumns.map((column) => ({
      id: column.key,
      title: column.title || column.key,
      width: column.width,
      hasMenu: false,
      style: isColumnFilterActive(tableViewState.filters[column.key]) ? 'highlight' : 'normal',
    })),
    [gridColumns, tableViewState.filters],
  );
  const gridSelection = useMemo<GridSelection>(() => ({
    columns: CompactSelection.empty(),
    rows: CompactSelection.empty(),
  }), []);
  const getModelCell = useCallback((columnIndex: number, rowIndex: number) => {
    const column = gridColumns[columnIndex];
    const candidate = rows[rowIndex];
    if (!column || !candidate) return null;
    return {
      column,
      candidate,
      state: getCellState(candidate, column.key, rowIndex),
    };
  }, [getCellState, gridColumns, rows]);
  const getCellContent = useCallback((cell: Item): GridCell => {
    const [columnIndex, rowIndex] = cell;
    const modelCell = getModelCell(columnIndex, rowIndex);
    if (!modelCell) return blankCell();
    const { column, candidate, state } = modelCell;
    const classes = rowClassName(candidate);
    const bgCell = state.error || isErrorRowClassName(classes)
      ? CANDIDATE_ERROR_ROW_BG
      : state.dirty
        ? CANDIDATE_DIFF_CELL_BG
        : undefined;
    return {
      kind: GridCellKind.Text,
      allowOverlay: false,
      readonly: true,
      data: state.displayValue,
      displayData: column.key === 'marked' || column.key === 'actions' ? '' : state.displayValue,
      copyData: state.displayValue,
      contentAlign: state.align ?? column.align ?? 'left',
      themeOverride: bgCell ? { bgCell } : undefined,
    };
  }, [getModelCell, rowClassName]);
  const drawCell = useCallback<DrawCellCallback>((args, drawContent) => {
    drawContent();
    const column = gridColumns[args.col];
    const state = column ? getModelCell(args.col, args.row)?.state : undefined;
    if (!column || !state) return;
    if (column.key === 'marked') {
      drawCandidateCheckbox(args.ctx, args.rect, state.displayValue === '1');
      return;
    }
    if (column.key === 'actions') {
      drawCandidateActions(args.ctx, args.rect, state.actions);
    }
  }, [getModelCell, gridColumns]);
  const openFilterPopup = useCallback((columnIndex: number, event: HeaderClickedEventArgs) => {
    const column = gridColumns[columnIndex];
    if (!column?.filterable) return;
    event.preventDefault();
    setActionMenu(null);
    setFilterPopup({
      columnIndex,
      left: event.bounds.x,
      top: event.bounds.y + event.bounds.height,
    });
  }, [gridColumns]);
  const handleHeaderClicked = useCallback((columnIndex: number, event: HeaderClickedEventArgs) => {
    const column = gridColumns[columnIndex];
    if (!column) return;
    if (column.filterable && event.localEventX >= Math.max(0, event.bounds.width - CANDIDATE_HEADER_FILTER_HIT_WIDTH)) {
      openFilterPopup(columnIndex, event);
      return;
    }
    if (!column.sortable) return;
    event.preventDefault();
    setFilterPopup(null);
    setActionMenu(null);
    onSetSort(column.key, nextSortDirection(tableViewState, column.key));
  }, [gridColumns, onSetSort, openFilterPopup, tableViewState]);
  const drawHeader = useCallback<DrawHeaderCallback>((args, drawContent) => {
    drawContent();
    const column = gridColumns[args.columnIndex];
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
    ctx.fillStyle = args.theme.bgHeader ?? CANDIDATE_HEADER_CONTROL_BG;
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
  }, [filterPopup?.columnIndex, gridColumns, hoveredHeaderColumnIndex, tableViewState]);
  const handleItemHovered = useCallback((args: GridMouseEventArgs) => {
    setHoveredHeaderColumnIndex(args.kind === 'header' ? args.location[0] : null);
  }, []);
  const handleCellClicked = useCallback((cell: Item, event: CellClickedEventArgs) => {
    const modelCell = getModelCell(cell[0], cell[1]);
    if (!modelCell) return;
    event.preventDefault();
    setFilterPopup(null);
    const { candidate, column, state } = modelCell;
    if (column.key === 'marked') {
      onToggleMarked(candidate, state.displayValue !== '1');
      return;
    }
    const action = findCandidateActionAt(state.actions, event);
    if (!action || action.disabled) return;
    if (action.key === 'folder') {
      const items = getActionMenuItems?.(candidate, column.key, action.key);
      if (items?.length) {
        setActionMenu({
          items,
          left: event.bounds.x,
          top: event.bounds.y + event.bounds.height,
        });
      }
      return;
    }
    setActionMenu(null);
    onCellAction(candidate, column.key, action.key);
  }, [getActionMenuItems, getModelCell, onCellAction, onToggleMarked]);
  const handleColumnResize = useCallback((
    _column: GridColumn,
    widthPx: number,
    columnIndex: number,
  ) => {
    const column = gridColumns[columnIndex];
    if (!column || column.resizable === false) return;
    onColumnResize?.(column.key, clampCandidateColumnWidth(column, widthPx));
  }, [gridColumns, onColumnResize]);
  const handleColumnResizeEnd = useCallback((
    _column: GridColumn,
    widthPx: number,
    columnIndex: number,
  ) => {
    const column = gridColumns[columnIndex];
    if (!column || column.resizable === false) return;
    onColumnResizeEnd?.(column.key, clampCandidateColumnWidth(column, widthPx));
  }, [gridColumns, onColumnResizeEnd]);
  const activeFilterColumn = filterPopup ? gridColumns[filterPopup.columnIndex] : undefined;
  const filterPopupStyle = useMemo<CSSProperties | undefined>(() => {
    if (!filterPopup) return undefined;
    return { left: filterPopup.left, top: filterPopup.top };
  }, [filterPopup]);
  const actionMenuStyle = useMemo<CSSProperties | undefined>(() => {
    if (!actionMenu) return undefined;
    return { left: actionMenu.left, top: actionMenu.top };
  }, [actionMenu]);

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
    if (!actionMenu) return undefined;

    function handlePointerDown(event: PointerEvent) {
      const menu = actionMenuRef.current;
      if (menu && event.target instanceof Node && menu.contains(event.target)) return;
      setActionMenu(null);
    }

    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === 'Escape') setActionMenu(null);
    }

    document.addEventListener('pointerdown', handlePointerDown, true);
    document.addEventListener('keydown', handleKeyDown);
    return () => {
      document.removeEventListener('pointerdown', handlePointerDown, true);
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, [actionMenu]);

  if (rows.length === 0) {
    return (
      <div className={`electrical-cable-sizing-table electrical-candidate-spreadsheet--glide calc-spreadsheet--${fontSizeKey}`}>
        <div className="excel-virtual-empty">
          {loading ? <Spin size="small" /> : emptyContent}
        </div>
      </div>
    );
  }

  return (
    <div className={`electrical-cable-sizing-table electrical-candidate-spreadsheet--glide calc-spreadsheet--${fontSizeKey}`}>
      <DataEditor
        className="electrical-candidate-glide-editor"
        width={Math.max(640, tableScrollX)}
        height={tableScrollY}
        columns={editorColumns}
        rows={rows.length}
        rowHeight={rowHeight}
        headerHeight={rowHeight + 8}
        minColumnWidth={CANDIDATE_GLIDE_MIN_COLUMN_WIDTH}
        maxColumnWidth={CANDIDATE_GLIDE_MAX_COLUMN_WIDTH}
        smoothScrollX
        smoothScrollY
        verticalBorder
        getCellContent={getCellContent}
        drawCell={drawCell}
        drawHeader={drawHeader}
        gridSelection={gridSelection}
        onCellClicked={handleCellClicked}
        onHeaderClicked={handleHeaderClicked}
        onHeaderContextMenu={openFilterPopup}
        onItemHovered={handleItemHovered}
        onColumnResize={onColumnResize ? handleColumnResize : undefined}
        onColumnResizeEnd={onColumnResizeEnd ? handleColumnResizeEnd : undefined}
        rowMarkers="none"
        rowSelect="none"
        rangeSelect="cell"
        columnSelect="none"
        getRowThemeOverride={(rowIndex) => {
          const candidate = rows[rowIndex];
          if (!candidate) return undefined;
          const classes = rowClassName(candidate);
          if (isErrorRowClassName(classes)) return { bgCell: CANDIDATE_ERROR_ROW_BG };
          if (isComparedRowClassName(classes)) return { bgCell: CANDIDATE_COMPARED_ROW_BG };
          return undefined;
        }}
        theme={{
          accentColor: GLIDE_THEME.accent,
          accentLight: GLIDE_THEME.accentLight,
          bgCell: GLIDE_THEME.bgCell,
          bgHeader: GLIDE_THEME.bgHeader,
          borderColor: GLIDE_THEME.border,
          fontFamily: 'inherit',
          baseFontStyle: `${fontSize.fontSizePx}px inherit`,
          headerFontStyle: `600 ${fontSize.fontSizePx}px inherit`,
          textHeader: GLIDE_THEME.text,
          textDark: GLIDE_THEME.text,
        }}
      />
      {loading && (
        <div className="electrical-candidate-glide-loading">
          <Spin size="small" />
        </div>
      )}
      {activeFilterColumn && filterPopupStyle && (
        <div
          ref={filterPopupRef}
          className="heatcalc-glide-filter-popup"
          style={filterPopupStyle}
        >
          <ElectricalGlideColumnFilterDropdown
            title={activeFilterColumn.label ?? activeFilterColumn.title}
            kind={activeFilterColumn.filterKind ?? 'text'}
            filter={tableViewState.filters[activeFilterColumn.key]}
            enumOptions={activeFilterColumn.enumOptions ?? []}
            onApply={(filter) => {
              onSetColumnFilter(activeFilterColumn.key, filter);
              setFilterPopup(null);
            }}
            onReset={() => {
              onResetColumnFilter(activeFilterColumn.key);
              setFilterPopup(null);
            }}
            onClose={() => setFilterPopup(null)}
          />
        </div>
      )}
      {actionMenu && actionMenuStyle && (
        <div
          ref={actionMenuRef}
          className="electrical-candidate-glide-action-menu"
          style={actionMenuStyle}
        >
          <Menu
            selectable={false}
            items={actionMenu.items}
            onClick={() => setActionMenu(null)}
          />
        </div>
      )}
    </div>
  );
}

export default memo(ElectricalCandidateGlideGrid);
