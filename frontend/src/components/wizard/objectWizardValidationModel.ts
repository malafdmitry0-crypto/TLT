import {
  getHeatCalcFieldByColumn,
  getHeatCalcFieldDefinition,
  getHeatCalcFieldLabel,
  getHeatCalcFormFieldIds,
} from '@/domain/heatCalcFields';
import {
  isHeatCalcFieldRequired,
  isHeatCalcFieldVisible,
} from '@/domain/heatCalcFieldRules';
import { isRangeField } from '@/domain/heatCalcFieldVisibilityRules';
import type { HeatCalcObjectType, ProjectObject } from '@/types/project';
import { INSULATION_LAYER_FORM_FIELDS } from './objectWizardInsulationModel';

const REQUIRED_FIELDS_ERROR_PREFIX = 'Не заполнены обязательные поля объекта:';

/*
 * Пара «толщина стенки ↔ λ стенки» резервуара: каждое поле обязательно только
 * потому, что заполнено соседнее. Незавершённую пару маппер вычищает из payload,
 * поэтому отправку она не блокирует.
 */
const PAIR_REQUIRED_FORM_FIELDS = new Set(['wall_thickness_mm', 'wall_lambda']);
export const REQUIRED_FIELD_ERROR_MESSAGE = '';

export type CalculationFieldError = {
  message: string;
  required?: boolean;
};

const REQUIRED_FIELD_LABEL_TO_FORM_NAMES: Record<string, string[]> = {
  'Наружный диаметр': ['outer_diameter_mm'],
  'Длина трубопровода': ['pipe_length'],
  'Толщина стенки': ['wall_thickness_mm'],
  'Материал трубы или λ трубы': ['pipe_material', 'pipe_lambda'],
  'Форма резервуара': ['shape'],
  'λ стенки': ['wall_lambda'],
  'Диаметр резервуара': ['diameter_mm'],
  'Высота резервуара': ['height_mm'],
  'Длина резервуара': ['length_mm'],
  'Ширина резервуара': ['width_mm'],
  'Размещение объекта': ['placement'],
  'Температура окружающей среды': ['ambient_temperature'],
  'Температура грунта': ['ground_temperature'],
  'Требуемая температура объекта': ['process_temperature'],
  'Температура продукта': ['process_temperature'],
  'Режим температуры изоляции': ['insulation_temperature_basis'],
  'Тип грунта': ['ground_type'],
  'λ грунта': ['ground_conductivity'],
  'Толщина изоляции': ['insulation_thickness_mm'],
  'Материал изоляции': ['insulation_material'],
  'Толщина 1-го слоя': ['insulation_thickness_mm'],
  'Толщина 1-го слоя изоляции': ['insulation_thickness_mm'],
  'Материал 1-го слоя': ['insulation_material'],
  'Материал 1-го слоя изоляции': ['insulation_material'],
  'λ 1-го слоя изоляции': ['first_insulation_lambda'],
  'Толщина 2-го слоя': ['second_insulation_thickness_mm'],
  'Толщина 2-го слоя изоляции': ['second_insulation_thickness_mm'],
  'Материал 2-го слоя': ['second_insulation_material'],
  'Материал 2-го слоя изоляции': ['second_insulation_material'],
  'λ 2-го слоя изоляции': ['second_insulation_lambda'],
  'Толщина 3-го слоя': ['third_insulation_thickness_mm'],
  'Толщина 3-го слоя изоляции': ['third_insulation_thickness_mm'],
  'Материал 3-го слоя': ['third_insulation_material'],
  'Материал 3-го слоя изоляции': ['third_insulation_material'],
  'λ 3-го слоя изоляции': ['third_insulation_lambda'],
};

