import {
  getHeatCalcFieldConfig,
  getHeatCalcFieldInputConfig,
  getHeatCalcFormFieldIds,
} from '@/domain/heatCalcFields';
import type { HeatCalcObjectType } from '@/types/project';

export interface HeatCalcFieldContext {
  objectType: HeatCalcObjectType;
  values: Record<string, unknown>;
}

export interface HeatCalcFieldValidationOptions {
  enforceRequired?: boolean;
}

function numericValue(value: unknown) {
  if (value == null || value === '') return null;
  const numberValue = Number(value);
  return Number.isFinite(numberValue) ? numberValue : Number.NaN;
}

function hasValue(value: unknown) {
  return value !== undefined && value !== null && value !== '';
}

function stringValue(value: unknown) {
  return value == null ? '' : String(value);
}

function input(fieldId: string, context: HeatCalcFieldContext) {
  return getHeatCalcFieldInputConfig(fieldId, context.objectType);
}

function fieldExistsForContext(fieldId: string, context: HeatCalcFieldContext) {
  const field = getHeatCalcFieldConfig(fieldId);
  if (!field) return false;
  const formFields = getHeatCalcFormFieldIds(context.objectType);
  if (formFields.includes(fieldId)) return true;
  return field.object_types.includes(context.objectType);
}

function layerCount(context: HeatCalcFieldContext) {
  const count = Number(context.values.insulation_layer_count ?? '1');
  return Math.min(Math.max(Number.isFinite(count) && count > 0 ? count : 1, 1), 3);
}

function localElementCount(context: HeatCalcFieldContext) {
  return ['valve_count', 'flange_count', 'support_count'].reduce((total, fieldId) => {
    const value = numericValue(context.values[fieldId]);
    return total + (typeof value === 'number' && Number.isFinite(value) ? value : 0);
  }, 0);
}

function isCustomGroundType(value: unknown) {
  const normalized = stringValue(value).trim().toLowerCase();
  return normalized === 'custom' || normalized === 'other';
}

const RANGE_FIELDS = {
  first_insulation_temperature_range: {
    material: 'insulation_material',
    min: 'first_insulation_temperature_min',
    max: 'first_insulation_temperature_max',
  },
  second_insulation_temperature_range: {
    material: 'second_insulation_material',
    min: 'second_insulation_temperature_min',
    max: 'second_insulation_temperature_max',
  },
  third_insulation_temperature_range: {
    material: 'third_insulation_material',
    min: 'third_insulation_temperature_min',
    max: 'third_insulation_temperature_max',
  },
} as const;

type RangeFieldId = keyof typeof RANGE_FIELDS;

const RANGE_BOUND_FIELDS = new Set<string>(
  Object.values(RANGE_FIELDS).flatMap((range) => [range.min, range.max]),
);

const SECOND_LAYER_FIELDS = new Set([
  'second_insulation_material',
  'second_insulation_thickness_mm',
  'second_insulation_lambda',
  'second_insulation_temperature_range',
]);

const THIRD_LAYER_FIELDS = new Set([
  'third_insulation_material',
  'third_insulation_thickness_mm',
  'third_insulation_lambda',
  'third_insulation_temperature_range',
]);

function isRangeField(fieldId: string): fieldId is RangeFieldId {
  return Object.prototype.hasOwnProperty.call(RANGE_FIELDS, fieldId);
}

function materialFieldForLambda(fieldId: string) {
  if (fieldId === 'first_insulation_lambda') return 'insulation_material';
  if (fieldId === 'second_insulation_lambda') return 'second_insulation_material';
  if (fieldId === 'third_insulation_lambda') return 'third_insulation_material';
  return null;
}

