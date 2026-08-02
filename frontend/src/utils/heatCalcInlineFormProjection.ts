/**
 * Explicit pipe/tank form key projection for inline edit drafts.
 * Unknown keys are dropped before form→API conversion.
 */
import type { PipeFormValues, TankFormValues } from '@/utils/objectWizardUtils';

// Allow-listed form keys (pipe/tank + name). Packed for LOC; field-by-field projection below.
const PIPE_FORM_PROJECTION_KEYS = [
  'outer_diameter_mm', 'wall_thickness_mm', 'pipe_material', 'pipe_lambda', 'pipe_lambda_mode',
  'insulation_thickness_mm', 'insulation_material', 'insulation_cover_material', 'insulation_layer_count',
  'first_insulation_lambda', 'first_insulation_temperature_min', 'first_insulation_temperature_max',
  'second_insulation_thickness_mm', 'second_insulation_material', 'second_insulation_lambda',
  'second_insulation_temperature_min', 'second_insulation_temperature_max',
  'third_insulation_thickness_mm', 'third_insulation_material', 'third_insulation_lambda',
  'third_insulation_temperature_min', 'third_insulation_temperature_max',
  'ambient_temperature', 'process_temperature', 'max_ambient_temperature', 'max_process_temperature',
  'environment', 'zone_classification', 'temperature_group', 'placement', 'ground_temperature',
  'ground_temperature_source', 'burial_depth', 'ground_type', 'ground_conductivity',
  'ground_conductivity_source', 'wind_speed', 'alpha_vnesh', 'climate_city', 'climate_region',
  'climate_key', 'climate_temperature_basis', 'insulation_temperature_basis', 'ambient_temperature_source',
  'wind_speed_source', 'pipe_length', 'min_switch_temperature', 'supply_voltage', 'safety_factor',
  'safety_factor_source', 'steam_tracing', 'vapor_temperature', 'winding_coefficient', 'connection_type',
  'explosion_zone_type', 'power_indication_on_boxes', 'end_of_section_indication', 'top_of_box_indication',
  'min_length_for_k2i', 'hot_reserve_coefficient',
  'num_local_elements', 'local_element_equiv_length', 'name',
] as const satisfies readonly (keyof (PipeFormValues & { name?: string }))[];
const TANK_FORM_PROJECTION_KEYS = [
  'shape', 'diameter_mm', 'height_mm', 'length_mm', 'width_mm', 'wall_thickness_mm', 'wall_lambda',
  'insulation_thickness_mm', 'insulation_material', 'insulation_cover_material', 'insulation_layer_count',
  'first_insulation_lambda', 'first_insulation_temperature_min', 'first_insulation_temperature_max',
  'second_insulation_thickness_mm', 'second_insulation_material', 'second_insulation_lambda',
  'second_insulation_temperature_min', 'second_insulation_temperature_max',
  'third_insulation_thickness_mm', 'third_insulation_material', 'third_insulation_lambda',
  'third_insulation_temperature_min', 'third_insulation_temperature_max',
  'ambient_temperature', 'process_temperature', 'max_ambient_temperature', 'max_process_temperature',
  'environment', 'zone_classification', 'temperature_group', 'placement', 'tank_buried_height', 'ground_temperature',
  'ground_temperature_source', 'ground_type', 'ground_conductivity', 'ground_conductivity_source',
  'wind_speed', 'alpha_vnesh', 'climate_city', 'climate_region',
  'climate_key', 'climate_temperature_basis', 'insulation_temperature_basis', 'ambient_temperature_source',
  'wind_speed_source', 'min_switch_temperature', 'supply_voltage', 'safety_factor', 'safety_factor_source',
  'steam_tracing', 'vapor_temperature', 'winding_coefficient', 'connection_type',
  'explosion_zone_type', 'power_indication_on_boxes', 'end_of_section_indication', 'top_of_box_indication',
  'min_length_for_k2i', 'hot_reserve_coefficient', 'q_additional', 'name',
] as const satisfies readonly (keyof (TankFormValues & { name?: string }))[];

function projectFormRecord<K extends string>(formValues: Record<string, unknown>, keys: readonly K[]) {
  const projected: Partial<Record<K, unknown>> = {};
  for (const key of keys) {
    if (Object.prototype.hasOwnProperty.call(formValues, key)) projected[key] = formValues[key];
  }
  return projected;
}

/** Explicit pipe form projection; unknown keys are dropped. */
export function projectPipeFormValuesFromRecord(formValues: Record<string, unknown>) {
  return projectFormRecord(formValues, PIPE_FORM_PROJECTION_KEYS) as PipeFormValues & { name?: string };
}

/** Explicit tank form projection; unknown keys are dropped. */
export function projectTankFormValuesFromRecord(formValues: Record<string, unknown>) {
  return projectFormRecord(formValues, TANK_FORM_PROJECTION_KEYS) as TankFormValues & { name?: string };
}