const API_FIELD_TO_FORM_NAMES: Record<string, string[]> = {
  outer_diameter: ['outer_diameter_mm'],
  pipe_length: ['pipe_length'],
  wall_thickness: ['wall_thickness_mm'],
  pipe_material: ['pipe_material'],
  pipe_lambda: ['pipe_lambda'],
  shape: ['shape'],
  diameter: ['diameter_mm'],
  height: ['height_mm'],
  length: ['length_mm'],
  width: ['width_mm'],
  wall_lambda: ['wall_lambda'],
  insulation_thickness: ['insulation_thickness_mm'],
  insulation_material: ['insulation_material'],
  ambient_temperature: ['ambient_temperature'],
  process_temperature: ['process_temperature'],
  ground_temperature: ['ground_temperature'],
  pipe_centerline_depth: ['burial_depth'],
  tank_buried_height: ['tank_buried_height'],
  ground_type: ['ground_type'],
  ground_conductivity: ['ground_conductivity'],
  wind_speed: ['wind_speed'],
  alpha_vnesh: ['alpha_vnesh'],
  safety_factor: ['safety_factor'],
  vapor_temperature: ['vapor_temperature'],
  local_element_equiv_length: ['local_element_equiv_length'],
  num_local_elements: ['num_local_elements'],
  q_additional: ['q_additional'],
  insulation_layer_count: ['insulation_layer_count'],
  insulation_temperature_basis: ['insulation_temperature_basis'],
};

const RANGE_MESSAGE_TO_FORM_NAMES: Array<[RegExp, string[]]> = [
  [/Температура окружающей среды/i, ['ambient_temperature']],
  [/Температура грунта/i, ['ground_temperature']],
  [/Температура продукта|Требуемая температура объекта/i, ['process_temperature']],
  [/Режим температуры изоляции|tm изоляции/i, ['insulation_temperature_basis']],
  [/Наружный диаметр/i, ['outer_diameter_mm']],
  [/Длина трубопровода/i, ['pipe_length']],
  [/Толщина стенки/i, ['wall_thickness_mm']],
  [/Толщина изоляции/i, ['insulation_thickness_mm']],
  [/λ грунта|теплопроводность грунта/i, ['ground_conductivity']],
  [/Скорость ветра/i, ['wind_speed']],
  [/коэф.*наружной теплоотдачи|alpha/i, ['alpha_vnesh']],
  [/Коэффициент запаса/i, ['safety_factor']],
  [/Температура пропарки|T проп/i, ['vapor_temperature']],
  [/эквивалентн.*длин/i, ['local_element_equiv_length']],
  [/Диаметр резервуара/i, ['diameter_mm']],
  [/Высота резервуара/i, ['height_mm']],
  [/Длина резервуара/i, ['length_mm']],
  [/Ширина резервуара/i, ['width_mm']],
  [/λ стенки/i, ['wall_lambda']],
  [/Максимальное количество слоёв/i, ['insulation_layer_count']],
];

function validationErrorsText(validationErrors: ProjectObject['validation_errors'] | undefined) {
  if (!validationErrors) return '';
  const message = validationErrors['message'];
  if (typeof message === 'string') return message;
  try {
    return JSON.stringify(validationErrors);
  } catch {
    return 'Проверьте параметры объекта';
  }
}

function sphereCriticalRadiusError(validationErrors: ProjectObject['validation_errors'] | undefined) {
  if (validationErrors?.['error_code'] !== 'sphere_below_critical_insulation_radius') return null;
  const context = validationErrors['error_context'];
  if (!context || typeof context !== 'object' || Array.isArray(context)) {
    return 'Наружный радиус изоляции сферы меньше критического радиуса; увеличьте толщину изоляции.';
  }
  const outerRadius = Number((context as Record<string, unknown>).router);
  const criticalRadius = Number((context as Record<string, unknown>).rcritical);
  if (!Number.isFinite(outerRadius) || !Number.isFinite(criticalRadius)) {
    return 'Наружный радиус изоляции сферы меньше критического радиуса; увеличьте толщину изоляции.';
  }
  return `Наружный радиус изоляции ${outerRadius.toFixed(3)} м меньше критического ${criticalRadius.toFixed(3)} м; увеличьте толщину изоляции.`;
}

export function isEmptyFormValue(value: unknown) {
  return value === undefined || value === null || value === '';
}

