// @vitest-environment node
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

  it('does not show error guidance for unsupported tank layout', () => {
    const guidance = getElectricalErrorGuidance({
      error: 'Электрорасчёт укладки кабеля для неизвестной геометрии резервуара не применим',
      errorCode: 'unsupported_layout',
      cableType: 'self_regulating',
      errorContext: { shape: 'hexagonal' },
    });

    expect(guidance).toBeNull();
  });

  it('localizes missing project I доп and points to project settings', () => {
    const guidance = getElectricalErrorGuidance({
      error: 'SECTION_CURRENT_LIMIT_REQUIRED',
      errorCode: 'SECTION_CURRENT_LIMIT_REQUIRED',
    });

    expect(guidance).toMatchObject({
      kind: 'section_current_limit_required',
      label: 'Не задан I доп проекта',
      message: 'Задайте допустимый стартовый ток одной секции в настройках проекта',
      suggestions: ['Задать I доп проекта'],
    });
  });

  it('localizes pipe layout inputs rejected for a tank', () => {
    const guidance = getElectricalErrorGuidance({
      error: 'Tank layout does not accept pipe winding inputs',
      errorCode: 'ELECTRICAL_TANK_LAYOUT_INPUT_UNSUPPORTED',
      suggestedActions: ['SET_TANK_LAYOUT'],
      cableType: 'self_regulating_tt',
    });

    expect(guidance).toMatchObject({
      kind: 'tank_layout_input_unsupported',
      label: 'Неверная укладка резервуара',
      message: 'Для резервуара нельзя задавать трубный шаг намотки',
      suggestions: ['Выбрать геометрию укладки'],
    });
  });

  it('explains an ambient temperature below the catalog limit', () => {
    const guidance = getElectricalErrorGuidance({
      errorCode: 'ELECTRICAL_CABLE_TEMPERATURE_LIMIT_EXCEEDED',
      error: 'backend fallback',
      errorContext: {
        ambient_temperature_c: -41,
        minimum_supported_ambient_temperature_c: -40,
        product_temperature_c: 20,
        maximum_supported_product_temperature_c: 200,
        violations: ['ambient_below_minimum'],
      },
    });

    expect(guidance?.message).toBe(
      'Температура окружающей среды -41 °C ниже допустимой для доступных марок кабеля: минимум -40 °C.',
    );
    expect(guidance?.suggestions).toContain('Проверить температуру среды');
  });

  it('explains a product temperature above the catalog limit', () => {
    const guidance = getElectricalErrorGuidance({
      errorCode: 'ELECTRICAL_CABLE_TEMPERATURE_LIMIT_EXCEEDED',
      error: 'backend fallback',
      errorContext: {
        ambient_temperature_c: -20,
        minimum_supported_ambient_temperature_c: -40,
        product_temperature_c: 201,
        maximum_supported_product_temperature_c: 200,
        violations: ['product_above_maximum'],
      },
    });

    expect(guidance?.message).toBe(
      'Температура продукта 201 °C выше допустимой для доступных марок кабеля: максимум 200 °C.',
    );
    expect(guidance?.suggestions).toContain('Проверить температуру продукта');
  });

  it('shows both independent temperature violations', () => {
    const guidance = getElectricalErrorGuidance({
      errorCode: 'ELECTRICAL_CABLE_TEMPERATURE_LIMIT_EXCEEDED',
      error: 'backend fallback',
      errorContext: {
        ambient_temperature_c: -41,
        minimum_supported_ambient_temperature_c: -40,
        product_temperature_c: 201,
        maximum_supported_product_temperature_c: 200,
        violations: ['ambient_below_minimum', 'product_above_maximum'],
      },
    });

    expect(guidance?.message).toContain('Температура окружающей среды -41 °C');
    expect(guidance?.message).toContain('Температура продукта 201 °C');
  });
});
