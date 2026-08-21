/**
 * Heat-calc field visibility + insulation temperature basis rule tables.
 */
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

export function numericValue(value: unknown) {
  if (value == null || value === '') return null;
  if (typeof value === 'string') {
    const trimmed = value.trim();
    if (!trimmed || trimmed === '—' || trimmed === '–' || trimmed === '-') return null;
    const normalized = trimmed
      .replace(/\u00a0/g, ' ')
      .replace(/\s+/g, '')
      .replace(',', '.');
    const parsed = Number(normalized);
    return Number.isFinite(parsed) ? parsed : Number.NaN;
  }
  const numberValue = Number(value);
  return Number.isFinite(numberValue) ? numberValue : Number.NaN;
}

export function hasValue(value: unknown) {
  return value !== undefined && value !== null && value !== '';
}

export function stringValue(value: unknown) {
  return value == null ? '' : String(value);
}

export function input(fieldId: string, context: HeatCalcFieldContext) {
  return getHeatCalcFieldInputConfig(fieldId, context.objectType);
}

export function fieldExistsForContext(fieldId: string, context: HeatCalcFieldContext) {
  const field = getHeatCalcFieldConfig(fieldId);
  if (!field) return false;
  const formFields = getHeatCalcFormFieldIds(context.objectType);
  if (formFields.includes(fieldId)) return true;
  return field.object_types.includes(context.objectType);
}

export function layerCount(context: HeatCalcFieldContext) {
  const count = Number(context.values.insulation_layer_count ?? '1');
  return Math.min(Math.max(Number.isFinite(count) && count > 0 ? count : 1, 1), 3);
}

export function localElementCount(context: HeatCalcFieldContext) {
  const value = numericValue(context.values.num_local_elements);
  return typeof value === 'number' && Number.isFinite(value) ? value : 0;
}

export function isCustomGroundType(value: unknown) {
  const normalized = stringValue(value).trim().toLowerCase();
  return normalized === 'custom' || normalized === 'other';
}

const INSULATION_TEMPERATURE_BASIS_BY_PLACEMENT: Record<string, readonly string[]> = {
  indoor: ['indoor', 'attic', 'basement'],
  outdoor: ['outdoor_summer', 'outdoor_winter'],
  underground: ['channel', 'tunnel', 'technical_subfloor'],
};

export const INSULATION_TEMPERATURE_BASIS_ERROR =
  'Режим tm изоляции не соответствует размещению объекта';

export function allowedInsulationTemperatureBasisValues(placement: unknown): readonly string[] {
  const normalized = stringValue(placement).trim();
  return INSULATION_TEMPERATURE_BASIS_BY_PLACEMENT[normalized]
    ?? INSULATION_TEMPERATURE_BASIS_BY_PLACEMENT.outdoor;
}

export function isInsulationTemperatureBasisAllowedForPlacement(
  basis: unknown,
  placement: unknown,
): boolean {
  if (basis == null || basis === '') return true;
  return allowedInsulationTemperatureBasisValues(placement).includes(String(basis));
}

export function defaultInsulationTemperatureBasisForPlacement(placement: unknown): string | undefined {
  const normalized = stringValue(placement).trim();
  if (normalized === 'indoor') return 'indoor';
  if (normalized === 'underground') return 'channel';
  if (normalized === 'outdoor') return 'outdoor_winter';
  return undefined;
}

export const RANGE_FIELDS = {
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

export type RangeFieldId = keyof typeof RANGE_FIELDS;

export const RANGE_BOUND_FIELDS = new Set<string>(
  Object.values(RANGE_FIELDS).flatMap((range) => [range.min, range.max]),
);

export const SECOND_LAYER_FIELDS = new Set([
  'second_insulation_material',
  'second_insulation_thickness_mm',
  'second_insulation_lambda',
  'second_insulation_temperature_range',
]);

export const THIRD_LAYER_FIELDS = new Set([
  'third_insulation_material',
  'third_insulation_thickness_mm',
  'third_insulation_lambda',
  'third_insulation_temperature_range',
]);

export const SECOND_LAYER_VALUE_FIELDS = [
  'second_insulation_material',
  'second_insulation_thickness_mm',
  'second_insulation_lambda',
  'second_insulation_temperature_min',
  'second_insulation_temperature_max',
];

export const THIRD_LAYER_VALUE_FIELDS = [
  'third_insulation_material',
  'third_insulation_thickness_mm',
  'third_insulation_lambda',
  'third_insulation_temperature_min',
  'third_insulation_temperature_max',
];

export function isRangeField(fieldId: string): fieldId is RangeFieldId {
  return Object.prototype.hasOwnProperty.call(RANGE_FIELDS, fieldId);
}

export function materialFieldForLambda(fieldId: string) {
  if (fieldId === 'first_insulation_lambda') return 'insulation_material';
  if (fieldId === 'second_insulation_lambda') return 'second_insulation_material';
  if (fieldId === 'third_insulation_lambda') return 'third_insulation_material';
  return null;
}

export function isHeatCalcFieldVisible(fieldId: string, context: HeatCalcFieldContext): boolean {
  if (RANGE_BOUND_FIELDS.has(fieldId)) return false;
  if (!fieldExistsForContext(fieldId, context)) return false;
  if (fieldId === 'pipe_material') return context.objectType === 'pipe';
  if (fieldId === 'pipe_lambda') return context.objectType === 'pipe' && context.values.pipe_material === 'other';
  if (fieldId === 'burial_depth' || fieldId === 'pipe_centerline_depth' || fieldId === 'tank_buried_height' || fieldId === 'ground_temperature' || fieldId === 'ground_type' || fieldId === 'ground_conductivity') {
    return context.values.placement === 'underground';
  }
  if (fieldId === 'climate_temperature_basis') return hasValue(context.values.climate_key);
  if (fieldId === 'vapor_temperature') return context.values.steam_tracing === 'yes';
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
    if (fieldId === 'diameter_mm') return shape === 'cylindrical';
    if (fieldId === 'height_mm') return shape === 'cylindrical' || shape === 'rectangular';
    if (fieldId === 'length_mm' || fieldId === 'width_mm') return shape === 'rectangular';
    if (fieldId === 'heating_height' || fieldId === 'laying_step') {
      return shape === 'cylindrical' || shape === 'rectangular';
    }
  }
  return true;
}
