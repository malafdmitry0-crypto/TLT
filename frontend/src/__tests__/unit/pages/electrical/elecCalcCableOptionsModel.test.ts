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
    model: '30ТТВ2-СР',
    series: 'ТТВ',
    base_model: '30ТТВ2',
    passport_power_w_per_m: 30,
    min_ambient_temperature_c: -40,
    max_product_temperature_c: 120,
    eligible: true,
    unavailable_reason: null,
    nomenclature_code: 'CASE1-30-SR',
    ...partial,
  };
}

describe('elecCalcCableOptionsModel', () => {
  it('maps eligible options to exact technical full marks', () => {
    const mapped = mapBackendCableOptionsToSelectOptions([option()]);
    expect(mapped).toHaveLength(1);
    expect(mapped[0].mark).toBe('30ТТВ2-СР');
    expect(mapped[0].disabled).toBe(false);
    expect(mapped[0].searchLabel).toContain('30.00 Вт/м');
    expect(mapped[0].searchLabel).toContain('Tmin -40 °C');
    expect(mapped[0].searchLabel).toContain('Tmax 120 °C');
    expect(mapped[0].searchLabel).not.toContain('@T3');
  });

  it('disables ineligible options with human reason', () => {
    const mapped = mapBackendCableOptionsToSelectOptions([
      option({
        eligible: false,
        unavailable_reason: 'ELECTRICAL_CABLE_TEMPERATURE_LIMIT_EXCEEDED',
        series: 'ТТН',
        model: '25ТТН2-СТ',
        base_model: '25ТТН2',
        passport_power_w_per_m: 25,
        max_product_temperature_c: 65,
      }),
    ]);
    expect(mapped[0].disabled).toBe(true);
    expect(mapped[0].searchLabel).toContain('температурные пределы не подходят');
    expect(cableOptionUnavailableLabel('ELECTRICAL_CATALOG_ROW_INVALID'))
      .toBe('строка каталога некорректна');
  });

  it('uses only the exact catalog full mark for API selection', () => {
    expect(cableOptionSelectMark(option({ model: '30ТТВ2-СР', base_model: 'wrong' })))
      .toBe('30ТТВ2-СР');
    expect(cableOptionSelectMark(option({ model: null, base_model: '30ТТВ2' }))).toBeNull();
    expect(formatCableOptionSearchLabel(option())).toContain('30ТТВ2-СР');
  });
});
