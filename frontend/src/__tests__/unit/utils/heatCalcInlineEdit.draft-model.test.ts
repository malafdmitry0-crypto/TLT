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

describe('heatCalcInlineEdit — draft model / units', () => {
  it('stores diameter draft in form units and converts to backend units on save', () => {
    const record = makePipe();
    const draft = applyInlineCellDraft(null, record, 'pipe_outer_diameter', 114);

    expect(draft?.draftFormValues.outer_diameter_mm).toBe(114);
    expect(draft?.dirtyFields.outer_diameter_mm).toBe(114);

    const params = buildDraftRowParams(draft!);
    expect(params.outer_diameter).toBeCloseTo(0.114);
    expect(params.insulation_thickness).toBeCloseTo(0.05);
  });

  it('applies form field drafts through the same row draft model as Excel cells', () => {
    const record = makePipe();
    const draft = applyInlineFieldDraft(null, record, 'pipe_length', '12,5');

    expect(draft?.draftFormValues.pipe_length).toBe(12.5);
    expect(draft?.dirtyFields.pipe_length).toBe(12.5);
    expect(buildDraftRowParams(draft!).pipe_length).toBe(12.5);
  });

  it('синхронизирует справочные и скрытые поля формы с черновиком Excel-строки', () => {
    const record = makePipe();
    let draft = applyFormFieldDraft(null, record, 'climate_key', 'Алтайский край|||Тогул');
    draft = applyFormFieldDraft(draft, record, 'climate_region', 'Алтайский край');
    draft = applyFormFieldDraft(draft, record, 'climate_city', 'Тогул');
    draft = applyFormFieldDraft(draft, record, 'ambient_temperature', -50);
    draft = applyFormFieldDraft(draft, record, 'ambient_temperature_source', 'climate');

    expect(draft?.draftFormValues.climate_key).toBe('Алтайский край|||Тогул');
    expect(draft?.draftFormValues.climate_region).toBe('Алтайский край');
    expect(draft?.draftFormValues.climate_city).toBe('Тогул');
    expect(draft?.draftFormValues.ambient_temperature_source).toBe('climate');

    const params = buildDraftRowParams(draft!);
    expect(params.climate_key).toBe('Алтайский край|||Тогул');
    expect(params.climate_region).toBe('Алтайский край');
    expect(params.climate_city).toBe('Тогул');
    expect(params.ambient_temperature_source).toBe('climate');
    expect(params.ambient_temperature).toBe(-50);
  });

});
