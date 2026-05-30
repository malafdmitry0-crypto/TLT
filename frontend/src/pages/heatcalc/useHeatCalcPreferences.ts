import { useCallback, useEffect, useRef, useState } from 'react';
import { message as antdMessage } from 'antd';
import { useMutation, useQuery } from '@tanstack/react-query';

import { getUserPreference, updateUserPreference } from '@/api/preferences';
import {
  HEATCALC_TABLE_COLUMN_PREF_KEY,
  clearRegisteredTableColumnCache,
  getDefaultTableColumnSettings,
  normalizeTableColumnSettings,
  readGuestTableColumnSettings,
  readRegisteredTableColumnCache,
  writeGuestTableColumnSettings,
  writeRegisteredTableColumnCache,
  type HeatCalcTableColumnSettings,
} from '@/utils/heatCalcTableColumns';
import {
  HEATCALC_TABLE_VIEW_PREF_KEY,
  areFormSectionWeightsEqual,
  clearGuestTableViewSettings,
  clearRegisteredTableViewCache,
  getDefaultTableViewSettings,
  isDefaultTableViewSettings,
  normalizeFormSectionWeights,
  normalizeTableViewSettings,
  readGuestTableViewSettings,
  readRegisteredTableViewCache,
  writeGuestTableViewSettings,
  writeRegisteredTableViewCache,
  type HeatCalcFormSectionWeights,
  type HeatCalcTableViewSettings,
} from '@/utils/heatCalcTableViewSettings';
import {
  HEATCALC_CALCULATION_DETAILS_PREF_KEY,
  clearGuestCalculationDetailsSettings,
  clearRegisteredCalculationDetailsCache,
  getDefaultCalculationDetailsSettings,
  isDefaultCalculationDetailsSettings,
  normalizeCalculationDetailsSettings,
  readGuestCalculationDetailsSettings,
  readRegisteredCalculationDetailsCache,
  writeGuestCalculationDetailsSettings,
  writeRegisteredCalculationDetailsCache,
  type HeatCalcCalculationDetailsSettings,
} from '@/utils/heatCalcCalculationDetailsSettings';
import {
  clearGuestFieldInputSettings,
  clearRegisteredFieldInputCache,
} from '@/utils/heatCalcFieldInputSettings';

type TableColumnPreferenceMutation = {
  settings: HeatCalcTableColumnSettings;
  closeModal?: boolean;
  showMessage?: boolean;
};

type TableSettingsPreferenceMutation = {
  columnSettings: HeatCalcTableColumnSettings;
  viewSettings?: HeatCalcTableViewSettings;
  calculationDetailsSettings?: HeatCalcCalculationDetailsSettings;
};

type UseHeatCalcPreferencesOptions = {
  isRegisteredUser: boolean;
  registeredUserId: string | null;
  onCloseSettingsModal?: () => void;
};

