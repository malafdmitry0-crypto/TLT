export interface PipeParams {
  outer_diameter: number;
  wall_thickness?: number | null;
  pipe_material?: string | null;
  pipe_lambda?: number | null;
  insulation_thickness: number;
  insulation_material: string;
  insulation_cover_material?: string | null;
  insulation_layers?: Array<{ thickness: number; material: string; conductivity?: number | null }>;
  ambient_temperature: number;
  process_temperature: number;
  max_ambient_temperature?: number | null;
  max_process_temperature?: number | null;
  pipe_length: number;
  placement?: 'indoor' | 'outdoor' | 'underground';
  burial_depth?: number | null;
  ground_type?: 'dry_sand' | 'wet_sand' | 'clay' | 'custom' | null;
  ground_conductivity?: number | null;
  valve_count?: number | null;
  flange_count?: number | null;
  support_count?: number | null;
  supply_voltage?: number | null;
  safety_factor?: number | null;
  location?: 'indoor' | 'outdoor';
}

export interface PipeResult {
  heat_loss_per_meter: number;
  total_heat_loss: number;
  surface_temperature?: number | null;
}

export interface TankParams {
  shape: 'cylindrical' | 'rectangular' | 'spherical';
  diameter?: number;
  height?: number;
  length?: number;
  width?: number;
  insulation_thickness: number;
  insulation_material: string;
  insulation_cover_material?: string | null;
  insulation_layers?: Array<{ thickness: number; material: string; conductivity?: number | null }>;
  ambient_temperature: number;
  process_temperature: number;
  max_ambient_temperature?: number | null;
  max_process_temperature?: number | null;
  placement?: 'indoor' | 'outdoor' | 'underground';
  burial_depth?: number | null;
  ground_type?: 'dry_sand' | 'wet_sand' | 'clay' | 'custom' | null;
  ground_conductivity?: number | null;
  supply_voltage?: number | null;
  safety_factor?: number | null;
  location?: 'indoor' | 'outdoor';
}

export interface TankResult {
  heat_loss_per_m2: number;
  total_heat_loss: number;
  surface_area: number;
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
  cable_type: 'self_regulating' | 'single_core' | 'three_core' | 'mineral' | 'skin';
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
