/**
 * ElecCalc workspace view shell — orchestration in useElecCalcWorkspaceModel.
 */
import { Space } from 'antd';
import { ThunderboltOutlined } from '@ant-design/icons';

import EmptyProjectState from '@/components/common/EmptyProjectState';
import ElectricalSummary from '@/components/electrical/ElectricalSummary';
import { TltAlert } from '@/components/ui-kit';
import ElectricalBatchActionBar from '@/pages/electrical/ElectricalBatchActionBar';
import ElectricalAssignmentPanel from '@/pages/electrical/ElectricalAssignmentPanel';
import { buildAssignAutoCalcBatchPayload } from '@/pages/electrical/elecCalcAssignAutoCalcModel';
import { ElectricalUnifiedTableCard } from '@/pages/electrical/ElectricalUnifiedTableCard';
import { ElecCalcWorkspaceModals } from '@/pages/electrical/ElecCalcWorkspaceModals';
import { ElecCalcWorkspaceParamsChrome } from '@/pages/electrical/ElecCalcWorkspaceParamsChrome';
import { ElecCalcIdopSettings } from '@/pages/electrical/ElecCalcIdopSettings';
import { ElecCalcStaleBanner } from '@/pages/electrical/ElecCalcStaleBanner';
import { listStaleObjectIds } from '@/pages/electrical/elecCalcStaleModel';
import { useProjectElectricalSettings } from '@/pages/electrical/useProjectElectricalSettings';
import {
  useElecCalcWorkspaceModel,
  type ElecCalcWorkspaceProps,
} from '@/pages/electrical/useElecCalcWorkspaceModel';
import { useMemo } from 'react';
import './elec-workspace-summary.css';
import './elec-workspace.css';
import '@/components/electrical/CablePickerCharacteristics.css';

export type { ElecCalcWorkspaceProps };

