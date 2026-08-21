/**
 * Characterization for workspace column-settings controller surface.
 * Locks return keys and that preference → view model → table view →
 * persistence → draft → params panel are composed; sub-hooks are stubbed.
 */
import { renderHook } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

const {
  stablePreference,
  stableColumnView,
  stableTableView,
  stableParamsPanel,
  stablePersistence,
  stableDraft,
} = vi.hoisted(() => {
  const stablePreference = {
    tableColumnSettings: { order: [], visibility: {}, widthPct: {} },
    setTableColumnSettings: vi.fn(),
    candidateTableColumnSettings: { order: [], visibility: {}, widthPct: {} },
    setCandidateTableColumnSettings: vi.fn(),
    tableViewSettings: {
      fontSize: 'medium',
      tableLabelFormat: 'short',
      settingsLabelFormat: 'short',
      calculationCableSource: 'builtin',
    },
    setTableViewSettings: vi.fn(),
    updateTableColumnPreference: { mutate: vi.fn() },
    updateCandidateTableColumnPreference: { mutate: vi.fn() },
    updateTableSettingsPreference: { mutate: vi.fn() },
  };
  const stableColumnView = {
    normalizedTableViewSettings: stablePreference.tableViewSettings,
    visibleElectricalColumnMetas: [{ key: 'name' }],
    visibleCandidateColumnMetas: [{ key: 'cable_mark' }],
    resolvedTableFontSize: 13,
    visibleElectricalColumnKeys: ['name'] as const,
    visibleCandidateColumnKeys: ['cable_mark'] as const,
  };
  const stableTableView = {
    tableViewState: { filters: {}, sort: undefined },
    candidateTableViewState: { filters: {}, sort: undefined },
    setTableViewState: vi.fn(),
    currentTableViewActive: false,
    candidateTableViewActive: false,
    setColumnFilter: vi.fn(),
    resetColumnFilter: vi.fn(),
    resetCurrentTableViewState: vi.fn(),
    setElectricalTableSort: vi.fn(),
    setCandidateColumnFilter: vi.fn(),
    resetCandidateColumnFilter: vi.fn(),
    resetCandidateTableViewState: vi.fn(),
    setCandidateTableSort: vi.fn(),
  };
  const stableParamsPanel = {
    paramsPanelVisible: false,
    toggleParamsPanel: vi.fn(),
  };
  const stablePersistence = {
    persistTableSettings: vi.fn(),
    persistCandidateTableColumnSettings: vi.fn(),
    startColumnResize: vi.fn(),
  };
  const stableDraft = {
    openColumnSettings: vi.fn(),
    openCandidateColumnSettings: vi.fn(),
    applyColumnSettings: vi.fn(),
  };
  return {
    stablePreference,
    stableColumnView,
    stableTableView,
    stableParamsPanel,
    stablePersistence,
    stableDraft,
  };
});

vi.mock('@/pages/electrical/useElecCalcPreferenceSettings', () => ({
  useElecCalcPreferenceSettings: () => stablePreference,
}));
vi.mock('@/pages/electrical/useElecCalcColumnViewModel', () => ({
  useElecCalcColumnViewModel: () => stableColumnView,
}));
vi.mock('@/pages/electrical/useElecCalcTableViewState', () => ({
  useElecCalcTableViewState: () => stableTableView,
}));
vi.mock('@/pages/electrical/useElecCalcParamsPanelState', () => ({
  useElecCalcParamsPanelState: () => stableParamsPanel,
}));
vi.mock('@/pages/electrical/useElecCalcColumnPersistence', () => ({
  useElecCalcColumnPersistence: () => stablePersistence,
}));
vi.mock('@/pages/electrical/useElecCalcColumnSettingsDraftState', () => ({
  useElecCalcColumnSettingsDraftState: () => stableDraft,
}));

import {
  useElecCalcWorkspaceColumnSettingsController,
  type UseElecCalcWorkspaceColumnSettingsControllerArgs,
} from '@/pages/electrical/useElecCalcWorkspaceColumnSettingsController';

