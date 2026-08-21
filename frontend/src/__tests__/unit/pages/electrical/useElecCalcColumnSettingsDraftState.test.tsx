import { act, renderHook } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import { useElecCalcColumnSettingsDraftState } from '@/pages/electrical/useElecCalcColumnSettingsDraftState';
import {
  getDefaultElectricalCandidateTableColumnSettings,
} from '@/utils/electricalCandidateTableColumns';
import {
  getDefaultElectricalTableColumnSettings,
} from '@/utils/electricalTableColumns';
import {
  getDefaultElectricalTableViewSettings,
  type ElectricalTableViewSettings,
} from '@/utils/electricalTableViewSettings';

function setup(options?: {
  isEmployee?: boolean;
  tableViewSettings?: ElectricalTableViewSettings;
}) {
  const persistTableSettings = vi.fn();
  const persistCandidateTableColumnSettings = vi.fn();
  const setColumnSettingsOpen = vi.fn();
  const setCandidateColumnSettingsOpen = vi.fn();
  const tableColumnSettings = getDefaultElectricalTableColumnSettings();
  const candidateTableColumnSettings = getDefaultElectricalCandidateTableColumnSettings();
  const tableViewSettings = options?.tableViewSettings ?? getDefaultElectricalTableViewSettings();

  return {
    persistTableSettings,
    persistCandidateTableColumnSettings,
    setColumnSettingsOpen,
    setCandidateColumnSettingsOpen,
    tableColumnSettings,
    candidateTableColumnSettings,
    tableViewSettings,
    ...renderHook(() => useElecCalcColumnSettingsDraftState({
      tableColumnSettings,
      candidateTableColumnSettings,
      tableViewSettings,
      isEmployee: options?.isEmployee ?? true,
      setColumnSettingsOpen,
      setCandidateColumnSettingsOpen,
      persistTableSettings,
      persistCandidateTableColumnSettings,
    })),
  };
}

describe('useElecCalcColumnSettingsDraftState', () => {
  it('opens main column settings with normalized draft view settings', () => {
    const { result, setColumnSettingsOpen } = setup({
      isEmployee: false,
      tableViewSettings: {
        ...getDefaultElectricalTableViewSettings(),
        calculationCableSource: 'extended',
      },
    });

    act(() => {
      result.current.openColumnSettings();
    });

    expect(setColumnSettingsOpen).toHaveBeenCalledWith(true);
    expect(result.current.draftTableViewSettings.calculationCableSource).toBe('builtin');
  });

  it('updates main draft columns and persists normalized settings', () => {
    const { result, persistTableSettings } = setup();

    act(() => {
      result.current.openColumnSettings();
      result.current.updateDraftColumnWidth('total_power', 14.5);
      result.current.updateDraftTableFontSize('large');
      result.current.updateDraftTableLabelFormat('compact');
      result.current.updateDraftCalculationCableSource('all');
    });
    act(() => {
      result.current.applyColumnSettings();
    });

    expect(persistTableSettings).toHaveBeenCalledTimes(1);
    const [columns, view] = persistTableSettings.mock.calls[0];
    expect(columns.columns.total_power.widthPct).toBe(14.5);
    expect(view).toMatchObject({
      fontSize: 'large',
      tableLabelFormat: 'compact',
      calculationCableSource: 'all',
    });
  });

  it('opens candidate settings and persists candidate drafts with close flag', () => {
    const {
      result,
      persistCandidateTableColumnSettings,
      setCandidateColumnSettingsOpen,
    } = setup();

    act(() => {
      result.current.openCandidateColumnSettings();
      result.current.updateDraftCandidateColumnWidth('total_power', 15);
    });
    act(() => {
      result.current.applyCandidateColumnSettings();
    });

    expect(setCandidateColumnSettingsOpen).toHaveBeenCalledWith(true);
    expect(persistCandidateTableColumnSettings).toHaveBeenCalledTimes(1);
    const [settings, options] = persistCandidateTableColumnSettings.mock.calls[0];
    expect(settings.columns.total_power.widthPct).toBe(15);
    expect(options).toEqual({ closeModal: true });
  });

  it('resets and selects draft columns without touching persisted settings immediately', () => {
    const {
      result,
      persistTableSettings,
      persistCandidateTableColumnSettings,
    } = setup();

    act(() => {
      result.current.openColumnSettings();
      result.current.resetDraftColumns();
      result.current.selectAllDraftColumns();
      result.current.resetDraftTableFontSize();
      result.current.resetDraftLabelFormats();
      result.current.openCandidateColumnSettings();
      result.current.resetDraftCandidateColumns();
      result.current.selectAllDraftCandidateColumns();
    });

    expect(result.current.draftTableColumnSettings.visibleOrder.length).toBeGreaterThan(0);
    expect(result.current.draftCandidateTableColumnSettings.visibleOrder.length).toBeGreaterThan(0);
    expect(persistTableSettings).not.toHaveBeenCalled();
    expect(persistCandidateTableColumnSettings).not.toHaveBeenCalled();
  });
});
