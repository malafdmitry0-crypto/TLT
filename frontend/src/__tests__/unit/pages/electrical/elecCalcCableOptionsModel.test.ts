import { describe, expect, it } from 'vitest';

import type { CableOptionOut } from '@/api/calculations';
import {
  cableOptionSelectMark,
  cableOptionUnavailableLabel,
  formatCableOptionSearchLabel,
  mapBackendCableOptionsToSelectOptions,
} from '@/pages/electrical/elecCalcCableOptionsModel';

function option(partial: Partial<CableOptionOut> = {}): CableOptionOut {
  return {
    model: '30ТТВ2',
    series: 'ТТВ',
    base_model: '30ТТВ2',
    full_mark_preview: '30ТТВ2-СР',
    power_at_t3_w_per_m: 30.59,
    eligible: true,
    unavailable_reason: null,
    temperature_group: 'high',
    q1: -0.141,
    q2: 32,
    nominal_power: 30,
    required_series: 'ТТВ',
    ...partial,
  };
}

describe('elecCalcCableOptionsModel', () => {
  it('maps eligible options to select marks without suffix', () => {
    const mapped = mapBackendCableOptionsToSelectOptions([option()]);
    expect(mapped).toHaveLength(1);
    expect(mapped[0].mark).toBe('30ТТВ2');
    expect(mapped[0].disabled).toBe(false);
    expect(mapped[0].searchLabel).toContain('@T3');
  });

  it('disables ineligible options with human reason', () => {
    const mapped = mapBackendCableOptionsToSelectOptions([
      option({
        eligible: false,
        unavailable_reason: 'ELECTRICAL_CABLE_SERIES_MISMATCH',
        series: 'ТТН',
        model: '25ТТН2',
        base_model: '25ТТН2',
        full_mark_preview: '25ТТН2-СТ',
      }),
    ]);
    expect(mapped[0].disabled).toBe(true);
    expect(mapped[0].searchLabel).toContain('серия не подходит');
    expect(cableOptionUnavailableLabel('ELECTRICAL_CABLE_POWER_CURVE_INVALID'))
      .toBe('некорректная кривая мощности');
  });

  it('prefers base_model for API mark', () => {
    expect(cableOptionSelectMark(option({ model: 'x', base_model: '30ТТВ2' }))).toBe('30ТТВ2');
    expect(formatCableOptionSearchLabel(option())).toContain('30ТТВ2-СР');
  });
});
