import { getHeatCalcFieldInputConfig, getHeatCalcFormFieldIds } from '@/domain/heatCalcFields';
import {
  INSULATION_TEMPERATURE_BASIS_ERROR,
  RANGE_BOUND_FIELDS,
  RANGE_FIELDS,
  SECOND_LAYER_VALUE_FIELDS,
  THIRD_LAYER_VALUE_FIELDS,
  defaultInsulationTemperatureBasisForPlacement,
  fieldExistsForContext,
  hasValue,
  input,
  isCustomGroundType,
  isHeatCalcFieldVisible,
  isInsulationTemperatureBasisAllowedForPlacement,
  isRangeField,
  layerCount,
  localElementCount,
  materialFieldForLambda,
  numericValue,
  type HeatCalcFieldContext,
  type RangeFieldId,
} from '@/domain/heatCalcFieldVisibilityRules';

export type { HeatCalcFieldContext } from '@/domain/heatCalcFieldVisibilityRules';

export {
  allowedInsulationTemperatureBasisValues,
  defaultInsulationTemperatureBasisForPlacement,
  isHeatCalcFieldVisible,
  isInsulationTemperatureBasisAllowedForPlacement,
} from '@/domain/heatCalcFieldVisibilityRules';

export interface HeatCalcFieldValidationOptions {
  enforceRequired?: boolean;
}

export function heatCalcRequiredFieldMessage(
  fieldId: string,
  objectType: HeatCalcFieldContext['objectType'],
) {
  const inputType = getHeatCalcFieldInputConfig(fieldId, objectType)?.type;
  return inputType === 'select' || inputType === 'reference'
    ? 'Выберите значение'
    : 'Укажите значение';
}

function fieldRequired(fieldId: string, context: HeatCalcFieldContext) {
  if (!isHeatCalcFieldVisible(fieldId, context)) return false;
  const fieldInput = input(fieldId, context);
  if (context.objectType === 'tank') {
    const shape = String(context.values.shape ?? '');
    if (fieldId === 'diameter_mm') return shape === 'cylindrical';
    if (fieldId === 'height_mm') return shape === 'cylindrical' || shape === 'rectangular';
    if (fieldId === 'length_mm' || fieldId === 'width_mm') return shape === 'rectangular';
    if (fieldId === 'wall_thickness_mm') return hasValue(context.values.wall_lambda);
    if (fieldId === 'wall_lambda') return hasValue(context.values.wall_thickness_mm);
  }
  if (fieldId === 'pipe_material') return context.objectType === 'pipe';
  if (fieldId === 'pipe_lambda') return context.objectType === 'pipe' && context.values.pipe_material === 'other';
  if (fieldId === 'burial_depth' || fieldId === 'pipe_centerline_depth' || fieldId === 'tank_buried_height' || fieldId === 'ground_type' || fieldId === 'ground_temperature') return context.values.placement === 'underground';
  if (fieldId === 'ground_conductivity') {
    return context.values.placement === 'underground' && isCustomGroundType(context.values.ground_type);
  }
  if (fieldId === 'climate_temperature_basis') return false;
  if (fieldId === 'vapor_temperature') return context.values.steam_tracing === 'yes';
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
  if (fieldInput.type === 'computed') return null;
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
      if (!known) return 'Выберите значение из списка';
      if (
        fieldId === 'insulation_temperature_basis'
        && !isInsulationTemperatureBasisAllowedForPlacement(value, context.values.placement)
      ) {
        return INSULATION_TEMPERATURE_BASIS_ERROR;
      }
      return null;
    }
    return null;
  }

  const numberValue = numericValue(value);
  if (numberValue == null) return enforceRequired && fieldRequired(fieldId, context) ? 'Укажите значение' : null;
  if (!Number.isFinite(numberValue)) return 'Введите число';
  if (fieldInput.min != null && numberValue < fieldInput.min) return `Минимальное значение — ${fieldInput.min}`;
  if (fieldInput.max != null && numberValue > fieldInput.max) return `Максимальное значение — ${fieldInput.max}`;

  if (fieldId === 'process_temperature') {
    const boundaries = context.values.placement === 'underground' && context.objectType === 'tank'
      ? [context.values.ambient_temperature, context.values.ground_temperature]
      : [context.objectType === 'pipe' && context.values.placement === 'underground'
        ? context.values.ground_temperature
        : context.values.ambient_temperature];
    if (boundaries.some((temperature) => {
      const value = numericValue(temperature);
      return typeof value === 'number' && Number.isFinite(value) && numberValue <= value;
    })) {
      return 'Требуемая температура объекта должна быть выше температуры среды';
    }
  }
  if (fieldId === 'ambient_temperature') {
    const process = numericValue(context.values.process_temperature);
    if (typeof process === 'number' && Number.isFinite(process) && process <= numberValue) {
      return 'Температура среды должна быть ниже требуемой температуры объекта';
    }
  }
  if (
    fieldId === 'ground_temperature'
    && (context.objectType === 'pipe' || context.objectType === 'tank')
    && context.values.placement === 'underground'
  ) {
    const process = numericValue(context.values.process_temperature);
    if (typeof process === 'number' && Number.isFinite(process) && process <= numberValue) {
      return 'Температура грунта должна быть ниже требуемой температуры объекта';
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
  if (fieldId === 'insulation_layer_count') {
    const count = layerCount({ ...context, values: nextValues });
    if (count < 3) {
      THIRD_LAYER_VALUE_FIELDS.forEach((fieldName) => {
        delete nextValues[fieldName];
      });
    }
    if (count < 2) {
      SECOND_LAYER_VALUE_FIELDS.forEach((fieldName) => {
        delete nextValues[fieldName];
      });
    }
  }
  if (fieldId === 'steam_tracing' && nextValues.steam_tracing !== 'yes') {
    delete nextValues.vapor_temperature;
  }
  if (
    fieldId === 'placement'
    && (
      nextValues.insulation_temperature_basis == null
      || nextValues.insulation_temperature_basis === ''
      || !isInsulationTemperatureBasisAllowedForPlacement(
        nextValues.insulation_temperature_basis,
        nextValues.placement,
      )
    )
  ) {
    const defaultBasis = defaultInsulationTemperatureBasisForPlacement(nextValues.placement);
    if (defaultBasis) {
      nextValues.insulation_temperature_basis = defaultBasis;
    } else {
      delete nextValues.insulation_temperature_basis;
    }
  }
  if (fieldId === 'ambient_temperature') {
    nextValues.ambient_temperature_source = 'manual';
  }
  if (fieldId === 'wind_speed') {
    nextValues.wind_speed_source = 'manual';
  }
  return nextValues;
}
