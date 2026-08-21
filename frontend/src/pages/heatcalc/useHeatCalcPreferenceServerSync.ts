/**
 * Server-backed HeatCalc preference queries + mutations (P-BAND-01).
 * Keeps React Query wiring out of the composition owner.
 * Гость (кейс §5.9/§5.11): настройки живут на проекте (display-settings),
 * localStorage — офлайн-кэш и источник миграции первого запуска.
 */
import { useCallback, useEffect, useRef } from 'react';
import type { Dispatch, MutableRefObject, SetStateAction } from 'react';
import { appMessage as antdMessage } from '@/feedback/appFeedback';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import {
  PROJECT_DISPLAY_SETTINGS_QUERY_KEY,
  getProjectDisplaySettings,
  isDisplaySettingsVersionConflict,
  updateProjectDisplaySettings,
} from '@/api/displaySettings';
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
  projectId?: string | null;
  onCloseSettingsModal?: () => void;
  setTableColumnSettings: Dispatch<SetStateAction<HeatCalcTableColumnSettings>>;
  setTableViewSettings: Dispatch<SetStateAction<HeatCalcTableViewSettings>>;
  setCalculationDetailsSettings: Dispatch<SetStateAction<HeatCalcCalculationDetailsSettings>>;
  tableViewSettingsRef: MutableRefObject<HeatCalcTableViewSettings>;
};

export function useHeatCalcPreferenceServerSync({
  isRegisteredUser,
  projectId,
  onCloseSettingsModal,
  setTableColumnSettings,
  setTableViewSettings,
  setCalculationDetailsSettings,
  tableViewSettingsRef,
}: UseHeatCalcPreferenceServerSyncOptions) {
  const queryClient = useQueryClient();
  const guestProjectSyncEnabled = !isRegisteredUser && !!projectId;

  const { data: projectDisplaySettings } = useQuery({
    queryKey: [PROJECT_DISPLAY_SETTINGS_QUERY_KEY, projectId],
    queryFn: () => getProjectDisplaySettings(projectId!),
    enabled: guestProjectSyncEnabled,
    staleTime: 30_000,
  });

  const projectDisplayVersionRef = useRef(0);
  useEffect(() => {
    if (projectDisplaySettings) {
      projectDisplayVersionRef.current = projectDisplaySettings.version;
    }
  }, [projectDisplaySettings]);

  const updateGuestDisplaySettings = useMutation({
    mutationFn: (section: Record<string, unknown>) =>
      updateProjectDisplaySettings(projectId!, projectDisplayVersionRef.current, {
        heatcalc: section,
      }),
    onSuccess: (response) => {
      projectDisplayVersionRef.current = response.version;
      queryClient.setQueryData([PROJECT_DISPLAY_SETTINGS_QUERY_KEY, projectId], response);
    },
    onError: async (error) => {
      // Сетевые/офлайн ошибки молча переживаем: localStorage остаётся кэшем.
      if (!isDisplaySettingsVersionConflict(error)) return;
      try {
        const fresh = await getProjectDisplaySettings(projectId!);
        projectDisplayVersionRef.current = fresh.version;
      } catch {
        // Версия обновится при следующем успешном чтении.
      }
      antdMessage.warning(
        'Настройки отображения изменены в другом окне. Сохраните ещё раз.',
      );
    },
  });

  // `.mutate` стабилен между рендерами (React Query) — колбэк не пересоздаётся,
  // иначе эффект гидратации в owner-хуке зацикливается.
  const { mutate: mutateGuestProjectDisplaySection } = updateGuestDisplaySettings;
  const syncGuestProjectDisplaySection = useCallback((section: Record<string, unknown>) => {
    if (!guestProjectSyncEnabled) return;
    mutateGuestProjectDisplaySection(section);
  }, [guestProjectSyncEnabled, mutateGuestProjectDisplaySection]);
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
    projectDisplaySettings,
    syncGuestProjectDisplaySection,
    updateTableColumnPreference,
    updateTableSettingsPreference,
    updateTableViewPreference,
    preferenceSavePending: updateTableColumnPreference.isPending
      || updateTableSettingsPreference.isPending
      || updateTableViewPreference.isPending,
  };
}
