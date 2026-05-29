import { useCallback, useState } from 'react';

import {
  createTableColumnSettingsPatch,
  getAvailableTableColumnKeys,
  moveTableColumnToOrder,
  normalizeTableColumnSettings,
  reorderTableColumn,
  resetTableColumnTypeSettings,
  resetTableColumnWidth,
  setTableColumnVisibility,
  setTableColumnWidthPct,
  type HeatCalcColumnKey,
  type HeatCalcObjectType,
  type HeatCalcTableColumnSettings,
  type HeatCalcTableColumnScope,
} from '@/utils/heatCalcTableColumns';
import {
  getDefaultTableViewSettings,
  normalizeTableViewSettings,
  type HeatCalcFormPlacement,
  type HeatCalcTableFontSize,
  type HeatCalcTableLabelFormat,
  type HeatCalcTableViewSettings,
} from '@/utils/heatCalcTableViewSettings';
import {
  getDefaultCalculationDetailsSettings,
  normalizeCalculationDetailsSettings,
  setCalculationDetailsMetrics,
  setCalculationDetailsPreset,
  type HeatCalcCalculationDetailMetric,
  type HeatCalcCalculationDetailPreset,
  type HeatCalcCalculationDetailsSettings,
} from '@/utils/heatCalcCalculationDetailsSettings';
import {
  normalizeFieldInputSettings,
  resetHeatCalcFieldStep,
  setHeatCalcFieldStep,
  type HeatCalcFieldInputSettings,
} from '@/utils/heatCalcFieldInputSettings';

export type PendingInlineDisableSettings = {
  columnSettings: HeatCalcTableColumnSettings;
  viewSettings: HeatCalcTableViewSettings;
  calculationDetailsSettings: HeatCalcCalculationDetailsSettings;
  fieldInputSettings: HeatCalcFieldInputSettings;
};

type SaveDraftRowsResult = {
  ok: boolean;
};

type UseHeatCalcColumnSettingsDialogOptions = {
  activeTableColumnScope: HeatCalcTableColumnScope;
  tableColumnSettings: HeatCalcTableColumnSettings;
  tableViewSettings: HeatCalcTableViewSettings;
  calculationDetailsSettings: HeatCalcCalculationDetailsSettings;
  fieldInputSettings: HeatCalcFieldInputSettings;
  dirtyDraftRowCount: number;
  cleanHiddenColumnStateForSettings: (settings: HeatCalcTableColumnSettings) => void;
  persistTableSettings: (
    columnSettings: HeatCalcTableColumnSettings,
    viewSettings: HeatCalcTableViewSettings,
    calculationDetailsSettings: HeatCalcCalculationDetailsSettings,
    fieldInputSettings: HeatCalcFieldInputSettings,
  ) => void;
};

