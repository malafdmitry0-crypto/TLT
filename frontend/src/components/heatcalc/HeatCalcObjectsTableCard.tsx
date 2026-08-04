import { Typography, type TableProps } from 'antd';
import { lazy, Suspense, type ReactNode } from 'react';
import type { ColumnType } from 'antd/es/table';

import { TltButton, TltCard } from '@/components/ui-kit';
import type { HeatCalcContextMenuTrigger } from '@/components/heatcalc/HeatCalcContextMenuTrigger';
import HeatCalcExcelGrid from '@/components/heatcalc/HeatCalcExcelGrid';
import type { HeatCalcExcelCellCoordinates } from '@/hooks/useHeatCalcExcelSelection';
import type { ProjectObject } from '@/types/project';
import type { ExcelCellPosition, ExcelSelectionRange } from '@/utils/heatCalcExcelMode';
import { resolveHeatCalcExcelEngine } from '@/utils/heatCalcExcelEngine';
import type {
  HeatCalcNormalGlideDraftInvalidator,
} from '@/components/heatcalc/HeatCalcNormalGlideGrid';
import type {
  HeatCalcGlideGridCellState,
  HeatCalcGlideGridColumn,
} from '@/utils/heatCalcGlideGrid';
import type {
  HeatCalcColumnFilter,
  HeatCalcTableViewState,
} from '@/utils/heatCalcTableFindability';
import type { HeatCalcObjectType } from '@/utils/heatCalcTableColumns';

const { Text } = Typography;
const HeatCalcGlideGrid = lazy(() => import('@/components/heatcalc/HeatCalcGlideGrid'));
const HeatCalcNormalGlideGrid = lazy(() => import('@/components/heatcalc/HeatCalcNormalGlideGrid'));

type ActiveObjectScope = HeatCalcObjectType | 'all';

export interface HeatCalcNormalInfiniteLoading {
  loaded: number;
  total: number;
  hasNextPage: boolean;
  loading?: boolean;
}

interface HeatCalcObjectsTableCardProps {
  activeObjectScope: ActiveObjectScope;
  activeTypeTotalCount: number;
  columns: ColumnType<ProjectObject>[];
  currentTableViewActive: boolean;
  dataSource: ProjectObject[];
  excelModeEnabled: boolean;
  excelSelectionRange: ExcelSelectionRange | null;
  fontSizeKey: string;
  glideColumns: HeatCalcGlideGridColumn[];
  normalInfiniteLoading: HeatCalcNormalInfiniteLoading | null;
  normalPagination: TableProps<ProjectObject>['pagination'];
  activeTableViewState: HeatCalcTableViewState;
  selectedExcelPosition: HeatCalcExcelCellCoordinates | null;
  selectedExcelRowIndex: number | null;
  selectedRowKeys: string[];
  tableScrollX: number;
  tableScrollY: string;
  activeRowId: string | null;
  // Method form: bivariant params — React MouseEvent handlers remain assignable.
  onExcelRowSecondaryAction(record: ProjectObject, event: HeatCalcContextMenuTrigger): void;
  onExcelReachScrollEnd: () => void;
  onExcelSetRangeSelection: (
    anchor: ExcelCellPosition,
    focus: ExcelCellPosition,
    active?: ExcelCellPosition,
  ) => void;
  onGlideCellCommit: (record: ProjectObject, columnKey: string, value: unknown) => string | null;
  onGlideCellState: (
    record: ProjectObject,
    columnKey: string,
    rowIndex: number,
  ) => HeatCalcGlideGridCellState;
  onGlideCellStartEdit: (record: ProjectObject, columnKey: string) => void;
  onGlideColumnResize: (columnKey: string, widthPx: number) => void;
  onGlideColumnResizeEnd: (columnKey: string, widthPx: number) => void;
  onNormalGlideCellState: (
    record: ProjectObject,
    columnKey: string,
    rowIndex: number,
  ) => HeatCalcGlideGridCellState;
  onNormalSetColumnFilter: (columnKey: string, filter?: HeatCalcColumnFilter) => void;
  onNormalResetColumnFilter: (columnKey: string) => void;
  onNormalSetSort: (columnKey: string, direction?: 'asc' | 'desc') => void;
  onNormalLoadMore: () => void;
  onNormalPageChange: (page: number) => void;
  onRegisterNormalDraftInvalidator?: (invalidateRows: HeatCalcNormalGlideDraftInvalidator) => () => void;
  onOpenEditWizard: (record: ProjectObject) => void;
  onResetCurrentTableViewState: () => void;
  onSelectedRowKeysChange: (keys: string[]) => void;
  /** PDF-HEAT-08 row DnD on normal Glide grid. */
  onRowMoved?: (startIndex: number, endIndex: number) => void;
  rowClassName: (record: ProjectObject) => string;
}

