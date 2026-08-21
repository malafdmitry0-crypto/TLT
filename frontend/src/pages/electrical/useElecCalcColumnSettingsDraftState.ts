import { useCallback, useState } from 'react';

import {
  createElectricalCandidateTableColumnSettingsPatch,
  getAvailableElectricalCandidateTableColumnKeys,
  moveElectricalCandidateTableColumnToOrder,
  normalizeElectricalCandidateTableColumnSettings,
  reorderElectricalCandidateTableColumn,
  resetElectricalCandidateTableColumnSettings,
  resetElectricalCandidateTableColumnWidth,
  setElectricalCandidateTableColumnVisibility,
  setElectricalCandidateTableColumnWidthPct,
  type ElectricalCandidateColumnKey,
  type ElectricalCandidateTableColumnSettings,
} from '@/utils/electricalCandidateTableColumns';
import {
  createElectricalTableColumnSettingsPatch,
  getAvailableElectricalTableColumnKeys,
  moveElectricalTableColumnToOrder,
  normalizeElectricalTableColumnSettings,
  reorderElectricalTableColumn,
  resetElectricalTableColumnSettings,
  resetElectricalTableColumnWidth,
  setElectricalTableColumnVisibility,
  setElectricalTableColumnWidthPct,
  type ElectricalColumnKey,
  type ElectricalTableColumnSettings,
} from '@/utils/electricalTableColumns';
import {
  getDefaultElectricalTableViewSettings,
  normalizeElectricalTableViewSettings,
  type ElectricalCalculationCableSource,
  type ElectricalTableFontSize,
  type ElectricalTableLabelFormat,
  type ElectricalTableViewSettings,
} from '@/utils/electricalTableViewSettings';

type PersistTableSettings = (
  columnSettings: ElectricalTableColumnSettings,
  viewSettings: ElectricalTableViewSettings,
) => void;

type PersistCandidateTableColumnSettings = (
  settings: ElectricalCandidateTableColumnSettings,
  options?: { closeModal?: boolean; showMessage?: boolean },
) => void;

type UseElecCalcColumnSettingsDraftStateOptions = {
  tableColumnSettings: ElectricalTableColumnSettings;
  candidateTableColumnSettings: ElectricalCandidateTableColumnSettings;
  tableViewSettings: ElectricalTableViewSettings;
  isEmployee: boolean;
  setColumnSettingsOpen: (open: boolean) => void;
  setCandidateColumnSettingsOpen: (open: boolean) => void;
  persistTableSettings: PersistTableSettings;
  persistCandidateTableColumnSettings: PersistCandidateTableColumnSettings;
};

