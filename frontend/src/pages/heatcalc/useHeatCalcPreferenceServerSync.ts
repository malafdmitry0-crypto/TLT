/**
 * Server-backed HeatCalc preference queries + mutations (P-BAND-01).
 * Keeps React Query wiring out of the composition owner.
 */
import type { Dispatch, MutableRefObject, SetStateAction } from 'react';
import { message as antdMessage } from 'antd';
import { useMutation, useQuery } from '@tanstack/react-query';

import { getUserPreference, updateUserPreference } from '@/api/preferences';
import {
  HEATCALC_TABLE_COLUMN_PREF_KEY,
  normalizeTableColumnSettings,
  writeRegisteredTableColumnCache,
  type HeatCalcTableColumnSettings,
} from '@/utils/heatCalcTableColumns';
import {
  HEATCALC_TABLE_VIEW_PREF_KEY,
  normalizeTableViewSettings,
  writeRegisteredTableViewCache,
  type HeatCalcTableViewSettings,
} from '@/utils/heatCalcTableViewSettings';
import {
  HEATCALC_CALCULATION_DETAILS_PREF_KEY,
  normalizeCalculationDetailsSettings,
  writeRegisteredCalculationDetailsCache,
  type HeatCalcCalculationDetailsSettings,
} from '@/utils/heatCalcCalculationDetailsSettings';

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

type UseHeatCalcPreferenceServerSyncOptions = {
  isRegisteredUser: boolean;
  onCloseSettingsModal?: () => void;
  setTableColumnSettings: Dispatch<SetStateAction<HeatCalcTableColumnSettings>>;
  setTableViewSettings: Dispatch<SetStateAction<HeatCalcTableViewSettings>>;
  setCalculationDetailsSettings: Dispatch<SetStateAction<HeatCalcCalculationDetailsSettings>>;
  tableViewSettingsRef: MutableRefObject<HeatCalcTableViewSettings>;
};

export function useHeatCalcPreferenceServerSync({
  isRegisteredUser,
  onCloseSettingsModal,
  setTableColumnSettings,
  setTableViewSettings,
  setCalculationDetailsSettings,
  tableViewSettingsRef,
}: UseHeatCalcPreferenceServerSyncOptions) {
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
    queryFn: () => getUserPreference<HeatCalcCalculationDetailsSettings>(
      HEATCALC_CALCULATION_DETAILS_PREF_KEY,
    ),
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
      return { columnPreference, viewPreference, calculationDetailsPreference };
    },
    onSuccess: ({ columnPreference, viewPreference, calculationDetailsPreference }) => {
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
        const normalizedDetails = normalizeCalculationDetailsSettings(
          calculationDetailsPreference.value,
        );
        setCalculationDetailsSettings(normalizedDetails);
        if (calculationDetailsPreference.user_id) {
          writeRegisteredCalculationDetailsCache(
            calculationDetailsPreference.user_id,
            normalizedDetails,
          );
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

  return {
    persistedTableColumnPreference,
    persistedTableViewPreference,
    persistedCalculationDetailsPreference,
    updateTableColumnPreference,
    updateTableSettingsPreference,
    updateTableViewPreference,
    preferenceSavePending: updateTableColumnPreference.isPending
      || updateTableSettingsPreference.isPending
      || updateTableViewPreference.isPending,
  };
}
