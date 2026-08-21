/**
 * Guest localStorage + registered-user cache for electrical candidate table columns.
 */
import {
  getDefaultElectricalCandidateTableColumnSettings,
  normalizeElectricalCandidateTableColumnSettings,
  type ElectricalCandidateTableColumnSettings,
} from '@/utils/electricalCandidateTableColumnsCore';
import { readStorageJson } from '@/utils/storage';
import { isRecord } from '@/utils/typeGuards';

export const ELECTRICAL_CANDIDATE_TABLE_COLUMN_PREF_KEY =
  'electrical.candidateTableColumns';
export const ELECTRICAL_GUEST_CANDIDATE_TABLE_COLUMN_STORAGE_KEY =
  `${ELECTRICAL_CANDIDATE_TABLE_COLUMN_PREF_KEY}.guest`;
export const ELECTRICAL_REGISTERED_CANDIDATE_TABLE_COLUMN_CACHE_KEY =
  `${ELECTRICAL_CANDIDATE_TABLE_COLUMN_PREF_KEY}.registered.cache`;

interface RegisteredElectricalCandidateTableColumnCache {
  userId: string;
  settings: ElectricalCandidateTableColumnSettings;
  cachedAt: string;
}

export function readGuestElectricalCandidateTableColumnSettings() {
  const stored = readStorageJson(ELECTRICAL_GUEST_CANDIDATE_TABLE_COLUMN_STORAGE_KEY);
  return stored
    ? normalizeElectricalCandidateTableColumnSettings(stored)
    : getDefaultElectricalCandidateTableColumnSettings();
}

export function writeGuestElectricalCandidateTableColumnSettings(
  settings: ElectricalCandidateTableColumnSettings,
) {
  if (typeof localStorage === 'undefined') return;
  localStorage.setItem(
    ELECTRICAL_GUEST_CANDIDATE_TABLE_COLUMN_STORAGE_KEY,
    JSON.stringify(normalizeElectricalCandidateTableColumnSettings(settings)),
  );
}

export function readRegisteredElectricalCandidateTableColumnCache(userId?: string | null) {
  if (!userId) return null;
  const stored = readStorageJson(ELECTRICAL_REGISTERED_CANDIDATE_TABLE_COLUMN_CACHE_KEY);
  if (!isRecord(stored) || stored.userId !== userId) return null;
  return normalizeElectricalCandidateTableColumnSettings(stored.settings);
}

export function writeRegisteredElectricalCandidateTableColumnCache(
  userId: string,
  settings: ElectricalCandidateTableColumnSettings,
) {
  if (typeof localStorage === 'undefined') return;
  const payload: RegisteredElectricalCandidateTableColumnCache = {
    userId,
    settings: normalizeElectricalCandidateTableColumnSettings(settings),
    cachedAt: new Date().toISOString(),
  };
  localStorage.setItem(
    ELECTRICAL_REGISTERED_CANDIDATE_TABLE_COLUMN_CACHE_KEY,
    JSON.stringify(payload),
  );
}

export function clearRegisteredElectricalCandidateTableColumnCache(userId?: string | null) {
  if (typeof localStorage === 'undefined') return;
  if (!userId) {
    localStorage.removeItem(ELECTRICAL_REGISTERED_CANDIDATE_TABLE_COLUMN_CACHE_KEY);
    return;
  }
  const stored = readStorageJson(ELECTRICAL_REGISTERED_CANDIDATE_TABLE_COLUMN_CACHE_KEY);
  if (!isRecord(stored) || stored.userId === userId) {
    localStorage.removeItem(ELECTRICAL_REGISTERED_CANDIDATE_TABLE_COLUMN_CACHE_KEY);
  }
}
