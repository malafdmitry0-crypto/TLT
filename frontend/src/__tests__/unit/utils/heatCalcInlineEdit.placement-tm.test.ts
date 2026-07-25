/* eslint-disable @typescript-eslint/no-unused-vars -- scenario split keeps shared preamble fixtures */
import { describe, expect, it } from 'vitest';
import { getHeatCalcFieldByColumn } from '@/domain/heatCalcFields';
import {
  applyHeatCalcFieldValue,
  validateHeatCalcField,
} from '@/domain/heatCalcFieldRules';
import {
  applyFormFieldDraft,
  applyInlineCellDraft,
  applyInlineFieldDraft,
  buildDraftRowParams,
  getDraftRowValidationErrors,
  getInlineEditFieldConfig,
  projectPipeFormValuesFromRecord,
  projectTankFormValuesFromRecord,
} from '@/utils/heatCalcInlineEdit';
import { pipeFormToApiParams } from '@/utils/objectWizardUtils';
import {
  heatCalcNumberInputProps,
  heatCalcSelectOptions,
  heatCalcTextInputProps,
} from '@/utils/heatCalcWizardFieldRules';
import type { ProjectObject } from '@/types/project';

function makePipe(): ProjectObject {
  return {
    id: 'pipe-1',
    project_id: 'project-1',
    object_type: 'pipe',
    sort_order: 0,
    version: 1,
    params: {
      name: 'Pipe 1',
      outer_diameter: 0.108,
      wall_thickness: 0.004,
      pipe_material: 'carbon_steel',
      pipe_length: 50,
      insulation_thickness: 0.05,
      insulation_material: 'mineral_wool',
      ambient_temperature: -20,
      process_temperature: 80,
      placement: 'outdoor',
      min_switch_temperature: -20,
      supply_voltage: 220,
      safety_factor: 1.2,
    },
    results: null,
    is_valid: true,
    validation_errors: null,
    created_at: '2026-05-10T00:00:00Z',
    updated_at: '2026-05-10T00:00:00Z',
  };
}

function makeInvalidDeclaredThreeLayerPipe(): ProjectObject {
  const record = makePipe();
  return {
    ...record,
    params: {
      ...record.params,
      insulation_layer_count: '3',
      insulation_layers: [
        { thickness: 0.05, material: 'mineral_wool' },
      ],
    },
    is_valid: false,
    validation_errors: {
      message: 'Не заполнены обязательные поля объекта: Толщина 2-го слоя изоляции, Материал 2-го слоя изоляции, Толщина 3-го слоя изоляции, Материал 3-го слоя изоляции',
    },
  };
}

function makeValidThreeLayerPipe(): ProjectObject {
  const record = makePipe();
  return {
    ...record,
    params: {
      ...record.params,
      insulation_layer_count: '3',
      insulation_layers: [
        { thickness: 0.05, material: 'mineral_wool' },
        { thickness: 0.02, material: 'polyurethane_foam' },
        { thickness: 0.01, material: 'foam_glass' },
      ],
    },
  };
}

describe('heatCalcInlineEdit — placement & insulation tm', () => {
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