export function useElecCalcColumnSettingsDraftState({
  tableColumnSettings,
  candidateTableColumnSettings,
  tableViewSettings,
  isEmployee,
  setColumnSettingsOpen,
  setCandidateColumnSettingsOpen,
  persistTableSettings,
  persistCandidateTableColumnSettings,
}: UseElecCalcColumnSettingsDraftStateOptions) {
  const [draftTableColumnSettings, setDraftTableColumnSettings] =
    useState<ElectricalTableColumnSettings>(() => tableColumnSettings);
  const [draftCandidateTableColumnSettings, setDraftCandidateTableColumnSettings] =
    useState<ElectricalCandidateTableColumnSettings>(() => candidateTableColumnSettings);
  const [draftTableViewSettings, setDraftTableViewSettings] =
    useState<ElectricalTableViewSettings>(() => tableViewSettings);

  const openColumnSettings = useCallback(() => {
    setDraftTableColumnSettings(normalizeElectricalTableColumnSettings(tableColumnSettings));
    setDraftTableViewSettings(
      normalizeElectricalTableViewSettings({
        ...tableViewSettings,
        calculationCableSource: isEmployee
          ? tableViewSettings.calculationCableSource
          : 'builtin',
      }),
    );
    setColumnSettingsOpen(true);
  }, [isEmployee, setColumnSettingsOpen, tableColumnSettings, tableViewSettings]);

  const openCandidateColumnSettings = useCallback(() => {
    setDraftCandidateTableColumnSettings(
      normalizeElectricalCandidateTableColumnSettings(candidateTableColumnSettings),
    );
    setCandidateColumnSettingsOpen(true);
  }, [candidateTableColumnSettings, setCandidateColumnSettingsOpen]);

  const updateDraftColumn = useCallback((key: ElectricalColumnKey, checked: boolean) => {
    setDraftTableColumnSettings((settings) =>
      setElectricalTableColumnVisibility(settings, key, checked),
    );
  }, []);

  const updateDraftColumnOrder = useCallback((key: ElectricalColumnKey, order: number) => {
    setDraftTableColumnSettings((settings) =>
      moveElectricalTableColumnToOrder(settings, key, order),
    );
  }, []);

  const reorderDraftColumn = useCallback((activeKey: ElectricalColumnKey, overKey: ElectricalColumnKey) => {
    setDraftTableColumnSettings((settings) =>
      reorderElectricalTableColumn(settings, activeKey, overKey),
    );
  }, []);

  const updateDraftColumnWidth = useCallback((key: ElectricalColumnKey, widthPct: number) => {
    setDraftTableColumnSettings((settings) =>
      setElectricalTableColumnWidthPct(settings, key, widthPct),
    );
  }, []);

  const updateDraftTableFontSize = useCallback((fontSize: ElectricalTableFontSize) => {
    setDraftTableViewSettings((settings) =>
      normalizeElectricalTableViewSettings({ ...settings, fontSize }),
    );
  }, []);

  const resetDraftTableFontSize = useCallback(() => {
    const defaultView = getDefaultElectricalTableViewSettings();
    setDraftTableViewSettings((settings) =>
      normalizeElectricalTableViewSettings({
        ...settings,
        fontSize: defaultView.fontSize,
      }),
    );
  }, []);

  const updateDraftTableLabelFormat = useCallback((tableLabelFormat: ElectricalTableLabelFormat) => {
    setDraftTableViewSettings((settings) =>
      normalizeElectricalTableViewSettings({
        ...settings,
        tableLabelFormat,
      }),
    );
  }, []);

  const updateDraftSettingsLabelFormat = useCallback((settingsLabelFormat: ElectricalTableLabelFormat) => {
    setDraftTableViewSettings((settings) =>
      normalizeElectricalTableViewSettings({
        ...settings,
        settingsLabelFormat,
      }),
    );
  }, []);

  const resetDraftLabelFormats = useCallback(() => {
    const defaultView = getDefaultElectricalTableViewSettings();
    setDraftTableViewSettings((settings) =>
      normalizeElectricalTableViewSettings({
        ...settings,
        tableLabelFormat: defaultView.tableLabelFormat,
        settingsLabelFormat: defaultView.settingsLabelFormat,
      }),
    );
  }, []);

  const updateDraftCalculationCableSource = useCallback((
    calculationCableSource: ElectricalCalculationCableSource,
  ) => {
    setDraftTableViewSettings((settings) =>
      normalizeElectricalTableViewSettings({
        ...settings,
        calculationCableSource,
      }),
    );
  }, []);

  const resetDraftColumnWidth = useCallback((key: ElectricalColumnKey) => {
    setDraftTableColumnSettings((settings) => resetElectricalTableColumnWidth(settings, key));
  }, []);

  const resetDraftColumns = useCallback(() => {
    setDraftTableColumnSettings(resetElectricalTableColumnSettings());
  }, []);

  const selectAllDraftColumns = useCallback(() => {
    setDraftTableColumnSettings((settings) =>
      createElectricalTableColumnSettingsPatch(settings, getAvailableElectricalTableColumnKeys()),
    );
  }, []);

  const applyColumnSettings = useCallback(() => {
    const normalized = normalizeElectricalTableColumnSettings(draftTableColumnSettings);
    const normalizedView = normalizeElectricalTableViewSettings(draftTableViewSettings);
    persistTableSettings(normalized, normalizedView);
  }, [draftTableColumnSettings, draftTableViewSettings, persistTableSettings]);

  const updateDraftCandidateColumn = useCallback((key: ElectricalCandidateColumnKey, checked: boolean) => {
    setDraftCandidateTableColumnSettings((settings) =>
      setElectricalCandidateTableColumnVisibility(settings, key, checked),
    );
  }, []);

  const updateDraftCandidateColumnOrder = useCallback((key: ElectricalCandidateColumnKey, order: number) => {
    setDraftCandidateTableColumnSettings((settings) =>
      moveElectricalCandidateTableColumnToOrder(settings, key, order),
    );
  }, []);

  const reorderDraftCandidateColumn = useCallback((
    activeKey: ElectricalCandidateColumnKey,
    overKey: ElectricalCandidateColumnKey,
  ) => {
    setDraftCandidateTableColumnSettings((settings) =>
      reorderElectricalCandidateTableColumn(settings, activeKey, overKey),
    );
  }, []);

  const updateDraftCandidateColumnWidth = useCallback((
    key: ElectricalCandidateColumnKey,
    widthPct: number,
  ) => {
    setDraftCandidateTableColumnSettings((settings) =>
      setElectricalCandidateTableColumnWidthPct(settings, key, widthPct),
    );
  }, []);

  const resetDraftCandidateColumnWidth = useCallback((key: ElectricalCandidateColumnKey) => {
    setDraftCandidateTableColumnSettings((settings) =>
      resetElectricalCandidateTableColumnWidth(settings, key),
    );
  }, []);

  const resetDraftCandidateColumns = useCallback(() => {
    setDraftCandidateTableColumnSettings(resetElectricalCandidateTableColumnSettings());
  }, []);

  const selectAllDraftCandidateColumns = useCallback(() => {
    setDraftCandidateTableColumnSettings((settings) =>
      createElectricalCandidateTableColumnSettingsPatch(
        settings,
        getAvailableElectricalCandidateTableColumnKeys(),
      ),
    );
  }, []);

  const applyCandidateColumnSettings = useCallback(() => {
    const normalized = normalizeElectricalCandidateTableColumnSettings(
      draftCandidateTableColumnSettings,
    );
    persistCandidateTableColumnSettings(normalized, { closeModal: true });
  }, [draftCandidateTableColumnSettings, persistCandidateTableColumnSettings]);

  return {
    draftTableColumnSettings,
    draftCandidateTableColumnSettings,
    draftTableViewSettings,
    openColumnSettings,
    openCandidateColumnSettings,
    updateDraftColumn,
    updateDraftColumnOrder,
    reorderDraftColumn,
    updateDraftColumnWidth,
    updateDraftTableFontSize,
    resetDraftTableFontSize,
    updateDraftTableLabelFormat,
    updateDraftSettingsLabelFormat,
    resetDraftLabelFormats,
    updateDraftCalculationCableSource,
    resetDraftColumnWidth,
    resetDraftColumns,
    selectAllDraftColumns,
    applyColumnSettings,
    updateDraftCandidateColumn,
    updateDraftCandidateColumnOrder,
    reorderDraftCandidateColumn,
    updateDraftCandidateColumnWidth,
    resetDraftCandidateColumnWidth,
    resetDraftCandidateColumns,
    selectAllDraftCandidateColumns,
    applyCandidateColumnSettings,
  };
}
