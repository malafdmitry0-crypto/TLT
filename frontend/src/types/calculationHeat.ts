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

export interface PipeParams {
  outer_diameter: number;
  wall_thickness?: number | null;
  pipe_material?: string | null;
  pipe_lambda?: number | null;
  insulation_thickness: number;
  insulation_material: string;
  insulation_cover_material?: string | null;
  insulation_layers?: InsulationLayerParams[];
  ambient_temperature: number;
  process_temperature: number;
  max_ambient_temperature?: number | null;
  max_process_temperature?: number | null;
  pipe_length: number;
  placement?: 'indoor' | 'outdoor' | 'underground';
  burial_depth?: number | null;
  ground_type?: string | null;
  ground_conductivity?: number | null;
  wind_speed?: number | null;
  alpha_vnesh?: number | null;
  climate_city?: string | null;
  climate_region?: string | null;
  climate_key?: string | null;
  climate_temperature_basis?: 't_0_92' | 't_0_98' | 't_abs_min' | null;
  insulation_temperature_basis?: InsulationTemperatureBasis | null;
  ambient_temperature_source?: 'manual' | 'climate' | null;
  wind_speed_source?: 'manual' | 'climate' | null;
  valve_count?: number | null;
  flange_count?: number | null;
  support_count?: number | null;
  num_local_elements?: number | null;
  local_element_equiv_length?: number | null;
  supply_voltage?: number | null;
  safety_factor?: number | null;
  maintain_temperature?: number | null;
  vapor_temperature?: number | null;
  location?: 'indoor' | 'outdoor';
}

export interface PipeResult {
  heat_loss_per_meter: number;
  total_heat_loss: number;
  effective_length?: number | null;
  thermal_resistance?: number | null;
  wall_resistance?: number | null;
  insulation_resistance?: number | null;
  external_resistance?: number | null;
  alpha_vnesh?: number | null;
  wind_speed?: number | null;
  ground_conductivity?: number | null;
  safety_factor?: number | null;
  local_elements_count?: number | null;
  local_element_equiv_length?: number | null;
}

export interface TankParams {
  shape: 'cylindrical' | 'rectangular' | 'spherical';
  diameter?: number;
  height?: number;
  length?: number;
  width?: number;
  wall_thickness?: number | null;
  wall_lambda?: number | null;
  insulation_thickness: number;
  insulation_material: string;
  insulation_cover_material?: string | null;
  insulation_layers?: InsulationLayerParams[];
  ambient_temperature: number;
  process_temperature: number;
  max_ambient_temperature?: number | null;
  max_process_temperature?: number | null;
  placement?: 'indoor' | 'outdoor' | 'underground';
  burial_depth?: number | null;
  ground_type?: string | null;
  ground_conductivity?: number | null;
  wind_speed?: number | null;
  alpha_vnesh?: number | null;
  climate_city?: string | null;
  climate_region?: string | null;
  climate_key?: string | null;
  climate_temperature_basis?: 't_0_92' | 't_0_98' | 't_abs_min' | null;
  insulation_temperature_basis?: InsulationTemperatureBasis | null;
  ambient_temperature_source?: 'manual' | 'climate' | null;
  wind_speed_source?: 'manual' | 'climate' | null;
  supply_voltage?: number | null;
  safety_factor?: number | null;
  maintain_temperature?: number | null;
  vapor_temperature?: number | null;
  location?: 'indoor' | 'outdoor';
}

export interface TankResult {
  heat_loss_per_m2: number;
  total_heat_loss: number;
  surface_area: number;
  wall_resistance?: number | null;
  insulation_resistance?: number | null;
  external_resistance?: number | null;
  ground_resistance?: number | null;
  alpha_vnesh?: number | null;
  wind_speed?: number | null;
  ground_conductivity?: number | null;
  safety_factor?: number | null;
  air_surface_area?: number | null;
  ground_surface_area?: number | null;
  heat_loss_air_per_m2?: number | null;
  heat_loss_ground_per_m2?: number | null;
  q_additional?: number | null;
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