function fieldRequired(fieldId: string, context: HeatCalcFieldContext) {
  if (!isHeatCalcFieldVisible(fieldId, context)) return false;
  const fieldInput = input(fieldId, context);
  if (context.objectType === 'tank') {
    const shape = String(context.values.shape ?? '');
    if (fieldId === 'diameter_mm') return shape === 'cylindrical' || shape === 'spherical';
    if (fieldId === 'height_mm') return shape === 'cylindrical' || shape === 'rectangular';
    if (fieldId === 'length_mm' || fieldId === 'width_mm') return shape === 'rectangular';
    if (fieldId === 'wall_thickness_mm') return hasValue(context.values.wall_lambda);
    if (fieldId === 'wall_lambda') return hasValue(context.values.wall_thickness_mm);
  }
  if (fieldId === 'pipe_material') return context.objectType === 'pipe' && context.values.pipe_lambda_mode === 'reference';
  if (fieldId === 'pipe_lambda') return context.objectType === 'pipe' && context.values.pipe_lambda_mode === 'manual';
  if (fieldId === 'burial_depth' || fieldId === 'ground_type') return context.values.placement === 'underground';
  if (fieldId === 'ground_conductivity') {
    return context.values.placement === 'underground' && isCustomGroundType(context.values.ground_type);
  }
  if (fieldId === 'climate_temperature_basis') return hasValue(context.values.climate_key);
  if (fieldId === 'local_element_equiv_length') return context.objectType === 'pipe' && localElementCount(context) > 0;
  if (isRangeField(fieldId)) return context.values[RANGE_FIELDS[fieldId].material] === 'other';
  const materialField = materialFieldForLambda(fieldId);
  if (materialField) return context.values[materialField] === 'other';
  return fieldInput?.required === true;
}

function validateRangeField(
  fieldId: RangeFieldId,
  context: HeatCalcFieldContext,
  options: HeatCalcFieldValidationOptions = {},
) {
  const range = RANGE_FIELDS[fieldId];
  const required = fieldRequired(fieldId, context);
  const enforceRequired = options.enforceRequired !== false;
  const min = numericValue(context.values[range.min]);
  const max = numericValue(context.values[range.max]);
  if (!required && min == null && max == null) return null;
  if (min == null || max == null) return required && enforceRequired ? 'Укажите диапазон T' : null;
  if (!Number.isFinite(min) || !Number.isFinite(max)) return 'Введите число';
  const minInput = getHeatCalcFieldInputConfig(range.min, context.objectType);
  const maxInput = getHeatCalcFieldInputConfig(range.max, context.objectType);
  const minLimit = minInput?.min ?? -273;
  const maxLimit = maxInput?.max ?? 1000;
  if (min < minLimit || min > maxLimit || max < minLimit || max > maxLimit) {
    return `Допустимо ${minLimit}...${maxLimit} °C`;
  }
  if (min >= max) return 'Нижняя граница должна быть меньше верхней';
  return null;
}

function pairValidationError(fieldId: string, context: HeatCalcFieldContext) {
  if (context.objectType !== 'tank') return null;
  if (fieldId === 'wall_thickness_mm' && !hasValue(context.values.wall_thickness_mm) && hasValue(context.values.wall_lambda)) {
    return 'Укажите толщину стенки';
  }
  if (fieldId === 'wall_lambda' && !hasValue(context.values.wall_lambda) && hasValue(context.values.wall_thickness_mm)) {
    return 'Укажите λ стенки';
  }
  return null;
}

export function isHeatCalcFieldVisible(fieldId: string, context: HeatCalcFieldContext): boolean {
  if (RANGE_BOUND_FIELDS.has(fieldId)) return false;
  if (!fieldExistsForContext(fieldId, context)) return false;
  if (fieldId === 'pipe_material') return context.objectType === 'pipe' && context.values.pipe_lambda_mode === 'reference';
  if (fieldId === 'pipe_lambda') return context.objectType === 'pipe' && context.values.pipe_lambda_mode === 'manual';
  if (fieldId === 'burial_depth' || fieldId === 'ground_type' || fieldId === 'ground_conductivity') {
    return context.values.placement === 'underground';
  }
  if (fieldId === 'climate_temperature_basis') return hasValue(context.values.climate_key);
  if (fieldId === 'wind_speed') {
    return context.values.placement === 'outdoor'
      || (context.objectType === 'tank' && context.values.placement === 'underground');
  }
  if (fieldId === 'alpha_vnesh') {
    return context.values.placement === 'outdoor'
      || context.values.placement === 'indoor'
      || (context.objectType === 'tank' && context.values.placement === 'underground');
  }
  if (SECOND_LAYER_FIELDS.has(fieldId)) return layerCount(context) >= 2;
  if (THIRD_LAYER_FIELDS.has(fieldId)) return layerCount(context) >= 3;
  if (context.objectType === 'tank') {
    const shape = String(context.values.shape ?? '');
    if (fieldId === 'diameter_mm') return shape === 'cylindrical' || shape === 'spherical';
    if (fieldId === 'height_mm') return shape === 'cylindrical' || shape === 'rectangular';
    if (fieldId === 'length_mm' || fieldId === 'width_mm') return shape === 'rectangular';
  }
  return true;
}

export function isHeatCalcFieldRequired(fieldId: string, context: HeatCalcFieldContext): boolean {
  return fieldExistsForContext(fieldId, context) && fieldRequired(fieldId, context);
}

