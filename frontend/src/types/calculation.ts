import type { ProjectObject, ProjectObjectsPageInfo } from './project';

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
  climate_temperature_basis?: 't_0_92' | 't_0_98' | 't_abs_min' | null;
  ambient_temperature_source?: 'manual' | 'climate' | null;
  wind_speed_source?: 'manual' | 'climate' | null;
  valve_count?: number | null;
  flange_count?: number | null;
  support_count?: number | null;
  local_element_equiv_length?: number | null;
  supply_voltage?: number | null;
  safety_factor?: number | null;
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
  surface_temperature?: number | null;
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
  climate_temperature_basis?: 't_0_92' | 't_0_98' | 't_abs_min' | null;
  ambient_temperature_source?: 'manual' | 'climate' | null;
  wind_speed_source?: 'manual' | 'climate' | null;
  supply_voltage?: number | null;
  safety_factor?: number | null;
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

export interface ElectricalRequest {
  object_id: string;
  cable_type:
    | 'self_regulating'
    | 'self_regulating_tt'
    | 'single_core'
    | 'three_core'
    | 'mineral'
    | 'skin';
  variant_number?: number;
  data: Record<string, unknown>;
}

export interface ElectricalResponse {
  object_id: string;
  cable_type: string;
  result: Record<string, unknown>;
}

export interface ElectricalCalcSummary {
  id: string;
  project_id?: string;
  object_id: string;
  cable_type: string;
  cable_mark: string | null;
  variant_number: number;
  params?: Record<string, unknown> | null;
  results: Record<string, unknown> | null;
  created_at?: string;
  updated_at?: string;
}

export interface ElectricalPageSummary {
  total_objects: number;
  valid_objects: number;
  invalid_objects: number;
  electrical_calculations_total: number;
  calculated_count: number;
  failed_count: number;
  total_cable_length: number;
  total_power: number;
  total_current: number;
}

export interface ElectricalPageResponse {
  items: ProjectObject[];
  calculations: ElectricalCalcSummary[];
  summary: ElectricalPageSummary;
  page_info: ProjectObjectsPageInfo;
}

export type CalculationTaskStatus =
  | 'queued'
  | 'enqueued'
  | 'running'
  | 'succeeded'
  | 'failed'
  | 'cancelled';

export interface CalculationTaskProgress {
  current: number;
  total: number | null;
  phase: string | null;
  percent: number | null;
}

export interface CalculationTaskLinks {
  status: string;
  result: string;
  cancel: string;
}

export interface BatchElectricalResponse {
  calculated: number;
  skipped: number;
  heat_loss_failed: number;
  errors: Array<{ object_id: string; error: string }>;
  results: ElectricalCalcSummary[];
}

export interface BatchHeatLossResponse {
  updated: number;
  failed: number;
  errors: Array<{ object_id: string; error: unknown }>;
}

export interface CalculationTaskResponse {
  id: string;
  type: string;
  status: CalculationTaskStatus;
  project_id: string | null;
  progress: CalculationTaskProgress;
  result: BatchElectricalResponse | BatchHeatLossResponse | null;
  error_message: string | null;
  cancel_requested: boolean;
  created_at: string;
  started_at: string | null;
  finished_at: string | null;
  links: CalculationTaskLinks;
}
