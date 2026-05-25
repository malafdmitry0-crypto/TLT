import { Button, Card, Table, Typography, type TableProps } from 'antd';
import type { Key, MouseEvent as ReactMouseEvent, ReactNode } from 'react';
import type { ColumnType } from 'antd/es/table';

import HeatCalcExcelGrid from '@/components/heatcalc/HeatCalcExcelGrid';
import type { ProjectObject } from '@/types/project';
import type { HeatCalcObjectType } from '@/utils/heatCalcTableColumns';

const { Text } = Typography;

type ActiveObjectScope = HeatCalcObjectType | 'all';

interface HeatCalcObjectsTableCardProps {
  activeObjectScope: ActiveObjectScope;
  activeTypeTotalCount: number;
  columns: ColumnType<ProjectObject>[];
  currentTableViewActive: boolean;
  dataSource: ProjectObject[];
  excelModeEnabled: boolean;
  fontSizeKey: string;
  normalPagination: TableProps<ProjectObject>['pagination'];
  selectedExcelRowIndex: number | null;
  selectedRowKeys: string[];
  tableScrollX: number;
  tableScrollY: string;
  onExcelRowSecondaryAction: (
    record: ProjectObject,
    event: ReactMouseEvent<HTMLElement>,
  ) => void;
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
  fontSizeKey,
  normalPagination,
  selectedExcelRowIndex,
  selectedRowKeys,
  tableScrollX,
  tableScrollY,
  onExcelRowSecondaryAction,
  onOpenEditWizard,
  onResetCurrentTableViewState,
  onSelectedRowKeysChange,
  onSourceTableChange,
  rowClassName,
}: HeatCalcObjectsTableCardProps) {
  return (
    <Card size="small" className="workspace-table-card srs-table-wrap">
      {excelModeEnabled ? (
        <HeatCalcExcelGrid
          rows={dataSource}
          columns={columns}
          tableScrollX={tableScrollX}
          tableScrollY={tableScrollY}
          fontSizeKey={fontSizeKey}
          selectedRowIndex={selectedExcelRowIndex}
          emptyContent={getExcelEmptyContent({
            activeObjectScope,
            activeTypeTotalCount,
            currentTableViewActive,
            onResetCurrentTableViewState,
          })}
          rowClassName={rowClassName}
          onRowSecondaryAction={onExcelRowSecondaryAction}
        />
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
            emptyText: getNormalEmptyContent({
              activeObjectScope,
              activeTypeTotalCount,
              currentTableViewActive,
              onResetCurrentTableViewState,
            }),
          }}
        />
      )}
    </Card>
  );
}
