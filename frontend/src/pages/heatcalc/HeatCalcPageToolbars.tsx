/**
 * @module heatcalc/page-toolbars
 * @owner heat
 * Type toolbar, actions toolbar, heat-loss job alert.
 */
import type { ReactNode } from 'react';
import { TltAlert } from '@/components/ui-kit';

import {
  HeatCalcActionsToolbar,
  HeatCalcTypeToolbar,
  type HeatCalcToolbarEditingMode,
} from '@/pages/heatcalc/HeatCalcToolbar';
import type { ActiveObjectScope } from '@/pages/heatcalc/useHeatCalcTableState';
import {
  PipeTypeIcon,
  TankTypeIcon,
} from '@/components/shared/ObjectTypeIcons';
import type { Role } from '@/constants/roles';

/** Explicit data/events contract for Heat page toolbars (AF9-TYPE-HEAT-TOOLBARS-01). */
export type HeatCalcPageToolbarsProps = {
  activeObjectScope: ActiveObjectScope;
  pipeButtonCountText: string;
  tankButtonCountText: string;
  allButtonCountText: string;
  formBlockVisible: boolean;
  formCaptionMode: string;
  formCaptionModeLabel: string;
  handleObjectScopeChange: (scope: ActiveObjectScope) => void;
  handleFormBlockVisibilityChange: (checked: boolean) => void;
  handleContinueToElectrical?: () => void;
  continueToElectricalDisabled?: boolean;
  continueToElectricalTooltip?: string;
  toolbarSaveTooltip: string;
  toolbarSaveDisabled: boolean;
  toolbarSaveLoading: boolean;
  deleteTargetCount: number;
  removeIsPending: boolean;
  openAddWizard: () => void;
  handleToolbarSave: () => void;
  removeSelectedObjects: () => void;
  tableEditingMode: HeatCalcToolbarEditingMode;
  commercialFeaturesAvailable: boolean;
  tableFindabilityAvailable: boolean;
  heatLossRecalcTooltip: string;
  heatLossRecalcAriaLabel: string;
  heatLossBatchPending: boolean;
  isHeatLossJobActive: boolean;
  heatLossScopedRecalcDisabled: boolean;
  heatLossRecalcAllTooltip: string;
  heatLossRecalcDisabled: boolean;
  activeHeatLossJobId: string | null;
  cancelHeatLossJobPending: boolean;
  currentTableViewActive: boolean;
  draftControlsVisible: boolean;
  dirtyDraftRowCount: number;
  saveTargetCount: number;
  inlineDraftSaving: boolean;
  draftDiscardLabel: string;
  selectedObjectCount: number;
  addIsPending: boolean;
  handleTableEditingModeChange: (value: string | number) => void;
  recalcHeatLossScoped: () => void;
  recalcHeatLossAll: () => void;
  cancelHeatLossJob: () => void;
  openColumnSettings: () => void;
  resetCurrentTableViewState: () => void;
  discardDraftRows: (rowIds?: string[]) => void;
  saveTargetIds: string[];
  duplicateSelectedObjects: () => void;
  openGroupUpdate: () => void;
  projectId: string;
  projectName: string;
  projectObjectCount: number;
  role: Role | null;
};

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
        editingMode: p.tableEditingMode,
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
        onOpenGroupUpdate: p.openGroupUpdate,
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
    <TltAlert
      tone="info"
      className="heatcalc-job-alert"
      title={`Пересчёт теплопотерь выполняется · ${heatLossJobProgressLabel}`}
    />
  );
}
