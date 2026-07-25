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
type SafetyFactorSource = 'default' | 'manual' | 'climate_policy';
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
    insulation_thickness: mmToMOrNull(v.insulation_thickness_mm),
    insulation_material: v.insulation_material ?? null,
    ambient_temperature: numberOrNull(v.ambient_temperature),
    process_temperature: numberOrNull(v.process_temperature),
    pipe_length: numberOrNull(v.pipe_length),
  };
  applyCommonObjectParams(params, v);
  if (v.pipe_material === 'other' || v.pipe_lambda_mode === 'manual') {
    params.pipe_lambda = numberOrNull(v.pipe_lambda);
  } else {
    params.pipe_material = v.pipe_material ?? null;
  }
  if (hasExplicitNumberValue(v.num_local_elements)) {
    params.num_local_elements = numberOrZero(v.num_local_elements);
    if (hasExplicitNumberValue(v.local_element_equiv_length)) {
      params.local_element_equiv_length = numberOrNull(v.local_element_equiv_length);
    }
  } else {
    const hasExplicitLocalCounts = [
    v.valve_count,
    v.flange_count,
    v.support_count,
    ].some(hasExplicitNumberValue);
    if (hasExplicitLocalCounts) {
      const valveCount = numberOrZero(v.valve_count);
      const flangeCount = numberOrZero(v.flange_count);
      const supportCount = numberOrZero(v.support_count);
      const localCount = valveCount + flangeCount + supportCount;
      params.valve_count = valveCount;
      params.flange_count = flangeCount;
      params.support_count = supportCount;
      if (localCount > 0) params.num_local_elements = localCount;
      if (localCount > 0 || hasExplicitNumberValue(v.local_element_equiv_length)) {
        params.local_element_equiv_length = numberOrNull(v.local_element_equiv_length);
      }
    } else if (hasExplicitNumberValue(v.local_element_equiv_length)) {
      params.local_element_equiv_length = numberOrNull(v.local_element_equiv_length);
    }
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
    insulation_thickness: mmToMOrNull(v.insulation_thickness_mm),
    insulation_material: v.insulation_material ?? null,
    ambient_temperature: numberOrNull(v.ambient_temperature),
    process_temperature: numberOrNull(v.process_temperature),
  };
  applyCommonObjectParams(params, v);
  applyInsulationLayers(params, v);
  if (hasExplicitNumberValue(v.diameter_mm)) params.diameter = mmToMOrNull(v.diameter_mm);
  if (hasExplicitNumberValue(v.height_mm)) params.height = mmToMOrNull(v.height_mm);
  if (hasExplicitNumberValue(v.length_mm)) params.length = mmToMOrNull(v.length_mm);
  if (hasExplicitNumberValue(v.width_mm)) params.width = mmToMOrNull(v.width_mm);
  if (hasExplicitNumberValue(v.wall_thickness_mm)) params.wall_thickness = mmToMOrNull(v.wall_thickness_mm);
  if (hasExplicitNumberValue(v.wall_lambda)) params.wall_lambda = numberOrNull(v.wall_lambda);
  if (hasExplicitNumberValue(v.q_additional)) params.q_additional = numberOrNull(v.q_additional);
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

function apiTemperatureRange(layer: Record<string, unknown> | undefined) {
  const range = layer?.temperature_range;
  if (!Array.isArray(range) || range.length < 2) return {};
  const min = Number(range[0]);
  const max = Number(range[1]);
  return {
    temperature_min: Number.isFinite(min) ? min : undefined,
    temperature_max: Number.isFinite(max) ? max : undefined,
  };
}

