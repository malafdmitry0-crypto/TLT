import { useCallback, useEffect, useRef, useState } from 'react';
import { message as antdMessage } from 'antd';

import {
  clearRegisteredTableColumnCache,
  getDefaultTableColumnSettings,
  normalizeTableColumnSettings,
  writeGuestTableColumnSettings,
  writeRegisteredTableColumnCache,
  type HeatCalcTableColumnSettings,
} from '@/utils/heatCalcTableColumns';
import {
  clearGuestTableViewSettings,
  clearRegisteredTableViewCache,
  getDefaultTableViewSettings,
  isDefaultTableViewSettings,
  normalizeFormSectionWeights,
  normalizeTableViewSettings,
  writeGuestTableViewSettings,
  writeRegisteredTableViewCache,
  type HeatCalcFormSectionWeights,
  type HeatCalcTableViewSettings,
} from '@/utils/heatCalcTableViewSettings';
import {
  clearGuestCalculationDetailsSettings,
  clearRegisteredCalculationDetailsCache,
  getDefaultCalculationDetailsSettings,
  normalizeCalculationDetailsSettings,
  writeGuestCalculationDetailsSettings,
  writeRegisteredCalculationDetailsCache,
  type HeatCalcCalculationDetailsSettings,
} from '@/utils/heatCalcCalculationDetailsSettings';
import {
  clearGuestFieldInputSettings,
  clearRegisteredFieldInputCache,
} from '@/utils/heatCalcFieldInputSettings';
import {
  hasCalculationDetailsSettingsChanged,
  hasTableViewSettingsChanged,
  normalizePreferenceBundle,
  planGuestCalculationDetailsWrite,
  planGuestTableViewWrite,
  planPreferenceHydration,
  resolveInitialCalculationDetailsSettings,
  resolveInitialTableColumnSettings,
  resolveInitialTableViewSettings,
  type GuestSettingsWriteAction,
  type PreferenceUserContext,
} from '@/pages/heatcalc/heatCalcPreferencesModel';
import { useHeatCalcPreferenceServerSync } from '@/pages/heatcalc/useHeatCalcPreferenceServerSync';

type UseHeatCalcPreferencesOptions = PreferenceUserContext & {
  onCloseSettingsModal?: () => void;
};

function applyGuestWriteAction<T>(
  action: GuestSettingsWriteAction<T>,
  write: (settings: T) => void,
  clear: () => void,
) {
  if (action.kind === 'write') write(action.settings);
  else if (action.kind === 'clear') clear();
}

