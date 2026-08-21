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
  type HeatCalcTableViewSettings,
} from '@/utils/heatCalcTableViewSettings';
import {
  getDefaultCalculationDetailsSettings,
} from '@/utils/heatCalcCalculationDetailsSettings';

function setupDialog({
  activeTableColumnScope = 'pipe',
  tableColumnSettings = getDefaultTableColumnSettings(),
  tableViewSettings = getDefaultTableViewSettings(),
}: {
  activeTableColumnScope?: HeatCalcTableColumnScope;
  tableColumnSettings?: HeatCalcTableColumnSettings;
  tableViewSettings?: HeatCalcTableViewSettings;
} = {}) {
  const cleanHiddenColumnStateForSettings = vi.fn();
  const persistTableSettings = vi.fn();
  const rendered = renderHook(() => useHeatCalcColumnSettingsDialog({
    activeTableColumnScope,
    tableColumnSettings,
    tableViewSettings,
    calculationDetailsSettings: getDefaultCalculationDetailsSettings(),
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

  it('persists view draft changes without inline-edit pending flow', () => {
    const { result, cleanHiddenColumnStateForSettings, persistTableSettings } = setupDialog({
      tableViewSettings: getDefaultTableViewSettings(),
    });

    act(() => {
      result.current.open();
      result.current.updateDraftFormPlacement('left');
    });
    act(() => {
      result.current.apply();
    });

    expect(cleanHiddenColumnStateForSettings).toHaveBeenCalledTimes(1);
    expect(persistTableSettings).toHaveBeenCalledTimes(1);
    expect(persistTableSettings.mock.calls[0][1]).toMatchObject({
      fontSize: 'compact',
      formPlacement: 'left',
    });
  });
});
