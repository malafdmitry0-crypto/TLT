import type { FormInstance } from 'antd';
import {
  getHeatCalcFieldInputConfig,
  getHeatCalcFieldLabel,
  type HeatCalcFieldOption,
} from '@/domain/heatCalcFields';
import {
  allowedInsulationTemperatureBasisValues,
  isHeatCalcFieldRequired,
  normalizeHeatCalcFieldValue,
  validateHeatCalcField,
} from '@/domain/heatCalcFieldRules';
import type { HeatCalcObjectType } from '@/types/project';
import {
  resolveHeatCalcFieldStep,
  type HeatCalcFieldInputSettings,
} from '@/utils/heatCalcFieldInputSettings';

export function heatCalcFieldRequired(
  form: FormInstance,
  objectType: HeatCalcObjectType,
  fieldId: string,
) {
  return isHeatCalcFieldRequired(fieldId, {
    objectType,
    values: form.getFieldsValue(true),
  });
}

export function heatCalcCustomControlRequiredProps(
  form: FormInstance,
  objectType: HeatCalcObjectType,
  fieldId: string,
) {
  const required = heatCalcFieldRequired(form, objectType, fieldId);
  return {
    required,
    'aria-required': required ? true : undefined,
  };
}

export function heatCalcFormFieldRules(
  form: FormInstance,
  objectType: HeatCalcObjectType,
  fieldId: string,
) {
  const required = heatCalcFieldRequired(form, objectType, fieldId);
  return [
    ...(required
      ? [{
        required: true,
        warningOnly: true,
        message: '',
      }]
      : []),
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
        }, {
          enforceRequired: false,
        });
        if (error) throw new Error(error);
      },
    },
  ];
}

export function heatCalcNumberInputProps(
  objectType: HeatCalcObjectType,
  fieldId: string,
  options: {
    includeStep?: boolean;
    fieldInputSettings?: HeatCalcFieldInputSettings;
    form?: FormInstance;
  } = {},
) {
  const input = getHeatCalcFieldInputConfig(fieldId, objectType);
  const required = options.form ? heatCalcFieldRequired(options.form, objectType, fieldId) : false;
  return {
    min: input?.min,
    max: input?.max,
    'aria-label': getHeatCalcFieldLabel(fieldId, {
      objectType,
      context: 'form',
      variant: 'full',
    }),
    'aria-required': required ? true : undefined,
    step: options.includeStep === false
      ? undefined
      : resolveHeatCalcFieldStep(objectType, fieldId, options.fieldInputSettings) ?? input?.default_step,
  };
}

export function heatCalcTextInputProps(objectType: HeatCalcObjectType, fieldId: string) {
  const input = getHeatCalcFieldInputConfig(fieldId, objectType);
  return {
    maxLength: input?.max_length,
    'aria-label': getHeatCalcFieldLabel(fieldId, {
      objectType,
      context: 'form',
      variant: 'full',
    }),
  };
}

export function heatCalcSelectOptions(
  objectType: HeatCalcObjectType,
  fieldId: string,
  values?: Record<string, unknown>,
): HeatCalcFieldOption[] {
  const options = getHeatCalcFieldInputConfig(fieldId, objectType)?.options ?? [];
  if (fieldId !== 'insulation_temperature_basis' || !values) return options;
  const allowedValues = allowedInsulationTemperatureBasisValues(values.placement);
  return options.filter((option) => allowedValues.includes(String(option.value)));
}