function renderFilterEmpty(resetCurrentTableViewState: () => void) {
  return (
    <div className="table-filter-empty">
      <Text type="secondary">Нет строк по текущим фильтрам</Text>
      <TltButton size="compact" onClick={resetCurrentTableViewState}>
        Сбросить фильтры
      </TltButton>
    </div>
  );
}

function getExcelEmptyContent({
  activeObjectScope,
  activeTypeTotalCount,
  currentTableViewActive,
  onResetCurrentTableViewState,
}: Pick<
  HeatCalcObjectsTableCardProps,
  'activeObjectScope' | 'activeTypeTotalCount' | 'currentTableViewActive' | 'onResetCurrentTableViewState'
>): ReactNode {
  if (currentTableViewActive && activeTypeTotalCount > 0) {
    return renderFilterEmpty(onResetCurrentTableViewState);
  }
  return (
    <Text type="secondary">
      {activeObjectScope === 'pipe'
        ? 'Трубопроводы не добавлены. Нажмите «+» или вставьте данные в Excel-режим.'
        : 'Резервуары не добавлены. Нажмите «+» или вставьте данные в Excel-режим.'}
    </Text>
  );
}

function getNormalEmptyContent({
  activeObjectScope,
  activeTypeTotalCount,
  currentTableViewActive,
  onResetCurrentTableViewState,
}: Pick<
  HeatCalcObjectsTableCardProps,
  'activeObjectScope' | 'activeTypeTotalCount' | 'currentTableViewActive' | 'onResetCurrentTableViewState'
>): ReactNode {
  if (currentTableViewActive && activeTypeTotalCount > 0) {
    return renderFilterEmpty(onResetCurrentTableViewState);
  }
  return (
    <Text type="secondary">
      {activeObjectScope === 'all'
        ? 'Объекты не добавлены. Нажмите «+» или импортируйте XLSX/CSV.'
        : activeObjectScope === 'pipe'
          ? 'Трубопроводы не добавлены. Нажмите «+» или импортируйте XLSX/CSV.'
          : 'Резервуары не добавлены. Нажмите «+» или импортируйте XLSX/CSV.'}
    </Text>
  );
}

