/**
 * Owner-neutral structural contract for HeatCalc context-menu open flow.
 *
 * Callers may pass React MouseEvent, PointerEvent, or a plain object that
 * exposes only the fields the menu position / open path actually reads.
 * MouseEvent and PointerEvent are structurally compatible without assertion.
 */
export interface HeatCalcContextMenuTrigger {
  clientX: number;
  clientY: number;
  preventDefault: () => void;
  stopPropagation: () => void;
}
