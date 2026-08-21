/**
 * @module electrical/workspace-summary-chrome-model
 * @owner electrical
 * Pure helpers for elec workspace summary / job chrome.
 */

export type ActiveJobLike = {
  status?: string | null;
} | null | undefined;

/**
 * Prefer live job status; while an id is known but status is missing, treat as queued.
 * Returns the status string (or 'queued') for summary chrome; cast to CalculationTaskStatus at call site.
 */
export function resolveActiveJobStatus(
  activeJob: ActiveJobLike,
  activeJobId: string | null | undefined,
): string | null {
  if (activeJob?.status) return activeJob.status;
  if (activeJobId) return 'queued';
  return null;
}

/**
 * Prefer server page summary total; fall back to currently loaded objects.
 */
export function resolveTotalObjectsCount(
  pageTotalObjects: number | null | undefined,
  loadedObjectsCount: number,
): number {
  return pageTotalObjects ?? loadedObjectsCount;
}
