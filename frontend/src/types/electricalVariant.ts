import type { ProjectObject } from '@/types/project';

export type ElectricalSystemType =
  | 'self_regulating'
  | 'resistive'
  | 'skin'
  | 'mineral';

export type ElectricalSupportedSystemType = Extract<
  ElectricalSystemType,
  'self_regulating' | 'resistive'
>;

export type ElectricalAssignmentState =
  | 'unassigned'
  | 'ready'
  | 'unsupported'
  | 'stale'
  | 'error';

export type ElectricalSpecificationState = 'not_generated' | 'generated' | 'stale';

export type ElectricalAssignmentView =
  | 'all'
  | 'unassigned'
  | ElectricalSystemType;

export type ElectricalAssignmentSystemCounts = Record<
  'unassigned' | ElectricalSystemType,
  number
>;

export type ElectricalAssignmentStateCounts = Record<ElectricalAssignmentState, number>;

export interface ElectricalReadinessIssue {
  code: string;
  message: string;
  object_id: string | null;
  details: Record<string, unknown>;
}

export interface ElectricalReadinessResponse {
  project_id: string;
  ready: boolean;
  total_objects: number;
  ready_objects: number;
  issues: ElectricalReadinessIssue[];
}

export interface ElectricalVariantCreateRequest {
  name?: string | null;
}

export interface ElectricalVariantCopyRequest {
  name?: string | null;
}

export interface ElectricalVariantRenameRequest {
  name: string;
}

export interface ElectricalVariant {
  id: string;
  project_id: string;
  name: string;
  sort_order: number;
  is_active: boolean;
  copied_from_id: string | null;
  legacy_variant_number: number | null;
  specification_state: ElectricalSpecificationState;
  created_at: string;
  updated_at: string;
}

// Backend schema name retained as an explicit alias for contract-oriented callers.
export type ElectricalVariantResponse = ElectricalVariant;

export interface ElectricalVariantInitializeResponse {
  project_id: string;
  created: boolean;
  assignments_created: number;
  variant: ElectricalVariant;
}

export interface ElectricalVariantDeleteResponse {
  project_id: string;
  deleted_variant_id: string;
  active_variant_id: string;
}

export interface ElectricalVariantErrorResponse {
  code: string;
  message: string;
  issues: ElectricalReadinessIssue[];
}

export interface ElectricalAssignmentOverrides {
  supply_voltage_v?: number | null;
  winding_pitch_mm?: number | null;
  thread_count?: number | null;
  manual_cable_model?: string | null;
  tank_heating_height_m?: number | null;
  tank_laying_step_m?: number | null;
  [key: string]: unknown;
}

export interface ElectricalAssignmentOverridesPatchRequest {
  expected_version: number;
  supply_voltage_v?: number | null;
  winding_pitch_mm?: number | null;
  thread_count?: number | null;
  manual_cable_model?: string | null;
  tank_heating_height_m?: number | null;
  tank_laying_step_m?: number | null;
}

export interface ElectricalAssignment {
  id: string;
  project_id: string;
  electrical_variant_id: string;
  object_id: string;
  system_type: ElectricalSystemType | null;
  assignment_state: ElectricalAssignmentState;
  requested_cable_type: string | null;
  max_section_start_current_a: number | null;
  electrical_overrides: ElectricalAssignmentOverrides;
  object_version_snapshot: number;
  version: number;
  diagnostics: Record<string, unknown>;
  object: ProjectObject;
  created_at: string;
  updated_at: string;
}

export interface ElectricalAssignmentCounts {
  total: number;
  filtered: number;
  by_system: ElectricalAssignmentSystemCounts;
  by_state: ElectricalAssignmentStateCounts;
}

export interface ElectricalAssignmentPageInfo {
  page: number;
  page_size: number;
  offset: number;
  total_pages: number;
  has_next_page: boolean;
  has_previous_page: boolean;
}

export interface ElectricalAssignmentListParams {
  view?: ElectricalAssignmentView;
  assignment_state?: ElectricalAssignmentState;
  page?: number;
  page_size?: number;
}

export interface ElectricalAssignmentListResponse {
  project_id: string;
  electrical_variant_id: string;
  items: ElectricalAssignment[];
  counts: ElectricalAssignmentCounts;
  page_info: ElectricalAssignmentPageInfo;
}

export interface ElectricalAssignmentVersionItem {
  object_id: string;
  expected_version: number;
}

export interface ElectricalAssignmentUpdateRequest {
  system_type: ElectricalSupportedSystemType;
  items: ElectricalAssignmentVersionItem[];
}

export interface ElectricalAssignmentUnassignRequest {
  confirm: true;
  items: ElectricalAssignmentVersionItem[];
}

export interface ElectricalAssignmentMutationResponse {
  project_id: string;
  electrical_variant_id: string;
  changed_count: number;
  assignments: ElectricalAssignment[];
  cleanup: Record<string, number>;
  specification_state: ElectricalSpecificationState;
}
