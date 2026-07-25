import { describe, expect, it } from 'vitest';
import {
  getDefaultTableViewSettings,
  normalizeTableViewSettings,
} from '@/utils/heatCalcTableViewSettings';
import {
  getDefaultCalculationDetailsSettings,
  normalizeCalculationDetailsSettings,
} from '@/utils/heatCalcCalculationDetailsSettings';
import {
  hasCalculationDetailsSettingsChanged,
  hasTableViewSettingsChanged,
  planGuestCalculationDetailsWrite,
  planGuestTableViewWrite,
  planPreferenceHydration,
} from '@/pages/heatcalc/heatCalcPreferencesModel';

describe('heatCalcPreferencesModel', () => {
  it('detects table view setting changes', () => {
    const base = getDefaultTableViewSettings();
    expect(hasTableViewSettingsChanged(base, base)).toBe(false);
    expect(hasTableViewSettingsChanged(
      { ...base, sideFormWidthPct: base.sideFormWidthPct + 5 },
      base,
    )).toBe(true);
  });

  it('detects calculation details changes', () => {
    const base = getDefaultCalculationDetailsSettings();
    expect(hasCalculationDetailsSettingsChanged(base, base)).toBe(false);
    expect(hasCalculationDetailsSettingsChanged(
      {
        ...base,
        visibleMetrics: base.visibleMetrics.slice(0, Math.max(0, base.visibleMetrics.length - 1)),
      },
      base,
    )).toBe(true);
  });

  it('plans preference hydration apply / reset / skip', () => {
    expect(planPreferenceHydration(false, { value: { a: 1 } }, null, (v) => v)).toBeNull();
    expect(planPreferenceHydration(true, undefined, 'u1', (v) => v)).toBeNull();

    expect(planPreferenceHydration(
      true,
      { value: { fontSize: 14 } as never, user_id: 'u1' },
      'u1',
      normalizeTableViewSettings,
    )).toMatchObject({ kind: 'apply', cacheUserId: 'u1' });

    expect(planPreferenceHydration(
      true,
      { value: null, user_id: 'u2' },
      'u1',
      (v: unknown) => v,
    )).toEqual({ kind: 'reset-default', clearUserId: 'u1' });
  });

  it('plans guest write actions for view and details', () => {
    const defaultView = getDefaultTableViewSettings();
    const customView = normalizeTableViewSettings({
      ...defaultView,
      sideFormWidthPct: defaultView.sideFormWidthPct + 10,
    });
    expect(planGuestTableViewWrite(false, customView)).toEqual({ kind: 'noop' });
    expect(planGuestTableViewWrite(true, defaultView)).toEqual({ kind: 'clear' });
    expect(planGuestTableViewWrite(true, customView)).toEqual({
      kind: 'write',
      settings: customView,
    });

    const defaultDetails = getDefaultCalculationDetailsSettings();
    const customDetails = normalizeCalculationDetailsSettings({
      ...defaultDetails,
      visibleMetrics: defaultDetails.visibleMetrics.slice(0, 1),
    });
    expect(planGuestCalculationDetailsWrite(false, customDetails)).toEqual({ kind: 'noop' });
    expect(planGuestCalculationDetailsWrite(true, defaultDetails)).toEqual({ kind: 'clear' });
    expect(planGuestCalculationDetailsWrite(true, customDetails)).toEqual({
      kind: 'write',
      settings: customDetails,
    });
  });
});
