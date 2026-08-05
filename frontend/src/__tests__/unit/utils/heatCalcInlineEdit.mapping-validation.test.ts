// @vitest-environment node
import { describe, expect, it } from 'vitest';
import { getHeatCalcFieldByColumn } from '@/domain/heatCalcFields';
import {
  applyHeatCalcFieldValue,
  validateHeatCalcField,
} from '@/domain/heatCalcFieldRules';
import {
  getInlineEditFieldConfig,
} from '@/utils/heatCalcInlineEdit';
import {
  heatCalcNumberInputProps,
  heatCalcSelectOptions,
  heatCalcTextInputProps,
} from '@/utils/heatCalcWizardFieldRules';

describe('heatCalcInlineEdit mapping and validation', () => {

  it('maps Phase 1 table columns to form field ids', () => {
    expect(getHeatCalcFieldByColumn('pipe', 'pipe_outer_diameter')?.id).toBe('outer_diameter_mm');
    expect(getHeatCalcFieldByColumn('tank', 'tank_wall_lambda')?.id).toBe('wall_lambda');
    expect(getInlineEditFieldConfig('pipe', 'placement')).toBeNull();
    expect(getInlineEditFieldConfig('tank', 'tank_shape')).toBeNull();
    expect(getInlineEditFieldConfig('pipe', 'insulation_material')).toBeNull();
    expect(getInlineEditFieldConfig('pipe', 'pipe_dn')).toBeNull();
    expect(getInlineEditFieldConfig('pipe', 'supply_voltage')?.editor).toBe('select');
  });

  it('uses shared validation for Phase 1 numeric ranges', () => {
    expect(validateHeatCalcField('outer_diameter_mm', 5, {
      objectType: 'pipe',
      values: { outer_diameter_mm: 5 },
    })).toBe('Минимальное значение — 10.8');
    expect(validateHeatCalcField('pipe_length', '10,5', {
      objectType: 'pipe',
      values: { pipe_length: '10,5' },
    })).toBeNull();
    expect(validateHeatCalcField('vapor_temperature', '—', {
      objectType: 'pipe',
      values: { vapor_temperature: '—' },
    }, {
      enforceRequired: false,
    })).toBeNull();
    expect(validateHeatCalcField('outer_diameter_mm', 108, {
      objectType: 'pipe',
      values: { outer_diameter_mm: 108 },
    })).toBeNull();
  });

  it('exposes the same Phase 1 metadata to ObjectWizard inputs', () => {
    expect(heatCalcTextInputProps('pipe', 'name')).toMatchObject({
      maxLength: 200,
      'aria-label': 'Наименование',
    });
    expect(heatCalcNumberInputProps('pipe', 'outer_diameter_mm')).toMatchObject({
      min: 10.8,
      max: 3000,
      step: 1,
    });
    expect(heatCalcNumberInputProps('tank', 'wall_lambda')).toMatchObject({
      min: 0.001,
      max: 400,
      step: 0.1,
    });
    // 230 — норматив системы (DEC-11), его подставляет бэкенд новым объектам
    expect(heatCalcSelectOptions('pipe', 'supply_voltage')).toEqual([
      { value: 230, label: '230' },
      { value: 220, label: '220' },
      { value: 380, label: '380' },
    ]);
  });

  it('фильтрует режимы tm изоляции по размещению объекта', () => {
    expect(
      heatCalcSelectOptions('pipe', 'insulation_temperature_basis', { placement: 'outdoor' }),
    ).toEqual([
      { value: 'outdoor_summer', label: 'Открытый воздух, лето' },
      { value: 'outdoor_winter', label: 'Открытый воздух, зима' },
    ]);
    expect(
      heatCalcSelectOptions('pipe', 'insulation_temperature_basis', { placement: 'underground' }),
    ).toEqual([
      { value: 'channel', label: 'Канал' },
      { value: 'tunnel', label: 'Тоннель' },
      { value: 'technical_subfloor', label: 'Техническое подполье' },
    ]);
    expect(
      heatCalcSelectOptions('pipe', 'insulation_temperature_basis', { placement: 'indoor' }),
    ).toEqual([
      { value: 'indoor', label: 'Помещение' },
      { value: 'attic', label: 'Чердак' },
      { value: 'basement', label: 'Подвал' },
    ]);
  });

  it('валидирует режим tm изоляции относительно размещения объекта', () => {
    expect(validateHeatCalcField('insulation_temperature_basis', 'attic', {
      objectType: 'pipe',
      values: { placement: 'outdoor', insulation_temperature_basis: 'attic' },
    })).toBe('Режим tm изоляции не соответствует размещению объекта');
    expect(validateHeatCalcField('insulation_temperature_basis', 'outdoor_winter', {
      objectType: 'pipe',
      values: { placement: 'outdoor', insulation_temperature_basis: 'outdoor_winter' },
    })).toBeNull();
    expect(validateHeatCalcField('insulation_temperature_basis', 'channel', {
      objectType: 'pipe',
      values: { placement: 'underground', insulation_temperature_basis: 'channel' },
    })).toBeNull();
  });

  it('дефолтит режим tm при смене размещения Excel-строки', () => {
    const values = applyHeatCalcFieldValue('placement', 'outdoor', {
      objectType: 'pipe',
      values: {
        placement: 'underground',
        insulation_temperature_basis: 'channel',
      },
    });

    expect(values.placement).toBe('outdoor');
    expect(values.insulation_temperature_basis).toBe('outdoor_winter');
  });
});