export function normalizeHeatCalcFieldValue(
  fieldId: string,
  value: unknown,
  context: HeatCalcFieldContext,
): unknown {
  const fieldInput = input(fieldId, context);
  if (!fieldInput) return value;
  if (fieldInput.type === 'text') {
    return String(value ?? '').trim();
  }
  if (fieldInput.type === 'number') {
    const numberValue = numericValue(value);
    return Number.isFinite(numberValue) ? numberValue : null;
  }
  if (fieldInput.type === 'select') {
    const option = fieldInput.options?.find((item) => String(item.value) === String(value));
    return option?.value ?? value;
  }
  return value;
}

export function validateHeatCalcField(
  fieldId: string,
  value: unknown,
  context: HeatCalcFieldContext,
  options: HeatCalcFieldValidationOptions = {},
): string | null {
  const fieldInput = input(fieldId, context);
  if (!fieldInput || !fieldExistsForContext(fieldId, context)) return 'Поле недоступно для редактирования';
  if (!isHeatCalcFieldVisible(fieldId, context)) return 'Поле скрыто для текущих параметров объекта';
  const enforceRequired = options.enforceRequired !== false;

  if (isRangeField(fieldId)) return validateRangeField(fieldId, context, options);

  if (enforceRequired) {
    const pairError = pairValidationError(fieldId, context);
    if (pairError) return pairError;
  }

  if (fieldInput.type === 'text') {
    const textValue = String(value ?? '').trim();
    if (enforceRequired && fieldRequired(fieldId, context) && textValue.length === 0) return 'Укажите значение';
    if (fieldInput.max_length != null && textValue.length > fieldInput.max_length) {
      return `Максимальная длина — ${fieldInput.max_length} символов`;
    }
    return null;
  }

  if (fieldInput.type === 'select' || fieldInput.type === 'reference') {
    if (value == null || value === '') {
      return enforceRequired && fieldRequired(fieldId, context) ? 'Выберите значение' : null;
    }
    if (fieldInput.type === 'select') {
      const known = fieldInput.options?.some((item) => String(item.value) === String(value)) ?? false;
      return known ? null : 'Выберите значение из списка';
    }
    return null;
  }

  const numberValue = numericValue(value);
  if (numberValue == null) return enforceRequired && fieldRequired(fieldId, context) ? 'Укажите значение' : null;
  if (!Number.isFinite(numberValue)) return 'Введите число';
  if (fieldInput.min != null && numberValue < fieldInput.min) return `Минимальное значение — ${fieldInput.min}`;
  if (fieldInput.max != null && numberValue > fieldInput.max) return `Максимальное значение — ${fieldInput.max}`;

  if (fieldId === 'process_temperature') {
    const ambient = numericValue(context.values.ambient_temperature);
    if (typeof ambient === 'number' && Number.isFinite(ambient) && numberValue <= ambient) {
      return 'Требуемая температура объекта должна быть выше температуры среды';
    }
  }
  if (fieldId === 'ambient_temperature') {
    const process = numericValue(context.values.process_temperature);
    if (typeof process === 'number' && Number.isFinite(process) && process <= numberValue) {
      return 'Температура среды должна быть ниже требуемой температуры объекта';
    }
  }
  return null;
}

export function validateHeatCalcFormValues(
  context: HeatCalcFieldContext,
  options: HeatCalcFieldValidationOptions = {},
): Record<string, string> {
  const errors: Record<string, string> = {};
  const fieldIds = new Set([
    ...getHeatCalcFormFieldIds(context.objectType),
    ...Object.keys(context.values),
  ]);
  for (const fieldId of fieldIds) {
    if (RANGE_BOUND_FIELDS.has(fieldId)) continue;
    if (!fieldExistsForContext(fieldId, context) || !isHeatCalcFieldVisible(fieldId, context)) continue;
    const error = validateHeatCalcField(fieldId, context.values[fieldId], context, options);
    if (error) errors[fieldId] = error;
  }
  return errors;
}

export function applyHeatCalcFieldValue(
  fieldId: string,
  value: unknown,
  context: HeatCalcFieldContext,
): Record<string, unknown> {
  const nextValues = {
    ...context.values,
    [fieldId]: normalizeHeatCalcFieldValue(fieldId, value, context),
  };
  if (fieldId === 'ambient_temperature') {
    nextValues.ambient_temperature_source = 'manual';
  }
  if (fieldId === 'wind_speed') {
    nextValues.wind_speed_source = 'manual';
  }
  return nextValues;
}
