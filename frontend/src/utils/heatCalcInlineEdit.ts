import {
  getHeatCalcFieldByColumn,
  getHeatCalcFieldConfig,
  getHeatCalcFieldDefinition,
  getHeatCalcFieldInputConfig,
  getHeatCalcFormFieldIds,
  type HeatCalcFieldDefinition,
} from '@/domain/heatCalcFields';
import {
  applyHeatCalcFieldValue,
  isHeatCalcFieldVisible,
  normalizeHeatCalcFieldValue,
  validateHeatCalcField,
  validateHeatCalcFormValues,
} from '@/domain/heatCalcFieldRules';
import type { ProjectObject, HeatCalcObjectType } from '@/types/project';
import {
  applyObjectFormDefaults,
  pipeApiParamsToForm,
  pipeFormToApiParams,
  tankApiParamsToForm,
  tankFormToApiParams,
  type PipeFormValues,
  type TankFormValues,
} from '@/utils/objectWizardUtils';

export type InlineEditorKind = 'text' | 'number' | 'select';

export interface InlineEditFieldConfig {
  columnKey: string;
  objectType: HeatCalcObjectType;
  fieldId: string;
  field: HeatCalcFieldDefinition;
  editor: InlineEditorKind;
}

export interface DraftRowState {
  objectId: string;
  objectType: HeatCalcObjectType;
  baseVersion: number;
  baseFormValues: Record<string, unknown>;
  draftFormValues: Record<string, unknown>;
  dirtyFields: Record<string, unknown>;
  errors: Record<string, string>;
  saving: boolean;
  sourceParams: Record<string, unknown>;
}

export type DraftRowsById = Record<string, DraftRowState>;

export class DraftRowValidationError extends Error {
  readonly errors: Record<string, string>;

  constructor(errors: Record<string, string>) {
    super('Исправьте ошибки в строке перед сохранением');
    this.name = 'DraftRowValidationError';
    this.errors = errors;
  }
}

function isHeatCalcObjectType(value: string): value is HeatCalcObjectType {
  return value === 'pipe' || value === 'tank';
}

export function getInlineEditFieldConfig(
  objectType: HeatCalcObjectType,
  columnKey: string,
): InlineEditFieldConfig | null {
  const field = getHeatCalcFieldByColumn(objectType, columnKey);
  if (!field) return null;
  return {
    columnKey,
    objectType,
    fieldId: field.id,
    field,
    editor: field.editor,
  };
}

export function getInlineEditFieldConfigByFieldId(
  objectType: HeatCalcObjectType,
  fieldId: string,
): InlineEditFieldConfig | null {
  const field = getHeatCalcFieldDefinition(fieldId, objectType);
  if (!field) return null;
  return {
    columnKey: field.tableColumnKeys[objectType] ?? fieldId,
    objectType,
    fieldId: field.id,
    field,
    editor: field.editor,
  };
}

function baseFormValuesFromRecord(record: ProjectObject): Record<string, unknown> {
  if (record.object_type === 'pipe') {
    return applyObjectFormDefaults('pipe', pipeApiParamsToForm(record.params));
  }
  if (record.object_type === 'tank') {
    return applyObjectFormDefaults('tank', tankApiParamsToForm(record.params));
  }
  return { ...record.params };
}

function createDraftRow(record: ProjectObject): DraftRowState | null {
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
    saving: false,
    sourceParams: record.params,
  };
}

function valuesEqual(left: unknown, right: unknown) {
  if (typeof left === 'number' || typeof right === 'number') {
    const leftNumber = Number(left);
    const rightNumber = Number(right);
    if (!Number.isFinite(leftNumber) && !Number.isFinite(rightNumber)) return true;
    return Math.abs(leftNumber - rightNumber) < 1e-9;
  }
  return JSON.stringify(left ?? null) === JSON.stringify(right ?? null);
}

