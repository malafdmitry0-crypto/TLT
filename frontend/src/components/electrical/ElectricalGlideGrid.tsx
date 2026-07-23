import { memo, useCallback, type ReactNode } from 'react';
import type { TableProps } from 'antd';

import HeatCalcNormalGlideGrid from '@/components/shared/NormalGlideGrid';
import type { HeatCalcNormalInfiniteLoading } from '@/components/shared/NormalGlideGrid';
import ElectricalGlideColumnFilterDropdown from '@/components/electrical/ElectricalGlideColumnFilterDropdown';
import type { ProjectObject } from '@/types/project';
import type {
  HeatCalcGlideGridCellState,
  HeatCalcGlideGridColumn,
} from '@/utils/heatCalcGlideGrid';
import type {
  HeatCalcColumnFilter,
  HeatCalcTableViewState,
} from '@/utils/heatCalcTableFindability';

interface ElectricalGlideGridProps {
  rows: ProjectObject[];
  gridColumns: HeatCalcGlideGridColumn[];
  tableScrollX: number;
  tableScrollY: string;
  fontSizeKey: string;
  activeRowId?: string | null;
  selectedRowKeys: string[];
  tableViewState: HeatCalcTableViewState;
  pagination: TableProps<ProjectObject>['pagination'];
  infiniteLoading?: HeatCalcNormalInfiniteLoading | null;
  emptyContent: ReactNode;
  rowClassName: (record: ProjectObject) => string;
  getCellState: (
    record: ProjectObject,
    columnKey: string,
    rowIndex: number,
  ) => HeatCalcGlideGridCellState;
  onOpenRow: (record: ProjectObject) => void;
  onSelectedRowKeysChange: (keys: string[]) => void;
  onSetColumnFilter: (columnKey: string, filter?: HeatCalcColumnFilter) => void;
  onResetColumnFilter: (columnKey: string) => void;
  onSetSort: (columnKey: string, direction?: 'asc' | 'desc') => void;
  onColumnResize?: (columnKey: string, widthPx: number) => void;
  onColumnResizeEnd?: (columnKey: string, widthPx: number) => void;
  onPageChange: (page: number) => void;
  onLoadMore: () => void;
  onCellAction?: (record: ProjectObject, columnKey: string, actionKey: string) => void;
  onStartCellEdit?: (record: ProjectObject, columnKey: string) => void;
  onCommitCell?: (record: ProjectObject, columnKey: string, value: unknown) => string | null;
}

function ElectricalGlideGrid({
  rows,
  gridColumns,
  tableScrollX,
  tableScrollY,
  fontSizeKey,
  activeRowId,
  selectedRowKeys,
  tableViewState,
  pagination,
  infiniteLoading,
  emptyContent,
  rowClassName,
  getCellState,
  onOpenRow,
  onSelectedRowKeysChange,
  onSetColumnFilter,
  onResetColumnFilter,
  onSetSort,
  onColumnResize,
  onColumnResizeEnd,
  onPageChange,
  onLoadMore,
  onCellAction,
  onStartCellEdit,
  onCommitCell,
}: ElectricalGlideGridProps) {
  const renderFilterDropdown = useCallback(({
    column,
    filter,
    onApply,
    onReset,
    onClose,
  }: {
    column: HeatCalcGlideGridColumn;
    filter?: HeatCalcColumnFilter;
    onApply: (filter?: HeatCalcColumnFilter) => void;
    onReset: () => void;
    onClose: () => void;
  }) => (
    <ElectricalGlideColumnFilterDropdown
      title={column.label ?? column.title}
      kind={column.filterKind ?? 'text'}
      filter={filter}
      enumOptions={column.enumOptions ?? []}
      onApply={onApply}
      onReset={onReset}
      onClose={onClose}
    />
  ), []);

  return (
    <HeatCalcNormalGlideGrid
      className="electrical-spreadsheet electrical-spreadsheet--glide"
      rows={rows}
      gridColumns={gridColumns}
      tableScrollX={tableScrollX}
      tableScrollY={tableScrollY}
      fontSizeKey={fontSizeKey}
      activeRowId={activeRowId}
      selectedRowKeys={selectedRowKeys}
      tableViewState={tableViewState}
      infiniteLoading={infiniteLoading ?? null}
      pagination={pagination}
      emptyContent={emptyContent}
      rowClassName={rowClassName}
      getCellState={getCellState}
      onOpenEditWizard={onOpenRow}
      onSelectedRowKeysChange={onSelectedRowKeysChange}
      onStartCellEdit={onStartCellEdit ?? (() => undefined)}
      onCommitCell={onCommitCell ?? (() => null)}
      onSetColumnFilter={onSetColumnFilter}
      onResetColumnFilter={onResetColumnFilter}
      onSetSort={onSetSort}
      onColumnResize={onColumnResize}
      onColumnResizeEnd={onColumnResizeEnd}
      onPageChange={onPageChange}
      onLoadMore={onLoadMore}
      onCellAction={onCellAction}
      fillAvailableWidth
      renderFilterDropdown={renderFilterDropdown}
    />
  );
}

export default memo(ElectricalGlideGrid);
