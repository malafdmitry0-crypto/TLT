// @vitest-environment node
import type { FormInstance } from 'antd';
import { describe, expect, it } from 'vitest';
import { heatCalcFormFieldRules } from '@/utils/heatCalcWizardFieldRules';

function formWithValues(values: Record<string, unknown>) {
  return {
    getFieldsValue: () => values,
  } as unknown as FormInstance;
}

describe('heatCalcFormFieldRules', () => {
  it('делает обязательные поля блокирующими и объясняет, что ввести', () => {
    const rules = heatCalcFormFieldRules(formWithValues({}), 'pipe', 'outer_diameter_mm');

    const requiredRule = rules.find((rule) => 'required' in rule && rule.required === true);

    expect(requiredRule).toEqual(expect.objectContaining({ required: true, message: 'Укажите значение' }));
    expect(requiredRule).not.toHaveProperty('warningOnly');
  });

  it('просит выбрать значение для обязательного поля выбора', () => {
    const rules = heatCalcFormFieldRules(formWithValues({}), 'pipe', 'placement');

    expect(rules).toContainEqual(expect.objectContaining({
      required: true,
      message: 'Выберите значение',
    }));
  });

  it('не помечает необязательные поля как required', () => {
    const rules = heatCalcFormFieldRules(formWithValues({}), 'pipe', 'wind_speed');

    expect(rules.some((rule) => 'required' in rule && rule.required === true)).toBe(false);
  });

  it('не считает наименование обязательным расчётным полем', () => {
    const rules = heatCalcFormFieldRules(formWithValues({}), 'pipe', 'name');

    expect(rules.some((rule) => 'required' in rule && rule.required === true)).toBe(false);
  });

  it('учитывает контекст формы для обязательных размеров резервуара', () => {
    const rectangularRules = heatCalcFormFieldRules(
      formWithValues({ shape: 'rectangular' }),
      'tank',
      'length_mm',
    );
    const cylindricalRules = heatCalcFormFieldRules(
      formWithValues({ shape: 'cylindrical' }),
      'tank',
      'length_mm',
    );

    expect(rectangularRules.some((rule) => 'required' in rule && rule.required === true)).toBe(true);
    expect(cylindricalRules.some((rule) => 'required' in rule && rule.required === true)).toBe(false);
  });
});
