/**
 * API params (metres) → form values (mm) for object wizard edit mode.
 * form→API remains in objectWizardFormMappers; both re-exported via objectWizardUtils.
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
