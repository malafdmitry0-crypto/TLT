/**
 * Owner-local async helpers for ElectricalVariantTabs (non-component exports).
 * Keeps component modules Fast Refresh clean.
 */

/** Fire-and-forget handled promise rejections (UI already owns failure surfaces). */
export function ignoreHandledError(operation: Promise<unknown>): void {
  void operation.catch(() => undefined);
}
