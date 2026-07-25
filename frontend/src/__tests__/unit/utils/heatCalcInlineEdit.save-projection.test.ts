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

describe('heatCalcInlineEdit — save / projection', () => {
  it('allows inline save when local elements require Lэкв so backend can mark calculation status', () => {
    const record = makePipe();
    record.params.valve_count = 1;
    const draft = applyInlineCellDraft(null, record, 'pipe_outer_diameter', 114);

    expect(buildDraftRowParams(draft!).outer_diameter).toBeCloseTo(0.114);

    record.params.local_element_equiv_length = 1.5;
    const fixedDraft = applyInlineCellDraft(null, record, 'pipe_outer_diameter', 114);
    expect(buildDraftRowParams(fixedDraft!).local_element_equiv_length).toBe(1.5);
  });

  it('projects allow-listed form fields only so unknown draft keys do not become API params', () => {
    const record = makePipe();
    const draft = applyInlineCellDraft(null, record, 'pipe_outer_diameter', 114);
    expect(draft).not.toBeNull();

    const polluted = {
      ...draft!,
      draftFormValues: {
        ...draft!.draftFormValues,
        unknown_client_only: 'should-not-leak',
        __proto_pollution_probe: 1,
      },
    };

    const params = buildDraftRowParams(polluted);
    expect(params.outer_diameter).toBeCloseTo(0.114);
    expect(params.unknown_client_only).toBeUndefined();
    expect(params.__proto_pollution_probe).toBeUndefined();
    // Existing source params still merge through (not part of form projection).
    expect(params.pipe_material).toBe('carbon_steel');
  });

  it('projectPipe/TankFormValuesFromRecord keep allow-list and climate_key presence', () => {
    const pipe = projectPipeFormValuesFromRecord({
      outer_diameter_mm: 108,
      pipe_length: 50,
      insulation_thickness_mm: 50,
      insulation_material: 'mineral_wool',
      ambient_temperature: -20,
      process_temperature: 80,
      climate_key: 'ХМАО|||Сургут',
      unknown_junk: 'drop-me',
    });
    expect(pipe.outer_diameter_mm).toBe(108);
    expect(pipe.climate_key).toBe('ХМАО|||Сургут');
    expect(Object.prototype.hasOwnProperty.call(pipe, 'unknown_junk')).toBe(false);

    const withoutClimateKey = projectPipeFormValuesFromRecord({
      outer_diameter_mm: 108,
      pipe_length: 50,
      insulation_thickness_mm: 50,
      insulation_material: 'mineral_wool',
      ambient_temperature: -20,
      process_temperature: 80,
      placement: 'outdoor',
    });
    expect(Object.prototype.hasOwnProperty.call(withoutClimateKey, 'climate_key')).toBe(false);
    expect(pipeFormToApiParams(withoutClimateKey).climate_key).toBeUndefined();

    const withUndefinedClimateKey = projectPipeFormValuesFromRecord({
      outer_diameter_mm: 108,
      pipe_length: 50,
      insulation_thickness_mm: 50,
      insulation_material: 'mineral_wool',
      ambient_temperature: -20,
      process_temperature: 80,
      placement: 'outdoor',
      climate_key: undefined,
    });
    expect(Object.prototype.hasOwnProperty.call(withUndefinedClimateKey, 'climate_key')).toBe(true);
    expect(pipeFormToApiParams(withUndefinedClimateKey).climate_key).toBeNull();

    const tank = projectTankFormValuesFromRecord({
      shape: 'cylindrical',
      diameter_mm: 2000,
      insulation_thickness_mm: 80,
      insulation_material: 'mineral_wool',
      ambient_temperature: -20,
      process_temperature: 80,
      q_additional: 12,
      unknown_junk: true,
    });
    expect(tank.q_additional).toBe(12);
    expect(Object.prototype.hasOwnProperty.call(tank, 'unknown_junk')).toBe(false);
  });

});
