/**
 * @module heatcalc/page-toolbars
 * @owner heat
 * Type toolbar, actions toolbar, heat-loss job alert.
 */
import type { ReactNode } from 'react';
import { Alert } from 'antd';

import {
  HeatCalcActionsToolbar,
  HeatCalcTypeToolbar,
  type HeatCalcToolbarEditingMode,
} from '@/pages/heatcalc/HeatCalcToolbar';
import {
  PipeTypeIcon,
  TankTypeIcon,
} from '@/pages/heatcalc/HeatCalcObjectTypeIcons';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type HeatCalcPageToolbarsProps = Record<string, any>;

export function buildHeatCalcTypeBar(p: HeatCalcPageToolbarsProps): ReactNode {
  return (
    <HeatCalcTypeToolbar
      activeObjectScope={p.activeObjectScope}
      pipeButtonCountText={p.pipeButtonCountText}
      tankButtonCountText={p.tankButtonCountText}
      allButtonCountText={p.allButtonCountText}
      pipeIcon={<PipeTypeIcon />}
      tankIcon={<TankTypeIcon />}
      formBlockVisible={p.formBlockVisible}
      formCaptionMode={p.formCaptionMode}
      formCaptionModeLabel={p.formCaptionModeLabel}
      onObjectScopeChange={p.handleObjectScopeChange}
      onFormBlockVisibilityChange={p.handleFormBlockVisibilityChange}
      onContinueToElectrical={p.handleContinueToElectrical}
      continueToElectricalDisabled={p.continueToElectricalDisabled}
      continueToElectricalTooltip={p.continueToElectricalTooltip}
    />
  );
}

export function buildHeatCalcActionsBar(p: HeatCalcPageToolbarsProps): ReactNode {
  return (
    <HeatCalcActionsToolbar
      formActions={{
        visible: p.formBlockVisible,
        saveTooltip: p.toolbarSaveTooltip,
        saveDisabled: p.toolbarSaveDisabled,
        saveLoading: p.toolbarSaveLoading,
        deleteTargetCount: p.deleteTargetCount,
        deleteLoading: p.removeIsPending,
        onAdd: p.openAddWizard,
        onSave: p.handleToolbarSave,
        onDeleteSelected: p.removeSelectedObjects,
      }}
      tableActions={{
        editingMode: p.tableEditingMode as HeatCalcToolbarEditingMode,
        commercialFeaturesAvailable: p.commercialFeaturesAvailable,
        tableFindabilityAvailable: p.tableFindabilityAvailable,
        recalcTooltip: p.heatLossRecalcTooltip,
        recalcAriaLabel: p.heatLossRecalcAriaLabel,
        recalcLoading: p.heatLossBatchPending || p.isHeatLossJobActive,
        recalcDisabled: p.heatLossScopedRecalcDisabled || p.heatLossBatchPending,
        recalcAllTooltip: p.heatLossRecalcAllTooltip,
        recalcAllDisabled: p.heatLossRecalcDisabled || p.heatLossBatchPending,
        jobActive: p.isHeatLossJobActive,
        jobId: p.activeHeatLossJobId,
        cancelJobLoading: p.cancelHeatLossJobPending,
        currentTableViewActive: p.currentTableViewActive,
        draftControlsVisible: p.draftControlsVisible,
        dirtyDraftRowCount: p.dirtyDraftRowCount,
        saveTargetCount: p.saveTargetCount,
        inlineDraftSaving: p.inlineDraftSaving,
        draftDiscardLabel: p.draftDiscardLabel,
        selectedObjectCount: p.selectedObjectCount,
        duplicateLoading: p.addIsPending,
        onEditingModeChange: p.handleTableEditingModeChange,
        onRecalcScoped: p.recalcHeatLossScoped,
        onRecalcAll: p.recalcHeatLossAll,
        onCancelJob: p.cancelHeatLossJob,
        onOpenSettings: p.openColumnSettings,
        onResetCurrentTableView: p.resetCurrentTableViewState,
        onDiscardDrafts: () => p.discardDraftRows(p.saveTargetIds),
        onDuplicateSelected: p.duplicateSelectedObjects,
      }}
      importExport={{
        projectId: p.projectId,
        projectName: p.projectName,
        existingObjectCount: p.projectObjectCount,
        canExport: p.role === 'employee',
      }}
    />
  );
}

export function buildHeatCalcJobAlert(
  isHeatLossJobActive: boolean,
  heatLossJobProgressLabel: string,
): ReactNode {
  if (!isHeatLossJobActive) return null;
  return (
    <Alert
      type="info"
      showIcon
      className="heatcalc-job-alert"
      message={`Пересчёт теплопотерь выполняется · ${heatLossJobProgressLabel}`}
    />
  );
}