export function useHeatCalcPreferences({
  isRegisteredUser,
  registeredUserId,
  onCloseSettingsModal,
}: UseHeatCalcPreferencesOptions) {
  const [tableColumnSettings, setTableColumnSettings] = useState<HeatCalcTableColumnSettings>(() => {
    if (isRegisteredUser) {
      return readRegisteredTableColumnCache(registeredUserId) ?? getDefaultTableColumnSettings();
    }
    return readGuestTableColumnSettings();
  });
  const tableColumnSettingsRef = useRef(tableColumnSettings);
  const [tableViewSettings, setTableViewSettings] = useState<HeatCalcTableViewSettings>(() => {
    if (isRegisteredUser) {
      return readRegisteredTableViewCache(registeredUserId) ?? getDefaultTableViewSettings();
    }
    return readGuestTableViewSettings();
  });
  const tableViewSettingsRef = useRef(tableViewSettings);
  const [calculationDetailsSettings, setCalculationDetailsSettings] =
    useState<HeatCalcCalculationDetailsSettings>(() => {
      if (isRegisteredUser) {
        return readRegisteredCalculationDetailsCache(registeredUserId)
          ?? getDefaultCalculationDetailsSettings();
      }
      return readGuestCalculationDetailsSettings();
    });

  useEffect(() => {
    tableColumnSettingsRef.current = tableColumnSettings;
  }, [tableColumnSettings]);

  useEffect(() => {
    tableViewSettingsRef.current = tableViewSettings;
  }, [tableViewSettings]);

  const { data: persistedTableColumnPreference } = useQuery({
    queryKey: ['preference', HEATCALC_TABLE_COLUMN_PREF_KEY],
    queryFn: () => getUserPreference<HeatCalcTableColumnSettings>(HEATCALC_TABLE_COLUMN_PREF_KEY),
    enabled: isRegisteredUser,
    staleTime: 30_000,
  });

  const { data: persistedTableViewPreference } = useQuery({
    queryKey: ['preference', HEATCALC_TABLE_VIEW_PREF_KEY],
    queryFn: () => getUserPreference<HeatCalcTableViewSettings>(HEATCALC_TABLE_VIEW_PREF_KEY),
    enabled: isRegisteredUser,
    staleTime: 30_000,
  });

  const { data: persistedCalculationDetailsPreference } = useQuery({
    queryKey: ['preference', HEATCALC_CALCULATION_DETAILS_PREF_KEY],
    queryFn: () => getUserPreference<HeatCalcCalculationDetailsSettings>(HEATCALC_CALCULATION_DETAILS_PREF_KEY),
    enabled: isRegisteredUser,
    staleTime: 30_000,
  });

  const updateTableColumnPreference = useMutation({
    mutationFn: ({ settings }: TableColumnPreferenceMutation) =>
      updateUserPreference<HeatCalcTableColumnSettings>(
        HEATCALC_TABLE_COLUMN_PREF_KEY,
        normalizeTableColumnSettings(settings),
      ),
    onSuccess: (preference, variables) => {
      const normalized = normalizeTableColumnSettings(preference.value);
      setTableColumnSettings(normalized);
      if (preference.user_id) {
        writeRegisteredTableColumnCache(preference.user_id, normalized);
      }
      if (variables.closeModal) onCloseSettingsModal?.();
      if (variables.showMessage !== false) antdMessage.success('Настройки таблицы сохранены');
    },
    onError: (error) => {
      antdMessage.error(error instanceof Error ? error.message : 'Не удалось сохранить настройки таблицы');
    },
  });

  const updateTableSettingsPreference = useMutation({
    mutationFn: async ({
      columnSettings,
      viewSettings,
      calculationDetailsSettings: calculationDetailsPreferenceSettings,
    }: TableSettingsPreferenceMutation) => {
      const columnPreference = await updateUserPreference<HeatCalcTableColumnSettings>(
        HEATCALC_TABLE_COLUMN_PREF_KEY,
        normalizeTableColumnSettings(columnSettings),
      );
      const viewPreference = viewSettings
        ? await updateUserPreference<HeatCalcTableViewSettings>(
          HEATCALC_TABLE_VIEW_PREF_KEY,
          normalizeTableViewSettings(viewSettings),
        )
        : null;
      const calculationDetailsPreference = calculationDetailsPreferenceSettings
        ? await updateUserPreference<HeatCalcCalculationDetailsSettings>(
          HEATCALC_CALCULATION_DETAILS_PREF_KEY,
          normalizeCalculationDetailsSettings(calculationDetailsPreferenceSettings),
        )
        : null;
      return {
        columnPreference,
        viewPreference,
        calculationDetailsPreference,
      };
    },
    onSuccess: ({
      columnPreference,
      viewPreference,
      calculationDetailsPreference,
    }) => {
      const normalizedColumns = normalizeTableColumnSettings(columnPreference.value);
      setTableColumnSettings(normalizedColumns);
      if (columnPreference.user_id) {
        writeRegisteredTableColumnCache(columnPreference.user_id, normalizedColumns);
      }
      if (viewPreference) {
        const normalizedView = normalizeTableViewSettings(viewPreference.value);
        tableViewSettingsRef.current = normalizedView;
        setTableViewSettings(normalizedView);
        if (viewPreference.user_id) {
          writeRegisteredTableViewCache(viewPreference.user_id, normalizedView);
        }
      }
      if (calculationDetailsPreference) {
        const normalizedDetails = normalizeCalculationDetailsSettings(calculationDetailsPreference.value);
        setCalculationDetailsSettings(normalizedDetails);
        if (calculationDetailsPreference.user_id) {
          writeRegisteredCalculationDetailsCache(calculationDetailsPreference.user_id, normalizedDetails);
        }
      }
      onCloseSettingsModal?.();
      antdMessage.success('Настройки таблицы сохранены');
    },
    onError: (error) => {
      antdMessage.error(error instanceof Error ? error.message : 'Не удалось сохранить настройки таблицы');
    },
  });

  const updateTableViewPreference = useMutation({
    mutationFn: (settings: HeatCalcTableViewSettings) =>
      updateUserPreference<HeatCalcTableViewSettings>(
        HEATCALC_TABLE_VIEW_PREF_KEY,
        normalizeTableViewSettings(settings),
      ),
    onSuccess: (preference) => {
      const normalizedView = normalizeTableViewSettings(preference.value);
      tableViewSettingsRef.current = normalizedView;
      setTableViewSettings(normalizedView);
      if (preference.user_id) {
        writeRegisteredTableViewCache(preference.user_id, normalizedView);
      }
    },
    onError: (error) => {
      antdMessage.error(error instanceof Error ? error.message : 'Не удалось сохранить настройки отображения');
    },
  });

  useEffect(() => {
    clearGuestFieldInputSettings();
    clearRegisteredFieldInputCache(registeredUserId);
  }, [registeredUserId]);

  useEffect(() => {
    if (isRegisteredUser) {
      const registeredTableViewSettings =
        readRegisteredTableViewCache(registeredUserId) ?? getDefaultTableViewSettings();
      setTableColumnSettings(
        readRegisteredTableColumnCache(registeredUserId) ?? getDefaultTableColumnSettings(),
      );
      tableViewSettingsRef.current = registeredTableViewSettings;
      setTableViewSettings(registeredTableViewSettings);
      setCalculationDetailsSettings(
        readRegisteredCalculationDetailsCache(registeredUserId) ?? getDefaultCalculationDetailsSettings(),
      );
      return;
    }
    const guestTableViewSettings = readGuestTableViewSettings();
    setTableColumnSettings(readGuestTableColumnSettings());
    tableViewSettingsRef.current = guestTableViewSettings;
    setTableViewSettings(guestTableViewSettings);
    setCalculationDetailsSettings(readGuestCalculationDetailsSettings());
  }, [isRegisteredUser, registeredUserId]);

  useEffect(() => {
    if (!isRegisteredUser || !persistedTableColumnPreference) return;
    if (persistedTableColumnPreference.value) {
      const normalized = normalizeTableColumnSettings(persistedTableColumnPreference.value);
      setTableColumnSettings(normalized);
      if (persistedTableColumnPreference.user_id) {
        writeRegisteredTableColumnCache(persistedTableColumnPreference.user_id, normalized);
      }
      return;
    }
    clearRegisteredTableColumnCache(registeredUserId ?? persistedTableColumnPreference.user_id);
    setTableColumnSettings(getDefaultTableColumnSettings());
  }, [isRegisteredUser, persistedTableColumnPreference, registeredUserId]);

  useEffect(() => {
    if (!isRegisteredUser || !persistedTableViewPreference) return;
    if (persistedTableViewPreference.value) {
      const normalized = normalizeTableViewSettings(persistedTableViewPreference.value);
      tableViewSettingsRef.current = normalized;
      setTableViewSettings(normalized);
      if (persistedTableViewPreference.user_id) {
        writeRegisteredTableViewCache(persistedTableViewPreference.user_id, normalized);
      }
      return;
    }
    clearRegisteredTableViewCache(registeredUserId ?? persistedTableViewPreference.user_id);
    const defaults = getDefaultTableViewSettings();
    tableViewSettingsRef.current = defaults;
    setTableViewSettings(defaults);
  }, [isRegisteredUser, persistedTableViewPreference, registeredUserId]);

  useEffect(() => {
    if (!isRegisteredUser || !persistedCalculationDetailsPreference) return;
    if (persistedCalculationDetailsPreference.value) {
      const normalized = normalizeCalculationDetailsSettings(persistedCalculationDetailsPreference.value);
      setCalculationDetailsSettings(normalized);
      if (persistedCalculationDetailsPreference.user_id) {
        writeRegisteredCalculationDetailsCache(persistedCalculationDetailsPreference.user_id, normalized);
      }
      return;
    }
    clearRegisteredCalculationDetailsCache(registeredUserId ?? persistedCalculationDetailsPreference.user_id);
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
    const normalizedColumns = normalizeTableColumnSettings(columnSettings);
    const normalizedView = normalizeTableViewSettings(viewSettings);
    const normalizedDetails = normalizeCalculationDetailsSettings(calculationDetails);
    const currentView = normalizeTableViewSettings(tableViewSettings);
    const currentDetails = normalizeCalculationDetailsSettings(calculationDetailsSettings);
    const viewChanged = normalizedView.fontSize !== currentView.fontSize
      || normalizedView.tableLabelFormat !== currentView.tableLabelFormat
      || normalizedView.settingsLabelFormat !== currentView.settingsLabelFormat
      || normalizedView.formPlacement !== currentView.formPlacement
      || normalizedView.sideFormWidthPct !== currentView.sideFormWidthPct
      || !areFormSectionWeightsEqual(normalizedView.formSectionWeights, currentView.formSectionWeights);
    const detailsChanged = normalizedDetails.preset !== currentDetails.preset
      || normalizedDetails.visibleMetrics.length !== currentDetails.visibleMetrics.length
      || normalizedDetails.visibleMetrics.some((metric) => !currentDetails.visibleMetrics.includes(metric));
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
    if (viewChanged) {
      if (isDefaultTableViewSettings(normalizedView)) {
        clearGuestTableViewSettings();
      } else {
        writeGuestTableViewSettings(normalizedView);
      }
    }
    if (detailsChanged) {
      if (isDefaultCalculationDetailsSettings(normalizedDetails)) {
        clearGuestCalculationDetailsSettings();
      } else {
        writeGuestCalculationDetailsSettings(normalizedDetails);
      }
    }
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
    preferenceSavePending: updateTableColumnPreference.isPending
      || updateTableSettingsPreference.isPending
      || updateTableViewPreference.isPending,
    persistTableColumnSettings,
    persistTableSettings,
    persistTableViewOnly,
    updateTableColumnSettingsDraft,
    applySideFormWidthPct,
    applyFormSectionWeights,
    commitFormSectionWeights,
  };
}
