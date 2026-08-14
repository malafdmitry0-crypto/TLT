import type { FormInstance } from 'antd';
import {
  getHeatCalcFieldInputConfig,
  getHeatCalcFieldLabel,
  type HeatCalcFieldOption,
} from '@/domain/heatCalcFields';
import {
  allowedInsulationTemperatureBasisValues,
  heatCalcRequiredFieldMessage,
  isHeatCalcFieldRequired,
  isHeatCalcFieldVisible,
  normalizeHeatCalcFieldValue,
  validateHeatCalcField,
} from '@/domain/heatCalcFieldRules';
import type { HeatCalcObjectType } from '@/types/project';
import {
  resolveHeatCalcFieldStep,
  type HeatCalcFieldInputSettings,
} from '@/utils/heatCalcFieldInputSettings';

/*
 * Render-phase reads must not touch the form store before <Form> mounts: the
 * wizard builds its slots (rules, aria-required) during render, and when that
 * render is thrown away — Suspense retry on the lazy chunk, StrictMode — the
 * store is never hooked and rc-field-form logs «useForm is not connected».
 * The wizard registers a render-safe snapshot getter per form instance;
 * validators keep live reads (they only run after mount).
 */
const renderValuesByForm = new WeakMap<FormInstance, () => Record<string, unknown>>();

export function registerHeatCalcWizardRenderValues(
  form: FormInstance,
  getValues: () => Record<string, unknown>,
) {
  renderValuesByForm.set(form, getValues);
}

function heatCalcRenderValues(form: FormInstance): Record<string, unknown> {
  return renderValuesByForm.get(form)?.() ?? form.getFieldsValue(true);
}

export function heatCalcFieldRequired(
  form: FormInstance,
  objectType: HeatCalcObjectType,
  fieldId: string,
) {
  return isHeatCalcFieldRequired(fieldId, {
    objectType,
    values: heatCalcRenderValues(form),
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
  const requiredMessage = heatCalcRequiredFieldMessage(fieldId, objectType);
  return [
    ...(required
      ? [{
        required: true,
        message: requiredMessage,
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
    preserveOutOfRangeDraft: true,
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

/**
 * Group update has no single object context, so only registry-owned numeric
 * bounds are safe to validate locally. Relation and heterogeneous visibility
 * checks remain at the atomic backend boundary.
 */
export function heatCalcNumberRangeError(
  objectType: HeatCalcObjectType,
  fieldId: string,
  value: unknown,
): string | null {
  const fieldInput = getHeatCalcFieldInputConfig(fieldId, objectType);
  if (fieldInput?.type !== 'number') return null;

  const context = {
    objectType,
    values: { [fieldId]: value },
  };
  const normalizedValue = normalizeHeatCalcFieldValue(fieldId, value, context);
  if (typeof normalizedValue !== 'number') return null;

  const belowMin = fieldInput.min != null && normalizedValue < fieldInput.min;
  const aboveMax = fieldInput.max != null && normalizedValue > fieldInput.max;
  if (!belowMin && !aboveMax) return null;

  // Never surface a false visibility/relation error from a context-free batch.
  // For visible numeric fields the domain validator checks bounds before any
  // relation, and therefore remains the sole owner of the displayed message.
  const normalizedContext = {
    objectType,
    values: { [fieldId]: normalizedValue },
  };
  if (!isHeatCalcFieldVisible(fieldId, normalizedContext)) return null;
  return validateHeatCalcField(fieldId, normalizedValue, normalizedContext, {
    enforceRequired: false,
  });
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

export function heatCalcSelectInputProps(
  objectType: HeatCalcObjectType,
  fieldId: string,
  options: {
    form?: FormInstance;
  } = {},
) {
  const required = options.form ? heatCalcFieldRequired(options.form, objectType, fieldId) : false;
  return {
    'aria-label': getHeatCalcFieldLabel(fieldId, {
      objectType,
      context: 'form',
      variant: 'full',
    }),
    'aria-required': required ? true : undefined,
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