export function useHeatCalcPreferences({
  isRegisteredUser,
  registeredUserId,
  onCloseSettingsModal,
}: UseHeatCalcPreferencesOptions) {
  const userCtx: PreferenceUserContext = { isRegisteredUser, registeredUserId };

  const [tableColumnSettings, setTableColumnSettings] = useState<HeatCalcTableColumnSettings>(
    () => resolveInitialTableColumnSettings(userCtx),
  );
  const tableColumnSettingsRef = useRef(tableColumnSettings);
  const [tableViewSettings, setTableViewSettings] = useState<HeatCalcTableViewSettings>(
    () => resolveInitialTableViewSettings(userCtx),
  );
  const tableViewSettingsRef = useRef(tableViewSettings);
  const [calculationDetailsSettings, setCalculationDetailsSettings] =
    useState<HeatCalcCalculationDetailsSettings>(
      () => resolveInitialCalculationDetailsSettings(userCtx),
    );

  useEffect(() => {
    tableColumnSettingsRef.current = tableColumnSettings;
  }, [tableColumnSettings]);

  useEffect(() => {
    tableViewSettingsRef.current = tableViewSettings;
  }, [tableViewSettings]);

  const {
    persistedTableColumnPreference,
    persistedTableViewPreference,
    persistedCalculationDetailsPreference,
    updateTableColumnPreference,
    updateTableSettingsPreference,
    updateTableViewPreference,
    preferenceSavePending,
  } = useHeatCalcPreferenceServerSync({
    isRegisteredUser,
    onCloseSettingsModal,
    setTableColumnSettings,
    setTableViewSettings,
    setCalculationDetailsSettings,
    tableViewSettingsRef,
  });

  useEffect(() => {
    clearGuestFieldInputSettings();
    clearRegisteredFieldInputCache(registeredUserId);
  }, [registeredUserId]);

  useEffect(() => {
    setTableColumnSettings(resolveInitialTableColumnSettings({
      isRegisteredUser,
      registeredUserId,
    }));
    const view = resolveInitialTableViewSettings({ isRegisteredUser, registeredUserId });
    tableViewSettingsRef.current = view;
    setTableViewSettings(view);
    setCalculationDetailsSettings(resolveInitialCalculationDetailsSettings({
      isRegisteredUser,
      registeredUserId,
    }));
  }, [isRegisteredUser, registeredUserId]);

  useEffect(() => {
    const plan = planPreferenceHydration(
      isRegisteredUser,
      persistedTableColumnPreference,
      registeredUserId,
      normalizeTableColumnSettings,
    );
    if (!plan) return;
    if (plan.kind === 'apply') {
      setTableColumnSettings(plan.settings);
      if (plan.cacheUserId) writeRegisteredTableColumnCache(plan.cacheUserId, plan.settings);
      return;
    }
    clearRegisteredTableColumnCache(plan.clearUserId);
    setTableColumnSettings(getDefaultTableColumnSettings());
  }, [isRegisteredUser, persistedTableColumnPreference, registeredUserId]);

  useEffect(() => {
    const plan = planPreferenceHydration(
      isRegisteredUser,
      persistedTableViewPreference,
      registeredUserId,
      normalizeTableViewSettings,
    );
    if (!plan) return;
    if (plan.kind === 'apply') {
      tableViewSettingsRef.current = plan.settings;
      setTableViewSettings(plan.settings);
      if (plan.cacheUserId) writeRegisteredTableViewCache(plan.cacheUserId, plan.settings);
      return;
    }
    clearRegisteredTableViewCache(plan.clearUserId);
    const defaults = getDefaultTableViewSettings();
    tableViewSettingsRef.current = defaults;
    setTableViewSettings(defaults);
  }, [isRegisteredUser, persistedTableViewPreference, registeredUserId]);

  useEffect(() => {
    const plan = planPreferenceHydration(
      isRegisteredUser,
      persistedCalculationDetailsPreference,
      registeredUserId,
      normalizeCalculationDetailsSettings,
    );
    if (!plan) return;
    if (plan.kind === 'apply') {
      setCalculationDetailsSettings(plan.settings);
      if (plan.cacheUserId) {
        writeRegisteredCalculationDetailsCache(plan.cacheUserId, plan.settings);
      }
      return;
    }
    clearRegisteredCalculationDetailsCache(plan.clearUserId);
    setCalculationDetailsSettings(getDefaultCalculationDetailsSettings());
  }, [isRegisteredUser, persistedCalculationDetailsPreference, registeredUserId]);

  const persistTableColumnSettings = useCallback((
    settings: HeatCalcTableColumnSettings,
    options: { closeModal?: boolean; showMessage?: boolean } = {},
  ) => {
    const normalized = normalizeTableColumnSettings(settings);
    setTableColumnSettings(normalized);
    if (isRegisteredUser) {
      clearRegisteredTableColumnCache(registeredUserId);
      updateTableColumnPreference.mutate({
        settings: normalized,
        closeModal: options.closeModal,
        showMessage: options.showMessage,
      });
      return;
    }
    writeGuestTableColumnSettings(normalized);
    if (options.closeModal) onCloseSettingsModal?.();
    if (options.showMessage !== false) antdMessage.success('Настройки таблицы сохранены');
  }, [isRegisteredUser, onCloseSettingsModal, registeredUserId, updateTableColumnPreference]);

  const persistTableSettings = useCallback((
    columnSettings: HeatCalcTableColumnSettings,
    viewSettings: HeatCalcTableViewSettings,
    calculationDetails: HeatCalcCalculationDetailsSettings,
  ) => {
    const {
      columns: normalizedColumns,
      view: normalizedView,
      details: normalizedDetails,
    } = normalizePreferenceBundle(columnSettings, viewSettings, calculationDetails);
    const viewChanged = hasTableViewSettingsChanged(normalizedView, tableViewSettings);
    const detailsChanged = hasCalculationDetailsSettingsChanged(
      normalizedDetails,
      calculationDetailsSettings,
    );
    setTableColumnSettings(normalizedColumns);
    tableViewSettingsRef.current = normalizedView;
    setTableViewSettings(normalizedView);
    setCalculationDetailsSettings(normalizedDetails);
    if (isRegisteredUser) {
      clearRegisteredTableColumnCache(registeredUserId);
      if (viewChanged) clearRegisteredTableViewCache(registeredUserId);
      if (detailsChanged) clearRegisteredCalculationDetailsCache(registeredUserId);
      updateTableSettingsPreference.mutate({
        columnSettings: normalizedColumns,
        viewSettings: viewChanged ? normalizedView : undefined,
        calculationDetailsSettings: detailsChanged ? normalizedDetails : undefined,
      });
      return;
    }
    writeGuestTableColumnSettings(normalizedColumns);
    applyGuestWriteAction(
      planGuestTableViewWrite(viewChanged, normalizedView),
      writeGuestTableViewSettings,
      clearGuestTableViewSettings,
    );
    applyGuestWriteAction(
      planGuestCalculationDetailsWrite(detailsChanged, normalizedDetails),
      writeGuestCalculationDetailsSettings,
      clearGuestCalculationDetailsSettings,
    );
    onCloseSettingsModal?.();
    antdMessage.success('Настройки таблицы сохранены');
  }, [
    calculationDetailsSettings,
    isRegisteredUser,
    onCloseSettingsModal,
    registeredUserId,
    tableViewSettings,
    updateTableSettingsPreference,
  ]);

  const persistTableViewOnly = useCallback((viewSettings: HeatCalcTableViewSettings) => {
    const normalizedView = normalizeTableViewSettings(viewSettings);
    tableViewSettingsRef.current = normalizedView;
    setTableViewSettings(normalizedView);
    if (isRegisteredUser) {
      clearRegisteredTableViewCache(registeredUserId);
      updateTableViewPreference.mutate(normalizedView);
      return;
    }
    if (isDefaultTableViewSettings(normalizedView)) {
      clearGuestTableViewSettings();
    } else {
      writeGuestTableViewSettings(normalizedView);
    }
  }, [isRegisteredUser, registeredUserId, updateTableViewPreference]);

  const updateTableColumnSettingsDraft = useCallback((
    updater: (settings: HeatCalcTableColumnSettings) => HeatCalcTableColumnSettings,
  ) => {
    setTableColumnSettings((current) => {
      const normalized = normalizeTableColumnSettings(updater(current));
      tableColumnSettingsRef.current = normalized;
      return normalized;
    });
  }, []);

  const applySideFormWidthPct = useCallback((widthPct: number) => {
    const normalizedView = normalizeTableViewSettings({
      ...tableViewSettingsRef.current,
      sideFormWidthPct: widthPct,
    });
    tableViewSettingsRef.current = normalizedView;
    setTableViewSettings(normalizedView);
    return normalizedView;
  }, []);

  const applyFormSectionWeights = useCallback((formSectionWeights: HeatCalcFormSectionWeights) => {
    const normalizedView = normalizeTableViewSettings({
      ...tableViewSettingsRef.current,
      formSectionWeights: normalizeFormSectionWeights(formSectionWeights),
    });
    tableViewSettingsRef.current = normalizedView;
    setTableViewSettings(normalizedView);
    return normalizedView;
  }, []);

  const commitFormSectionWeights = useCallback((formSectionWeights: HeatCalcFormSectionWeights) => {
    const normalizedView = applyFormSectionWeights(formSectionWeights);
    persistTableViewOnly(normalizedView);
  }, [applyFormSectionWeights, persistTableViewOnly]);

  return {
    tableColumnSettings,
    tableColumnSettingsRef,
    tableViewSettings,
    tableViewSettingsRef,
    calculationDetailsSettings,
    preferenceSavePending,
    persistTableColumnSettings,
    persistTableSettings,
    persistTableViewOnly,
    updateTableColumnSettingsDraft,
    applySideFormWidthPct,
    applyFormSectionWeights,
    commitFormSectionWeights,
  };
}
