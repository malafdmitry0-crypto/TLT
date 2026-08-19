/** Heat-loss calculation request/response and object param/result shapes. */

export type InsulationTemperatureBasis =
  | 'indoor'
  | 'outdoor_summer'
  | 'outdoor_winter'
  | 'channel'
  | 'tunnel'
  | 'technical_subfloor'
  | 'attic'
  | 'basement';

export interface InsulationLayerParams {
  thickness: number;
  material: string;
  conductivity?: number | null;
  temperature_range?: [number, number] | null;
}

export interface InsulationLayerApplied {
  index: number;
  thickness: number;
  material: string;
  conductivity_applied: number;
  conductivity_source: 'manual' | 'reference_data';
  conductivity_temperature_applied: number;
  resistance: number;
  resistance_unit: 'm*K/W' | 'm2*K/W';
}

export interface HeatResultTrace {
  formula_model: string;
  formula_model_version: string;
  model_assumptions: string[];
  process_temperature_applied?: number | null;
  ambient_temperature_applied?: number | null;
  ground_temperature_applied?: number | null;
  safety_factor_applied: number;
  insulation_layers_applied: InsulationLayerApplied[];
  input_units: Record<string, string>;
  applied_units: Record<string, string>;
  source_corrections: string[];
}

export interface PipeParams {
  outer_diameter: number;
  wall_thickness: number;
  pipe_material?: string | null;
  pipe_lambda?: number | null;
  insulation_cover_material?: string | null;
  insulation_layers: InsulationLayerParams[];
  ambient_temperature?: number | null;
  max_ambient_temperature?: number | null;
  process_temperature: number;
  max_process_temperature?: number | null;
  pipe_length: number;
  placement: 'indoor' | 'outdoor' | 'underground';
  ground_temperature?: number | null;
  pipe_centerline_depth?: number | null;
  ground_type?: string | null;
  ground_conductivity?: number | null;
  wind_speed?: number | null;
  climate_city?: string | null;
  climate_region?: string | null;
  climate_key?: string | null;
  climate_temperature_basis?: 't_0_92' | 't_0_98' | 't_abs_min' | null;
  insulation_temperature_basis?: InsulationTemperatureBasis | null;
  ambient_temperature_source?: 'manual' | 'climate' | null;
  ground_temperature_source?: 'manual' | 'climate' | null;
  wind_speed_source?: 'manual' | 'climate' | null;
  ground_conductivity_source?: 'manual' | 'reference' | null;
  num_local_elements: number;
  local_element_equiv_length?: number | null;
  safety_factor: number;
  safety_factor_source?: 'default' | 'manual' | 'climate_policy' | null;
  climate_policy_rule?: 'pipe_diameter_ge_100' | 'pipe_diameter_lt_100' | null;
  maintain_temperature?: number | null;
  vapor_temperature?: number | null;
}

export interface PipeResult extends HeatResultTrace {
  heat_loss_per_meter_base: number;
  heat_loss_per_meter_design: number;
  total_heat_loss_base: number;
  total_heat_loss_design: number;
  effective_length?: number | null;
  additional_equivalent_length?: number | null;
  thermal_resistance?: number | null;
  wall_resistance?: number | null;
  insulation_resistance?: number | null;
  external_resistance?: number | null;
  alpha_vnesh_applied?: number | null;
  wind_speed_applied?: number | null;
  ground_conductivity_applied?: number | null;
  local_elements_count_applied?: number | null;
  local_element_equiv_length_applied?: number | null;
}

export interface TankParams {
  shape: 'cylindrical' | 'rectangular';
  diameter?: number;
  height?: number;
  length?: number;
  width?: number;
  wall_thickness?: number | null;
  wall_lambda?: number | null;
  insulation_cover_material?: string | null;
  insulation_layers: InsulationLayerParams[];
  ambient_temperature: number;
  max_ambient_temperature?: number | null;
  process_temperature: number;
  max_process_temperature?: number | null;
  placement: 'indoor' | 'outdoor' | 'underground';
  tank_buried_height?: number | null;
  ground_temperature?: number | null;
  ground_temperature_source?: 'manual' | 'climate' | null;
  ground_type?: string | null;
  ground_conductivity?: number | null;
  ground_conductivity_source?: 'manual' | 'reference' | null;
  wind_speed?: number | null;
  climate_city?: string | null;
  climate_region?: string | null;
  climate_key?: string | null;
  climate_temperature_basis?: 't_0_92' | 't_0_98' | 't_abs_min' | null;
  insulation_temperature_basis?: InsulationTemperatureBasis | null;
  ambient_temperature_source?: 'manual' | 'climate' | null;
  wind_speed_source?: 'manual' | 'climate' | null;
  safety_factor: number;
  safety_factor_source?: 'default' | 'manual' | 'climate_policy' | null;
  q_additional: number;
  maintain_temperature?: number | null;
  vapor_temperature?: number | null;
}

export interface TankResult extends HeatResultTrace {
  total_heat_loss_base: number;
  total_heat_loss_design: number;
  heat_loss_per_m2_bare_base: number;
  heat_loss_per_m2_bare_design: number;
  surface_area_bare: number;
  thermal_resistance_areal_bare?: number | null;
  wall_resistance_areal_bare?: number | null;
  insulation_resistance_areal_bare?: number | null;
  external_resistance_areal_bare?: number | null;
  ground_resistance_areal_bare?: number | null;
  air_surface_area?: number | null;
  ground_surface_area?: number | null;
  heat_loss_air_base?: number | null;
  heat_loss_ground_base?: number | null;
  alpha_vnesh_applied?: number | null;
  wind_speed_applied?: number | null;
  ground_conductivity_applied?: number | null;
  q_additional_applied?: number | null;
}

export interface HeatLossRequest {
  project_id: string;
  object_type: 'pipe' | 'tank';
  data: Record<string, unknown>;
}

export interface HeatLossResponse {
  object_type: string;
  result: Record<string, unknown>;
}
