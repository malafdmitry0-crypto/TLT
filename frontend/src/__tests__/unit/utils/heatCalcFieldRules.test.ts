// @vitest-environment node
import { describe, expect, it } from 'vitest';
import {
  isHeatCalcFieldRequired,
  isHeatCalcFieldVisible,
  validateHeatCalcField,
  validateHeatCalcFormValues,
} from '@/domain/heatCalcFieldRules';

describe('heatCalcFieldRules', () => {
  it('делает грунт обязательным только для подземного размещения и λ грунта только для ручного грунта', () => {
    expect(isHeatCalcFieldVisible('ground_type', {
      objectType: 'pipe',
      values: { placement: 'outdoor' },
    })).toBe(false);
    expect(isHeatCalcFieldRequired('ground_type', {
      objectType: 'pipe',
      values: { placement: 'underground' },
    })).toBe(true);
    expect(isHeatCalcFieldRequired('ground_conductivity', {
      objectType: 'pipe',
      values: { placement: 'underground', ground_type: 'dry_sand:na:0' },
    })).toBe(false);
    expect(isHeatCalcFieldRequired('ground_conductivity', {
      objectType: 'pipe',
      values: { placement: 'underground', ground_type: 'custom' },
    })).toBe(true);
  });

  it('требует Lэкв только когда есть ненулевые локальные элементы', () => {
    expect(isHeatCalcFieldRequired('local_element_equiv_length', {
      objectType: 'pipe',
      values: { valve_count: 0, flange_count: 0, support_count: 0 },
    })).toBe(false);
    expect(isHeatCalcFieldRequired('local_element_equiv_length', {
      objectType: 'pipe',
      values: { valve_count: 1, flange_count: 0, support_count: 0 },
    })).toBe(true);
    expect(validateHeatCalcField('local_element_equiv_length', undefined, {
      objectType: 'pipe',
      values: { valve_count: 1, flange_count: 0, support_count: 0 },
    })).toBe('Укажите значение');
  });

  it('валидирует стенку резервуара как пару толщина + λ', () => {
    expect(validateHeatCalcField('wall_lambda', undefined, {
      objectType: 'tank',
      values: { wall_thickness_mm: 12 },
    })).toBe('Укажите λ стенки');
    expect(validateHeatCalcField('wall_thickness_mm', undefined, {
      objectType: 'tank',
      values: { wall_lambda: 45 },
    })).toBe('Укажите толщину стенки');
    expect(validateHeatCalcFormValues({
      objectType: 'tank',
      values: { wall_thickness_mm: 12, wall_lambda: 45 },
    })).not.toHaveProperty('wall_lambda');
  });

  it('показывает климатическую обеспеченность при выбранном климате, но не требует ручного выбора', () => {
    expect(isHeatCalcFieldVisible('climate_temperature_basis', {
      objectType: 'pipe',
      values: {},
    })).toBe(false);
    expect(isHeatCalcFieldRequired('climate_temperature_basis', {
      objectType: 'pipe',
      values: { climate_key: 'Москва|||Москва' },
    })).toBe(false);
    expect(validateHeatCalcField('climate_temperature_basis', undefined, {
      objectType: 'pipe',
      values: { climate_key: 'Москва|||Москва' },
    })).toBeNull();
  });

  it('ограничивает температурные и физические диапазоны из ТНП', () => {
    expect(validateHeatCalcField('vapor_temperature', 85, {
      objectType: 'pipe',
      values: {},
    })).toBe('Минимальное значение — 90');
    expect(validateHeatCalcField('vapor_temperature', 200, {
      objectType: 'pipe',
      values: {},
    })).toBeNull();
    expect(validateHeatCalcField('vapor_temperature', 250, {
      objectType: 'pipe',
      values: {},
    })).toBe('Максимальное значение — 200');
    expect(validateHeatCalcField('ground_conductivity', 0.5, {
      objectType: 'pipe',
      values: { placement: 'underground' },
    })).toBe('Минимальное значение — 0.8');
    expect(validateHeatCalcField('ground_conductivity', 1.5, {
      objectType: 'pipe',
      values: { placement: 'underground' },
    })).toBeNull();
    expect(validateHeatCalcField('min_switch_temperature', -25, {
      objectType: 'pipe',
      values: {},
    })).toBe('Минимальное значение — -20');
    expect(validateHeatCalcField('min_switch_temperature', 0, {
      objectType: 'pipe',
      values: {},
    })).toBeNull();
    expect(validateHeatCalcField('min_switch_temperature', 10, {
      objectType: 'pipe',
      values: {},
    })).toBe('Максимальное значение — 5');
    expect(validateHeatCalcField('insulation_thickness_mm', 0.005, {
      objectType: 'pipe',
      values: {},
    })).toBe('Минимальное значение — 0.01');
    expect(validateHeatCalcField('insulation_thickness_mm', 0.05, {
      objectType: 'pipe',
      values: {},
    })).toBeNull();
    expect(validateHeatCalcField('winding_coefficient', 1.25, {
      objectType: 'pipe',
      values: {},
    })).toBeNull();
    expect(validateHeatCalcField('winding_coefficient', 2, {
      objectType: 'pipe',
      values: {},
    })).toBe('Максимальное значение — 1.5');
    expect(validateHeatCalcField('valve_count', 150, {
      objectType: 'pipe',
      values: {},
    })).toBe('Максимальное значение — 100');
  });

  it('учитывает количество слоёв и материал other для λ и диапазона T', () => {
    expect(isHeatCalcFieldVisible('second_insulation_material', {
      objectType: 'pipe',
      values: { insulation_layer_count: '1' },
    })).toBe(false);
    expect(isHeatCalcFieldRequired('second_insulation_material', {
      objectType: 'pipe',
      values: { insulation_layer_count: '2' },
    })).toBe(true);
    expect(isHeatCalcFieldRequired('first_insulation_lambda', {
      objectType: 'pipe',
      values: { insulation_material: 'mineral_wool' },
    })).toBe(false);
    expect(isHeatCalcFieldRequired('first_insulation_lambda', {
      objectType: 'pipe',
      values: { insulation_material: 'other' },
    })).toBe(true);
    expect(validateHeatCalcField('first_insulation_temperature_range', undefined, {
      objectType: 'pipe',
      values: { insulation_material: 'other' },
    })).toBe('Укажите диапазон T');
    expect(validateHeatCalcField('first_insulation_temperature_range', undefined, {
      objectType: 'pipe',
      values: {
        insulation_material: 'other',
        first_insulation_temperature_min: 20,
        first_insulation_temperature_max: 10,
      },
    })).toBe('Нижняя граница должна быть меньше верхней');
  });
});
