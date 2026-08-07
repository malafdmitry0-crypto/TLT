import type {
  SpecificationDiagnostic,
  SpecificationGenerateResult,
  SpecificationOptions,
} from '@/api/specifications';
import apiClient, { withIdempotencyKey } from '@/api/client';

export type CalculationWorkflowStatus =
  | 'queued'
  | 'enqueued'
  | 'running'
  | 'waiting_input'
  | 'succeeded'
  | 'failed'
  | 'cancelled'
  | 'timed_out';

export interface CalculationWorkflowProgress {
  current: number;
  total: number | null;
  percent: number | null;
}

export interface CalculationWorkflowWaitingResult {
  electrical_variant_id: string;
  electrical_variant_name?: string | null;
  status: 'ready' | 'blocked' | 'confirmation_required' | 'selection_required';
  total_objects: number;
  contributing_objects: number;
  unassigned_object_ids: string[];
  excluded_unassigned_object_ids: string[];
  diagnostics: SpecificationDiagnostic[];
  candidate_groups: import('@/api/specifications').SpecificationCandidateGroup[];
  catalog_selections: Record<string, string>;
  fingerprint_schema?: 'specification-preflight/v1' | null;
  input_fingerprint?: string | null;
}

export interface CalculationWorkflow {
  id: string;
  project_id: string;
  status: CalculationWorkflowStatus;
  stage: string;
  workflow_version: number;
  variant_ids: string[];
  progress: CalculationWorkflowProgress;
  queue_deadline_at: string | null;
  execution_deadline_at: string | null;
  interaction_deadline_at: string | null;
  waiting_results: CalculationWorkflowWaitingResult[];
  result: SpecificationGenerateResult | null;
  error_message: string | null;
  cancel_requested: boolean;
  created_at: string;
  started_at: string | null;
  finished_at: string | null;
  status_url: string;
  cancel_url: string;
  resume_url: string;
  retry_url: string;
}

const WORKFLOW_HTTP_TIMEOUT_MS = 12_000;

export async function getActiveCalculationWorkflow(
  projectId: string,
  signal?: AbortSignal,
): Promise<CalculationWorkflow | null> {
  const { data } = await apiClient.get<CalculationWorkflow | null>(
    `/projects/${projectId}/calculation-workflows/active`,
    { signal, timeout: WORKFLOW_HTTP_TIMEOUT_MS },
  );
  return data;
}

export async function getCalculationWorkflow(
  workflowId: string,
  signal?: AbortSignal,
): Promise<CalculationWorkflow> {
  const { data } = await apiClient.get<CalculationWorkflow>(
    `/calculation-workflows/${workflowId}`,
    { signal, timeout: WORKFLOW_HTTP_TIMEOUT_MS },
  );
  return data;
}

export async function startCalculationWorkflow(
  projectId: string,
  payload: { variant_ids: string[]; options: SpecificationOptions },
): Promise<CalculationWorkflow> {
  const { data } = await apiClient.post<CalculationWorkflow>(
    `/projects/${projectId}/calculation-workflows`,
    payload,
    withIdempotencyKey({ timeout: WORKFLOW_HTTP_TIMEOUT_MS }),
  );
  return data;
}

export async function resumeCalculationWorkflow(
  workflowId: string,
  payload: {
    expected_workflow_version: number;
    exclude_unassigned_confirmed: boolean;
    catalog_selections: Record<string, string>;
  },
): Promise<CalculationWorkflow> {
  const { data } = await apiClient.post<CalculationWorkflow>(
    `/calculation-workflows/${workflowId}/resume`,
    payload,
    withIdempotencyKey({ timeout: WORKFLOW_HTTP_TIMEOUT_MS }),
  );
  return data;
}

export async function cancelCalculationWorkflow(
  workflowId: string,
): Promise<CalculationWorkflow> {
  const { data } = await apiClient.post<CalculationWorkflow>(
    `/calculation-workflows/${workflowId}/cancel`,
    undefined,
    { timeout: WORKFLOW_HTTP_TIMEOUT_MS },
  );
  return data;
}
