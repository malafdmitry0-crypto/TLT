import { describe, expect, it } from 'vitest';

import type { CableOptionOut } from '@/api/calculations';
import { buildElecCalcAutoAvailability } from '@/pages/electrical/elecCalcAutoAvailabilityModel';

function option(overrides: Partial<CableOptionOut> = {}): CableOptionOut {
  return {
    model: 'ТЛТ-25',
    series: '25ТТ',
    base_model: '25ТТ',
    passport_power_w_per_m: 25,
    min_ambient_temperature_c: -60,
    max_product_temperature_c: 65,
    object_ambient_temperature_c: -70,
    object_product_temperature_c: 80,
    eligible: false,
    unavailable_reason: 'ELECTRICAL_CABLE_TEMPERATURE_LIMIT_EXCEEDED',
    ...overrides,
  };
}

describe('buildElecCalcAutoAvailability', () => {
  it('does not block Auto outside TT or when at least one mark is eligible', () => {
    expect(buildElecCalcAutoAvailability({ enabled: false, status: 'pending' }).kind)
      .toBe('available');
    expect(buildElecCalcAutoAvailability({
      enabled: true,
      status: 'success',
      options: [option(), option({ model: 'ТЛТ-40', eligible: true, unavailable_reason: null })],
    }).kind).toBe('available');
  });

  it('separates loading, request error, and empty catalog', () => {
    expect(buildElecCalcAutoAvailability({ enabled: true, status: 'pending' }))
      .toMatchObject({ kind: 'loading', blocked: true, tone: 'info', canRetry: false });
    expect(buildElecCalcAutoAvailability({ enabled: true, status: 'error' }))
      .toMatchObject({ kind: 'request_error', blocked: true, tone: 'danger', canRetry: true });
    expect(buildElecCalcAutoAvailability({ enabled: true, status: 'success', options: [] }))
      .toMatchObject({ kind: 'catalog_empty', blocked: true, canRetry: false });
  });

  it('shows temperature facts only when every rejection is temperature-related', () => {
    const result = buildElecCalcAutoAvailability({
      enabled: true,
      status: 'success',
      options: [option()],
    });
    expect(result).toMatchObject({ kind: 'temperature', blocked: true });
    expect(result.message).toContain('среда -70 °C');
    expect(result.message).toContain('продукт 80 °C');
  });

  it('does not call a catalog restriction a temperature problem', () => {
    const result = buildElecCalcAutoAvailability({
      enabled: true,
      status: 'success',
      options: [option({ unavailable_reason: 'ELECTRICAL_POWER_CATALOG_PROVISIONAL' })],
    });
    expect(result.kind).toBe('catalog');
    expect(result.message).toContain('каталог');
    expect(result.message).not.toContain('температур');
  });

  it('lists unique user-facing reasons for mixed rejection', () => {
    const result = buildElecCalcAutoAvailability({
      enabled: true,
      status: 'success',
      options: [
        option(),
        option({ model: 'ТЛТ-40', unavailable_reason: 'ELECTRICAL_POWER_CATALOG_PROVISIONAL' }),
        option({ model: 'ТЛТ-55', unavailable_reason: 'ELECTRICAL_POWER_CATALOG_PROVISIONAL' }),
      ],
    });
    expect(result.kind).toBe('mixed');
    expect(result.message).toContain('температурные пределы');
    expect(result.message).toContain('каталог не подтверждён');
    expect(result.message?.match(/каталог не подтверждён/g)).toHaveLength(1);
  });

  it('uses a neutral explanation for an unknown backend reason without exposing its code', () => {
    const result = buildElecCalcAutoAvailability({
      enabled: true,
      status: 'success',
      options: [option({ unavailable_reason: 'SOME_INTERNAL_CODE' })],
    });
    expect(result.kind).toBe('unknown');
    expect(result.message).not.toContain('SOME_INTERNAL_CODE');
    expect(result.message).toContain('backend не разрешил');
  });
});
