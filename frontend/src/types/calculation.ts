export interface PipeParams {
  outer_diameter: number;
  insulation_thickness: number;
  insulation_material: string;
  ambient_temperature: number;
  process_temperature: number;
  pipe_length: number;
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
  ambient_temperature: number;
  process_temperature: number;
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
  object_id: string;
  cable_type: string;
  cable_mark: string | null;
  variant_number: number;
  results: Record<string, unknown> | null;
}
