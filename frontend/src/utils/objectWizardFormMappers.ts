/**
 * Form ↔ API param mappers for the object wizard (mm form units ↔ metre API units).
 * Public entry points re-exported from objectWizardUtils for stable import paths.
 */

import type { PipeFormValues, TankFormValues } from '@/utils/objectWizardUtils';

type InsulationTemperatureBasis =
  | 'indoor'
  | 'outdoor_summer'
  | 'outdoor_winter'
  | 'channel'
  | 'tunnel'
  | 'technical_subfloor'
  | 'attic'
  | 'basement';
type TemperatureRange = [number, number];

function hasExplicitNumberValue(value: unknown): boolean {
  return value !== null && value !== undefined && value !== '';
}

function numberOrNull(value: unknown): number | null {
  if (!hasExplicitNumberValue(value)) return null;
  const numeric = Number(value);
  return Number.isFinite(numeric) ? numeric : null;
}

function mmToMOrNull(value: unknown): number | null {
  const numeric = numberOrNull(value);
  return numeric == null ? null : numeric / 1000;
}

function numberOrZero(value: unknown): number {
  return hasExplicitNumberValue(value) ? Number(value) : 0;
}

function defaultInsulationTemperatureBasisForPlacement(
  placement: unknown,
): InsulationTemperatureBasis | undefined {
  if (placement === 'indoor') return 'indoor';
  if (placement === 'underground') return 'channel';
  if (placement === 'outdoor') return 'outdoor_winter';
  return undefined;
}

function insulationTemperatureBasisOrDefault(
  value: unknown,
  placement: unknown,
): InsulationTemperatureBasis | undefined {
  if (value) return value as InsulationTemperatureBasis;
  return defaultInsulationTemperatureBasisForPlacement(placement);
}

// ---------------------------------------------------------------------------
// Conversion: form values (mm) → API params (metres)
// ---------------------------------------------------------------------------

export function pipeFormToApiParams(
  v: PipeFormValues & { name?: string }
): Record<string, unknown> {
  const params: Record<string, unknown> = {
    outer_diameter: mmToMOrNull(v.outer_diameter_mm),
    wall_thickness: mmToMOrNull(v.wall_thickness_mm),
    process_temperature: numberOrNull(v.process_temperature),
    pipe_length: numberOrNull(v.pipe_length),
  };
  if (v.placement !== 'underground') params.ambient_temperature = numberOrNull(v.ambient_temperature);
  applyCommonObjectParams(params, v, { objectType: 'pipe' });
  if (v.pipe_material === 'other' || v.pipe_lambda_mode === 'manual') {
    params.pipe_lambda = numberOrNull(v.pipe_lambda);
  } else {
    params.pipe_material = v.pipe_material ?? null;
  }
  if (hasExplicitNumberValue(v.num_local_elements)) {
    params.num_local_elements = numberOrZero(v.num_local_elements);
  }
  if (hasExplicitNumberValue(v.local_element_equiv_length)) {
    params.local_element_equiv_length = numberOrNull(v.local_element_equiv_length);
  }
  applyInsulationLayers(params, v);
  if (v.name) params.name = v.name;
  return params;
}

export function tankFormToApiParams(
  v: TankFormValues & { name?: string }
): Record<string, unknown> {
  const params: Record<string, unknown> = {
    shape: v.shape ?? null,
    process_temperature: numberOrNull(v.process_temperature),
    q_additional: numberOrZero(v.q_additional),
  };
  applyCommonObjectParams(params, v, { objectType: 'tank' });
  applyInsulationLayers(params, v);
  if (v.shape === 'cylindrical' || v.shape === 'spherical') {
    if (hasExplicitNumberValue(v.diameter_mm)) params.diameter = mmToMOrNull(v.diameter_mm);
  }
  if (v.shape === 'cylindrical' || v.shape === 'rectangular') {
    if (hasExplicitNumberValue(v.height_mm)) params.height = mmToMOrNull(v.height_mm);
  }
  if (v.shape === 'rectangular') {
    if (hasExplicitNumberValue(v.length_mm)) params.length = mmToMOrNull(v.length_mm);
    if (hasExplicitNumberValue(v.width_mm)) params.width = mmToMOrNull(v.width_mm);
  }
  if (hasExplicitNumberValue(v.wall_thickness_mm) && hasExplicitNumberValue(v.wall_lambda)) {
    params.wall_thickness = mmToMOrNull(v.wall_thickness_mm);
    params.wall_lambda = numberOrNull(v.wall_lambda);
  }
  if (v.name) params.name = v.name;
  return params;
}