function computeDirtyFields(row: DraftRowState) {
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

function omitErrors(errors: Record<string, string>, fieldIds: string[]) {
  return Object.fromEntries(
    Object.entries(errors).filter(([fieldId]) => !fieldIds.includes(fieldId)),
  ) as Record<string, string>;
}

function normalizeDraftErrorFieldId(objectType: HeatCalcObjectType, fieldId: string) {
  if (fieldId === '_row') return fieldId;
  const normalized = fieldId.trim();
  if (getHeatCalcFieldDefinition(normalized, objectType)) return normalized;
  const byColumn = getHeatCalcFieldByColumn(objectType, normalized);
  if (byColumn) return byColumn.id;
  const withoutParamsPrefix = normalized.replace(/^params[.\s]+/, '');
  if (withoutParamsPrefix !== normalized) return normalizeDraftErrorFieldId(objectType, withoutParamsPrefix);
  return normalized;
}

function hasMeaningfulDraftValue(value: unknown) {
  if (value == null) return false;
  if (typeof value === 'string') {
    const normalized = value.trim();
    return normalized !== '' && normalized !== '—' && normalized !== '–' && normalized !== '-';
  }
  return true;
}

function sanitizeConvertedParams(value: unknown): unknown {
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

function convertFormValuesToParams(
  objectType: HeatCalcObjectType,
  formValues: Record<string, unknown>,
) {
  const rawParams = objectType === 'pipe'
    ? pipeFormToApiParams(formValues as unknown as PipeFormValues & { name?: string })
    : tankFormToApiParams(formValues as unknown as TankFormValues & { name?: string });
  return sanitizeConvertedParams(rawParams) as Record<string, unknown>;
}

export function applyInlineCellDraft(
  draftRow: DraftRowState | null,
  record: ProjectObject,
  columnKey: string,
  value: unknown,
): DraftRowState | null {
  if (!isHeatCalcObjectType(record.object_type)) return null;
  const config = getInlineEditFieldConfig(record.object_type, columnKey);
  if (!config) return draftRow;
  return applyInlineDraftValue(draftRow, record, config, value);
}

export function applyInlineFieldDraft(
  draftRow: DraftRowState | null,
  record: ProjectObject,
  fieldId: string,
  value: unknown,
): DraftRowState | null {
  if (!isHeatCalcObjectType(record.object_type)) return null;
  const config = getInlineEditFieldConfigByFieldId(record.object_type, fieldId);
  if (!config) return draftRow;
  return applyInlineDraftValue(draftRow, record, config, value);
}

export function applyFormFieldDraft(
  draftRow: DraftRowState | null,
  record: ProjectObject,
  fieldId: string,
  value: unknown,
): DraftRowState | null {
  if (!isHeatCalcObjectType(record.object_type)) return null;
  const currentRow = draftRow ?? createDraftRow(record);
  if (!currentRow) return null;

  const fieldConfig = getHeatCalcFieldConfig(fieldId);
  if (!fieldConfig) return currentRow;

  const fieldContext = {
    objectType: currentRow.objectType,
    values: currentRow.draftFormValues,
  };
  const normalizedValue = normalizeHeatCalcFieldValue(fieldId, value, fieldContext);
  const nextDraftValues = applyHeatCalcFieldValue(fieldId, normalizedValue, {
    objectType: currentRow.objectType,
    values: currentRow.draftFormValues,
  });
  const nextValidationErrors = validateHeatCalcFormValues({
    objectType: currentRow.objectType,
    values: nextDraftValues,
  }, {
    enforceRequired: false,
  });
  const nextRow = {
    ...currentRow,
    draftFormValues: nextDraftValues,
    errors: nextValidationErrors,
  };
  return {
    ...nextRow,
    dirtyFields: computeDirtyFields(nextRow),
  };
}

function applyInlineDraftValue(
  draftRow: DraftRowState | null,
  record: ProjectObject,
  config: InlineEditFieldConfig,
  value: unknown,
): DraftRowState | null {
  const currentRow = draftRow ?? createDraftRow(record);
  if (!currentRow) return null;

  const fieldContext = {
    objectType: currentRow.objectType,
    values: currentRow.draftFormValues,
  };
  if (!isHeatCalcFieldVisible(config.fieldId, fieldContext)) {
    return {
      ...currentRow,
      errors: {
        ...currentRow.errors,
        [config.fieldId]: 'Поле недоступно для текущих параметров объекта',
      },
    };
  }

  const normalizedValue = normalizeHeatCalcFieldValue(config.fieldId, value, fieldContext);
  const nextValuesForValidation = {
    ...currentRow.draftFormValues,
    [config.fieldId]: normalizedValue,
  };
  const error = validateHeatCalcField(config.fieldId, normalizedValue, {
    objectType: currentRow.objectType,
    values: nextValuesForValidation,
  }, {
    enforceRequired: false,
  });
  if (error) {
    const nextRow = {
      ...currentRow,
      draftFormValues: nextValuesForValidation,
      errors: {
        ...omitErrors(currentRow.errors, [config.fieldId, '_row']),
        [config.fieldId]: error,
      },
    };
    return {
      ...nextRow,
      dirtyFields: computeDirtyFields(nextRow),
    };
  }

  const nextDraftValues = applyHeatCalcFieldValue(config.fieldId, normalizedValue, {
    objectType: currentRow.objectType,
    values: currentRow.draftFormValues,
  });
  const nextValidationErrors = validateHeatCalcFormValues({
    objectType: currentRow.objectType,
    values: nextDraftValues,
  }, {
    enforceRequired: false,
  });
  const nextRow = {
    ...currentRow,
    draftFormValues: nextDraftValues,
    errors: nextValidationErrors,
  };
  return {
    ...nextRow,
    dirtyFields: computeDirtyFields(nextRow),
  };
}

export function buildDraftRowParams(
  draftRow: DraftRowState,
  options: { enforceRequired?: boolean } = {},
): Record<string, unknown> {
  const errors = getDraftRowValidationErrors(draftRow, options);
  if (Object.keys(errors).length > 0) {
    throw new DraftRowValidationError(errors);
  }
  return {
    ...draftRow.sourceParams,
    ...convertFormValuesToParams(draftRow.objectType, draftRow.draftFormValues),
  };
}

export function getDraftRowValidationErrors(
  draftRow: DraftRowState,
  options: { enforceRequired?: boolean } = {},
): Record<string, string> {
  const errors = validateHeatCalcFormValues({
    objectType: draftRow.objectType,
    values: draftRow.draftFormValues,
  }, {
    enforceRequired: options.enforceRequired ?? false,
  });
  const normalizedStoredErrors: Record<string, string> = {};
  const formFieldIds = getHeatCalcFormFieldIds(draftRow.objectType);
  for (const [rawFieldId, message] of Object.entries(draftRow.errors)) {
    if (!message) continue;
    if (rawFieldId === '_row') {
      normalizedStoredErrors._row = message;
      continue;
    }
    const fieldId = normalizeDraftErrorFieldId(draftRow.objectType, rawFieldId);
    if (getHeatCalcFieldInputConfig(fieldId, draftRow.objectType)?.type === 'computed') {
      continue;
    }
    if (
      !getHeatCalcFieldDefinition(fieldId, draftRow.objectType)
      && !formFieldIds.includes(fieldId)
    ) {
      continue;
    }
    if (!isHeatCalcFieldVisible(fieldId, {
      objectType: draftRow.objectType,
      values: draftRow.draftFormValues,
    })) {
      continue;
    }
    if (errors[fieldId]) continue;
    const currentValue = draftRow.draftFormValues[fieldId];
    if (hasMeaningfulDraftValue(currentValue)) continue;
    normalizedStoredErrors[fieldId] = message;
  }
  return {
    ...normalizedStoredErrors,
    ...errors,
  };
}

export function buildDraftDisplayRecord(draftRow: DraftRowState | undefined, record: ProjectObject): ProjectObject {
  if (!draftRow || Object.keys(draftRow.dirtyFields).length === 0) return record;
  try {
    return {
      ...record,
      params: {
        ...record.params,
        ...convertFormValuesToParams(draftRow.objectType, draftRow.draftFormValues),
      },
    };
  } catch {
    return record;
  }
}

export function getInlineCellFormValue(
  record: ProjectObject,
  columnKey: string,
  draftRow?: DraftRowState,
) {
  if (!isHeatCalcObjectType(record.object_type)) return undefined;
  const config = getInlineEditFieldConfig(record.object_type, columnKey);
  if (!config) return undefined;
  const values = draftRow?.draftFormValues ?? baseFormValuesFromRecord(record);
  return values[config.fieldId];
}

export function getInlineRowFormValues(
  record: ProjectObject,
  draftRow?: DraftRowState,
): Record<string, unknown> {
  if (!isHeatCalcObjectType(record.object_type)) return { ...record.params };
  return draftRow?.draftFormValues ?? baseFormValuesFromRecord(record);
}

export function isDraftRowDirty(draftRow: DraftRowState | undefined) {
  return !!draftRow && Object.keys(draftRow.dirtyFields).length > 0;
}

export function isDraftRowEmpty(draftRow: DraftRowState | null | undefined) {
  return !draftRow || (
    Object.keys(draftRow.dirtyFields).length === 0
    && Object.keys(draftRow.errors).length === 0
  );
}