function applyCommonObjectParams(params: Record<string, unknown>, v: PipeFormValues | TankFormValues) {
  const placement = v.placement ?? null;
  params.placement = placement;
  if (placement === 'indoor' || placement === 'outdoor' || placement === 'underground') {
    params.location = placement === 'indoor' ? 'indoor' : 'outdoor';
  }
  if (placement === 'underground' && v.burial_depth != null) {
    params.burial_depth = v.burial_depth;
  }
  if (placement === 'underground' && v.ground_type) params.ground_type = v.ground_type;
  if (placement === 'underground' && v.ground_conductivity != null) {
    params.ground_conductivity = v.ground_conductivity;
  }
  if (v.wind_speed != null) params.wind_speed = v.wind_speed;
  if (v.alpha_vnesh != null) params.alpha_vnesh = v.alpha_vnesh;
  const hasClimateKeyField = Object.prototype.hasOwnProperty.call(v, 'climate_key');
  if (v.climate_key) {
    params.climate_key = v.climate_key;
  } else if (v.climate_region && v.climate_city) {
    params.climate_key = `${v.climate_region}|||${v.climate_city}`;
  } else if (hasClimateKeyField) {
    params.climate_key = null;
    params.climate_city = null;
    params.climate_region = null;
    params.climate_temperature_basis = null;
  }
  if (v.climate_city) params.climate_city = v.climate_city;
  if (v.climate_region) params.climate_region = v.climate_region;
  if (v.climate_temperature_basis) {
    params.climate_temperature_basis = v.climate_temperature_basis;
  }
  const insulationTemperatureBasis = insulationTemperatureBasisOrDefault(
    v.insulation_temperature_basis,
    placement,
  );
  if (insulationTemperatureBasis) {
    params.insulation_temperature_basis = insulationTemperatureBasis;
  }
  if (v.ambient_temperature_source) {
    params.ambient_temperature_source = v.ambient_temperature_source;
  }
  if (v.wind_speed_source) params.wind_speed_source = v.wind_speed_source;
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

function applyInsulationLayers(params: Record<string, unknown>, v: LayeredFormValues) {
  const count = Number(v.insulation_layer_count ?? '1');
  params.insulation_layer_count = String(Math.min(Math.max(count || 1, 1), 3));

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
// Conversion: API params (metres) → form values (mm) for edit mode
// ---------------------------------------------------------------------------

export function pipeApiParamsToForm(p: Record<string, unknown>): Partial<PipeFormValues & { name: string }> {
  const layers = Array.isArray(p.insulation_layers)
    ? (p.insulation_layers as Record<string, unknown>[])
    : [];
  const firstRange = apiTemperatureRange(layers[0]);
  const secondRange = apiTemperatureRange(layers[1]);
  const thirdRange = apiTemperatureRange(layers[2]);
  const placement =
    (p.placement as PipeFormValues['placement']) ??
    (p.burial_depth != null ? 'underground' : p.location as PipeFormValues['placement']);
  return {
    outer_diameter_mm: p.outer_diameter != null ? Number(p.outer_diameter) * 1000 : undefined,
    wall_thickness_mm: p.wall_thickness != null ? Number(p.wall_thickness) * 1000 : undefined,
    pipe_material: p.pipe_lambda != null ? 'other' : p.pipe_material as string | undefined,
    pipe_lambda: p.pipe_lambda as number | undefined,
    pipe_lambda_mode: p.pipe_lambda != null ? 'manual' : 'reference',
    insulation_thickness_mm:
      layers[0]?.thickness != null
        ? Number(layers[0].thickness) * 1000
        : p.insulation_thickness != null ? Number(p.insulation_thickness) * 1000 : undefined,
    insulation_material:
      (layers[0]?.material as string | undefined) ?? (p.insulation_material as string | undefined),
    first_insulation_lambda: layers[0]?.conductivity as number | undefined,
    first_insulation_temperature_min: firstRange.temperature_min,
    first_insulation_temperature_max: firstRange.temperature_max,
    insulation_cover_material: p.insulation_cover_material as string | undefined,
    insulation_layer_count:
      p.insulation_layer_count != null
        ? String(p.insulation_layer_count) as PipeFormValues['insulation_layer_count']
        : layers.length > 0 ? String(Math.min(layers.length, 3)) as PipeFormValues['insulation_layer_count'] : '1',
    second_insulation_thickness_mm:
      layers[1]?.thickness != null ? Number(layers[1].thickness) * 1000 : undefined,
    second_insulation_material: layers[1]?.material as string | undefined,
    second_insulation_lambda: layers[1]?.conductivity as number | undefined,
    second_insulation_temperature_min: secondRange.temperature_min,
    second_insulation_temperature_max: secondRange.temperature_max,
    third_insulation_thickness_mm:
      layers[2]?.thickness != null ? Number(layers[2].thickness) * 1000 : undefined,
    third_insulation_material: layers[2]?.material as string | undefined,
    third_insulation_lambda: layers[2]?.conductivity as number | undefined,
    third_insulation_temperature_min: thirdRange.temperature_min,
    third_insulation_temperature_max: thirdRange.temperature_max,
    ambient_temperature: p.ambient_temperature as number | undefined,
    process_temperature: p.process_temperature as number | undefined,
    max_ambient_temperature: p.max_ambient_temperature as number | undefined,
    max_process_temperature: p.max_process_temperature as number | undefined,
    environment: p.environment as PipeFormValues['environment'],
    zone_classification: p.zone_classification as PipeFormValues['zone_classification'],
    temperature_group: p.temperature_group as PipeFormValues['temperature_group'],
    placement,
    burial_depth: p.burial_depth as number | undefined,
    ground_type: p.ground_type as string | undefined,
    ground_conductivity: p.ground_conductivity as number | undefined,
    wind_speed: p.wind_speed as number | undefined,
    alpha_vnesh: p.alpha_vnesh as number | undefined,
    climate_city: p.climate_city as string | undefined,
    climate_region: p.climate_region as string | undefined,
    climate_key:
      (p.climate_key as string | undefined) ??
      (p.climate_region != null && p.climate_city != null
        ? `${String(p.climate_region)}|||${String(p.climate_city)}`
        : undefined),
    climate_temperature_basis:
      p.climate_temperature_basis as PipeFormValues['climate_temperature_basis'],
    insulation_temperature_basis: insulationTemperatureBasisOrDefault(
      p.insulation_temperature_basis,
      placement,
    ),
    ambient_temperature_source:
      p.ambient_temperature_source as PipeFormValues['ambient_temperature_source'],
    wind_speed_source: p.wind_speed_source as PipeFormValues['wind_speed_source'],
    pipe_length: p.pipe_length as number | undefined,
    min_switch_temperature: p.min_switch_temperature as number | undefined,
    supply_voltage: p.supply_voltage as number | undefined,
    safety_factor: p.safety_factor as number | undefined,
    safety_factor_source: p.safety_factor_source as SafetyFactorSource | undefined,
    steam_tracing: p.steam_tracing as PipeFormValues['steam_tracing'],
    vapor_temperature: p.vapor_temperature as number | undefined,
    winding_coefficient: p.winding_coefficient as number | undefined,
    connection_type: p.connection_type as string | undefined,
    valve_count: p.valve_count as number | undefined,
    flange_count: p.flange_count as number | undefined,
    support_count: p.support_count as number | undefined,
    num_local_elements: p.num_local_elements != null
      ? Number(p.num_local_elements)
      : [p.valve_count, p.flange_count, p.support_count].some((value) => value != null)
        ? [p.valve_count, p.flange_count, p.support_count].reduce<number>(
            (sum, value) => sum + (Number(value) || 0),
            0,
          )
        : undefined,
    local_element_equiv_length: p.local_element_equiv_length as number | undefined,
    name: p.name as string | undefined,
  };
}

export function tankApiParamsToForm(p: Record<string, unknown>): Partial<TankFormValues & { name: string }> {
  const layers = Array.isArray(p.insulation_layers)
    ? (p.insulation_layers as Record<string, unknown>[])
    : [];
  const firstRange = apiTemperatureRange(layers[0]);
  const secondRange = apiTemperatureRange(layers[1]);
  const thirdRange = apiTemperatureRange(layers[2]);
  const placement =
    (p.placement as TankFormValues['placement']) ??
    (p.burial_depth != null ? 'underground' : p.location as TankFormValues['placement']);
  return {
    shape: (p.shape as TankFormValues['shape']) ?? 'cylindrical',
    diameter_mm: p.diameter != null ? Number(p.diameter) * 1000 : undefined,
    height_mm: p.height != null ? Number(p.height) * 1000 : undefined,
    length_mm: p.length != null ? Number(p.length) * 1000 : undefined,
    width_mm: p.width != null ? Number(p.width) * 1000 : undefined,
    wall_thickness_mm: p.wall_thickness != null ? Number(p.wall_thickness) * 1000 : undefined,
    wall_lambda: p.wall_lambda as number | undefined,
    insulation_thickness_mm:
      layers[0]?.thickness != null
        ? Number(layers[0].thickness) * 1000
        : p.insulation_thickness != null ? Number(p.insulation_thickness) * 1000 : undefined,
    insulation_material:
      (layers[0]?.material as string | undefined) ?? (p.insulation_material as string | undefined),
    first_insulation_lambda: layers[0]?.conductivity as number | undefined,
    first_insulation_temperature_min: firstRange.temperature_min,
    first_insulation_temperature_max: firstRange.temperature_max,
    insulation_cover_material: p.insulation_cover_material as string | undefined,
    insulation_layer_count:
      p.insulation_layer_count != null
        ? String(p.insulation_layer_count) as TankFormValues['insulation_layer_count']
        : layers.length > 0 ? String(Math.min(layers.length, 3)) as TankFormValues['insulation_layer_count'] : '1',
    second_insulation_thickness_mm:
      layers[1]?.thickness != null ? Number(layers[1].thickness) * 1000 : undefined,
    second_insulation_material: layers[1]?.material as string | undefined,
    second_insulation_lambda: layers[1]?.conductivity as number | undefined,
    second_insulation_temperature_min: secondRange.temperature_min,
    second_insulation_temperature_max: secondRange.temperature_max,
    third_insulation_thickness_mm:
      layers[2]?.thickness != null ? Number(layers[2].thickness) * 1000 : undefined,
    third_insulation_material: layers[2]?.material as string | undefined,
    third_insulation_lambda: layers[2]?.conductivity as number | undefined,
    third_insulation_temperature_min: thirdRange.temperature_min,
    third_insulation_temperature_max: thirdRange.temperature_max,
    ambient_temperature: p.ambient_temperature as number | undefined,
    process_temperature: p.process_temperature as number | undefined,
    max_ambient_temperature: p.max_ambient_temperature as number | undefined,
    max_process_temperature: p.max_process_temperature as number | undefined,
    environment: p.environment as TankFormValues['environment'],
    zone_classification: p.zone_classification as TankFormValues['zone_classification'],
    temperature_group: p.temperature_group as TankFormValues['temperature_group'],
    placement,
    burial_depth: p.burial_depth as number | undefined,
    ground_type: p.ground_type as string | undefined,
    ground_conductivity: p.ground_conductivity as number | undefined,
    wind_speed: p.wind_speed as number | undefined,
    alpha_vnesh: p.alpha_vnesh as number | undefined,
    climate_city: p.climate_city as string | undefined,
    climate_region: p.climate_region as string | undefined,
    climate_key:
      (p.climate_key as string | undefined) ??
      (p.climate_region != null && p.climate_city != null
        ? `${String(p.climate_region)}|||${String(p.climate_city)}`
        : undefined),
    climate_temperature_basis:
      p.climate_temperature_basis as TankFormValues['climate_temperature_basis'],
    insulation_temperature_basis: insulationTemperatureBasisOrDefault(
      p.insulation_temperature_basis,
      placement,
    ),
    ambient_temperature_source:
      p.ambient_temperature_source as TankFormValues['ambient_temperature_source'],
    wind_speed_source: p.wind_speed_source as TankFormValues['wind_speed_source'],
    min_switch_temperature: p.min_switch_temperature as number | undefined,
    supply_voltage: p.supply_voltage as number | undefined,
    safety_factor: p.safety_factor as number | undefined,
    safety_factor_source: p.safety_factor_source as SafetyFactorSource | undefined,
    steam_tracing: p.steam_tracing as TankFormValues['steam_tracing'],
    vapor_temperature: p.vapor_temperature as number | undefined,
    winding_coefficient: p.winding_coefficient as number | undefined,
    connection_type: p.connection_type as string | undefined,
    q_additional: p.q_additional as number | undefined,
    name: p.name as string | undefined,
  };
}