const COLUMN_SETTINGS_CONTROLLER_RETURN_KEYS = [
  'columnSettingsOpen',
  'setColumnSettingsOpen',
  'candidateColumnSettingsOpen',
  'setCandidateColumnSettingsOpen',
  'tableViewSettings',
  'normalizedTableViewSettings',
  'visibleElectricalColumnMetas',
  'visibleCandidateColumnMetas',
  'resolvedTableFontSize',
  'tableViewState',
  'candidateTableViewState',
  'setTableViewState',
  'currentTableViewActive',
  'candidateTableViewActive',
  'setColumnFilter',
  'resetColumnFilter',
  'resetCurrentTableViewState',
  'setElectricalTableSort',
  'setCandidateColumnFilter',
  'resetCandidateColumnFilter',
  'resetCandidateTableViewState',
  'setCandidateTableSort',
  'paramsPanelVisible',
  'toggleParamsPanel',
  'columnPersistence',
  'columnDraft',
  'updateTableColumnPreference',
  'updateCandidateTableColumnPreference',
  'updateTableSettingsPreference',
] as const;

function baseArgs(
  overrides: Partial<UseElecCalcWorkspaceColumnSettingsControllerArgs> = {},
): UseElecCalcWorkspaceColumnSettingsControllerArgs {
  return {
    isRegisteredUser: true,
    registeredUserId: 'user-1',
    isEmployee: true,
    resetElectricalTablePage: vi.fn(),
    ...overrides,
  };
}

describe('useElecCalcWorkspaceColumnSettingsController', () => {
  it('exposes a stable column-settings controller return surface', () => {
    const { result } = renderHook(() =>
      useElecCalcWorkspaceColumnSettingsController(baseArgs()),
    );

    expect(Object.keys(result.current).sort()).toEqual(
      [...COLUMN_SETTINGS_CONTROLLER_RETURN_KEYS].sort(),
    );
    expect(result.current.tableViewSettings).toBe(stablePreference.tableViewSettings);
    expect(result.current.normalizedTableViewSettings).toBe(
      stableColumnView.normalizedTableViewSettings,
    );
    expect(result.current.visibleElectricalColumnMetas).toBe(
      stableColumnView.visibleElectricalColumnMetas,
    );
    expect(result.current.visibleCandidateColumnMetas).toBe(
      stableColumnView.visibleCandidateColumnMetas,
    );
    expect(result.current.resolvedTableFontSize).toBe(stableColumnView.resolvedTableFontSize);
    expect(result.current.tableViewState).toBe(stableTableView.tableViewState);
    expect(result.current.candidateTableViewState).toBe(stableTableView.candidateTableViewState);
    expect(result.current.setColumnFilter).toBe(stableTableView.setColumnFilter);
    expect(result.current.resetCandidateTableViewState).toBe(
      stableTableView.resetCandidateTableViewState,
    );
    expect(result.current.paramsPanelVisible).toBe(stableParamsPanel.paramsPanelVisible);
    expect(result.current.toggleParamsPanel).toBe(stableParamsPanel.toggleParamsPanel);
    expect(result.current.columnPersistence).toBe(stablePersistence);
    expect(result.current.columnDraft).toBe(stableDraft);
    expect(result.current.updateTableColumnPreference).toBe(
      stablePreference.updateTableColumnPreference,
    );
    expect(result.current.updateCandidateTableColumnPreference).toBe(
      stablePreference.updateCandidateTableColumnPreference,
    );
    expect(result.current.updateTableSettingsPreference).toBe(
      stablePreference.updateTableSettingsPreference,
    );
    expect(result.current.columnSettingsOpen).toBe(false);
    expect(result.current.candidateColumnSettingsOpen).toBe(false);
    expect(typeof result.current.setColumnSettingsOpen).toBe('function');
    expect(typeof result.current.setCandidateColumnSettingsOpen).toBe('function');
  });

  it('starts with column settings modals closed', () => {
    const { result } = renderHook(() =>
      useElecCalcWorkspaceColumnSettingsController(baseArgs()),
    );

    expect(result.current.columnSettingsOpen).toBe(false);
    expect(result.current.candidateColumnSettingsOpen).toBe(false);
  });

  it('keeps composed bags identity-stable when args identity is stable', () => {
    const args = baseArgs();
    const { result, rerender } = renderHook(
      (props: UseElecCalcWorkspaceColumnSettingsControllerArgs) =>
        useElecCalcWorkspaceColumnSettingsController(props),
      { initialProps: args },
    );

    const first = {
      columnPersistence: result.current.columnPersistence,
      columnDraft: result.current.columnDraft,
      tableViewState: result.current.tableViewState,
      toggleParamsPanel: result.current.toggleParamsPanel,
    };

    rerender(args);

    expect(result.current.columnPersistence).toBe(first.columnPersistence);
    expect(result.current.columnDraft).toBe(first.columnDraft);
    expect(result.current.tableViewState).toBe(first.tableViewState);
    expect(result.current.toggleParamsPanel).toBe(first.toggleParamsPanel);
  });
});