export function ElecCalcWorkspace(props: ElecCalcWorkspaceProps) {
  const m = useElecCalcWorkspaceModel(props);
  const { project } = m;
  const { canMutate, projectId, electricalVariant, onAssignmentsChanged } = props;
  const electricalSettings = useProjectElectricalSettings(projectId, canMutate);
  const staleObjectIds = useMemo(
    () => listStaleObjectIds(
      m.scopedObjects.map((obj) => obj.id),
      m.stats.calcByObjectId,
      m.assignmentByObjectId,
    ),
    [m.assignmentByObjectId, m.scopedObjects, m.stats.calcByObjectId],
  );

  if (!project) {
    return (
      <EmptyProjectState
        icon={<ThunderboltOutlined className="electrical-empty-icon" />}
        title="Электротехнический расчёт"
        description="Шаг 2 из 4. Результаты автоподбора греющего кабеля ТЛТ для каждого объекта."
      />
    );
  }

  return (
    <>
      <div id="electrical-variant-workspace" ref={m.tableScrollRegionsRef}>
        <Space direction="vertical" size={8} style={{ width: '100%' }}>
          <ElectricalSummary
            systems={m.systemSummaries}
            totalCableLength={m.totalCableLength}
            totalPower={Number(m.stats.totalPower)}
            totalCurrent={m.totalCurrent}
            calcedCount={m.calculatedCount}
            totalObjects={m.totalObjects}
          />

          <ElecCalcIdopSettings settings={electricalSettings} />

          <ElecCalcStaleBanner
            staleCount={staleObjectIds.length}
            canMutate={canMutate}
            isJobActive={m.isJobActive}
            batchPending={m.batchMut.isPending}
            onSelectStale={() => m.setSelectedRowKeys(staleObjectIds)}
            onRecalculateStale={() => m.onRecalculateObjectIds(staleObjectIds, true)}
          />

          <ElectricalAssignmentPanel
            projectId={projectId}
            electricalVariant={electricalVariant}
            canMutate={canMutate}
            systemView={m.systemView}
            onSystemViewChange={m.setSystemView}
            selectedObjectIds={m.selectedRowKeys}
            onSelectedObjectIdsChange={m.setSelectedRowKeys}
            versionByObjectId={m.versionByObjectId}
            onAssignmentsChanged={onAssignmentsChanged}
            onAssignedNeedCalc={(systemType, objectIds) => {
              if (!canMutate) return;
              const payload = buildAssignAutoCalcBatchPayload({ systemType, objectIds });
              if (!payload) return;
              m.setSystemView(payload.nextSystemView);
              m.batchMut.mutate({
                scope: payload.scope,
                objectIds: payload.objectIds,
                skipManual: payload.skipManual,
                cableType: payload.cableType,
                objectOverrides: payload.objectOverrides,
              });
            }}
            tableDragging={m.tableDragging}
          />

          <ElecCalcWorkspaceParamsChrome
            canMutate={canMutate}
            paramsPanelVisible={m.paramsPanelVisible}
            toggleParamsPanel={m.toggleParamsPanel}
            visibleCableTypeControl={m.cableTypes.visibleCableTypeControl}
            cableTypeOptions={m.cableTypeOptions}
            onCableTypeChange={m.handleCableTypeControlChange}
            recalc={m.recalc}
            setRecalc={m.setRecalc}
            failedCount={m.failedCount}
            activeRowId={m.activeRowId}
            activeElectricalErrorItem={m.activeElectricalErrorItem}
            activeElectricalErrorGuidance={m.activeElectricalErrorGuidance}
            isElectricalCapabilitiesError={m.isElectricalCapabilitiesError}
            isElectricalPageError={m.isElectricalPageError}
            electricalPageError={m.electricalPageError}
            electricalCapabilitiesError={m.electricalCapabilitiesError}
            retryElectricalCapabilities={m.retryElectricalCapabilities}
            retryElectricalPage={m.retryElectricalPage}
          />

          <ElectricalBatchActionBar
            canMutate={canMutate}
            variantName={m.electricalVariantName}
            cableTypeControlLabel={m.cableTypeControlLabel}
            cableTypeOptions={m.cableTypeOptions}
            visibleCableTypeControl={m.cableTypes.visibleCableTypeControl}
            typeControls={m.paramsPanelVisible ? null : m.defaultElectricalTypeControls}
            isJobActive={m.isJobActive}
            selectedManualCableCount={m.selectedManualCableCount}
            selectedValidObjectsCount={m.selectedValidObjectsCount}
            selectedHeatLossFailedCount={m.selectedHeatLossFailedCount}
            manualCableCount={m.manualCableCount}
            overwriteManualChoices={m.overwriteManualChoices}
            selectedRecalcDisabled={m.selectedRecalcDisabled}
            selectedRecalcTooltip={m.selectedRecalcTooltip}
            selectedRecalcCountLabel={m.selectedRecalcCountLabel}
            batchPending={m.batchMut.isPending}
            validObjectsCount={m.validObjectsCount}
            cableTypeForRecalculation={m.cableTypes.cableTypeForRecalculation}
            activeJobId={m.activeJobId}
            cancelJobPending={m.cancelJobMut.isPending}
            currentTableViewActive={m.currentTableViewActive}
            renderManualOverwriteControl={m.renderManualOverwriteControl}
            onCableTypeChange={m.handleCableTypeControlChange}
            onManualOverwritePromptOpen={() => m.setOverwriteManualChoices(false)}
            onRecalculateSelected={m.onRecalculateSelected}
            onRecalculateAll={m.onRecalculateAll}
            onCancelJob={m.onCancelJob}
            onOpenColumnSettings={m.openColumnSettings}
            onResetFilters={m.resetCurrentTableViewState}
          />

          {m.isJobActive && (
            <TltAlert
              tone="info"
              title={`Электрорасчёт выполняется · ${m.jobProgressLabel}`}
            />
          )}

          <ElectricalUnifiedTableCard
            electricalPageLoaded={Boolean(m.electricalPage)}
            totalObjects={m.totalObjects}
            electricalGlideEnabled={m.electricalGlideEnabled}
            scopedObjects={m.scopedObjects}
            electricalGlideColumns={m.electricalGlideColumns}
            electricalTableScrollX={m.electricalTableScrollX}
            electricalTableScrollY={m.electricalTableScrollY}
            fontSizeKey={m.resolvedTableFontSize.key}
            activeRowId={m.activeRowId}
            systemView={m.systemView}
            selectedRowKeys={m.selectedRowKeys}
            compatibleSelectedRowKeys={m.compatibleSelectedRowKeys}
            tableViewState={m.tableViewState}
            electricalPagination={m.electricalPagination}
            electricalInfiniteLoading={m.electricalInfiniteLoading}
            currentTableViewActive={m.currentTableViewActive}
            electricalRowClassName={m.electricalRowClassName}
            getElectricalGlideCellState={m.getElectricalGlideCellState}
            openElectricalRow={m.openElectricalRow}
            handleAssignmentAwareSelectionChange={m.handleAssignmentAwareSelectionChange}
            setColumnFilter={m.setColumnFilter}
            resetColumnFilter={m.resetColumnFilter}
            setElectricalTableSort={m.setElectricalTableSort}
            applyElectricalGlideColumnDraftWidth={m.applyElectricalGlideColumnDraftWidth}
            commitElectricalGlideColumnWidth={m.commitElectricalGlideColumnWidth}
            handleElectricalGlidePageChange={m.handleElectricalGlidePageChange}
            handleElectricalGlideLoadMore={m.handleElectricalGlideLoadMore}
            handleElectricalGlideCellAction={m.handleElectricalGlideCellAction}
            handleElectricalGlideStartCellEdit={m.handleElectricalGlideStartCellEdit}
            handleElectricalGlideCommitCell={m.handleElectricalGlideCommitCell}
            isElectricalPageFetching={m.isElectricalPageFetching}
            handleElectricalTableChange={m.handleElectricalTableChange}
            canMutate={canMutate}
            handleTableRowDragStart={m.handleTableRowDragStart}
            handleTableRowDragEnd={m.handleTableRowDragEnd}
            activateRowId={m.activateRowId}
            assignmentByObjectId={m.assignmentByObjectId}
            cableTypeForRecalculation={m.cableTypes.cableTypeForRecalculation}
            electricalColumns={m.electricalColumns}
            calcByObjectId={m.stats.calcByObjectId}
            calculatedCount={m.calculatedCount}
            resetCurrentTableViewState={m.resetCurrentTableViewState}
            navigate={m.navigate}
          />
        </Space>
      </div>
      <ElecCalcWorkspaceModals {...m.workspaceModalProps} />
    </>
  );
}
