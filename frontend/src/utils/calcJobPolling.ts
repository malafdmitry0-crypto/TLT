import type { CalculationTaskStatus } from '@/types/calculation';

const ACTIVE_JOB_STATUSES: ReadonlySet<CalculationTaskStatus> = new Set<CalculationTaskStatus>([
  'queued',
  'enqueued',
  'running',
]);

const QUEUED_JOB_POLL_MS = 2_000;
const RUNNING_JOB_POLL_MS = 1_000;
const BACKGROUND_JOB_POLL_MS = 15_000;
const STALE_JOB_POLL_MS = 15_000;

export const QUEUED_JOB_STALE_AFTER_MS = 60_000;
export const RUNNING_JOB_STALE_AFTER_MS = 30 * 60_000;

export function isCalcJobStale(
  status: CalculationTaskStatus | null | undefined,
  createdAt: string | null | undefined,
  nowMs = Date.now(),
): boolean {
  if (!status || !ACTIVE_JOB_STATUSES.has(status) || !createdAt) return false;
  const createdAtMs = Date.parse(createdAt);
  if (!Number.isFinite(createdAtMs)) return false;
  const staleAfterMs = status === 'running'
    ? RUNNING_JOB_STALE_AFTER_MS
    : QUEUED_JOB_STALE_AFTER_MS;
  return nowMs - createdAtMs >= staleAfterMs;
}

export function getCalcJobRefetchInterval(
  status: CalculationTaskStatus | null | undefined,
  isDocumentHidden = typeof document !== 'undefined' && document.visibilityState === 'hidden',
  stale = false,
): number | false {
  if (!status || !ACTIVE_JOB_STATUSES.has(status)) return false;
  if (isDocumentHidden) return BACKGROUND_JOB_POLL_MS;
  if (stale) return STALE_JOB_POLL_MS;
  return status === 'running' ? RUNNING_JOB_POLL_MS : QUEUED_JOB_POLL_MS;
}

export function isActiveCalcJobStatus(
  status: CalculationTaskStatus | null | undefined,
): boolean {
  return !!status && ACTIVE_JOB_STATUSES.has(status);
}
