import { memo, type ReactNode } from 'react';
import { Pagination, type TableProps } from 'antd';
import { DataEditor } from '@glideapps/glide-data-grid';
import '@glideapps/glide-data-grid/dist/index.css';

import ColumnFilterDropdown from '@/components/heatcalc/HeatCalcColumnFilterDropdown';
import type { ProjectObject } from '@/types/project';
import {
  NORMAL_GLIDE_MAX_COLUMN_WIDTH,
  NORMAL_GLIDE_MIN_COLUMN_WIDTH,
  NORMAL_ROW_MARKER_WIDTH,
  type HeatCalcGlideGridCellState,
  type HeatCalcGlideGridColumn,
} from '@/utils/heatCalcGlideGrid';
import type {
  HeatCalcColumnFilter,
  HeatCalcTableViewState,
} from '@/utils/heatCalcTableFindability';
import {
  useHeatCalcNormalGlideController,
  type HeatCalcNormalGlideDraftInvalidator,
  type HeatCalcNormalInfiniteLoading,
} from '@/hooks/useHeatCalcNormalGlideController';

export type {
  HeatCalcNormalGlideDraftInvalidator,
  HeatCalcNormalInfiniteLoading,
} from '@/hooks/useHeatCalcNormalGlideController';

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
  const {
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
    handleColumnResize,
    handleColumnResizeEnd,
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
  } = useHeatCalcNormalGlideController({
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
    fillAvailableWidth,
  });

  const rootClassName = `calc-spreadsheet heatcalc-spreadsheet calc-spreadsheet--${fontSizeKey} calc-spreadsheet--glide calc-spreadsheet--normal-glide${className ? ` ${className}` : ''}`;

  if (rows.length === 0) {
    return (
      <div ref={rootRef} className={rootClassName}>
        <div className="excel-virtual-empty">
          {emptyContent}
        </div>
      </div>
    );
  }

  return (
    <div
      ref={rootRef}
      className={rootClassName}
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
        onColumnResize={handleColumnResize}
        onColumnResizeEnd={handleColumnResizeEnd}
        rowSelect="multi"
        rowSelectionMode="multi"
        rangeSelect="cell"
        columnSelect="none"
        onRowMoved={onRowMoved}
        getRowThemeOverride={getRowThemeOverride}
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
            onChange={(event) => handleSelectEditorChange(event.target.value)}
            onBlur={commitNormalEditor}
            onKeyDown={handleEditorKeyDown}
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
            onChange={(event) => handleTextEditorChange(event.target.value)}
            onBlur={commitNormalEditor}
            onKeyDown={handleEditorKeyDown}
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
            onClose: closeFilterPopup,
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
              onClose={closeFilterPopup}
            />
          )}
        </div>
      )}
    </div>
  );
}

export default memo(HeatCalcNormalGlideGrid);
