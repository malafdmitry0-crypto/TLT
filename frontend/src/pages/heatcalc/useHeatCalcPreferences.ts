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
  HEATCALC_FIELD_INPUT_PREF_KEY,
  areFieldInputSettingsEqual,
  clearGuestFieldInputSettings,
  clearRegisteredFieldInputCache,
  getDefaultFieldInputSettings,
  isDefaultFieldInputSettings,
  normalizeFieldInputSettings,
  readGuestFieldInputSettings,
  readRegisteredFieldInputCache,
  writeGuestFieldInputSettings,
  writeRegisteredFieldInputCache,
  type HeatCalcFieldInputSettings,
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
  fieldInputSettings?: HeatCalcFieldInputSettings;
};

type UseHeatCalcPreferencesOptions = {
  isRegisteredUser: boolean;
  registeredUserId: string | null;
  onInlineEditingDisabled?: () => void;
  onCloseSettingsModal?: () => void;
};

export function useHeatCalcPreferences({
  isRegisteredUser,
  registeredUserId,
  onInlineEditingDisabled,
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
  const [fieldInputSettings, setFieldInputSettings] =
    useState<HeatCalcFieldInputSettings>(() => {
      if (isRegisteredUser) {
        return readRegisteredFieldInputCache(registeredUserId) ?? getDefaultFieldInputSettings();
      }
      return readGuestFieldInputSettings();
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

  const { data: persistedFieldInputPreference } = useQuery({
    queryKey: ['preference', HEATCALC_FIELD_INPUT_PREF_KEY],
    queryFn: () => getUserPreference<HeatCalcFieldInputSettings>(HEATCALC_FIELD_INPUT_PREF_KEY),
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
      fieldInputSettings: fieldInputPreferenceSettings,
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
      const fieldInputPreference = fieldInputPreferenceSettings
        ? await updateUserPreference<HeatCalcFieldInputSettings>(
          HEATCALC_FIELD_INPUT_PREF_KEY,
          normalizeFieldInputSettings(fieldInputPreferenceSettings),
        )
        : null;
      return {
        columnPreference,
        viewPreference,
        calculationDetailsPreference,
        fieldInputPreference,
      };
    },
    onSuccess: ({
      columnPreference,
      viewPreference,
      calculationDetailsPreference,
      fieldInputPreference,
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
      if (fieldInputPreference) {
        const normalizedFieldInputs = normalizeFieldInputSettings(fieldInputPreference.value);
        setFieldInputSettings(normalizedFieldInputs);
        if (fieldInputPreference.user_id) {
          writeRegisteredFieldInputCache(fieldInputPreference.user_id, normalizedFieldInputs);
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
      setFieldInputSettings(
        readRegisteredFieldInputCache(registeredUserId) ?? getDefaultFieldInputSettings(),
      );
      return;
    }
    const guestTableViewSettings = readGuestTableViewSettings();
    setTableColumnSettings(readGuestTableColumnSettings());
    tableViewSettingsRef.current = guestTableViewSettings;
    setTableViewSettings(guestTableViewSettings);
    setCalculationDetailsSettings(readGuestCalculationDetailsSettings());
    setFieldInputSettings(readGuestFieldInputSettings());
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

  useEffect(() => {
    if (!isRegisteredUser || !persistedFieldInputPreference) return;
    if (persistedFieldInputPreference.value) {
      const normalized = normalizeFieldInputSettings(persistedFieldInputPreference.value);
      setFieldInputSettings(normalized);
      if (persistedFieldInputPreference.user_id) {
        writeRegisteredFieldInputCache(persistedFieldInputPreference.user_id, normalized);
      }
      return;
    }
    clearRegisteredFieldInputCache(registeredUserId ?? persistedFieldInputPreference.user_id);
    setFieldInputSettings(getDefaultFieldInputSettings());
  }, [isRegisteredUser, persistedFieldInputPreference, registeredUserId]);

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
    fieldInputs: HeatCalcFieldInputSettings,
  ) => {
    const normalizedColumns = normalizeTableColumnSettings(columnSettings);
    const normalizedView = normalizeTableViewSettings(viewSettings);
    const normalizedDetails = normalizeCalculationDetailsSettings(calculationDetails);
    const normalizedFieldInputs = normalizeFieldInputSettings(fieldInputs);
    const currentView = normalizeTableViewSettings(tableViewSettings);
    const currentDetails = normalizeCalculationDetailsSettings(calculationDetailsSettings);
    const currentFieldInputs = normalizeFieldInputSettings(fieldInputSettings);
    const viewChanged = normalizedView.fontSize !== currentView.fontSize
      || normalizedView.tableLabelFormat !== currentView.tableLabelFormat
      || normalizedView.settingsLabelFormat !== currentView.settingsLabelFormat
      || normalizedView.inlineEditingEnabled !== currentView.inlineEditingEnabled
      || normalizedView.formPlacement !== currentView.formPlacement
      || normalizedView.sideFormWidthPct !== currentView.sideFormWidthPct
      || !areFormSectionWeightsEqual(normalizedView.formSectionWeights, currentView.formSectionWeights);
    const detailsChanged = normalizedDetails.preset !== currentDetails.preset
      || normalizedDetails.visibleMetrics.length !== currentDetails.visibleMetrics.length
      || normalizedDetails.visibleMetrics.some((metric) => !currentDetails.visibleMetrics.includes(metric));
    const fieldInputsChanged = !areFieldInputSettingsEqual(normalizedFieldInputs, currentFieldInputs);
    setTableColumnSettings(normalizedColumns);
    tableViewSettingsRef.current = normalizedView;
    setTableViewSettings(normalizedView);
    setCalculationDetailsSettings(normalizedDetails);
    setFieldInputSettings(normalizedFieldInputs);
    if (!normalizedView.inlineEditingEnabled) onInlineEditingDisabled?.();
    if (isRegisteredUser) {
      clearRegisteredTableColumnCache(registeredUserId);
      if (viewChanged) clearRegisteredTableViewCache(registeredUserId);
      if (detailsChanged) clearRegisteredCalculationDetailsCache(registeredUserId);
      if (fieldInputsChanged) clearRegisteredFieldInputCache(registeredUserId);
      updateTableSettingsPreference.mutate({
        columnSettings: normalizedColumns,
        viewSettings: viewChanged ? normalizedView : undefined,
        calculationDetailsSettings: detailsChanged ? normalizedDetails : undefined,
        fieldInputSettings: fieldInputsChanged ? normalizedFieldInputs : undefined,
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
    if (fieldInputsChanged) {
      if (isDefaultFieldInputSettings(normalizedFieldInputs)) {
        clearGuestFieldInputSettings();
      } else {
        writeGuestFieldInputSettings(normalizedFieldInputs);
      }
    }
    onCloseSettingsModal?.();
    antdMessage.success('Настройки таблицы сохранены');
  }, [
    calculationDetailsSettings,
    fieldInputSettings,
    isRegisteredUser,
    onCloseSettingsModal,
    onInlineEditingDisabled,
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
    fieldInputSettings,
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