export function useHeatCalcColumnSettingsDialog({
  activeTableColumnScope,
  tableColumnSettings,
  tableViewSettings,
  calculationDetailsSettings,
  fieldInputSettings,
  dirtyDraftRowCount,
  cleanHiddenColumnStateForSettings,
  persistTableSettings,
}: UseHeatCalcColumnSettingsDialogOptions) {
  const [isOpen, setIsOpen] = useState(false);
  const [activeType, setActiveType] = useState<HeatCalcTableColumnScope>('pipe');
  const [draftColumnSettings, setDraftColumnSettings] = useState<HeatCalcTableColumnSettings>(
    () => tableColumnSettings,
  );
  const [draftViewSettings, setDraftViewSettings] = useState<HeatCalcTableViewSettings>(
    () => tableViewSettings,
  );
  const [draftCalculationDetailsSettings, setDraftCalculationDetailsSettings] =
    useState<HeatCalcCalculationDetailsSettings>(() => calculationDetailsSettings);
  const [draftFieldInputSettings, setDraftFieldInputSettings] =
    useState<HeatCalcFieldInputSettings>(() => fieldInputSettings);
  const [pendingInlineDisableSettings, setPendingInlineDisableSettings] =
    useState<PendingInlineDisableSettings | null>(null);

  const close = useCallback(() => {
    setIsOpen(false);
  }, []);

  const open = useCallback(() => {
    setActiveType(activeTableColumnScope);
    setDraftColumnSettings(normalizeTableColumnSettings(tableColumnSettings));
    setDraftViewSettings(normalizeTableViewSettings(tableViewSettings));
    setDraftCalculationDetailsSettings(normalizeCalculationDetailsSettings(calculationDetailsSettings));
    setDraftFieldInputSettings(normalizeFieldInputSettings(fieldInputSettings));
    setIsOpen(true);
  }, [
    activeTableColumnScope,
    calculationDetailsSettings,
    fieldInputSettings,
    tableColumnSettings,
    tableViewSettings,
  ]);

  const updateDraftColumn = useCallback((
    type: HeatCalcTableColumnScope,
    key: HeatCalcColumnKey,
    checked: boolean,
  ) => {
    setDraftColumnSettings((settings) => setTableColumnVisibility(settings, type, key, checked));
  }, []);

  const updateDraftColumnOrder = useCallback((
    type: HeatCalcTableColumnScope,
    key: HeatCalcColumnKey,
    order: number,
  ) => {
    setDraftColumnSettings((settings) => moveTableColumnToOrder(settings, type, key, order));
  }, []);

  const updateDraftColumnWidth = useCallback((
    type: HeatCalcTableColumnScope,
    key: HeatCalcColumnKey,
    widthPct: number,
  ) => {
    setDraftColumnSettings((settings) => setTableColumnWidthPct(settings, type, key, widthPct));
  }, []);

  const resetDraftColumnWidth = useCallback((type: HeatCalcTableColumnScope, key: HeatCalcColumnKey) => {
    setDraftColumnSettings((settings) => resetTableColumnWidth(settings, type, key));
  }, []);

  const reorderDraftColumn = useCallback((
    type: HeatCalcTableColumnScope,
    activeKey: HeatCalcColumnKey,
    overKey: HeatCalcColumnKey,
  ) => {
    if (activeKey === overKey) return;
    setDraftColumnSettings((settings) => reorderTableColumn(settings, type, activeKey, overKey));
  }, []);

  const resetDraftColumns = useCallback((type: HeatCalcTableColumnScope) => {
    setDraftColumnSettings((settings) => resetTableColumnTypeSettings(settings, type));
  }, []);

  const selectAllDraftColumns = useCallback((type: HeatCalcTableColumnScope) => {
    setDraftColumnSettings((settings) =>
      createTableColumnSettingsPatch(settings, type, getAvailableTableColumnKeys(type)),
    );
  }, []);

  const updateDraftTableFontSize = useCallback((fontSize: HeatCalcTableFontSize) => {
    setDraftViewSettings((settings) => normalizeTableViewSettings({ ...settings, fontSize }));
  }, []);

  const resetDraftTableFontSize = useCallback(() => {
    const defaultView = getDefaultTableViewSettings();
    setDraftViewSettings((settings) => normalizeTableViewSettings({
      ...settings,
      fontSize: defaultView.fontSize,
    }));
  }, []);

  const updateDraftTableLabelFormat = useCallback((tableLabelFormat: HeatCalcTableLabelFormat) => {
    setDraftViewSettings((settings) => normalizeTableViewSettings({
      ...settings,
      tableLabelFormat,
    }));
  }, []);

  const updateDraftSettingsLabelFormat = useCallback((settingsLabelFormat: HeatCalcTableLabelFormat) => {
    setDraftViewSettings((settings) => normalizeTableViewSettings({
      ...settings,
      settingsLabelFormat,
    }));
  }, []);

  const resetDraftLabelFormats = useCallback(() => {
    const defaultView = getDefaultTableViewSettings();
    setDraftViewSettings((settings) => normalizeTableViewSettings({
      ...settings,
      tableLabelFormat: defaultView.tableLabelFormat,
      settingsLabelFormat: defaultView.settingsLabelFormat,
    }));
  }, []);

  const updateDraftFormPlacement = useCallback((formPlacement: HeatCalcFormPlacement) => {
    setDraftViewSettings((settings) => normalizeTableViewSettings({ ...settings, formPlacement }));
  }, []);

  const updateDraftInlineEditingEnabled = useCallback((inlineEditingEnabled: boolean) => {
    setDraftViewSettings((settings) => normalizeTableViewSettings({
      ...settings,
      inlineEditingEnabled,
    }));
  }, []);

  const updateDraftCalculationDetailsPreset = useCallback((preset: HeatCalcCalculationDetailPreset) => {
    setDraftCalculationDetailsSettings((settings) => setCalculationDetailsPreset(settings, preset));
  }, []);

  const updateDraftCalculationDetailMetrics = useCallback((metrics: HeatCalcCalculationDetailMetric[]) => {
    setDraftCalculationDetailsSettings((settings) => setCalculationDetailsMetrics(settings, metrics));
  }, []);

  const resetDraftCalculationDetails = useCallback(() => {
    setDraftCalculationDetailsSettings(getDefaultCalculationDetailsSettings());
  }, []);

  const updateDraftFieldStep = useCallback((type: HeatCalcObjectType, fieldId: string, step: number | null) => {
    setDraftFieldInputSettings((settings) => setHeatCalcFieldStep(settings, type, fieldId, step));
  }, []);

  const resetDraftFieldStep = useCallback((type: HeatCalcObjectType, fieldId: string) => {
    setDraftFieldInputSettings((settings) => resetHeatCalcFieldStep(settings, type, fieldId));
  }, []);

  const apply = useCallback(() => {
    const normalized = normalizeTableColumnSettings(draftColumnSettings);
    const normalizedView = normalizeTableViewSettings(draftViewSettings);
    const normalizedDetails = normalizeCalculationDetailsSettings(draftCalculationDetailsSettings);
    const normalizedFieldInputs = normalizeFieldInputSettings(draftFieldInputSettings);
    if (
      normalizeTableViewSettings(tableViewSettings).inlineEditingEnabled
      && !normalizedView.inlineEditingEnabled
      && dirtyDraftRowCount > 0
    ) {
      setPendingInlineDisableSettings({
        columnSettings: normalized,
        viewSettings: normalizedView,
        calculationDetailsSettings: normalizedDetails,
        fieldInputSettings: normalizedFieldInputs,
      });
      return;
    }
    cleanHiddenColumnStateForSettings(normalized);
    persistTableSettings(normalized, normalizedView, normalizedDetails, normalizedFieldInputs);
  }, [
    cleanHiddenColumnStateForSettings,
    dirtyDraftRowCount,
    draftCalculationDetailsSettings,
    draftColumnSettings,
    draftFieldInputSettings,
    draftViewSettings,
    persistTableSettings,
    tableViewSettings,
  ]);

  const cancelPendingInlineDisable = useCallback(() => {
    setPendingInlineDisableSettings(null);
    setDraftViewSettings(tableViewSettings);
    setDraftCalculationDetailsSettings(calculationDetailsSettings);
    setDraftFieldInputSettings(fieldInputSettings);
  }, [calculationDetailsSettings, fieldInputSettings, tableViewSettings]);

  const discardPendingInlineDisable = useCallback((discardDraftRows: () => void) => {
    const pending = pendingInlineDisableSettings;
    if (!pending) return;
    discardDraftRows();
    persistTableSettings(
      pending.columnSettings,
      pending.viewSettings,
      pending.calculationDetailsSettings,
      pending.fieldInputSettings,
    );
    setPendingInlineDisableSettings(null);
  }, [pendingInlineDisableSettings, persistTableSettings]);

  const savePendingInlineDisable = useCallback(async (
    saveDraftRows: () => Promise<SaveDraftRowsResult>,
  ) => {
    const pending = pendingInlineDisableSettings;
    if (!pending) return;
    const result = await saveDraftRows();
    if (!result.ok) return;
    persistTableSettings(
      pending.columnSettings,
      pending.viewSettings,
      pending.calculationDetailsSettings,
      pending.fieldInputSettings,
    );
    setPendingInlineDisableSettings(null);
  }, [pendingInlineDisableSettings, persistTableSettings]);

  return {
    isOpen,
    activeType,
    draftColumnSettings,
    draftViewSettings,
    draftCalculationDetailsSettings,
    draftFieldInputSettings,
    pendingInlineDisableSettings,
    setActiveType,
    open,
    close,
    updateDraftColumn,
    updateDraftColumnOrder,
    updateDraftColumnWidth,
    resetDraftColumnWidth,
    reorderDraftColumn,
    resetDraftColumns,
    selectAllDraftColumns,
    updateDraftTableFontSize,
    updateDraftTableLabelFormat,
    updateDraftSettingsLabelFormat,
    updateDraftFormPlacement,
    updateDraftInlineEditingEnabled,
    resetDraftTableFontSize,
    resetDraftLabelFormats,
    updateDraftCalculationDetailsPreset,
    updateDraftCalculationDetailMetrics,
    resetDraftCalculationDetails,
    updateDraftFieldStep,
    resetDraftFieldStep,
    apply,
    cancelPendingInlineDisable,
    discardPendingInlineDisable,
    savePendingInlineDisable,
  };
}
