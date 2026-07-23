/**
 * @module electrical/unified-table-card
 * @owner electrical
 * @depends glide grid, assignment scope
 * @does-not heat
 *
 * Single system-filtered objects table (Glide or antd) + selection footer.
 */
import { Suspense, type ReactNode } from 'react';
import { Alert, Button, Card, Table, Typography } from 'antd';
import { ThunderboltOutlined } from '@ant-design/icons';
import type { ColumnsType, TableProps } from 'antd/es/table';

import type { ElectricalCalcSummary, ElectricalQueryAssignment } from '@/types/calculation';
import type { ProjectObject } from '@/types/project';
import type { CableTypeKey } from '@/domain/electrical/elecCalcMainTableModel';
import { objectDisplayName } from '@/domain/electrical/elecCalcMainTableModel';
import { electricalAssignmentCompatibilityReason } from '@/pages/electrical/elecCalcAssignmentScopeModel';
import {
  systemViewLabel,
  type ElectricalSystemView,
} from '@/pages/electrical/elecCalcSystemViewModel';
import { ElectricalSectionHierarchy } from '@/pages/electrical/ElectricalSectionHierarchy';
import { ROUTES } from '@/routes/routes';

const { Text } = Typography;

export type ElectricalUnifiedTableCardProps = {
  electricalPageLoaded: boolean;
  totalObjects: number;
  electricalGlideEnabled: boolean;
  scopedObjects: ProjectObject[];
  electricalGlideColumns: unknown;
  electricalTableScrollX: number | string;
  electricalTableScrollY: number | string;
  fontSizeKey: string;
  activeRowId: string | null;
  systemView: ElectricalSystemView;
  selectedRowKeys: string[];
  compatibleSelectedRowKeys: string[];
  tableViewState: unknown;
  electricalPagination: TableProps<ProjectObject>['pagination'];
  electricalInfiniteLoading: boolean | null | unknown;
  currentTableViewActive: boolean;
  electricalRowClassName: (obj: ProjectObject, index: number) => string;
  getElectricalGlideCellState: (...args: never[]) => unknown;
  openElectricalRow: (obj: ProjectObject) => void;
  handleAssignmentAwareSelectionChange: (keys: string[]) => void;
  setColumnFilter: (...args: never[]) => void;
  resetColumnFilter: (...args: never[]) => void;
  setElectricalTableSort: (...args: never[]) => void;
  applyElectricalGlideColumnDraftWidth: (...args: never[]) => void;
  commitElectricalGlideColumnWidth: (...args: never[]) => void;
  handleElectricalGlidePageChange: (...args: never[]) => void;
  handleElectricalGlideLoadMore: (...args: never[]) => void;
  handleElectricalGlideCellAction: (...args: never[]) => void;
  handleElectricalGlideStartCellEdit: (...args: never[]) => void;
  handleElectricalGlideCommitCell: (...args: never[]) => void;
  isElectricalPageFetching: boolean;
  handleElectricalTableChange: TableProps<ProjectObject>['onChange'];
  canMutate: boolean;
  handleTableRowDragStart: (event: React.DragEvent, objectId: string) => void;
  handleTableRowDragEnd: () => void;
  activateRowId: (id: string) => void;
  assignmentByObjectId: ReadonlyMap<string, ElectricalQueryAssignment>;
  cableTypeForRecalculation: CableTypeKey | null | undefined;
  electricalColumns: ColumnsType<ProjectObject>;
  calcByObjectId: Record<string, ElectricalCalcSummary | undefined>;
  calculatedCount: number;
  resetCurrentTableViewState: () => void;
  navigate: (path: string) => void;
  ElectricalGlideGrid: React.ComponentType<Record<string, unknown>>;
};

