import { useCallback } from 'react';

import type { HeatCalcObjectType } from '@/utils/heatCalcTableColumns';
import type { ActiveObjectScope } from '@/pages/heatcalc/useHeatCalcTableState';

export type HeatCalcRouteTableEditingMode = 'normal' | 'excel';

export interface UseHeatCalcRouteActionsModelOptions {
  activeObjectScope: ActiveObjectScope;
  activeTableObjectType: HeatCalcObjectType;
  activeTypeTotalCount: number;
  allCount: number;
  clearExcelSelectionState: () => void;
  clearSelectedRows: () => void;
  clearWizard: () => void;
  closeExcelContextMenu: () => void;
  commercialFeaturesAvailable: boolean;
  currentTableViewActive: boolean;
  filteredTableCount: number;
  formBlockVisible: boolean;
  pipeCount: number;
  resetNewWizard: (type: HeatCalcObjectType) => void;
  saveDraftRows: (ids: string[]) => void | Promise<unknown>;
  saveTargetCount: number;
  saveTargetIds: string[];
  selectedObjectCount: number;
  selectObjectScope: (scope: ActiveObjectScope) => void;
  setFormBlockVisible: (visible: boolean) => void;
  setTableEditingMode: (mode: HeatCalcRouteTableEditingMode) => void;
  tankCount: number;
  wizardStateType?: HeatCalcObjectType;
  notifyInfo?: (message: string) => void;
}

export function heatCalcScopeCountText({
  activeObjectScope,
  activeTypeTotalCount,
  currentTableViewActive,
  filteredTableCount,
  scope,
  selectedObjectCount,
  total,
}: {
  activeObjectScope: ActiveObjectScope;
  activeTypeTotalCount: number;
  currentTableViewActive: boolean;
  filteredTableCount: number;
  scope: ActiveObjectScope;
  selectedObjectCount: number;
  total: number;
}) {
  if (activeObjectScope !== scope) return String(total);
  if (selectedObjectCount > 0) return `${selectedObjectCount}/${total}`;
  if (currentTableViewActive) return `${filteredTableCount}/${activeTypeTotalCount}`;
  return String(total);
}

export function useHeatCalcRouteActionsModel({
  activeObjectScope,
  activeTableObjectType,
  activeTypeTotalCount,
  allCount,
  clearExcelSelectionState,
  clearSelectedRows,
  clearWizard,
  closeExcelContextMenu,
  currentTableViewActive,
  filteredTableCount,
  formBlockVisible,
  pipeCount,
  resetNewWizard,
  saveDraftRows,
  saveTargetCount,
  saveTargetIds,
  selectedObjectCount,
  selectObjectScope,
  setFormBlockVisible,
  setTableEditingMode,
  tankCount,
  wizardStateType,
  notifyInfo,
}: UseHeatCalcRouteActionsModelOptions) {
  const handleObjectScopeChange = useCallback((scope: ActiveObjectScope) => {
    selectObjectScope(scope);
    if (scope === 'all') return;
    if (formBlockVisible) {
      resetNewWizard(scope);
      return;
    }
    clearWizard();
  }, [clearWizard, formBlockVisible, resetNewWizard, selectObjectScope]);

  const handleFormBlockVisibilityChange = useCallback((checked: boolean) => {
    setFormBlockVisible(checked);
    if (checked) {
      resetNewWizard(wizardStateType ?? activeTableObjectType);
      return;
    }
    clearWizard();
  }, [activeTableObjectType, clearWizard, resetNewWizard, setFormBlockVisible, wizardStateType]);

  const handleTableEditingModeChange = useCallback((value: string | number) => {
    const nextMode: HeatCalcRouteTableEditingMode = value === 'excel' ? 'excel' : 'normal';
    if (nextMode === 'excel' && activeObjectScope === 'all') {
      selectObjectScope('pipe');
      notifyInfo?.('Excel-режим включён для таблицы трубопроводов');
    }
    setTableEditingMode(nextMode);
    if (nextMode === 'excel') clearSelectedRows();
    clearExcelSelectionState();
    closeExcelContextMenu();
  }, [
    activeObjectScope,
    clearExcelSelectionState,
    clearSelectedRows,
    closeExcelContextMenu,
    notifyInfo,
    selectObjectScope,
    setTableEditingMode,
  ]);

  const handleToolbarSave = useCallback(() => {
    if (saveTargetCount > 0) {
      void saveDraftRows(saveTargetIds);
      return;
    }
    document.getElementById('inline-object-save')?.click();
  }, [saveDraftRows, saveTargetCount, saveTargetIds]);

  const countLabelOptions = {
    activeObjectScope,
    activeTypeTotalCount,
    currentTableViewActive,
    filteredTableCount,
    selectedObjectCount,
  };

  return {
    allButtonCountText: heatCalcScopeCountText({
      ...countLabelOptions,
      scope: 'all',
      total: allCount,
    }),
    handleFormBlockVisibilityChange,
    handleObjectScopeChange,
    handleTableEditingModeChange,
    handleToolbarSave,
    pipeButtonCountText: heatCalcScopeCountText({
      ...countLabelOptions,
      scope: 'pipe',
      total: pipeCount,
    }),
    tankButtonCountText: heatCalcScopeCountText({
      ...countLabelOptions,
      scope: 'tank',
      total: tankCount,
    }),
  };
}
