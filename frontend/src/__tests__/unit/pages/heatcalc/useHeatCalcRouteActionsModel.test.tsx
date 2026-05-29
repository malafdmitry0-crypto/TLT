import { act, renderHook } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import {
  heatCalcScopeCountText,
  useHeatCalcRouteActionsModel,
} from '@/pages/heatcalc/useHeatCalcRouteActionsModel';

function makeOptions(
  overrides: Partial<Parameters<typeof useHeatCalcRouteActionsModel>[0]> = {},
) {
  return {
    activeObjectScope: 'pipe',
    activeTableObjectType: 'pipe',
    activeTypeTotalCount: 10,
    allCount: 12,
    clearExcelSelectionState: vi.fn(),
    clearSelectedRows: vi.fn(),
    clearWizard: vi.fn(),
    closeExcelContextMenu: vi.fn(),
    currentTableViewActive: false,
    filteredTableCount: 4,
    formBlockVisible: true,
    pipeCount: 10,
    resetNewWizard: vi.fn(),
    saveDraftRows: vi.fn(),
    saveTargetCount: 0,
    saveTargetIds: [],
    selectedObjectCount: 0,
    selectObjectScope: vi.fn(),
    setFormBlockVisible: vi.fn(),
    setTableEditingMode: vi.fn(),
    tankCount: 2,
    wizardStateType: undefined,
    notifyInfo: vi.fn(),
    ...overrides,
  } satisfies Parameters<typeof useHeatCalcRouteActionsModel>[0];
}

