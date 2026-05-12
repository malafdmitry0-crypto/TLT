import type { FormInstance } from 'antd';
import { getHeatCalcFieldDefinition, type HeatCalcFieldOption } from '@/domain/heatCalcFields';
import {
  normalizeHeatCalcFieldValue,
  validateHeatCalcField,
} from '@/domain/heatCalcFieldRules';
import type { HeatCalcObjectType } from '@/types/project';

export function heatCalcFormFieldRules(
  form: FormInstance,
  objectType: HeatCalcObjectType,
  fieldId: string,
) {
  return [
    {
      async validator(_: unknown, value: unknown) {
        const values = {
          ...form.getFieldsValue(true),
          [fieldId]: value,
        };
        const normalizedValue = normalizeHeatCalcFieldValue(fieldId, value, { objectType, values });
        const normalizedValues = {
          ...values,
          [fieldId]: normalizedValue,
        };
        const error = validateHeatCalcField(fieldId, normalizedValue, {
          objectType,
          values: normalizedValues,
        });
        if (error) throw new Error(error);
      },
    },
  ];
}

export function heatCalcNumberInputProps(
  objectType: HeatCalcObjectType,
  fieldId: string,
  options: { includeStep?: boolean } = {},
) {
  const field = getHeatCalcFieldDefinition(fieldId, objectType);
  return {
    min: field?.min,
    max: field?.max,
    step: options.includeStep === false ? undefined : field?.step,
  };
}

export function heatCalcTextInputProps(objectType: HeatCalcObjectType, fieldId: string) {
  const field = getHeatCalcFieldDefinition(fieldId, objectType);
  return {
    maxLength: field?.maxLength,
  };
}

export function heatCalcSelectOptions(
  objectType: HeatCalcObjectType,
  fieldId: string,
): HeatCalcFieldOption[] {
  return getHeatCalcFieldDefinition(fieldId, objectType)?.options ?? [];
}
