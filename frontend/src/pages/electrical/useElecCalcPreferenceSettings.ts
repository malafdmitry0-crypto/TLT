import {
  useEffect,
  useState,
} from 'react';
import { message } from 'antd';
import { useMutation, useQuery } from '@tanstack/react-query';

import { getUserPreference, updateUserPreference } from '@/api/preferences';
import { useAuthStore } from '@/store/authStore';
import type {
  ElectricalCandidateTableColumnPreferenceMutation,
  ElectricalTableColumnPreferenceMutation,
  ElectricalTableSettingsPreferenceMutation,
} from '@/pages/electrical/elecCalcPageModel';
import {
  ELECTRICAL_CANDIDATE_TABLE_COLUMN_PREF_KEY,
  clearRegisteredElectricalCandidateTableColumnCache,
  getDefaultElectricalCandidateTableColumnSettings,
  normalizeElectricalCandidateTableColumnSettings,
  readGuestElectricalCandidateTableColumnSettings,
  readRegisteredElectricalCandidateTableColumnCache,
  writeRegisteredElectricalCandidateTableColumnCache,
  type ElectricalCandidateTableColumnSettings,
} from '@/utils/electricalCandidateTableColumns';
import {
  ELECTRICAL_TABLE_COLUMN_PREF_KEY,
  clearRegisteredElectricalTableColumnCache,
  getDefaultElectricalTableColumnSettings,
  normalizeElectricalTableColumnSettings,
  readGuestElectricalTableColumnSettings,
  readRegisteredElectricalTableColumnCache,
  writeRegisteredElectricalTableColumnCache,
  type ElectricalTableColumnSettings,
} from '@/utils/electricalTableColumns';
import {
  ELECTRICAL_TABLE_VIEW_PREF_KEY,
  clearRegisteredElectricalTableViewCache,
  getDefaultElectricalTableViewSettings,
  normalizeElectricalTableViewSettings,
  readGuestElectricalTableViewSettings,
  readRegisteredElectricalTableViewCache,
  writeRegisteredElectricalTableViewCache,
  type ElectricalTableViewSettings,
} from '@/utils/electricalTableViewSettings';

type UseElecCalcPreferenceSettingsOptions = {
  isRegisteredUser: boolean;
  registeredUserId: string | null;
  setColumnSettingsOpen: (open: boolean) => void;
  setCandidateColumnSettingsOpen: (open: boolean) => void;
};

function isRegisteredRole(role: unknown) {
  return role === 'employee' || role === 'admin';
}

export function initialElectricalTableColumnSettings() {
  const auth = useAuthStore.getState();
  const cached = readRegisteredElectricalTableColumnCache(auth.user?.id ?? null);
  if (isRegisteredRole(auth.role)) {
    return cached ?? getDefaultElectricalTableColumnSettings();
  }
  return readGuestElectricalTableColumnSettings();
}

export function initialElectricalCandidateTableColumnSettings() {
  const auth = useAuthStore.getState();
  const cached = readRegisteredElectricalCandidateTableColumnCache(auth.user?.id ?? null);
  if (isRegisteredRole(auth.role)) {
    return cached ?? getDefaultElectricalCandidateTableColumnSettings();
  }
  return readGuestElectricalCandidateTableColumnSettings();
}

export function initialElectricalTableViewSettings() {
  const auth = useAuthStore.getState();
  const cached = readRegisteredElectricalTableViewCache(auth.user?.id ?? null);
  if (isRegisteredRole(auth.role)) {
    return cached ?? getDefaultElectricalTableViewSettings();
  }
  return readGuestElectricalTableViewSettings();
}

