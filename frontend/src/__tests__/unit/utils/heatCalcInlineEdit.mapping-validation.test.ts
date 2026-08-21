// @vitest-environment node
import { describe, expect, it } from 'vitest';
import {
  getHeatCalcFieldByColumn,
  getHeatCalcFieldDefinition,
  getHeatCalcFieldDescription,
  getHeatCalcFieldLabel,
} from '@/domain/heatCalcFields';
import {
  applyHeatCalcFieldValue,
  validateHeatCalcField,
} from '@/domain/heatCalcFieldRules';
import {
  getInlineEditFieldConfig,
} from '@/utils/heatCalcInlineEdit';
import {
  projectPipeFormValuesFromRecord,
  projectTankFormValuesFromRecord,
} from '@/utils/heatCalcInlineFormProjection';
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
    expect(getHeatCalcFieldDefinition('supply_voltage', 'pipe')).toBeNull();
    expect(getHeatCalcFieldDefinition('supply_voltage', 'tank')).toBeNull();
    expect(getHeatCalcFieldDefinition('winding_coefficient', 'pipe')).toBeNull();
    expect(getHeatCalcFieldDefinition('winding_coefficient', 'tank')).toBeNull();
    expect(getHeatCalcFieldDefinition('aggressive_product', 'pipe')).toBeNull();
    expect(getHeatCalcFieldDefinition('aggressive_product', 'tank')).toBeNull();
    expect(getHeatCalcFieldDefinition('min_switch_temperature', 'tank')).toMatchObject({
      id: 'min_switch_temperature',
      required: true,
      min: -40,
      max: 10,
    });
    expect(getInlineEditFieldConfig('pipe', 'supply_voltage')).toBeNull();
    expect(projectPipeFormValuesFromRecord({ supply_voltage: 380 })).not.toHaveProperty('supply_voltage');
    expect(projectTankFormValuesFromRecord({ supply_voltage: 380 })).not.toHaveProperty('supply_voltage');
    expect(projectPipeFormValuesFromRecord({ winding_coefficient: 1.25 }))
      .not.toHaveProperty('winding_coefficient');
    expect(projectTankFormValuesFromRecord({ winding_coefficient: 1.25 }))
      .not.toHaveProperty('winding_coefficient');
    expect(projectPipeFormValuesFromRecord({ aggressive_product: 'yes' }))
      .not.toHaveProperty('aggressive_product');
    expect(projectTankFormValuesFromRecord({ aggressive_product: 'yes' }))
      .not.toHaveProperty('aggressive_product');
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
      values: { steam_tracing: 'yes', vapor_temperature: '—' },
    }, {
      enforceRequired: false,
    })).toBeNull();
    expect(validateHeatCalcField('outer_diameter_mm', 108, {
      objectType: 'pipe',
      values: { outer_diameter_mm: 108 },
    })).toBeNull();
  });

  it('labels T2/T3 as adjacent Heat-card fields outside the Case 1 selector', () => {
    expect(getHeatCalcFieldLabel('maintain_temperature', { objectType: 'pipe' }))
      .toBe('Температура поддержания');
    expect(getHeatCalcFieldDescription('vapor_temperature', { objectType: 'pipe' }))
      .toContain('Алгоритм выбора марки §6.13 температуру пропарки не использует');
    expect(getHeatCalcFieldDescription('maintain_temperature', { objectType: 'tank' }))
      .toContain('Алгоритм выбора марки §6.13 температуру поддержания не использует');
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
    expect(heatCalcNumberInputProps('pipe', 'min_switch_temperature')).toMatchObject({
      min: -40,
      max: 10,
    });
    expect(heatCalcNumberInputProps('tank', 'min_switch_temperature')).toMatchObject({
      min: -40,
      max: 10,
    });
    expect(heatCalcNumberInputProps('pipe', 'maintain_temperature')).toMatchObject({
      min: -90,
      max: 600,
      step: 0.1,
    });
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
