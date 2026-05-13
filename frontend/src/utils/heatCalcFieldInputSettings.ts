import {
  getHeatCalcFieldDefinition,
  HEATCALC_FIELD_DEFINITIONS,
  type HeatCalcFieldDefinition,
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

const OBJECT_TYPES: HeatCalcObjectType[] = ['pipe', 'tank'];
const EPSILON = 1e-9;
const MAX_STEP = 1_000_000;

export const HEATCALC_FIELD_INPUT_SETTINGS_VERSION = 1;
export const HEATCALC_FIELD_INPUT_PREF_KEY = 'heatcalc.fieldInputs.v1';
export const HEATCALC_GUEST_FIELD_INPUT_STORAGE_KEY = 'heatcalc.fieldInputs.v1.guest';
export const HEATCALC_REGISTERED_FIELD_INPUT_CACHE_KEY = 'heatcalc.fieldInputs.v1.registered.cache';

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isPositiveFinite(value: unknown): value is number {
  return typeof value === 'number'
    && Number.isFinite(value)
    && value > 0
    && value <= MAX_STEP;
}

function numberFromUnknown(value: unknown) {
  if (typeof value === 'number') return value;
  if (typeof value === 'string' && value.trim().length > 0) return Number(value);
  return Number.NaN;
}

function isConfigurableNumberField(field: HeatCalcFieldDefinition | null): field is HeatCalcFieldDefinition & { step: number } {
  return !!field && field.editor === 'number' && isPositiveFinite(field.step);
}

function sameStep(left: number | undefined, right: number | undefined) {
  if (left == null || right == null) return left == null && right == null;
  return Math.abs(left - right) < EPSILON;
}

function cloneFieldSettings(settings: HeatCalcFieldInputSettings): HeatCalcFieldInputSettings {
  const fields: HeatCalcFieldInputSettings['fields'] = {};
  for (const objectType of OBJECT_TYPES) {
    const objectFields = settings.fields[objectType];
    if (!objectFields || Object.keys(objectFields).length === 0) continue;
    fields[objectType] = Object.fromEntries(
      Object.entries(objectFields).map(([fieldId, layout]) => [fieldId, { ...layout }]),
    );
  }
  return {
    version: HEATCALC_FIELD_INPUT_SETTINGS_VERSION,
    fields,
  };
}

function normalizedStepOverride(
  objectType: HeatCalcObjectType,
  fieldId: string,
  layout: unknown,
) {
  const field = getHeatCalcFieldDefinition(fieldId, objectType);
  if (!isConfigurableNumberField(field) || !isRecord(layout)) return undefined;
  const step = numberFromUnknown(layout.step);
  if (!isPositiveFinite(step) || sameStep(step, field.step)) return undefined;
  return step;
}

export function getDefaultFieldInputSettings(): HeatCalcFieldInputSettings {
  return {
    version: HEATCALC_FIELD_INPUT_SETTINGS_VERSION,
    fields: {},
  };
}

export function normalizeFieldInputSettings(value: unknown): HeatCalcFieldInputSettings {
  if (!isRecord(value)) return getDefaultFieldInputSettings();
  const rawFields = isRecord(value.fields) ? value.fields : {};
  const fields: HeatCalcFieldInputSettings['fields'] = {};

  for (const objectType of OBJECT_TYPES) {
    const objectFields = rawFields[objectType];
    if (!isRecord(objectFields)) continue;
    const normalizedObjectFields: Record<HeatCalcFieldId, HeatCalcFieldInputLayout> = {};
    for (const [fieldId, layout] of Object.entries(objectFields)) {
      const step = normalizedStepOverride(objectType, fieldId, layout);
      if (step != null) normalizedObjectFields[fieldId] = { step };
    }
    if (Object.keys(normalizedObjectFields).length > 0) {
      fields[objectType] = normalizedObjectFields;
    }
  }

  return {
    version: HEATCALC_FIELD_INPUT_SETTINGS_VERSION,
    fields,
  };
}

export function areFieldInputSettingsEqual(left: unknown, right: unknown) {
  const normalizedLeft = normalizeFieldInputSettings(left);
  const normalizedRight = normalizeFieldInputSettings(right);
  for (const objectType of OBJECT_TYPES) {
    const leftFields = normalizedLeft.fields[objectType] ?? {};
    const rightFields = normalizedRight.fields[objectType] ?? {};
    const keys = new Set([...Object.keys(leftFields), ...Object.keys(rightFields)]);
    for (const key of keys) {
      if (!sameStep(leftFields[key]?.step, rightFields[key]?.step)) return false;
    }
  }
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
  const field = getHeatCalcFieldDefinition(fieldId, objectType);
  if (!isConfigurableNumberField(field)) return undefined;
  const normalized = settings ? normalizeFieldInputSettings(settings) : getDefaultFieldInputSettings();
  return normalized.fields[objectType]?.[fieldId]?.step ?? field.step;
}

export function setHeatCalcFieldStep(
  settings: HeatCalcFieldInputSettings,
  objectType: HeatCalcObjectType,
  fieldId: HeatCalcFieldId,
  step: unknown,
) {
  const field = getHeatCalcFieldDefinition(fieldId, objectType);
  if (!isConfigurableNumberField(field)) return normalizeFieldInputSettings(settings);
  const numericStep = numberFromUnknown(step);
  const normalized = cloneFieldSettings(normalizeFieldInputSettings(settings));
  const nextObjectFields = { ...(normalized.fields[objectType] ?? {}) };

  if (!isPositiveFinite(numericStep) || sameStep(numericStep, field.step)) {
    delete nextObjectFields[fieldId];
  } else {
    nextObjectFields[fieldId] = { step: numericStep };
  }

  if (Object.keys(nextObjectFields).length === 0) {
    delete normalized.fields[objectType];
  } else {
    normalized.fields[objectType] = nextObjectFields;
  }
  return normalizeFieldInputSettings(normalized);
}

export function resetHeatCalcFieldStep(
  settings: HeatCalcFieldInputSettings,
  objectType: HeatCalcObjectType,
  fieldId: HeatCalcFieldId,
) {
  return setHeatCalcFieldStep(settings, objectType, fieldId, undefined);
}

export function getHeatCalcFieldStepSettingItems(
  objectType: HeatCalcObjectType,
  settings: HeatCalcFieldInputSettings,
): HeatCalcFieldStepSettingItem[] {
  const normalized = normalizeFieldInputSettings(settings);
  return HEATCALC_FIELD_DEFINITIONS
    .filter((field): field is HeatCalcFieldDefinition & { step: number } =>
      field.objectTypes.includes(objectType) && isConfigurableNumberField(field))
    .map((field) => {
      const override = normalized.fields[objectType]?.[field.id]?.step;
      return {
        objectType,
        fieldId: field.id,
        label: field.label,
        unit: field.unit,
        defaultStep: field.step,
        step: override ?? field.step,
        overridden: override != null,
      };
    });
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