function validationRequiredFields(validationErrors: ProjectObject['validation_errors'] | undefined, message: string) {
  const explicitFields = validationErrors?.['missing_fields'];
  if (Array.isArray(explicitFields)) {
    return explicitFields
      .map((field) => String(field).trim())
      .filter(Boolean);
  }

  const prefixIndex = message.indexOf(REQUIRED_FIELDS_ERROR_PREFIX);
  if (prefixIndex < 0) return [];
  return message
    .slice(prefixIndex + REQUIRED_FIELDS_ERROR_PREFIX.length)
    .split(',')
    .map((field) => field.trim())
    .filter(Boolean);
}

function uniqueFieldNames(fieldNames: string[]) {
  return [...new Set(fieldNames.filter(Boolean))];
}

function requiredFieldNamesFromLabels(labels: string[], objectType: HeatCalcObjectType) {
  return uniqueFieldNames(labels.flatMap((field) => {
    const trimmed = field.trim();
    if (!trimmed) return [];
    if (trimmed === 'Глубина/высота подземной части') {
      return objectType === 'pipe' ? ['burial_depth'] : ['tank_buried_height'];
    }
    if (REQUIRED_FIELD_LABEL_TO_FORM_NAMES[trimmed]) return REQUIRED_FIELD_LABEL_TO_FORM_NAMES[trimmed];
    if (API_FIELD_TO_FORM_NAMES[trimmed]) return API_FIELD_TO_FORM_NAMES[trimmed];
    return /^[a-z][a-z0-9_]*$/i.test(trimmed) ? [trimmed] : [];
  }));
}

function insulationLayerFieldNamesFromMessage(message: string) {
  const matches = [...message.matchAll(/insulation_layers[.\s]+(\d+)[.\s]+(thickness|material|conductivity|temperature_range)/gi)];
  return matches.flatMap((match) => {
    const index = Number(match[1]);
    const field = match[2];
    const prefix = index === 0 ? 'first' : index === 1 ? 'second' : index === 2 ? 'third' : null;
    const layer = INSULATION_LAYER_FORM_FIELDS[index];
    if (!prefix || !layer) return [];
    if (field === 'thickness') return [index === 0 ? 'insulation_thickness_mm' : `${prefix}_insulation_thickness_mm`];
    if (field === 'material') return [layer.material];
    if (field === 'conductivity') return [layer.lambda];
    if (field === 'temperature_range') return [layer.range, layer.min];
    return [];
  });
}

function insulationMaterialRangeLayerFromMessage(message: string) {
  const numberPattern = '([-+−–—]?\\d+(?:[.,]\\d+)?)';
  const match = message.match(new RegExp(
    `слоя изоляции\\s*#\\s*(\\d+)\\s*\\(${numberPattern}\\s*°C\\)\\s*`
    + `вне диапазона\\s*материала\\s*'([^']+)'\\s*:\\s*${numberPattern}\\s*(?:…|\\.{2,3})\\s*${numberPattern}\\s*°C`,
    'i',
  ));
  if (!match) return null;

  const layerNumber = Number(match[1]);
  return INSULATION_LAYER_FORM_FIELDS[layerNumber - 1] ?? null;
}

function messageHasApiFieldName(message: string, apiName: string) {
  return message.split(/\s+/).includes(apiName);
}

function fieldNamesFromValidationMessage(message: string, objectType: HeatCalcObjectType) {
  const fromApiNames = Object.entries(API_FIELD_TO_FORM_NAMES)
    .filter(([apiName]) => messageHasApiFieldName(message, apiName))
    .flatMap(([, formNames]) => formNames);
  const fromRangeMessages = RANGE_MESSAGE_TO_FORM_NAMES
    .filter(([pattern]) => pattern.test(message))
    .flatMap(([, formNames]) => formNames);
  return uniqueFieldNames([
    ...fromApiNames,
    ...fromRangeMessages,
    ...insulationLayerFieldNamesFromMessage(message),
    ...(/Глубина|подземной части/i.test(message)
      ? [objectType === 'pipe' ? 'burial_depth' : 'tank_buried_height']
      : []),
  ]);
}

