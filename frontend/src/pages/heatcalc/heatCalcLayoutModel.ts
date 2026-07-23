/**
 * @module heatcalc/layout-model
 * @owner heat
 * @depends none
 * @does-not electrical
 */
import type { CSSProperties } from 'react';

export type HeatCalcFormPlacement = 'top' | 'bottom' | 'left' | 'right' | string;

export function buildHeatCalcLayoutPresentation(
  formPlacement: HeatCalcFormPlacement,
  formBlockVisible: boolean,
  sideFormWidthPct: number,
) {
  const isSideFormPlacement = formPlacement === 'left' || formPlacement === 'right';
  const sideResizeVisible = isSideFormPlacement && formBlockVisible;
  const workspaceLayoutStyle: CSSProperties | undefined = isSideFormPlacement
    ? ({ '--heatcalc-side-form-width': `${sideFormWidthPct}%` } as CSSProperties)
    : undefined;

  return {
    isSideFormPlacement,
    sideResizeVisible,
    workspaceLayoutStyle,
  };
}
