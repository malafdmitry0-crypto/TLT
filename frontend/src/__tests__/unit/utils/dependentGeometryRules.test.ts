// @vitest-environment node
import { describe, expect, it } from 'vitest';
import { validateHeatCalcField } from '@/domain/heatCalcFieldRules';

describe('dependent underground geometry rules', () => {
  it('uses millimetres for pipe geometry and metres for centerline depth', () => {
    const values = {
      placement: 'underground',
      outer_diameter_mm: 108,
      insulation_layer_count: '3',
      insulation_thickness_mm: 30,
      second_insulation_thickness_mm: 10,
      third_insulation_thickness_mm: 10,
    };
    expect(validateHeatCalcField('pipe_centerline_depth', 0.1, {
      objectType: 'pipe',
      values,
    })).toBe(
      'Глубина оси H=0.10 м меньше наружного радиуса изоляции r=0.104 м — труба не помещается в грунт',
    );
    expect(validateHeatCalcField('pipe_centerline_depth', 0.104, {
      objectType: 'pipe',
      values,
    })).toBeNull();
    expect(validateHeatCalcField('pipe_centerline_depth', 0.11, {
      objectType: 'pipe',
      values: { ...values, insulation_layer_count: '1', insulation_thickness_mm: 50 },
    })).toBeNull();
  });

  it('compares tank buried metres with total height millimetres', () => {
    const values = {
      placement: 'underground',
      height_mm: 4000,
      tank_buried_height: 10,
    };
    expect(validateHeatCalcField('tank_buried_height', 10, {
      objectType: 'tank',
      values,
    })).toBe('Высота подземной части 10 м не может быть больше высоты резервуара 4 м');
    expect(validateHeatCalcField('tank_buried_height', 4, {
      objectType: 'tank',
      values: { ...values, tank_buried_height: 4 },
    })).toBeNull();
  });
});
