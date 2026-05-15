import { describe, expect, it } from 'vitest';

import { getElectricalErrorGuidance } from '@/utils/electricalErrorGuidance';

describe('electricalErrorGuidance', () => {
  it('does not derive guidance from raw unstructured error text', () => {
    const guidance = getElectricalErrorGuidance('Unexpected failure');

    expect(guidance).toBeNull();
  });

  it('uses backend error code and suggested action codes when present', () => {
    const guidance = getElectricalErrorGuidance({
      error: 'structured backend error',
      errorCode: 'POWER_TOO_HIGH',
      suggestedActions: ['TRY_OTHER_CABLE_TYPE'],
    });

    expect(guidance?.kind).toBe('power_too_high');
    expect(guidance?.errorCode).toBe('POWER_TOO_HIGH');
    expect(guidance?.suggestedActions).toEqual(['TRY_OTHER_CABLE_TYPE']);
    expect(guidance?.suggestions).toEqual(['Попробовать другой тип кабеля']);
  });

  it('does not suggest thread changes for TT auto mode power errors', () => {
    const guidance = getElectricalErrorGuidance({
      error: 'Ни один кабель серии ТТН/ТТВ/ТТХ не обеспечивает 180.00 Вт/м',
      errorCode: 'POWER_TOO_HIGH',
      cableType: 'self_regulating_tt',
      errorContext: { number_of_threads: null },
    });

    expect(guidance?.kind).toBe('power_too_high');
    expect(guidance?.suggestedActions).toEqual(['TRY_OTHER_CABLE_TYPE']);
  });

  it('does not suggest thread changes from structured power context', () => {
    const guidance = getElectricalErrorGuidance({
      error: 'Не найден кабель с мощностью ≥ 132.67 Вт/м (максимум линейки - 100 Вт/м на одну нитку)',
      errorCode: 'POWER_TOO_HIGH',
      cableType: 'self_regulating',
      errorContext: {
        number_of_threads: 1,
        required_power_per_meter: 132.67,
        max_power_per_meter: 100,
        winding_coefficient: 1,
      },
    });

    expect(guidance?.suggestedActions).toEqual(['TRY_OTHER_CABLE_TYPE']);
  });

  it('does not suggest thread changes without explicit thread context', () => {
    const guidance = getElectricalErrorGuidance({
      error: 'Не найден кабель с мощностью ≥ 132.67 Вт/м (максимум линейки - 100 Вт/м на одну нитку)',
      errorCode: 'POWER_TOO_HIGH',
      cableType: 'self_regulating',
      errorContext: {
        required_power_per_meter: 132.67,
        max_power_per_meter: 100,
        winding_coefficient: 1,
      },
    });

    expect(guidance?.suggestedActions).toEqual(['TRY_OTHER_CABLE_TYPE']);
  });

  it('only suggests layout choice for unsupported tank layout shape', () => {
    const guidance = getElectricalErrorGuidance({
      error: 'Для электрорасчёта резервуара требуется геометрия укладки кабеля',
      errorCode: 'MISSING_TANK_LAYOUT',
      cableType: 'self_regulating',
      errorContext: { shape: 'spherical' },
    });

    expect(guidance?.suggestedActions).toEqual(['SET_TANK_LAYOUT']);
    expect(guidance?.suggestions).toEqual(['Выбрать геометрию укладки']);
  });
});