export function useElecCalcPreferenceSettings({
  isRegisteredUser,
  registeredUserId,
  setColumnSettingsOpen,
  setCandidateColumnSettingsOpen,
}: UseElecCalcPreferenceSettingsOptions) {
  const [tableColumnSettings, setTableColumnSettings] =
    useState<ElectricalTableColumnSettings>(initialElectricalTableColumnSettings);
  const [candidateTableColumnSettings, setCandidateTableColumnSettings] =
    useState<ElectricalCandidateTableColumnSettings>(
      initialElectricalCandidateTableColumnSettings,
    );
  const [tableViewSettings, setTableViewSettings] =
    useState<ElectricalTableViewSettings>(initialElectricalTableViewSettings);

  const { data: persistedTableColumnPreference } = useQuery({
    queryKey: ['preference', ELECTRICAL_TABLE_COLUMN_PREF_KEY],
    queryFn: () =>
      getUserPreference<ElectricalTableColumnSettings>(ELECTRICAL_TABLE_COLUMN_PREF_KEY),
    enabled: isRegisteredUser,
    staleTime: 30_000,
  });

  const { data: persistedCandidateTableColumnPreference } = useQuery({
    queryKey: ['preference', ELECTRICAL_CANDIDATE_TABLE_COLUMN_PREF_KEY],
    queryFn: () =>
      getUserPreference<ElectricalCandidateTableColumnSettings>(
        ELECTRICAL_CANDIDATE_TABLE_COLUMN_PREF_KEY,
      ),
    enabled: isRegisteredUser,
    staleTime: 30_000,
  });

  const { data: persistedTableViewPreference } = useQuery({
    queryKey: ['preference', ELECTRICAL_TABLE_VIEW_PREF_KEY],
    queryFn: () =>
      getUserPreference<ElectricalTableViewSettings>(ELECTRICAL_TABLE_VIEW_PREF_KEY),
    enabled: isRegisteredUser,
    staleTime: 30_000,
  });

  const updateTableColumnPreference = useMutation({
    mutationFn: ({ settings }: ElectricalTableColumnPreferenceMutation) =>
      updateUserPreference<ElectricalTableColumnSettings>(
        ELECTRICAL_TABLE_COLUMN_PREF_KEY,
        normalizeElectricalTableColumnSettings(settings),
      ),
    onSuccess: (preference, variables) => {
      const normalized = normalizeElectricalTableColumnSettings(preference.value);
      setTableColumnSettings(normalized);
      if (preference.user_id) {
        writeRegisteredElectricalTableColumnCache(preference.user_id, normalized);
      }
      if (variables.closeModal) setColumnSettingsOpen(false);
      if (variables.showMessage !== false) message.success('Настройки таблицы сохранены');
    },
    onError: (error) => {
      message.error(error instanceof Error ? error.message : 'Не удалось сохранить настройки таблицы');
    },
  });

  const updateCandidateTableColumnPreference = useMutation({
    mutationFn: ({ settings }: ElectricalCandidateTableColumnPreferenceMutation) =>
      updateUserPreference<ElectricalCandidateTableColumnSettings>(
        ELECTRICAL_CANDIDATE_TABLE_COLUMN_PREF_KEY,
        normalizeElectricalCandidateTableColumnSettings(settings),
      ),
    onSuccess: (preference, variables) => {
      const normalized = normalizeElectricalCandidateTableColumnSettings(preference.value);
      setCandidateTableColumnSettings(normalized);
      if (preference.user_id) {
        writeRegisteredElectricalCandidateTableColumnCache(preference.user_id, normalized);
      }
      if (variables.closeModal) setCandidateColumnSettingsOpen(false);
      if (variables.showMessage !== false) message.success('Настройки таблицы подбора сохранены');
    },
    onError: (error) => {
      message.error(
        error instanceof Error ? error.message : 'Не удалось сохранить настройки таблицы подбора',
      );
    },
  });

  const updateTableSettingsPreference = useMutation({
    mutationFn: async ({ columnSettings, viewSettings }: ElectricalTableSettingsPreferenceMutation) => {
      const columnPreference = await updateUserPreference<ElectricalTableColumnSettings>(
        ELECTRICAL_TABLE_COLUMN_PREF_KEY,
        normalizeElectricalTableColumnSettings(columnSettings),
      );
      const viewPreference = await updateUserPreference<ElectricalTableViewSettings>(
        ELECTRICAL_TABLE_VIEW_PREF_KEY,
        normalizeElectricalTableViewSettings(viewSettings),
      );
      return { columnPreference, viewPreference };
    },
    onSuccess: ({ columnPreference, viewPreference }) => {
      const normalizedColumns = normalizeElectricalTableColumnSettings(columnPreference.value);
      const normalizedView = normalizeElectricalTableViewSettings(viewPreference.value);
      setTableColumnSettings(normalizedColumns);
      setTableViewSettings(normalizedView);
      if (columnPreference.user_id) {
        writeRegisteredElectricalTableColumnCache(columnPreference.user_id, normalizedColumns);
      }
      if (viewPreference.user_id) {
        writeRegisteredElectricalTableViewCache(viewPreference.user_id, normalizedView);
      }
      setColumnSettingsOpen(false);
      message.success('Настройки таблицы сохранены');
    },
    onError: (error) => {
      message.error(error instanceof Error ? error.message : 'Не удалось сохранить настройки таблицы');
    },
  });

  useEffect(() => {
    if (isRegisteredUser) {
      const registeredViewSettings =
        readRegisteredElectricalTableViewCache(registeredUserId) ??
        getDefaultElectricalTableViewSettings();
      setTableColumnSettings(
        readRegisteredElectricalTableColumnCache(registeredUserId) ??
          getDefaultElectricalTableColumnSettings(),
      );
      setCandidateTableColumnSettings(
        readRegisteredElectricalCandidateTableColumnCache(registeredUserId) ??
          getDefaultElectricalCandidateTableColumnSettings(),
      );
      setTableViewSettings(registeredViewSettings);
      return;
    }
    setTableColumnSettings(readGuestElectricalTableColumnSettings());
    setCandidateTableColumnSettings(readGuestElectricalCandidateTableColumnSettings());
    const guestViewSettings = readGuestElectricalTableViewSettings();
    setTableViewSettings(guestViewSettings);
  }, [isRegisteredUser, registeredUserId]);

  useEffect(() => {
    if (!isRegisteredUser || !persistedTableColumnPreference) return;
    if (persistedTableColumnPreference.value) {
      const normalized = normalizeElectricalTableColumnSettings(
        persistedTableColumnPreference.value,
      );
      setTableColumnSettings(normalized);
      if (persistedTableColumnPreference.user_id) {
        writeRegisteredElectricalTableColumnCache(
          persistedTableColumnPreference.user_id,
          normalized,
        );
      }
      return;
    }
    clearRegisteredElectricalTableColumnCache(
      registeredUserId ?? persistedTableColumnPreference.user_id,
    );
    setTableColumnSettings(getDefaultElectricalTableColumnSettings());
  }, [isRegisteredUser, persistedTableColumnPreference, registeredUserId]);

  useEffect(() => {
    if (!isRegisteredUser || !persistedCandidateTableColumnPreference) return;
    if (persistedCandidateTableColumnPreference.value) {
      const normalized = normalizeElectricalCandidateTableColumnSettings(
        persistedCandidateTableColumnPreference.value,
      );
      setCandidateTableColumnSettings(normalized);
      if (persistedCandidateTableColumnPreference.user_id) {
        writeRegisteredElectricalCandidateTableColumnCache(
          persistedCandidateTableColumnPreference.user_id,
          normalized,
        );
      }
      return;
    }
    clearRegisteredElectricalCandidateTableColumnCache(
      registeredUserId ?? persistedCandidateTableColumnPreference.user_id,
    );
    setCandidateTableColumnSettings(getDefaultElectricalCandidateTableColumnSettings());
  }, [isRegisteredUser, persistedCandidateTableColumnPreference, registeredUserId]);

  useEffect(() => {
    if (!isRegisteredUser || !persistedTableViewPreference) return;
    if (persistedTableViewPreference.value) {
      const normalized = normalizeElectricalTableViewSettings(persistedTableViewPreference.value);
      setTableViewSettings(normalized);
      if (persistedTableViewPreference.user_id) {
        writeRegisteredElectricalTableViewCache(persistedTableViewPreference.user_id, normalized);
      }
      return;
    }
    clearRegisteredElectricalTableViewCache(
      registeredUserId ?? persistedTableViewPreference.user_id,
    );
    const defaults = getDefaultElectricalTableViewSettings();
    setTableViewSettings(defaults);
  }, [isRegisteredUser, persistedTableViewPreference, registeredUserId]);

  return {
    tableColumnSettings,
    setTableColumnSettings,
    candidateTableColumnSettings,
    setCandidateTableColumnSettings,
    tableViewSettings,
    setTableViewSettings,
    updateTableColumnPreference,
    updateCandidateTableColumnPreference,
    updateTableSettingsPreference,
  };
}
