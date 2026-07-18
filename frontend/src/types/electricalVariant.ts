export type ElectricalSystemType =
  | 'self_regulating'
  | 'resistive'
  | 'skin'
  | 'mineral';

export type ElectricalAssignmentState =
  | 'unassigned'
  | 'ready'
  | 'unsupported'
  | 'stale'
  | 'error';

export type ElectricalSpecificationState = 'not_generated' | 'generated' | 'stale';

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
