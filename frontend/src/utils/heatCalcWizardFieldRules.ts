import type { FormInstance } from 'antd';
import {
  getHeatCalcFieldDefinition,
  getHeatCalcFieldInputConfig,
  type HeatCalcFieldOption,
} from '@/domain/heatCalcFields';
import {
  isHeatCalcFieldRequired,
  normalizeHeatCalcFieldValue,
  validateHeatCalcField,
} from '@/domain/heatCalcFieldRules';
import type { HeatCalcObjectType } from '@/types/project';
import {
  resolveHeatCalcFieldStep,
  type HeatCalcFieldInputSettings,
} from '@/utils/heatCalcFieldInputSettings';

export function heatCalcFormFieldRules(
  form: FormInstance,
  objectType: HeatCalcObjectType,
  fieldId: string,
) {
  const values = form.getFieldsValue(true);
  const required = isHeatCalcFieldRequired(fieldId, { objectType, values });
  const requiredMessage = getRequiredMessage(objectType, fieldId);
  return [
    ...(required ? [{ required: true, message: requiredMessage }] : []),
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

function getRequiredMessage(objectType: HeatCalcObjectType, fieldId: string) {
  const field = getHeatCalcFieldDefinition(fieldId, objectType);
  if (field?.editor === 'select') return 'Выберите значение';
  return 'Укажите значение';
}

export function heatCalcNumberInputProps(
  objectType: HeatCalcObjectType,
  fieldId: string,
  options: { includeStep?: boolean; fieldInputSettings?: HeatCalcFieldInputSettings } = {},
) {
  const field = getHeatCalcFieldDefinition(fieldId, objectType);
  const input = getHeatCalcFieldInputConfig(fieldId, objectType);
  return {
    min: field?.min ?? input?.min,
    max: field?.max ?? input?.max,
    step: options.includeStep === false
      ? undefined
      : resolveHeatCalcFieldStep(objectType, fieldId, options.fieldInputSettings) ?? input?.default_step,
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
  return getHeatCalcFieldDefinition(fieldId, objectType)?.options
    ?? getHeatCalcFieldInputConfig(fieldId, objectType)?.options
    ?? [];
}
