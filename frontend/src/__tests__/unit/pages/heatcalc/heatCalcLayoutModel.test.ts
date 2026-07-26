// @vitest-environment node
import { describe, expect, it } from 'vitest';

import { buildHeatCalcLayoutPresentation } from '@/pages/heatcalc/heatCalcLayoutModel';

describe('buildHeatCalcLayoutPresentation', () => {
  it('top placement is not side', () => {
    const layout = buildHeatCalcLayoutPresentation('top', true, 40);
    expect(layout.isSideFormPlacement).toBe(false);
    expect(layout.sideResizeVisible).toBe(false);
    expect(layout.workspaceLayoutStyle).toBeUndefined();
  });

  it('left placement enables resize when form visible', () => {
    const layout = buildHeatCalcLayoutPresentation('left', true, 35);
    expect(layout.isSideFormPlacement).toBe(true);
    expect(layout.sideResizeVisible).toBe(true);
    expect(layout.workspaceLayoutStyle).toEqual({
      '--heatcalc-side-form-width': '35%',
    });
  });

  it('right placement hides resize when form hidden', () => {
    const layout = buildHeatCalcLayoutPresentation('right', false, 50);
    expect(layout.sideResizeVisible).toBe(false);
  });
});
