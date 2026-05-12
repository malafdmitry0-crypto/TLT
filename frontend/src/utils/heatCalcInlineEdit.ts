import { getHeatCalcFieldByColumn, type HeatCalcFieldDefinition } from '@/domain/heatCalcFields';
import {
  applyHeatCalcFieldValue,
  isHeatCalcFieldVisible,
  normalizeHeatCalcFieldValue,
  validateHeatCalcField,
  validateHeatCalcFormValues,
} from '@/domain/heatCalcFieldRules';
import type { ProjectObject, HeatCalcObjectType } from '@/types/project';
import {
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
  baseFormValues: Record<string, unknown>;
  draftFormValues: Record<string, unknown>;
  dirtyFields: Record<string, unknown>;
  errors: Record<string, string>;
  saving: boolean;
  sourceParams: Record<string, unknown>;
}

export type DraftRowsById = Record<string, DraftRowState>;

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

function baseFormValuesFromRecord(record: ProjectObject): Record<string, unknown> {
  if (record.object_type === 'pipe') {
    return {
      pipe_lambda_mode: 'reference',
      insulation_layer_count: '1',
      ...pipeApiParamsToForm(record.params),
    };
  }
  if (record.object_type === 'tank') {
    return {
      shape: 'cylindrical',
      insulation_layer_count: '1',
      ...tankApiParamsToForm(record.params),
    };
  }
  return { ...record.params };
}

function createDraftRow(record: ProjectObject): DraftRowState | null {
  if (!isHeatCalcObjectType(record.object_type)) return null;
  const baseFormValues = baseFormValuesFromRecord(record);
  return {
    objectId: record.id,
    objectType: record.object_type,
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
  const nextRow = {
    ...currentRow,
    draftFormValues: nextDraftValues,
    errors: omitErrors(currentRow.errors, [config.fieldId, '_row']),
  };
  return {
    ...nextRow,
    dirtyFields: computeDirtyFields(nextRow),
  };
}

export function buildDraftRowParams(draftRow: DraftRowState): Record<string, unknown> {
  const errors = validateHeatCalcFormValues({
    objectType: draftRow.objectType,
    values: draftRow.draftFormValues,
  });
  if (Object.keys({ ...draftRow.errors, ...errors }).length > 0) {
    throw new Error('Исправьте ошибки в строке перед сохранением');
  }
  return {
    ...draftRow.sourceParams,
    ...convertFormValuesToParams(draftRow.objectType, draftRow.draftFormValues),
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

export function isDraftRowDirty(draftRow: DraftRowState | undefined) {
  return !!draftRow && Object.keys(draftRow.dirtyFields).length > 0;
}

export function isDraftRowEmpty(draftRow: DraftRowState | null | undefined) {
  return !draftRow || (
    Object.keys(draftRow.dirtyFields).length === 0
    && Object.keys(draftRow.errors).length === 0
  );
}