function formFieldNamesFromErrorKey(fieldKey: string, objectType: HeatCalcObjectType) {
  const normalizedKey = fieldKey.trim();
  if (!normalizedKey || normalizedKey === '_row') return [];
  if (API_FIELD_TO_FORM_NAMES[normalizedKey]) return API_FIELD_TO_FORM_NAMES[normalizedKey];
  if (getHeatCalcFieldDefinition(normalizedKey, objectType)) return [normalizedKey];
  const byColumn = getHeatCalcFieldByColumn(objectType, normalizedKey);
  if (byColumn) return [byColumn.id];
  const withoutParamsPrefix = normalizedKey.replace(/^params[.\s]+/, '');
  if (withoutParamsPrefix !== normalizedKey) return formFieldNamesFromErrorKey(withoutParamsPrefix, objectType);
  return fieldNamesFromValidationMessage(normalizedKey, objectType);
}

export function normalizeFieldErrorsForForm(
  fieldErrors: Record<string, unknown> | undefined,
  objectType: HeatCalcObjectType,
) {
  if (!fieldErrors) return {};
  const result: Record<string, CalculationFieldError> = {};
  Object.entries(fieldErrors).forEach(([fieldKey, message]) => {
    const text = typeof message === 'string' && message.trim()
      ? message
      : 'Проверьте значение';
    formFieldNamesFromErrorKey(fieldKey, objectType).forEach((fieldName) => {
      result[fieldName] = { message: text };
    });
  });
  return result;
}

/**
 * Обязательные поля объекта, оставшиеся пустыми, — §5.3 «Ошибка заполнения».
 * Считаем по тем же предикатам, что рисуют палевую заливку обязательного поля,
 * чтобы форма не отправляла заведомо отклоняемый запрос.
 */
export function missingRequiredFormFields(
  objectType: HeatCalcObjectType,
  values: Record<string, unknown>,
): string[] {
  const context = { objectType, values };
  return getHeatCalcFormFieldIds(objectType).filter((fieldId) => (
    !PAIR_REQUIRED_FORM_FIELDS.has(fieldId)
      && !isRangeField(fieldId)
      && isHeatCalcFieldVisible(fieldId, context)
      && isHeatCalcFieldRequired(fieldId, context)
      && isEmptyFormValue(values[fieldId])
  ));
}

/*
 * Бэкенд отдаёт в 422 текст pydantic-исключения: «6 validation errors for
 * StoredPipeHeatParams\nouter_diameter\n  Input should be a valid number
 * [type=float_type…]». §3.11 требует «поле + что исправить», поэтому дамп
 * разбирается на пары (поле, причина) и переводится.
 */
const PYDANTIC_HEADER = /^\d+\s+validation errors?\s+for\s+(\S+)/i;
const PYDANTIC_TYPE_SUFFIX = /\s*\[type=[^\]]*\]/g;
const PYDANTIC_DOC_LINK = /For further information visit/i;
const MAX_HUMANIZED_ERRORS = 4;

const PYDANTIC_MESSAGE_RU: Array<[RegExp, string]> = [
  [/^Field required$/i, 'заполните поле'],
  [/^Input should be a valid number.*$/i, 'укажите число'],
  [/^Input should be a valid integer.*$/i, 'укажите целое число'],
  [/^Input should be a valid string.*$/i, 'укажите значение'],
  [/^Input should be greater than or equal to (\S+)$/i, 'значение не меньше $1'],
  [/^Input should be less than or equal to (\S+)$/i, 'значение не больше $1'],
  [/^Input should be greater than (\S+)$/i, 'значение больше $1'],
  [/^Input should be less than (\S+)$/i, 'значение меньше $1'],
  [/^List should have at least (\d+) item.*$/i, 'заполните хотя бы $1 значение'],
];

function humanizePydanticReason(raw: string) {
  let text = raw.replace(PYDANTIC_TYPE_SUFFIX, '').trim();
  const valueError = text.match(/^Value error,\s*(.+)$/i);
  if (valueError) text = valueError[1].trim();
  // «process_temperature_not_above_ambient: температура продукта…» — код нам не нужен
  const codePrefixed = text.match(/^[a-z][a-z0-9_]*:\s*(.+)$/);
  if (codePrefixed && /[а-яё]/i.test(codePrefixed[1])) text = codePrefixed[1].trim();
  const translation = PYDANTIC_MESSAGE_RU.find(([pattern]) => pattern.test(text));
  return translation ? text.replace(translation[0], translation[1]) : text;
}

