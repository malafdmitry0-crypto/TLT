import type { InsulationEntry } from '@/types/reference';

export const INSULATION_LAYER_FORM_FIELDS = [
  {
    material: 'insulation_material',
    lambda: 'first_insulation_lambda',
    range: 'first_insulation_temperature_range',
    min: 'first_insulation_temperature_min',
    max: 'first_insulation_temperature_max',
  },
  {
    material: 'second_insulation_material',
    lambda: 'second_insulation_lambda',
    range: 'second_insulation_temperature_range',
    min: 'second_insulation_temperature_min',
    max: 'second_insulation_temperature_max',
  },
  {
    material: 'third_insulation_material',
    lambda: 'third_insulation_lambda',
    range: 'third_insulation_temperature_range',
    min: 'third_insulation_temperature_min',
    max: 'third_insulation_temperature_max',
  },
] as const;

export function isReferenceInsulationMaterial(value: unknown) {
  return value !== undefined && value !== null && value !== '' && value !== 'other';
}

export function insulationReferenceFieldValues(
  layer: (typeof INSULATION_LAYER_FORM_FIELDS)[number],
  materials: InsulationEntry[],
  material: unknown,
) {
  const selected = materials.find((entry) => entry.material === material);
  if (!selected) return {};
  const nextValues: Record<string, unknown> = {};
  if (selected.conductivity != null) nextValues[layer.lambda] = selected.conductivity;
  const range = selected.temperature_range;
  if (Array.isArray(range) && range.length >= 2) {
    nextValues[layer.min] = range[0];
    nextValues[layer.max] = range[1];
  }
  return nextValues;
}

export function expandedChangedFieldNames(fieldNames: string[]) {
  const expanded = new Set(fieldNames);
  INSULATION_LAYER_FORM_FIELDS.forEach((layer) => {
    if (fieldNames.includes(layer.min) || fieldNames.includes(layer.max)) {
      expanded.add(layer.range);
      expanded.add(layer.min);
      expanded.add(layer.max);
    }
    if (fieldNames.includes(layer.material)) {
      expanded.add(layer.lambda);
      expanded.add(layer.range);
      expanded.add(layer.min);
      expanded.add(layer.max);
    }
  });
  return Array.from(expanded);
}