export function ElectricalUnifiedTableCard(props: ElectricalUnifiedTableCardProps): ReactNode {
  const {
    electricalPageLoaded,
    totalObjects,
    electricalGlideEnabled,
    scopedObjects,
    electricalGlideColumns,
    electricalTableScrollX,
    electricalTableScrollY,
    fontSizeKey,
    activeRowId,
    systemView,
    selectedRowKeys,
    compatibleSelectedRowKeys,
    tableViewState,
    electricalPagination,
    electricalInfiniteLoading,
    currentTableViewActive,
    electricalRowClassName,
    getElectricalGlideCellState,
    openElectricalRow,
    handleAssignmentAwareSelectionChange,
    setColumnFilter,
    resetColumnFilter,
    setElectricalTableSort,
    applyElectricalGlideColumnDraftWidth,
    commitElectricalGlideColumnWidth,
    handleElectricalGlidePageChange,
    handleElectricalGlideLoadMore,
    handleElectricalGlideCellAction,
    handleElectricalGlideStartCellEdit,
    handleElectricalGlideCommitCell,
    isElectricalPageFetching,
    handleElectricalTableChange,
    canMutate,
    handleTableRowDragStart,
    handleTableRowDragEnd,
    activateRowId,
    assignmentByObjectId,
    cableTypeForRecalculation,
    electricalColumns,
    calcByObjectId,
    calculatedCount,
    resetCurrentTableViewState,
    navigate,
    ElectricalGlideGrid,
  } = props;

  const effectiveSelectedKeys = systemView === 'unassigned'
    ? selectedRowKeys
    : compatibleSelectedRowKeys;

  const emptyFilterContent = scopedObjects.length === 0 && totalObjects > 0 ? (
    <div className="table-filter-empty">
      <Text type="secondary">
        В разделе «
        {systemViewLabel(systemView)}
        » объектов нет
      </Text>
    </div>
  ) : currentTableViewActive && totalObjects > 0 ? (
    <div className="table-filter-empty">
      <Text type="secondary">Нет строк по текущим фильтрам</Text>
      <Button size="small" onClick={resetCurrentTableViewState}>
        Сбросить фильтры
      </Button>
    </div>
  ) : undefined;

  return (
    <Card size="small" className="workspace-table-card srs-table-wrap" data-testid="electrical-unified-table">
      {electricalPageLoaded && totalObjects === 0 ? (
        <Alert
          type="warning"
          showIcon
          message="Нет объектов"
          description="Добавьте объекты на шаге «Теплопотери»."
          style={{ margin: 12 }}
        />
      ) : electricalGlideEnabled ? (
        <Suspense fallback={null}>
          <ElectricalGlideGrid
            rows={scopedObjects}
            gridColumns={electricalGlideColumns}
            tableScrollX={electricalTableScrollX}
            tableScrollY={electricalTableScrollY}
            fontSizeKey={fontSizeKey}
            activeRowId={activeRowId}
            selectedRowKeys={effectiveSelectedKeys}
            tableViewState={tableViewState}
            pagination={electricalPagination}
            infiniteLoading={electricalInfiniteLoading}
            emptyContent={emptyFilterContent}
            rowClassName={electricalRowClassName}
            getCellState={getElectricalGlideCellState}
            onOpenRow={openElectricalRow}
            onSelectedRowKeysChange={handleAssignmentAwareSelectionChange}
            onSetColumnFilter={setColumnFilter}
            onResetColumnFilter={resetColumnFilter}
            onSetSort={setElectricalTableSort}
            onColumnResize={applyElectricalGlideColumnDraftWidth}
            onColumnResizeEnd={commitElectricalGlideColumnWidth}
            onPageChange={handleElectricalGlidePageChange}
            onLoadMore={handleElectricalGlideLoadMore}
            onCellAction={handleElectricalGlideCellAction}
            onStartCellEdit={handleElectricalGlideStartCellEdit}
            onCommitCell={handleElectricalGlideCommitCell}
          />
        </Suspense>
      ) : (
        <Table<ProjectObject>
          className={`calc-spreadsheet calc-spreadsheet--${fontSizeKey} electrical-spreadsheet`}
          rowKey="id"
          size="small"
          loading={isElectricalPageFetching}
          pagination={electricalPagination}
          dataSource={scopedObjects}
          onChange={handleElectricalTableChange}
          scroll={{ x: electricalTableScrollX }}
          rowClassName={electricalRowClassName}
          onRow={(obj) => ({
            draggable: canMutate,
            onDragStart: (event) => handleTableRowDragStart(event, obj.id),
            onDragEnd: handleTableRowDragEnd,
            onClick: (event) => {
              if ((event.target as HTMLElement).closest('.ant-table-selection-column')) return;
              activateRowId(obj.id);
            },
            style: canMutate ? { cursor: 'grab' } : undefined,
            'data-testid': `electrical-object-row-${obj.id}`,
          })}
          rowSelection={{
            type: 'checkbox',
            selectedRowKeys: effectiveSelectedKeys,
            onChange: (keys) => handleAssignmentAwareSelectionChange(keys as string[]),
            getCheckboxProps: (obj) => {
              if (systemView === 'unassigned') {
                return {
                  disabled: !canMutate,
                  'aria-label': `Выбрать ${objectDisplayName(obj)} для назначения`,
                };
              }
              const reason = electricalAssignmentCompatibilityReason(
                assignmentByObjectId.get(obj.id),
                cableTypeForRecalculation,
              );
              return {
                disabled: reason != null,
                title: reason ?? undefined,
                'aria-label': reason
                  ? `${objectDisplayName(obj)}: ${reason}`
                  : `Выбрать ${objectDisplayName(obj)} для пересчёта`,
              };
            },
            columnWidth: 36,
          }}
          columns={electricalColumns}
          expandable={{
            expandedRowRender: (obj) => (
              <ElectricalSectionHierarchy calc={calcByObjectId[obj.id]} />
            ),
            rowExpandable: () => systemView !== 'unassigned',
          }}
          locale={{
            emptyText: emptyFilterContent,
          }}
        />
      )}

      <div className="electrical-table-footer">
        <Text type="secondary" className="electrical-table-footer__selection">
          Выбрано:
          {' '}
          {effectiveSelectedKeys.length}
          {' '}
          из
          {' '}
          {scopedObjects.length}
        </Text>
        {calculatedCount > 0 && (
          <Button
            size="small"
            type="link"
            icon={<ThunderboltOutlined />}
            onClick={() => navigate(ROUTES.specification)}
          >
            Спецификация →
          </Button>
        )}
      </div>
    </Card>
  );
}