export default function HeatCalcObjectsTableCard({
  activeObjectScope,
  activeTypeTotalCount,
  columns,
  currentTableViewActive,
  dataSource,
  excelModeEnabled,
  excelSelectionRange,
  fontSizeKey,
  glideColumns,
  normalInfiniteLoading,
  normalPagination,
  activeTableViewState,
  selectedExcelPosition,
  selectedExcelRowIndex,
  selectedRowKeys,
  tableScrollX,
  tableScrollY,
  activeRowId,
  onExcelRowSecondaryAction,
  onExcelReachScrollEnd,
  onExcelSetRangeSelection,
  onGlideCellCommit,
  onGlideCellState,
  onGlideCellStartEdit,
  onGlideColumnResize,
  onGlideColumnResizeEnd,
  onNormalGlideCellState,
  onNormalSetColumnFilter,
  onNormalResetColumnFilter,
  onNormalSetSort,
  onNormalLoadMore,
  onNormalPageChange,
  onRegisterNormalDraftInvalidator,
  onOpenEditWizard,
  onResetCurrentTableViewState,
  onSelectedRowKeysChange,
  onRowMoved,
  rowClassName,
}: HeatCalcObjectsTableCardProps) {
  const excelEngine = excelModeEnabled ? resolveHeatCalcExcelEngine() : 'table';
  const excelEmptyContent = excelModeEnabled
    ? getExcelEmptyContent({
      activeObjectScope,
      activeTypeTotalCount,
      currentTableViewActive,
      onResetCurrentTableViewState,
    })
    : null;

  const tableGrid = excelModeEnabled ? (
    <HeatCalcExcelGrid
      rows={dataSource}
      columns={columns}
      tableScrollX={tableScrollX}
      tableScrollY={tableScrollY}
      fontSizeKey={fontSizeKey}
      selectedRowIndex={selectedExcelRowIndex}
      emptyContent={excelEmptyContent}
      rowClassName={rowClassName}
      onRowSecondaryAction={onExcelRowSecondaryAction}
      onReachScrollEnd={onExcelReachScrollEnd}
    />
  ) : null;
  const normalEmptyContent = getNormalEmptyContent({
    activeObjectScope,
    activeTypeTotalCount,
    currentTableViewActive,
    onResetCurrentTableViewState,
  });

  return (
    <TltCard padding="compact" className="workspace-table-card srs-table-wrap">
      {excelModeEnabled && excelEngine === 'glide' ? (
        <Suspense fallback={tableGrid}>
          <HeatCalcGlideGrid
            rows={dataSource}
            columns={columns}
            tableScrollX={tableScrollX}
            tableScrollY={tableScrollY}
            fontSizeKey={fontSizeKey}
            gridColumns={glideColumns}
            selectedRowIndex={selectedExcelRowIndex}
            selectedPosition={selectedExcelPosition}
            selectionRange={excelSelectionRange}
            emptyContent={excelEmptyContent}
            rowClassName={rowClassName}
            getCellState={onGlideCellState}
            onRowSecondaryAction={onExcelRowSecondaryAction}
            onReachScrollEnd={onExcelReachScrollEnd}
            onSetRangeSelection={onExcelSetRangeSelection}
            onStartCellEdit={onGlideCellStartEdit}
            onCommitCell={onGlideCellCommit}
            onColumnResize={onGlideColumnResize}
            onColumnResizeEnd={onGlideColumnResizeEnd}
          />
        </Suspense>
      ) : excelModeEnabled ? (
        tableGrid
      ) : (
        <Suspense fallback={null}>
          <HeatCalcNormalGlideGrid
            rows={dataSource}
            gridColumns={glideColumns}
            tableScrollX={tableScrollX}
            tableScrollY={tableScrollY}
            fillAvailableWidth
            fontSizeKey={fontSizeKey}
            activeRowId={activeRowId}
            selectedRowKeys={selectedRowKeys}
            tableViewState={activeTableViewState}
            infiniteLoading={normalInfiniteLoading}
            pagination={normalPagination}
            emptyContent={normalEmptyContent}
            rowClassName={rowClassName}
            getCellState={onNormalGlideCellState}
            onOpenEditWizard={onOpenEditWizard}
            onSelectedRowKeysChange={onSelectedRowKeysChange}
            onStartCellEdit={onGlideCellStartEdit}
            onCommitCell={onGlideCellCommit}
            onSetColumnFilter={onNormalSetColumnFilter}
            onResetColumnFilter={onNormalResetColumnFilter}
            onSetSort={onNormalSetSort}
            onRegisterDraftInvalidator={onRegisterNormalDraftInvalidator}
            onColumnResize={onGlideColumnResize}
            onColumnResizeEnd={onGlideColumnResizeEnd}
            onPageChange={onNormalPageChange}
            onLoadMore={onNormalLoadMore}
            onRowMoved={onRowMoved}
          />
        </Suspense>
      )}
    </TltCard>
  );
}
