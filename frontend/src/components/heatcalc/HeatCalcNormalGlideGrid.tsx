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

function columnTitle(column: HeatCalcGlideGridColumn, tableViewState: HeatCalcTableViewState) {
  const sort = tableViewState.sort?.columnKey === column.key
    ? tableViewState.sort.direction === 'asc'
      ? ' ↑'
      : ' ↓'
    : '';
  const filtered = isColumnFilterActive(tableViewState.filters[column.key]) ? ' •' : '';
  return `${column.title}${sort}${filtered}`;
}

function nextSortDirection(
  tableViewState: HeatCalcTableViewState,
  columnKey: string,
): 'asc' | 'desc' | undefined {
  if (tableViewState.sort?.columnKey !== columnKey) return 'asc';
  if (tableViewState.sort.direction === 'asc') return 'desc';
  return undefined;
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
  const editorColumns = useMemo<GridColumn[]>(
    () => gridColumns.map((column) => ({
      id: column.key,
      title: columnTitle(column, tableViewState) || column.key,
      width: column.width,
      hasMenu: column.filterable,
      style: isColumnFilterActive(tableViewState.filters[column.key]) ? 'highlight' : 'normal',
    })),
    [gridColumns, tableViewState],
  );
  const gridSelection = useMemo(
    () => buildRowSelection(rows, selectedRowKeys),
    [rows, selectedRowKeys],
  );
  const getCellContent = useCallback((cell: Item): GridCell => {
    const [columnIndex, rowIndex] = cell;
    const column = gridColumns[columnIndex];
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
  }, [getCellState, gridColumns, rowClassName, rows]);
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
    const column = gridColumns[columnIndex];
    if (!column?.filterable) return;
    event.preventDefault();
    setFilterPopup({
      columnIndex,
      left: event.bounds.x,
      top: event.bounds.y + event.bounds.height,
    });
  }, [gridColumns]);
  const handleHeaderClicked = useCallback((columnIndex: number, event: HeaderClickedEventArgs) => {
    const column = gridColumns[columnIndex];
    if (!column) return;
    if (column.filterable && event.localEventX >= Math.max(0, event.bounds.width - 28)) {
      openFilterPopup(columnIndex, event);
      return;
    }
    if (!column.sortable) return;
    event.preventDefault();
    setFilterPopup(null);
    onSetSort(column.key, nextSortDirection(tableViewState, column.key));
  }, [gridColumns, onSetSort, openFilterPopup, tableViewState]);
  const activeFilterColumn = filterPopup ? gridColumns[filterPopup.columnIndex] : undefined;
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
        width={tableScrollX + NORMAL_ROW_MARKER_WIDTH}
        height={tableScrollY}
        columns={editorColumns}
        rows={rows.length}
        rowMarkers={{
          kind: 'checkbox-visible',
          checkboxStyle: 'square',
          width: NORMAL_ROW_MARKER_WIDTH,
        }}
        rowHeight={30}
        headerHeight={38}
        smoothScrollX
        smoothScrollY
        verticalBorder
        getCellContent={getCellContent}
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