type LayeredFormValues = Pick<
  PipeFormValues,
  | 'insulation_thickness_mm'
  | 'insulation_material'
  | 'insulation_layer_count'
  | 'first_insulation_lambda'
  | 'first_insulation_temperature_min'
  | 'first_insulation_temperature_max'
  | 'second_insulation_thickness_mm'
  | 'second_insulation_material'
  | 'second_insulation_lambda'
  | 'second_insulation_temperature_min'
  | 'second_insulation_temperature_max'
  | 'third_insulation_thickness_mm'
  | 'third_insulation_material'
  | 'third_insulation_lambda'
  | 'third_insulation_temperature_min'
  | 'third_insulation_temperature_max'
>;

function formTemperatureRange(min?: number, max?: number) {
  if (min == null || max == null) return {};
  return { temperature_range: [min, max] as TemperatureRange };
}


function applyCommonObjectParams(
  params: Record<string, unknown>,
  v: PipeFormValues | TankFormValues,
  options: { objectType: 'pipe' | 'tank' },
) {
  const placement = v.placement ?? null;
  params.placement = placement;
  const isPipe = options.objectType === 'pipe';
  if (!isPipe && placement !== 'underground' && v.ambient_temperature != null) {
    params.ambient_temperature = v.ambient_temperature;
  }
  if (!isPipe && placement === 'underground') {
    const tankValues = v as TankFormValues;
    if (tankValues.ambient_temperature != null) params.ambient_temperature = tankValues.ambient_temperature;
    if (tankValues.ground_temperature != null) {
      params.ground_temperature = tankValues.ground_temperature;
      params.ground_temperature_source = tankValues.ground_temperature_source ?? 'manual';
    }
    if (tankValues.tank_buried_height != null) {
      params.tank_buried_height = tankValues.tank_buried_height;
    }
  }
  if (isPipe && placement === 'underground') {
    const pipeValues = v as PipeFormValues;
    if (pipeValues.ground_temperature != null) {
      params.ground_temperature = pipeValues.ground_temperature;
      params.ground_temperature_source = pipeValues.ground_temperature_source ?? 'manual';
    }
    if (pipeValues.burial_depth != null) params.pipe_centerline_depth = pipeValues.burial_depth;
  }
  if (placement === 'underground' && v.ground_type) params.ground_type = v.ground_type;
  if (placement === 'underground' && v.ground_conductivity != null) {
    params.ground_conductivity = v.ground_conductivity;
    const source = isPipe
      ? (v as PipeFormValues).ground_conductivity_source
      : (v as TankFormValues).ground_conductivity_source;
    params.ground_conductivity_source = source
      ?? (v.ground_type === 'custom' ? 'manual' : 'reference');
  }
  if ((!isPipe || placement !== 'underground') && v.wind_speed != null) params.wind_speed = v.wind_speed;
  if ((!isPipe || placement !== 'underground') && v.alpha_vnesh != null) params.alpha_vnesh = v.alpha_vnesh;
  const hasClimateKeyField = Object.prototype.hasOwnProperty.call(v, 'climate_key');
  if (v.climate_key) {
    params.climate_key = v.climate_key;
  } else if (v.climate_region && v.climate_city) {
    params.climate_key = `${v.climate_region}|||${v.climate_city}`;
  } else if (hasClimateKeyField) {
    params.climate_key = null;
    params.climate_city = null;
    params.climate_region = null;
    if (!isPipe || placement !== 'underground') params.climate_temperature_basis = null;
  }
  if (v.climate_city) params.climate_city = v.climate_city;
  if (v.climate_region) params.climate_region = v.climate_region;
  if ((!isPipe || placement !== 'underground') && v.climate_temperature_basis) {
    params.climate_temperature_basis = v.climate_temperature_basis;
  }
  const insulationTemperatureBasis = insulationTemperatureBasisOrDefault(
    v.insulation_temperature_basis,
    placement,
  );
  if (insulationTemperatureBasis) {
    params.insulation_temperature_basis = insulationTemperatureBasis;
  }
  if ((!isPipe || placement !== 'underground') && v.ambient_temperature_source) {
    params.ambient_temperature_source = v.ambient_temperature_source;
  }
  if ((!isPipe || placement !== 'underground') && v.wind_speed_source) {
    params.wind_speed_source = v.wind_speed_source;
  }
  if (v.insulation_cover_material) params.insulation_cover_material = v.insulation_cover_material;
  if (v.max_ambient_temperature != null) params.max_ambient_temperature = v.max_ambient_temperature;
  if (v.max_process_temperature != null) params.max_process_temperature = v.max_process_temperature;
  if (v.environment) params.environment = v.environment;
  if (v.zone_classification) params.zone_classification = v.zone_classification;
  if (v.temperature_group) params.temperature_group = v.temperature_group;
  if (v.min_switch_temperature != null) params.min_switch_temperature = v.min_switch_temperature;
  if (v.supply_voltage != null) params.supply_voltage = v.supply_voltage;
  if (v.safety_factor != null) params.safety_factor = v.safety_factor;
  if (v.safety_factor_source) params.safety_factor_source = v.safety_factor_source;
  if (v.steam_tracing) params.steam_tracing = v.steam_tracing;
  if (v.vapor_temperature != null) params.vapor_temperature = v.vapor_temperature;
  if (v.winding_coefficient != null) params.winding_coefficient = v.winding_coefficient;
  if (v.connection_type) params.connection_type = v.connection_type;
}

