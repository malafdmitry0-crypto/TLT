import {
  getHeatCalcFieldInputSettingsVersion,
  getHeatCalcFieldDefinition,
  type HeatCalcFieldId,
} from '@/domain/heatCalcFields';
import type { HeatCalcObjectType } from '@/types/project';

export interface HeatCalcFieldInputLayout {
  step?: number;
}

export interface HeatCalcFieldInputSettings {
  version: number;
  fields: Partial<Record<HeatCalcObjectType, Record<HeatCalcFieldId, HeatCalcFieldInputLayout>>>;
}

export interface HeatCalcFieldStepSettingItem {
  objectType: HeatCalcObjectType;
  fieldId: HeatCalcFieldId;
  label: string;
  unit?: string;
  defaultStep: number;
  step: number;
  overridden: boolean;
}

interface RegisteredFieldInputCache {
  userId: string;
  settings: HeatCalcFieldInputSettings;
  cachedAt: string;
}

export const HEATCALC_FIELD_INPUT_SETTINGS_VERSION = getHeatCalcFieldInputSettingsVersion();
export const HEATCALC_GUEST_FIELD_INPUT_STORAGE_KEY = 'heatcalc.fieldInputs.v1.guest';
export const HEATCALC_REGISTERED_FIELD_INPUT_CACHE_KEY = 'heatcalc.fieldInputs.v1.registered.cache';

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

export function getDefaultFieldInputSettings(): HeatCalcFieldInputSettings {
  return {
    version: HEATCALC_FIELD_INPUT_SETTINGS_VERSION,
    fields: {},
  };
}

export function normalizeFieldInputSettings(value: unknown): HeatCalcFieldInputSettings {
  void value;
  return getDefaultFieldInputSettings();
}

export function areFieldInputSettingsEqual(left: unknown, right: unknown) {
  normalizeFieldInputSettings(left);
  normalizeFieldInputSettings(right);
  return true;
}

export function isDefaultFieldInputSettings(settings: HeatCalcFieldInputSettings) {
  return areFieldInputSettingsEqual(settings, getDefaultFieldInputSettings());
}

export function resolveHeatCalcFieldStep(
  objectType: HeatCalcObjectType,
  fieldId: HeatCalcFieldId,
  settings?: HeatCalcFieldInputSettings,
) {
  void settings;
  const field = getHeatCalcFieldDefinition(fieldId, objectType);
  if (!field || field.editor !== 'number' || typeof field.step !== 'number' || !Number.isFinite(field.step)) {
    return undefined;
  }
  return field.step;
}

export function setHeatCalcFieldStep(
  settings: HeatCalcFieldInputSettings,
  objectType: HeatCalcObjectType,
  fieldId: HeatCalcFieldId,
  step: unknown,
) {
  void objectType;
  void fieldId;
  void step;
  return normalizeFieldInputSettings(settings);
}

export function resetHeatCalcFieldStep(
  settings: HeatCalcFieldInputSettings,
  objectType: HeatCalcObjectType,
  fieldId: HeatCalcFieldId,
) {
  void objectType;
  void fieldId;
  return normalizeFieldInputSettings(settings);
}

export function getHeatCalcFieldStepSettingItems(
  objectType: HeatCalcObjectType,
  settings: HeatCalcFieldInputSettings,
): HeatCalcFieldStepSettingItem[] {
  void objectType;
  void settings;
  return [];
}

function readStorageJson(key: string): unknown {
  if (typeof localStorage === 'undefined') return null;
  const raw = localStorage.getItem(key);
  if (!raw) return null;
  try {
    return JSON.parse(raw) as unknown;
  } catch {
    return null;
  }
}

export function readGuestFieldInputSettings() {
  const stored = readStorageJson(HEATCALC_GUEST_FIELD_INPUT_STORAGE_KEY);
  return stored ? normalizeFieldInputSettings(stored) : getDefaultFieldInputSettings();
}

export function writeGuestFieldInputSettings(settings: HeatCalcFieldInputSettings) {
  if (typeof localStorage === 'undefined') return;
  localStorage.setItem(
    HEATCALC_GUEST_FIELD_INPUT_STORAGE_KEY,
    JSON.stringify(normalizeFieldInputSettings(settings)),
  );
}

export function clearGuestFieldInputSettings() {
  if (typeof localStorage === 'undefined') return;
  localStorage.removeItem(HEATCALC_GUEST_FIELD_INPUT_STORAGE_KEY);
}

export function readRegisteredFieldInputCache(userId?: string | null) {
  if (!userId) return null;
  const stored = readStorageJson(HEATCALC_REGISTERED_FIELD_INPUT_CACHE_KEY);
  if (!isRecord(stored) || stored.userId !== userId) return null;
  return normalizeFieldInputSettings(stored.settings);
}

export function writeRegisteredFieldInputCache(
  userId: string,
  settings: HeatCalcFieldInputSettings,
) {
  if (typeof localStorage === 'undefined') return;
  const payload: RegisteredFieldInputCache = {
    userId,
    settings: normalizeFieldInputSettings(settings),
    cachedAt: new Date().toISOString(),
  };
  localStorage.setItem(HEATCALC_REGISTERED_FIELD_INPUT_CACHE_KEY, JSON.stringify(payload));
}

export function clearRegisteredFieldInputCache(userId?: string | null) {
  if (typeof localStorage === 'undefined') return;
  if (!userId) {
    localStorage.removeItem(HEATCALC_REGISTERED_FIELD_INPUT_CACHE_KEY);
    return;
  }
  const stored = readStorageJson(HEATCALC_REGISTERED_FIELD_INPUT_CACHE_KEY);
  if (isRecord(stored) && stored.userId === userId) {
    localStorage.removeItem(HEATCALC_REGISTERED_FIELD_INPUT_CACHE_KEY);
  }
}