describe('useHeatCalcRouteActionsModel', () => {
  afterEach(() => {
    document.body.replaceChildren();
    vi.restoreAllMocks();
  });

  it('selects a pipe scope and resets the visible wizard', () => {
    const selectObjectScope = vi.fn();
    const resetNewWizard = vi.fn();
    const clearWizard = vi.fn();
    const { result } = renderHook(() => useHeatCalcRouteActionsModel(makeOptions({
      clearWizard,
      resetNewWizard,
      selectObjectScope,
    })));

    act(() => result.current.handleObjectScopeChange('pipe'));

    expect(selectObjectScope).toHaveBeenCalledWith('pipe');
    expect(resetNewWizard).toHaveBeenCalledWith('pipe');
    expect(clearWizard).not.toHaveBeenCalled();
  });

  it('selects a tank scope and clears the hidden wizard', () => {
    const selectObjectScope = vi.fn();
    const resetNewWizard = vi.fn();
    const clearWizard = vi.fn();
    const { result } = renderHook(() => useHeatCalcRouteActionsModel(makeOptions({
      clearWizard,
      formBlockVisible: false,
      resetNewWizard,
      selectObjectScope,
    })));

    act(() => result.current.handleObjectScopeChange('tank'));

    expect(selectObjectScope).toHaveBeenCalledWith('tank');
    expect(clearWizard).toHaveBeenCalledTimes(1);
    expect(resetNewWizard).not.toHaveBeenCalled();
  });

  it('selects all scope without resetting or clearing the wizard', () => {
    const resetNewWizard = vi.fn();
    const clearWizard = vi.fn();
    const { result } = renderHook(() => useHeatCalcRouteActionsModel(makeOptions({
      clearWizard,
      resetNewWizard,
    })));

    act(() => result.current.handleObjectScopeChange('all'));

    expect(resetNewWizard).not.toHaveBeenCalled();
    expect(clearWizard).not.toHaveBeenCalled();
  });

  it('shows the form block and resets wizard by current wizard type', () => {
    const setFormBlockVisible = vi.fn();
    const resetNewWizard = vi.fn();
    const { result } = renderHook(() => useHeatCalcRouteActionsModel(makeOptions({
      activeTableObjectType: 'pipe',
      resetNewWizard,
      setFormBlockVisible,
      wizardStateType: 'tank',
    })));

    act(() => result.current.handleFormBlockVisibilityChange(true));

    expect(setFormBlockVisible).toHaveBeenCalledWith(true);
    expect(resetNewWizard).toHaveBeenCalledWith('tank');
  });

  it('shows the form block and falls back to the active table type', () => {
    const resetNewWizard = vi.fn();
    const { result } = renderHook(() => useHeatCalcRouteActionsModel(makeOptions({
      activeTableObjectType: 'tank',
      resetNewWizard,
      wizardStateType: undefined,
    })));

    act(() => result.current.handleFormBlockVisibilityChange(true));

    expect(resetNewWizard).toHaveBeenCalledWith('tank');
  });

  it('hides the form block and clears the wizard', () => {
    const clearWizard = vi.fn();
    const setFormBlockVisible = vi.fn();
    const { result } = renderHook(() => useHeatCalcRouteActionsModel(makeOptions({
      clearWizard,
      setFormBlockVisible,
    })));

    act(() => result.current.handleFormBlockVisibilityChange(false));

    expect(setFormBlockVisible).toHaveBeenCalledWith(false);
    expect(clearWizard).toHaveBeenCalledTimes(1);
  });

  it('enables Excel mode from all scope by switching to pipes and clearing selections', () => {
    const clearExcelSelectionState = vi.fn();
    const clearSelectedRows = vi.fn();
    const closeExcelContextMenu = vi.fn();
    const notifyInfo = vi.fn();
    const selectObjectScope = vi.fn();
    const setTableEditingMode = vi.fn();
    const { result } = renderHook(() => useHeatCalcRouteActionsModel(makeOptions({
      activeObjectScope: 'all',
      clearExcelSelectionState,
      clearSelectedRows,
      closeExcelContextMenu,
      notifyInfo,
      selectObjectScope,
      setTableEditingMode,
    })));

    act(() => result.current.handleTableEditingModeChange('excel'));

    expect(selectObjectScope).toHaveBeenCalledWith('pipe');
    expect(notifyInfo).toHaveBeenCalledWith('Excel-режим включён для таблицы трубопроводов');
    expect(setTableEditingMode).toHaveBeenCalledWith('excel');
    expect(clearSelectedRows).toHaveBeenCalledTimes(1);
    expect(clearExcelSelectionState).toHaveBeenCalledTimes(1);
    expect(closeExcelContextMenu).toHaveBeenCalledTimes(1);
  });

  it('switches to normal mode without clearing selected normal rows', () => {
    const clearExcelSelectionState = vi.fn();
    const clearSelectedRows = vi.fn();
    const closeExcelContextMenu = vi.fn();
    const setTableEditingMode = vi.fn();
    const { result } = renderHook(() => useHeatCalcRouteActionsModel(makeOptions({
      clearExcelSelectionState,
      clearSelectedRows,
      closeExcelContextMenu,
      setTableEditingMode,
    })));

    act(() => result.current.handleTableEditingModeChange('normal'));

    expect(setTableEditingMode).toHaveBeenCalledWith('normal');
    expect(clearSelectedRows).not.toHaveBeenCalled();
    expect(clearExcelSelectionState).toHaveBeenCalledTimes(1);
    expect(closeExcelContextMenu).toHaveBeenCalledTimes(1);
  });

  it('saves dirty draft targets from the toolbar', () => {
    const saveDraftRows = vi.fn();
    const { result } = renderHook(() => useHeatCalcRouteActionsModel(makeOptions({
      saveDraftRows,
      saveTargetCount: 2,
      saveTargetIds: ['row-1', 'row-2'],
    })));

    act(() => result.current.handleToolbarSave());

    expect(saveDraftRows).toHaveBeenCalledWith(['row-1', 'row-2']);
  });

  it('clicks inline object save when there are no dirty draft targets', () => {
    const button = document.createElement('button');
    button.id = 'inline-object-save';
    const clickSpy = vi.spyOn(button, 'click');
    document.body.appendChild(button);
    const { result } = renderHook(() => useHeatCalcRouteActionsModel(makeOptions()));

    act(() => result.current.handleToolbarSave());

    expect(clickSpy).toHaveBeenCalledTimes(1);
  });

  it('builds count labels for inactive, selected, filtered and plain active scopes', () => {
    expect(heatCalcScopeCountText({
      activeObjectScope: 'pipe',
      activeTypeTotalCount: 10,
      currentTableViewActive: true,
      filteredTableCount: 4,
      scope: 'tank',
      selectedObjectCount: 3,
      total: 2,
    })).toBe('2');
    expect(heatCalcScopeCountText({
      activeObjectScope: 'pipe',
      activeTypeTotalCount: 10,
      currentTableViewActive: true,
      filteredTableCount: 4,
      scope: 'pipe',
      selectedObjectCount: 3,
      total: 10,
    })).toBe('3/10');
    expect(heatCalcScopeCountText({
      activeObjectScope: 'pipe',
      activeTypeTotalCount: 10,
      currentTableViewActive: true,
      filteredTableCount: 4,
      scope: 'pipe',
      selectedObjectCount: 0,
      total: 10,
    })).toBe('4/10');
    expect(heatCalcScopeCountText({
      activeObjectScope: 'pipe',
      activeTypeTotalCount: 10,
      currentTableViewActive: false,
      filteredTableCount: 4,
      scope: 'pipe',
      selectedObjectCount: 0,
      total: 10,
    })).toBe('10');
  });

  it('returns hook count labels for all object scopes', () => {
    const { result } = renderHook(() => useHeatCalcRouteActionsModel(makeOptions({
      activeObjectScope: 'all',
      activeTypeTotalCount: 12,
      allCount: 12,
      currentTableViewActive: true,
      filteredTableCount: 5,
      pipeCount: 10,
      tankCount: 2,
    })));

    expect(result.current.pipeButtonCountText).toBe('10');
    expect(result.current.tankButtonCountText).toBe('2');
    expect(result.current.allButtonCountText).toBe('5/12');
  });
});
