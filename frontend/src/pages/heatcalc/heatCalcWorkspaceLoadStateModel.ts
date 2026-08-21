/**
 * Pure aggregation of required Heat workspace query health.
 * Insulation reference errors are intentionally excluded by callers.
 */

export type HeatCalcRequiredQuerySlice = {
  /** Whether this query is currently enabled for the workspace mode. */
  enabled: boolean;
  isError: boolean;
  error: Error | null;
  /** True while a refetch is in flight (including retry after error). */
  isFetching: boolean;
  /** True when a usable snapshot is already present (stale data counts). */
  hasUsableSnapshot: boolean;
  /** Retry only this query; aggregator calls failed enabled slices only. */
  refetch: () => void;
};

export type HeatCalcWorkspaceLoadState = {
  /** First error among enabled required queries; null when all enabled are healthy. */
  error: Error | null;
  /** True while any failed enabled query is currently refetching. */
  isRetrying: boolean;
  /** True when at least one enabled required query still has usable data. */
  hasUsableSnapshot: boolean;
  /** Blocking = enabled error without any usable snapshot (show QueryError). */
  isBlockingError: boolean;
  /** Refetches only failed enabled required queries. */
  retry: () => void;
};

/**
 * Aggregate required Heat workspace query health without treating inactive
 * query errors as blockers, and without dropping a stale usable snapshot.
 */
export function buildHeatCalcWorkspaceLoadState(
  slices: readonly HeatCalcRequiredQuerySlice[],
): HeatCalcWorkspaceLoadState {
  const enabled = slices.filter((slice) => slice.enabled);
  const failed = enabled.filter((slice) => slice.isError);
  const firstError = failed[0]?.error ?? null;
  const hasUsableSnapshot = enabled.some((slice) => slice.hasUsableSnapshot);
  const isRetrying = failed.some((slice) => slice.isFetching);

  return {
    error: firstError,
    isRetrying,
    hasUsableSnapshot,
    isBlockingError: firstError != null && !hasUsableSnapshot,
    retry: () => {
      for (const slice of failed) {
        slice.refetch();
      }
    },
  };
}

export function toQueryError(error: unknown): Error | null {
  if (error == null) return null;
  if (error instanceof Error) return error;
  return new Error(String(error));
}

/** Minimal query surface used by Heat load-state wiring. */
export type HeatCalcQueryResultLike = {
  isError: boolean;
  error: unknown;
  isFetching: boolean;
  data: unknown;
  refetch: () => unknown;
};

export function requiredQuerySlice(
  enabled: boolean,
  query: HeatCalcQueryResultLike,
  hasUsableSnapshot: boolean = query.data != null,
): HeatCalcRequiredQuerySlice {
  return {
    enabled,
    isError: query.isError,
    error: toQueryError(query.error),
    isFetching: query.isFetching,
    hasUsableSnapshot,
    refetch: () => { void query.refetch(); },
  };
}
