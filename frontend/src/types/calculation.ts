import type {
  ObjectQueryCapabilities,
  ObjectQueryFilter,
  ObjectQuerySearch,
  ObjectQuerySort,
  ProjectObject,
  ProjectObjectsPageInfo,
} from './project';

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
  location_factor?: number | null;
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
  location_factor?: number | null;
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
  cable_type_source?: 'auto' | 'manual' | 'bulk' | string | null;
  cable_mark: string | null;
  cable_mark_source?: 'auto' | 'manual' | string | null;
  cable_snapshot?: Record<string, unknown> | null;
  cable_snapshot_status?: {
    technical_status?: 'current' | 'changed' | 'missing' | 'unknown' | string;
    commercial_status?: 'current' | 'changed' | 'missing' | 'unknown' | string;
    severity?: 'ok' | 'warning' | 'critical' | string;
    changed_fields?: string[];
    message?: string;
  } | null;
  variant_number: number;
  params?: Record<string, unknown> | null;
  results: Record<string, unknown> | null;
  created_at?: string;
  updated_at?: string;
}

export type ElectricalCandidateMode = 'auto' | 'manual';
export type ElectricalCandidateStatus =
  | 'applicable'
  | 'error'
  | 'not_applicable'
  | 'excluded'
  | 'stale';

export interface ElectricalCandidate {
  id: string;
  project_id: string;
  object_id: string;
  variant_number: number;
  cable_type: string;
  cable_source: string;
  cable_mark: string | null;
  mode: ElectricalCandidateMode | string;
  status: ElectricalCandidateStatus | string;
  priority: number;
  is_recommended: boolean;
  is_pinned: boolean;
  is_applied: boolean;
  reason_code?: string | null;
  reason_message?: string | null;
  engineer_comment?: string | null;
  params: Record<string, unknown>;
  results: Record<string, unknown> | null;
  cable_snapshot?: Record<string, unknown> | null;
  warnings: unknown[];
  risk_flags: unknown[];
  candidate_meta: Record<string, unknown>;
  created_at: string;
  updated_at: string;
}

export interface ElectricalCandidateCreateRequest {
  project_id: string;
  object_id: string;
  variant_number: number;
  cable_type: ElectricalRequest['cable_type'];
  cable_source?: 'builtin' | 'commercial' | 'extended' | 'all';
  mode: ElectricalCandidateMode;
  cable_mark?: string | null;
  electrical_params?: Record<string, unknown>;
}

export interface ElectricalCandidateApplyResponse {
  candidate: ElectricalCandidate;
  calculation: ElectricalCalcSummary;
}

export interface ElectricalPageSummary {
  total_objects: number;
  valid_objects: number;
  invalid_objects: number;
  electrical_calculations_total: number;
  calculated_count: number;
  failed_count: number;
  manual_cable_mark_count?: number;
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

export interface ElectricalQueryRequest {
  project_id: string;
  variant_number?: number;
  cable_source?: 'builtin' | 'commercial' | 'extended' | 'all';
  page?: number;
  page_size?: number;
  after_sort_order?: number | null;
  after_id?: string | null;
  after_key?: string | null;
  after_value?: unknown;
  after_value_is_null?: boolean;
  search?: ObjectQuerySearch | null;
  filters?: ObjectQueryFilter[];
  sort?: ObjectQuerySort | null;
}

export interface ElectricalQueryCounts {
  total: number;
  filtered: number;
}

export interface ElectricalQueryResponse extends ElectricalPageResponse {
  counts: ElectricalQueryCounts;
  query: {
    variant_number: number;
    sort: ObjectQuerySort | null;
  };
}

export type ElectricalQueryCapabilities = Omit<ObjectQueryCapabilities, 'object_type'>;

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
  scope?: 'all' | 'selected';
  heat_loss_failed: number;
  errors: Array<{
    object_id: string;
    error_code?: string;
    category?: 'validation' | 'formula' | 'unsupported' | 'external' | 'stale' | string;
    message?: string;
    field?: string | null;
    hint?: string | null;
    suggested_actions?: string[];
    error_context?: Record<string, unknown>;
  }>;
  results: ElectricalCalcSummary[];
}

export interface BatchHeatLossResponse {
  updated: number;
  failed: number;
  errors: Array<{ object_id: string; error: unknown }>;
}

export interface ReportExportTaskResult {
  project_id: string;
  format: 'pdf' | 'docx' | 'xlsx';
  variant_number: number;
  filename: string;
  media_type: string;
  size_bytes: number;
  download_url: string;
}

export interface CalculationTaskResponse {
  id: string;
  type: string;
  status: CalculationTaskStatus;
  project_id: string | null;
  progress: CalculationTaskProgress;
  result: BatchElectricalResponse | BatchHeatLossResponse | ReportExportTaskResult | null;
  error_message: string | null;
  cancel_requested: boolean;
  created_at: string;
  started_at: string | null;
  finished_at: string | null;
  links: CalculationTaskLinks;
}