function fieldLabelForErrorKey(errorKey: string, objectType: HeatCalcObjectType) {
  if (!errorKey) return '';
  const [formFieldName] = formFieldNamesFromErrorKey(errorKey, objectType);
  if (!formFieldName) return '';
  return getHeatCalcFieldLabel(formFieldName, {
    objectType,
    context: 'form',
    variant: 'full',
  });
}

/** Превращает 422-ответ бэкенда в «Поле: что исправить»; чужой текст не трогает. */
export function humanizeObjectParamsErrorMessage(
  rawMessage: string,
  fallbackObjectType: HeatCalcObjectType = 'pipe',
): string {
  const message = String(rawMessage ?? '').trim();
  const header = message.match(PYDANTIC_HEADER);
  if (!header) return message;
  const objectType: HeatCalcObjectType = /tank/i.test(header[1])
    ? 'tank'
    : /pipe/i.test(header[1])
      ? 'pipe'
      : fallbackObjectType;

  const reasonByKey = new Map<string, string>();
  let errorKey = '';
  message
    .split('\n')
    .slice(1)
    .filter((line) => line.trim() && !PYDANTIC_DOC_LINK.test(line))
    .forEach((line) => {
      if (!/^\s/.test(line)) {
        errorKey = line.trim();
        return;
      }
      if (reasonByKey.has(errorKey)) return;
      reasonByKey.set(errorKey, humanizePydanticReason(line.trim()));
    });
  if (reasonByKey.size === 0) return message;

  const entries = [...reasonByKey.entries()];
  const shown = entries.slice(0, MAX_HUMANIZED_ERRORS).map(([key, reason]) => {
    const label = fieldLabelForErrorKey(key, objectType);
    return label ? `${label}: ${reason}` : reason;
  });
  const hidden = entries.length - shown.length;
  return hidden > 0 ? `${shown.join('; ')} и ещё ${hidden}` : shown.join('; ');
}

export function buildCalculationFieldErrors(
  validationErrors: ProjectObject['validation_errors'] | undefined,
  objectType: HeatCalcObjectType,
): Record<string, CalculationFieldError> {
  const criticalRadiusError = sphereCriticalRadiusError(validationErrors);
  if (criticalRadiusError) {
    return { insulation_thickness_mm: { message: criticalRadiusError } };
  }
  const message = validationErrorsText(validationErrors).trim();
  const structuredErrors: Record<string, CalculationFieldError> = {};
  const field = validationErrors?.['field'];
  if (typeof field === 'string' && field.trim()) {
    Object.assign(structuredErrors, normalizeFieldErrorsForForm({
      [field]: message || 'Проверьте значение',
    }, objectType));
  }
  const fields = validationErrors?.['fields'];
  if (fields && typeof fields === 'object' && !Array.isArray(fields)) {
    Object.assign(structuredErrors, normalizeFieldErrorsForForm(fields as Record<string, unknown>, objectType));
  }
  if (!message) return structuredErrors;
  const requiredFieldNames = requiredFieldNamesFromLabels(
    validationRequiredFields(validationErrors, message),
    objectType,
  );
  if (requiredFieldNames.length > 0) {
    return {
      ...structuredErrors,
      ...Object.fromEntries(requiredFieldNames.map((fieldName) => [
        fieldName,
        { message: REQUIRED_FIELD_ERROR_MESSAGE, required: true },
      ])),
    };
  }
  const insulationRangeLayer = insulationMaterialRangeLayerFromMessage(message);
  if (insulationRangeLayer) {
    return {
      ...structuredErrors,
      [insulationRangeLayer.material]: { message: '' },
      [insulationRangeLayer.lambda]: { message: '' },
      [insulationRangeLayer.range]: { message: '' },
      [insulationRangeLayer.min]: { message: '' },
    };
  }
  return {
    ...structuredErrors,
    ...Object.fromEntries(fieldNamesFromValidationMessage(message, objectType).map((fieldName) => [
      fieldName,
      { message },
    ])),
  };
}
