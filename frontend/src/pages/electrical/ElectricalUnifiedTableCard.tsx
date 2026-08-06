/**
 * @module electrical/unified-table-card
 * @owner electrical
 * @depends glide grid, assignment scope
 * @does-not heat
 *
 * Single system-filtered objects table (Glide or antd) + selection footer.
 */
import { lazy, Suspense, type ReactNode } from 'react';
import { Table, Typography } from 'antd';
import { ThunderboltOutlined } from '@ant-design/icons';
import type { ColumnsType, TableProps } from 'antd/es/table';

import type { ElectricalGlideGridProps } from '@/components/electrical/ElectricalGlideGrid';
import { TltAlert, TltButton, TltCard } from '@/components/ui-kit';
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

/** Owns Glide code-split so the workspace shell does not inject a loosely typed component. */
const ElectricalGlideGrid = lazy(() => import('@/components/electrical/ElectricalGlideGrid'));

export type ElectricalUnifiedTableCardProps = {
  electricalPageLoaded: boolean;
  totalObjects: number;
  electricalGlideEnabled: boolean;
  scopedObjects: ProjectObject[];
  electricalGlideColumns: ElectricalGlideGridProps['gridColumns'];
  electricalTableScrollX: ElectricalGlideGridProps['tableScrollX'];
  electricalTableScrollY: ElectricalGlideGridProps['tableScrollY'];
  fontSizeKey: string;
  activeRowId: string | null;
  systemView: ElectricalSystemView;
  selectedRowKeys: string[];
  compatibleSelectedRowKeys: string[];
  tableViewState: ElectricalGlideGridProps['tableViewState'];
  electricalPagination: TableProps<ProjectObject>['pagination'];
  electricalInfiniteLoading: ElectricalGlideGridProps['infiniteLoading'];
  currentTableViewActive: boolean;
  electricalRowClassName: (obj: ProjectObject) => string;
  getElectricalGlideCellState: ElectricalGlideGridProps['getCellState'];
  openElectricalRow: (obj: ProjectObject) => void;
  handleAssignmentAwareSelectionChange: (keys: string[]) => void;
  setColumnFilter: ElectricalGlideGridProps['onSetColumnFilter'];
  resetColumnFilter: ElectricalGlideGridProps['onResetColumnFilter'];
  setElectricalTableSort: ElectricalGlideGridProps['onSetSort'];
  applyElectricalGlideColumnDraftWidth: NonNullable<ElectricalGlideGridProps['onColumnResize']>;
  commitElectricalGlideColumnWidth: NonNullable<ElectricalGlideGridProps['onColumnResizeEnd']>;
  handleElectricalGlidePageChange: ElectricalGlideGridProps['onPageChange'];
  handleElectricalGlideLoadMore: ElectricalGlideGridProps['onLoadMore'];
  handleElectricalGlideCellAction: NonNullable<ElectricalGlideGridProps['onCellAction']>;
  handleElectricalGlideStartCellEdit: NonNullable<ElectricalGlideGridProps['onStartCellEdit']>;
  handleElectricalGlideCommitCell: NonNullable<ElectricalGlideGridProps['onCommitCell']>;
  isElectricalPageFetching: boolean;
  handleElectricalTableChange: TableProps<ProjectObject>['onChange'];
  canMutate: boolean;
  handleTableRowDragStart: NonNullable<ElectricalGlideGridProps['onRowDragStart']>;
  handleTableRowDragEnd: () => void;
  activateRowId: (id: string) => void;
  assignmentByObjectId: ReadonlyMap<string, ElectricalQueryAssignment>;
  cableTypeForRecalculation: CableTypeKey | null | undefined;
  electricalColumns: ColumnsType<ProjectObject>;
  calcByObjectId: Record<string, ElectricalCalcSummary | undefined>;
  calculatedCount: number;
  resetCurrentTableViewState: () => void;
  navigate: (path: string) => void;
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
      <TltButton size="compact" onClick={resetCurrentTableViewState}>
        Сбросить фильтры
      </TltButton>
    </div>
  ) : undefined;

  return (
    <TltCard padding="compact" className="workspace-table-card srs-table-wrap" data-testid="electrical-unified-table">
      {electricalPageLoaded && totalObjects === 0 ? (
        <TltAlert
          tone="warning"
          title="Нет объектов"
          className="electrical-unified-alert"
        >
          Добавьте объекты на шаге «Теплопотери».
        </TltAlert>
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
            rowDragEnabled={canMutate}
            onRowDragStart={handleTableRowDragStart}
            onRowDragEnd={handleTableRowDragEnd}
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
            onDragStart: (event) => handleTableRowDragStart({
              preventDefault: () => event.preventDefault(),
              setData: (mime, payload) => event.dataTransfer.setData(mime, payload),
              setMoveEffect: () => {
                event.dataTransfer.effectAllowed = 'move';
              },
            }, obj.id),
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
          <TltButton
            size="compact"
            variant="link"
            icon={<ThunderboltOutlined />}
            onClick={() => navigate(ROUTES.specification)}
          >
            Спецификация →
          </TltButton>
        )}
      </div>
    </TltCard>
  );
}
