import apiClient, { withIdempotencyKey } from '@/api/client';

export type ElectricalVariantSetTaskStatus =
  | 'queued'
  | 'enqueued'
  | 'running'
  | 'succeeded'
  | 'failed'
  | 'cancelled'
  | 'timed_out';

export interface ElectricalVariantSetTask {
  id: string;
  project_id: string;
  status: ElectricalVariantSetTaskStatus;
  stage: string;
  task_version: number;
  electrical_variant_ids: string[];
  progress: { current: number; total: number | null; percent: number | null };
  queue_deadline_at: string | null;
  execution_deadline_at: string | null;
  result: {
    requested_electrical_variant_ids: string[];
    completed_electrical_variant_ids: string[];
    failed_electrical_variant_ids: string[];
    per_variant: Record<string, Record<string, unknown>>;
  };
  error_message: string | null;
  cancel_requested: boolean;
  created_at: string;
  started_at: string | null;
  finished_at: string | null;
  status_url: string;
  cancel_url: string;
  retry_url: string;
}

const TASK_HTTP_TIMEOUT_MS = 12_000;

export async function getActiveElectricalVariantSetTask(
  projectId: string,
  signal?: AbortSignal,
): Promise<ElectricalVariantSetTask | null> {
  const { data } = await apiClient.get<ElectricalVariantSetTask | null>(
    `/projects/${projectId}/electrical-variant-set-tasks/active`,
    { signal, timeout: TASK_HTTP_TIMEOUT_MS },
  );
  return data;
}

export async function getElectricalVariantSetTask(
  taskId: string,
  signal?: AbortSignal,
): Promise<ElectricalVariantSetTask> {
  const { data } = await apiClient.get<ElectricalVariantSetTask>(
    `/electrical-variant-set-tasks/${taskId}`,
    { signal, timeout: TASK_HTTP_TIMEOUT_MS },
  );
  return data;
}

export async function startElectricalVariantSetTask(
  projectId: string,
  electricalVariantIds: readonly string[],
): Promise<ElectricalVariantSetTask> {
  const { data } = await apiClient.post<ElectricalVariantSetTask>(
    `/projects/${projectId}/electrical-variant-set-tasks`,
    { electrical_variant_ids: [...electricalVariantIds] },
    withIdempotencyKey({ timeout: TASK_HTTP_TIMEOUT_MS }),
  );
  return data;
}

export async function cancelElectricalVariantSetTask(
  taskId: string,
): Promise<ElectricalVariantSetTask> {
  const { data } = await apiClient.post<ElectricalVariantSetTask>(
    `/electrical-variant-set-tasks/${taskId}/cancel`,
    undefined,
    { timeout: TASK_HTTP_TIMEOUT_MS },
  );
  return data;
}
