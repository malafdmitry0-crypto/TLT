/**
 * Pure draft-row model helpers for heat-calc inline edit.
 * Builds drafts from records, tracks dirty fields, and converts form → API params.
 */
import {
  getHeatCalcFieldByColumn,
  getHeatCalcFieldDefinition,
} from '@/domain/heatCalcFields';
import { normalizeHeatCalcFieldValue } from '@/domain/heatCalcFieldRules';
import type { ProjectObject, HeatCalcObjectType } from '@/types/project';
import {
  applyObjectFormDefaults,
  pipeApiParamsToForm,
  pipeFormToApiParams,
  tankApiParamsToForm,
  tankFormToApiParams,
} from '@/utils/objectWizardUtils';
import {
  projectPipeFormValuesFromRecord,
  projectTankFormValuesFromRecord,
} from '@/utils/heatCalcInlineFormProjection';

export interface DraftRowState {
  objectId: string;
  objectType: HeatCalcObjectType;
  baseVersion: number;
  baseFormValues: Record<string, unknown>;
  draftFormValues: Record<string, unknown>;
  dirtyFields: Record<string, unknown>;
  errors: Record<string, string>;
  validationAttempted?: boolean;
  saving: boolean;
  sourceParams: Record<string, unknown>;
}

export type DraftRowsById = Record<string, DraftRowState>;

export function isHeatCalcObjectType(value: string): value is HeatCalcObjectType {
  return value === 'pipe' || value === 'tank';
}

export function baseFormValuesFromRecord(record: ProjectObject): Record<string, unknown> {
  if (record.object_type === 'pipe') {
    const values = pipeApiParamsToForm(record.params);
    return applyObjectFormDefaults('pipe', values);
  }
  if (record.object_type === 'tank') {
    const values = tankApiParamsToForm(record.params);
    return applyObjectFormDefaults('tank', values);
  }
  return { ...record.params };
}

export function createDraftRow(record: ProjectObject): DraftRowState | null {
  if (!isHeatCalcObjectType(record.object_type)) return null;
  const baseFormValues = baseFormValuesFromRecord(record);
  return {
    objectId: record.id,
    objectType: record.object_type,
    baseVersion: record.version,
    baseFormValues,
    draftFormValues: baseFormValues,
    dirtyFields: {},
    errors: {},
    validationAttempted: false,
    saving: false,
    sourceParams: record.params,
  };
}

export function valuesEqual(left: unknown, right: unknown) {
  if (typeof left === 'number' || typeof right === 'number') {
    const leftNumber = Number(left);
    const rightNumber = Number(right);
    if (!Number.isFinite(leftNumber) && !Number.isFinite(rightNumber)) return true;
    return Math.abs(leftNumber - rightNumber) < 1e-9;
  }
  return JSON.stringify(left ?? null) === JSON.stringify(right ?? null);
}

export function computeDirtyFields(row: DraftRowState) {
  const dirtyFields: Record<string, unknown> = {};
  const keys = new Set([...Object.keys(row.baseFormValues), ...Object.keys(row.draftFormValues)]);
  for (const fieldId of keys) {
    const context = { objectType: row.objectType, values: row.draftFormValues };
    const left = normalizeHeatCalcFieldValue(fieldId, row.draftFormValues[fieldId], context);
    const right = normalizeHeatCalcFieldValue(fieldId, row.baseFormValues[fieldId], {
      objectType: row.objectType,
      values: row.baseFormValues,
    });
    if (!valuesEqual(left, right)) dirtyFields[fieldId] = left;
  }
  return dirtyFields;
}

export function omitErrors(errors: Record<string, string>, fieldIds: string[]) {
  return Object.fromEntries(
    Object.entries(errors).filter(([fieldId]) => !fieldIds.includes(fieldId)),
  ) as Record<string, string>;
}

export function normalizeDraftErrorFieldId(objectType: HeatCalcObjectType, fieldId: string) {
  if (fieldId === '_row') return fieldId;
  const normalized = fieldId.trim();
  if (getHeatCalcFieldDefinition(normalized, objectType)) return normalized;
  const byColumn = getHeatCalcFieldByColumn(objectType, normalized);
  if (byColumn) return byColumn.id;
  const withoutParamsPrefix = normalized.replace(/^params[.\s]+/, '');
  if (withoutParamsPrefix !== normalized) {
    return normalizeDraftErrorFieldId(objectType, withoutParamsPrefix);
  }
  return normalized;
}

export function hasMeaningfulDraftValue(value: unknown) {
  if (value == null) return false;
  if (typeof value === 'string') {
    const normalized = value.trim();
    return normalized !== '' && normalized !== '—' && normalized !== '–' && normalized !== '-';
  }
  return true;
}

export function sanitizeConvertedParams(value: unknown): unknown {
  if (typeof value === 'number') return Number.isFinite(value) ? value : undefined;
  if (Array.isArray(value)) {
    return value
      .map(sanitizeConvertedParams)
      .filter((item) => item !== undefined);
  }
  if (typeof value === 'object' && value !== null) {
    const result: Record<string, unknown> = {};
    for (const [key, childValue] of Object.entries(value)) {
      const nextValue = sanitizeConvertedParams(childValue);
      if (nextValue !== undefined) result[key] = nextValue;
    }
    return result;
  }
  return value === undefined ? undefined : value;
}

export function convertFormValuesToParams(
  objectType: HeatCalcObjectType,
  formValues: Record<string, unknown>,
) {
  const rawParams = objectType === 'pipe'
    ? pipeFormToApiParams(projectPipeFormValuesFromRecord(formValues))
    : tankFormToApiParams(projectTankFormValuesFromRecord(formValues));
  return sanitizeConvertedParams(rawParams) as Record<string, unknown>;
}
