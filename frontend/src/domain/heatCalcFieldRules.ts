import {
  getHeatCalcFieldDefinition,
  type HeatCalcFieldDefinition,
} from '@/domain/heatCalcFields';
import type { HeatCalcObjectType } from '@/types/project';

export interface HeatCalcFieldContext {
  objectType: HeatCalcObjectType;
  values: Record<string, unknown>;
}

function numericValue(value: unknown) {
  if (value == null || value === '') return null;
  const numberValue = Number(value);
  return Number.isFinite(numberValue) ? numberValue : Number.NaN;
}

function definition(fieldId: string, context: HeatCalcFieldContext) {
  return getHeatCalcFieldDefinition(fieldId, context.objectType);
}

function fieldRequired(field: HeatCalcFieldDefinition, context: HeatCalcFieldContext) {
  if (context.objectType === 'tank') {
    const shape = String(context.values.shape ?? 'cylindrical');
    if (field.id === 'diameter_mm') return shape === 'cylindrical' || shape === 'spherical';
    if (field.id === 'height_mm') return shape === 'cylindrical' || shape === 'rectangular';
    if (field.id === 'length_mm' || field.id === 'width_mm') return shape === 'rectangular';
  }
  return field.required === true;
}

export function isHeatCalcFieldVisible(fieldId: string, context: HeatCalcFieldContext): boolean {
  const field = definition(fieldId, context);
  if (!field) return false;
  if (context.objectType === 'tank') {
    const shape = String(context.values.shape ?? 'cylindrical');
    if (fieldId === 'diameter_mm') return shape === 'cylindrical' || shape === 'spherical';
    if (fieldId === 'height_mm') return shape === 'cylindrical' || shape === 'rectangular';
    if (fieldId === 'length_mm' || fieldId === 'width_mm') return shape === 'rectangular';
  }
  return true;
}

export function isHeatCalcFieldRequired(fieldId: string, context: HeatCalcFieldContext): boolean {
  const field = definition(fieldId, context);
  return field ? fieldRequired(field, context) : false;
}

export function normalizeHeatCalcFieldValue(
  fieldId: string,
  value: unknown,
  context: HeatCalcFieldContext,
): unknown {
  const field = definition(fieldId, context);
  if (!field) return value;
  if (field.editor === 'text') {
    return String(value ?? '').trim();
  }
  if (field.editor === 'number') {
    const numberValue = numericValue(value);
    return Number.isFinite(numberValue) ? numberValue : null;
  }
  if (field.editor === 'select') {
    const option = field.options?.find((item) => String(item.value) === String(value));
    return option?.value ?? value;
  }
  return value;
}

export function validateHeatCalcField(
  fieldId: string,
  value: unknown,
  context: HeatCalcFieldContext,
): string | null {
  const field = definition(fieldId, context);
  if (!field) return 'Поле недоступно для редактирования';
  if (!isHeatCalcFieldVisible(fieldId, context)) return 'Поле скрыто для текущих параметров объекта';

  if (field.editor === 'text') {
    const textValue = String(value ?? '').trim();
    if (fieldRequired(field, context) && textValue.length === 0) return 'Укажите значение';
    if (field.maxLength != null && textValue.length > field.maxLength) {
      return `Максимальная длина — ${field.maxLength} символов`;
    }
    return null;
  }

  if (field.editor === 'select') {
    if (value == null || value === '') {
      return fieldRequired(field, context) ? 'Выберите значение' : null;
    }
    const known = field.options?.some((item) => String(item.value) === String(value)) ?? false;
    return known ? null : 'Выберите значение из списка';
  }

  const numberValue = numericValue(value);
  if (numberValue == null) return fieldRequired(field, context) ? 'Укажите значение' : null;
  if (!Number.isFinite(numberValue)) return 'Введите число';
  if (field.min != null && numberValue < field.min) return `Минимальное значение — ${field.min}`;
  if (field.max != null && numberValue > field.max) return `Максимальное значение — ${field.max}`;

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

export function validateHeatCalcFormValues(context: HeatCalcFieldContext): Record<string, string> {
  const errors: Record<string, string> = {};
  for (const fieldId of Object.keys(context.values)) {
    const field = definition(fieldId, context);
    if (!field || !isHeatCalcFieldVisible(fieldId, context)) continue;
    const error = validateHeatCalcField(fieldId, context.values[fieldId], context);
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