function applyInsulationLayers(
  params: Record<string, unknown>,
  v: LayeredFormValues,
) {
  const count = Number(v.insulation_layer_count ?? '1');

  const layers = [
    {
      thickness: mmToMOrNull(v.insulation_thickness_mm),
      material: v.insulation_material ?? null,
      ...(v.insulation_material === 'other' && v.first_insulation_lambda != null
        ? { conductivity: v.first_insulation_lambda }
        : {}),
      ...(v.insulation_material === 'other'
        ? formTemperatureRange(v.first_insulation_temperature_min, v.first_insulation_temperature_max)
        : {}),
    },
  ];

  if (count >= 2 && v.second_insulation_thickness_mm != null && v.second_insulation_material) {
    layers.push({
      thickness: mmToMOrNull(v.second_insulation_thickness_mm),
      material: v.second_insulation_material,
      ...(v.second_insulation_material === 'other' && v.second_insulation_lambda != null
        ? { conductivity: v.second_insulation_lambda }
        : {}),
      ...(v.second_insulation_material === 'other'
        ? formTemperatureRange(v.second_insulation_temperature_min, v.second_insulation_temperature_max)
        : {}),
    });
  }
  if (count >= 3 && v.third_insulation_thickness_mm != null && v.third_insulation_material) {
    layers.push({
      thickness: mmToMOrNull(v.third_insulation_thickness_mm),
      material: v.third_insulation_material,
      ...(v.third_insulation_material === 'other' && v.third_insulation_lambda != null
        ? { conductivity: v.third_insulation_lambda }
        : {}),
      ...(v.third_insulation_material === 'other'
        ? formTemperatureRange(v.third_insulation_temperature_min, v.third_insulation_temperature_max)
        : {}),
    });
  }

  params.insulation_layers = layers;
}

// ---------------------------------------------------------------------------

// API → form mappers live in objectWizardApiToFormMappers; re-export for stable paths.
export {
  pipeApiParamsToForm,
  tankApiParamsToForm,
} from '@/utils/objectWizardApiToFormMappers';
