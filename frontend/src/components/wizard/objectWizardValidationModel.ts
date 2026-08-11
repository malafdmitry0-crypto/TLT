import {
  getHeatCalcFieldByColumn,
  getHeatCalcFieldDefinition,
} from '@/domain/heatCalcFields';
import type { HeatCalcObjectType, ProjectObject } from '@/types/project';
import { heatCalcRequiredFieldMessage } from '@/domain/heatCalcFieldRules';
import { INSULATION_LAYER_FORM_FIELDS } from './objectWizardInsulationModel';

const REQUIRED_FIELDS_ERROR_PREFIX = 'Не заполнены обязательные поля объекта:';
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

export function buildCalculationFieldErrors(
  validationErrors: ProjectObject['validation_errors'] | undefined,
  objectType: HeatCalcObjectType,
): Record<string, CalculationFieldError> {
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
        { message: heatCalcRequiredFieldMessage(fieldName, objectType), required: true },
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
