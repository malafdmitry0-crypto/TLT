/**
 * Guest localStorage + registered-user cache for heat-calc table column settings.
 */
import {
  getDefaultTableColumnSettings,
  HEATCALC_GUEST_TABLE_COLUMN_STORAGE_KEY,
  HEATCALC_REGISTERED_TABLE_COLUMN_CACHE_KEY,
  normalizeTableColumnSettings,
  type HeatCalcTableColumnSettings,
} from '@/utils/heatCalcTableColumnNormalizeModel';
import { readStorageJson } from '@/utils/storage';
import { isRecord } from '@/utils/typeGuards';

interface RegisteredTableColumnCache {
  userId: string;
  settings: HeatCalcTableColumnSettings;
  cachedAt: string;
}

export function readGuestTableColumnSettings() {
  const stored = readStorageJson(HEATCALC_GUEST_TABLE_COLUMN_STORAGE_KEY);
  return stored ? normalizeTableColumnSettings(stored) : getDefaultTableColumnSettings();
}

export function writeGuestTableColumnSettings(settings: HeatCalcTableColumnSettings) {
  if (typeof localStorage === 'undefined') return;
  localStorage.setItem(
    HEATCALC_GUEST_TABLE_COLUMN_STORAGE_KEY,
    JSON.stringify(normalizeTableColumnSettings(settings)),
  );
}

export function readRegisteredTableColumnCache(userId?: string | null) {
  if (!userId) return null;
  const stored = readStorageJson(HEATCALC_REGISTERED_TABLE_COLUMN_CACHE_KEY);
  if (!isRecord(stored) || stored.userId !== userId) return null;
  return normalizeTableColumnSettings(stored.settings);
}

export function writeRegisteredTableColumnCache(
  userId: string,
  settings: HeatCalcTableColumnSettings,
) {
  if (typeof localStorage === 'undefined') return;
  const payload: RegisteredTableColumnCache = {
    userId,
    settings: normalizeTableColumnSettings(settings),
    cachedAt: new Date().toISOString(),
  };
  localStorage.setItem(HEATCALC_REGISTERED_TABLE_COLUMN_CACHE_KEY, JSON.stringify(payload));
}

export function clearRegisteredTableColumnCache(userId?: string | null) {
  if (typeof localStorage === 'undefined') return;
  if (!userId) {
    localStorage.removeItem(HEATCALC_REGISTERED_TABLE_COLUMN_CACHE_KEY);
    return;
  }
  const stored = readStorageJson(HEATCALC_REGISTERED_TABLE_COLUMN_CACHE_KEY);
  if (!isRecord(stored) || stored.userId === userId) {
    localStorage.removeItem(HEATCALC_REGISTERED_TABLE_COLUMN_CACHE_KEY);
  }
}
