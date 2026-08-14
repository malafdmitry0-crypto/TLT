/** Electrical calculation, candidate, page/query type shapes. */
import type {
  ObjectQueryCapabilities,
  ObjectQueryFilter,
  ObjectQuerySearch,
  ObjectQuerySort,
  ProjectObject,
  ProjectObjectsPageInfo,
} from './project';
import type {
  ElectricalAssignmentState,
  ElectricalSystemType,
} from './electricalVariant';
import type { ElectricalCalcSummary } from './calculationElectricalSummary';

export type { ElectricalCalcSummary } from './calculationElectricalSummary';

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
  electrical_variant_id?: string;
  /** Optimistic concurrency for ER assignment (E8 / B6). */
  expected_assignment_version?: number | null;
  data: Record<string, unknown>;
}

export interface ElectricalResponse {
  object_id: string;
  cable_type: string;
  result: Record<string, unknown>;
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
  electrical_variant_id?: string | null;
  cable_type: string;
  cable_source: string;
  cable_mark: string | null;
  dedupe_key: string;
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
  electrical_variant_id?: string;
  cable_type: ElectricalRequest['cable_type'];
  cable_source?: 'builtin' | 'commercial' | 'extended' | 'all';
  mode: ElectricalCandidateMode;
  cable_mark?: string | null;
  electrical_params?: Record<string, unknown>;
}

export interface ElectricalCandidateUpsertResponse {
  candidate: ElectricalCandidate;
  action: 'created' | 'updated';
}

export interface ElectricalCandidateApplyResponse {
  candidate: ElectricalCandidate;
  calculation: ElectricalCalcSummary;
}

export interface ElectricalCandidateFolder {
  id: string;
  project_id: string;
  object_id: string;
  variant_number: number;
  electrical_variant_id?: string | null;
  name: string;
  color?: string | null;
  sort_order: number;
  candidate_ids: string[];
  created_at: string;
  updated_at: string;
}

export interface ElectricalCandidateFolderCreateRequest {
  project_id: string;
  object_id: string;
  variant_number: number;
  electrical_variant_id?: string;
  name: string;
  color?: string | null;
}

export interface ElectricalCandidateFolderUpdateRequest {
  name?: string | null;
  color?: string | null;
  sort_order?: number | null;
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
  total_sections?: number;
  total_start_current_a?: number;
  system_summaries?: ElectricalPageSystemSummaries;
}

export interface ElectricalPageSystemSummaryBucket {
  object_count: number;
  cable_length_m: number;
  section_count: number;
  power_w: number;
  start_current_a: number;
  working_current_a: number;
}

export interface ElectricalPageSystemSummaries {
  self_regulating: ElectricalPageSystemSummaryBucket;
  resistive: ElectricalPageSystemSummaryBucket;
  skin: ElectricalPageSystemSummaryBucket;
  total: ElectricalPageSystemSummaryBucket;
}

export interface ElectricalPageResponse {
  items: ProjectObject[];
  calculations: ElectricalCalcSummary[];
  summary: ElectricalPageSummary;
  page_info: ProjectObjectsPageInfo;
}

export interface ElectricalQueryRequest {
  project_id: string;
  variant_number?: number | null;
  electrical_variant_id?: string;
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

export interface ElectricalQueryAssignment {
  object_id: string;
  // Optional only for defensive compatibility; the current API returns explicit null.
  system_type?: ElectricalSystemType | null;
  assignment_state: ElectricalAssignmentState;
  version: number;
  electrical_overrides?: {
    supply_voltage_v?: number | string | null;
    [key: string]: unknown;
  };
}

export interface ElectricalQueryResponse extends ElectricalPageResponse {
  assignments?: ElectricalQueryAssignment[];
  counts: ElectricalQueryCounts;
  query: {
    electrical_variant_id: string | null;
    variant_number: number | null;
    sort: ObjectQuerySort | null;
  };
}

export type ElectricalQueryCapabilities = Omit<ObjectQueryCapabilities, 'object_type'>;
