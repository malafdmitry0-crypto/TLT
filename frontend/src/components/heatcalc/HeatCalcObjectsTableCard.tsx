import { Button, Card, Table, Typography, type TableProps } from 'antd';
import { lazy, Suspense, type Key, type MouseEvent as ReactMouseEvent, type ReactNode } from 'react';
import type { ColumnType } from 'antd/es/table';

import HeatCalcExcelGrid from '@/components/heatcalc/HeatCalcExcelGrid';
import type { HeatCalcExcelCellCoordinates } from '@/hooks/useHeatCalcExcelSelection';
import type { ProjectObject } from '@/types/project';
import type { ExcelCellPosition, ExcelSelectionRange } from '@/utils/heatCalcExcelMode';
import {
  resolveHeatCalcExcelEngine,
  resolveHeatCalcNormalTableEngine,
} from '@/utils/heatCalcExcelEngine';
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
  normalPagination: TableProps<ProjectObject>['pagination'];
  activeTableViewState: HeatCalcTableViewState;
  selectedExcelPosition: HeatCalcExcelCellCoordinates | null;
  selectedExcelRowIndex: number | null;
  selectedRowKeys: string[];
  tableScrollX: number;
  tableScrollY: string;
  onExcelRowSecondaryAction: (
    record: ProjectObject,
    event: ReactMouseEvent<HTMLElement>,
  ) => void;
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
  onNormalGlideCellState: (
    record: ProjectObject,
    columnKey: string,
    rowIndex: number,
  ) => HeatCalcGlideGridCellState;
  onNormalSetColumnFilter: (columnKey: string, filter?: HeatCalcColumnFilter) => void;
  onNormalResetColumnFilter: (columnKey: string) => void;
  onNormalSetSort: (columnKey: string, direction?: 'asc' | 'desc') => void;
  onNormalPageChange: (page: number) => void;
  onOpenEditWizard: (record: ProjectObject) => void;
  onResetCurrentTableViewState: () => void;
  onSelectedRowKeysChange: (keys: string[]) => void;
  onSourceTableChange: NonNullable<TableProps<ProjectObject>['onChange']>;
  rowClassName: (record: ProjectObject) => string;
}

function renderFilterEmpty(resetCurrentTableViewState: () => void) {
  return (
    <div className="table-filter-empty">
      <Text type="secondary">Нет строк по текущим фильтрам</Text>
      <Button size="small" onClick={resetCurrentTableViewState}>
        Сбросить фильтры
      </Button>
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
  normalPagination,
  activeTableViewState,
  selectedExcelPosition,
  selectedExcelRowIndex,
  selectedRowKeys,
  tableScrollX,
  tableScrollY,
  onExcelRowSecondaryAction,
  onExcelReachScrollEnd,
  onExcelSetRangeSelection,
  onGlideCellCommit,
  onGlideCellState,
  onGlideCellStartEdit,
  onNormalGlideCellState,
  onNormalSetColumnFilter,
  onNormalResetColumnFilter,
  onNormalSetSort,
  onNormalPageChange,
  onOpenEditWizard,
  onResetCurrentTableViewState,
  onSelectedRowKeysChange,
  onSourceTableChange,
  rowClassName,
}: HeatCalcObjectsTableCardProps) {
  const excelEngine = excelModeEnabled ? resolveHeatCalcExcelEngine() : 'table';
  const normalEngine = excelModeEnabled ? 'table' : resolveHeatCalcNormalTableEngine();
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
    <Card size="small" className="workspace-table-card srs-table-wrap">
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
          />
        </Suspense>
      ) : excelModeEnabled ? (
        tableGrid
      ) : normalEngine === 'glide' ? (
        <Suspense fallback={null}>
          <HeatCalcNormalGlideGrid
            rows={dataSource}
            gridColumns={glideColumns}
            tableScrollX={tableScrollX}
            tableScrollY={tableScrollY}
            fontSizeKey={fontSizeKey}
            selectedRowKeys={selectedRowKeys}
            tableViewState={activeTableViewState}
            pagination={normalPagination}
            emptyContent={normalEmptyContent}
            rowClassName={rowClassName}
            getCellState={onNormalGlideCellState}
            onOpenEditWizard={onOpenEditWizard}
            onSelectedRowKeysChange={onSelectedRowKeysChange}
            onSetColumnFilter={onNormalSetColumnFilter}
            onResetColumnFilter={onNormalResetColumnFilter}
            onSetSort={onNormalSetSort}
            onPageChange={onNormalPageChange}
          />
        </Suspense>
      ) : (
        <Table<ProjectObject>
          className={`calc-spreadsheet calc-spreadsheet--${fontSizeKey}`}
          rowKey="id"
          size="small"
          pagination={normalPagination}
          dataSource={dataSource}
          columns={columns}
          onChange={onSourceTableChange}
          scroll={{
            x: tableScrollX,
            y: tableScrollY,
          }}
          rowSelection={{
            type: 'checkbox',
            selectedRowKeys,
            onChange: (keys: Key[]) => onSelectedRowKeysChange(keys as string[]),
            columnWidth: 36,
          }}
          rowClassName={rowClassName}
          onRow={(record) => ({
            onClick: (event) => {
              if ((event.target as HTMLElement).closest('.ant-table-selection-column')) return;
              onOpenEditWizard(record);
            },
          })}
          locale={{
            emptyText: normalEmptyContent,
          }}
        />
      )}
    </Card>
  );
}
