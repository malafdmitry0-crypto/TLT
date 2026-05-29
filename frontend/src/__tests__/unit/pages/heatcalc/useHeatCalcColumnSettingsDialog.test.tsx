import { act, renderHook } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import {
  useHeatCalcColumnSettingsDialog,
} from '@/pages/heatcalc/useHeatCalcColumnSettingsDialog';
import {
  getDefaultTableColumnSettings,
  type HeatCalcTableColumnSettings,
  type HeatCalcTableColumnScope,
} from '@/utils/heatCalcTableColumns';
import {
  getDefaultTableViewSettings,
  normalizeTableViewSettings,
  type HeatCalcTableViewSettings,
} from '@/utils/heatCalcTableViewSettings';
import {
  getDefaultCalculationDetailsSettings,
} from '@/utils/heatCalcCalculationDetailsSettings';
import {
  getDefaultFieldInputSettings,
} from '@/utils/heatCalcFieldInputSettings';

function setupDialog({
  activeTableColumnScope = 'pipe',
  tableColumnSettings = getDefaultTableColumnSettings(),
  tableViewSettings = getDefaultTableViewSettings(),
  dirtyDraftRowCount = 0,
}: {
  activeTableColumnScope?: HeatCalcTableColumnScope;
  tableColumnSettings?: HeatCalcTableColumnSettings;
  tableViewSettings?: HeatCalcTableViewSettings;
  dirtyDraftRowCount?: number;
} = {}) {
  const cleanHiddenColumnStateForSettings = vi.fn();
  const persistTableSettings = vi.fn();
  const rendered = renderHook(() => useHeatCalcColumnSettingsDialog({
    activeTableColumnScope,
    tableColumnSettings,
    tableViewSettings,
    calculationDetailsSettings: getDefaultCalculationDetailsSettings(),
    fieldInputSettings: getDefaultFieldInputSettings(),
    dirtyDraftRowCount,
    cleanHiddenColumnStateForSettings,
    persistTableSettings,
  }));
  return {
    ...rendered,
    cleanHiddenColumnStateForSettings,
    persistTableSettings,
  };
}

describe('useHeatCalcColumnSettingsDialog', () => {
  it('opens with current scope and persists column draft changes explicitly', () => {
    const { result, cleanHiddenColumnStateForSettings, persistTableSettings } = setupDialog({
      activeTableColumnScope: 'tank',
    });

    act(() => {
      result.current.open();
    });

    expect(result.current.isOpen).toBe(true);
    expect(result.current.activeType).toBe('tank');

    act(() => {
      result.current.updateDraftColumnWidth('tank', 'tank_dimensions', 22.5);
    });
    act(() => {
      result.current.apply();
    });

    expect(cleanHiddenColumnStateForSettings).toHaveBeenCalledTimes(1);
    expect(persistTableSettings).toHaveBeenCalledTimes(1);
    expect(persistTableSettings.mock.calls[0][0].types.tank.columns.tank_dimensions)
      .toMatchObject({ widthPct: 22.5 });
  });

  it('blocks inline editing disable while dirty rows exist until user decides', () => {
    const tableViewSettings = normalizeTableViewSettings({
      ...getDefaultTableViewSettings(),
      inlineEditingEnabled: true,
    });
    const { result, cleanHiddenColumnStateForSettings, persistTableSettings } = setupDialog({
      tableViewSettings,
      dirtyDraftRowCount: 1,
    });

    act(() => {
      result.current.open();
      result.current.updateDraftInlineEditingEnabled(false);
    });
    act(() => {
      result.current.apply();
    });

    expect(result.current.pendingInlineDisableSettings).not.toBeNull();
    expect(cleanHiddenColumnStateForSettings).not.toHaveBeenCalled();
    expect(persistTableSettings).not.toHaveBeenCalled();

    act(() => {
      result.current.cancelPendingInlineDisable();
    });

    expect(result.current.pendingInlineDisableSettings).toBeNull();
    expect(result.current.draftViewSettings.inlineEditingEnabled).toBe(true);

    const discardDraftRows = vi.fn();
    act(() => {
      result.current.updateDraftInlineEditingEnabled(false);
    });
    act(() => {
      result.current.apply();
    });
    act(() => {
      result.current.discardPendingInlineDisable(discardDraftRows);
    });

    expect(discardDraftRows).toHaveBeenCalledTimes(1);
    expect(persistTableSettings).toHaveBeenCalledTimes(1);
    expect(persistTableSettings.mock.calls[0][1]).toMatchObject({ inlineEditingEnabled: false });
    expect(result.current.pendingInlineDisableSettings).toBeNull();
  });

  it('keeps pending inline disable open when draft save fails', async () => {
    const tableViewSettings = normalizeTableViewSettings({
      ...getDefaultTableViewSettings(),
      inlineEditingEnabled: true,
    });
    const { result, persistTableSettings } = setupDialog({
      tableViewSettings,
      dirtyDraftRowCount: 1,
    });

    act(() => {
      result.current.open();
      result.current.updateDraftInlineEditingEnabled(false);
    });
    act(() => {
      result.current.apply();
    });

    await act(async () => {
      await result.current.savePendingInlineDisable(async () => ({ ok: false }));
    });

    expect(result.current.pendingInlineDisableSettings).not.toBeNull();
    expect(persistTableSettings).not.toHaveBeenCalled();

    await act(async () => {
      await result.current.savePendingInlineDisable(async () => ({ ok: true }));
    });

    expect(persistTableSettings).toHaveBeenCalledTimes(1);
    expect(persistTableSettings.mock.calls[0][1]).toMatchObject({ inlineEditingEnabled: false });
    expect(result.current.pendingInlineDisableSettings).toBeNull();
  });
});
