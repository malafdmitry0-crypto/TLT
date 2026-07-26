import { describe, expect, it } from 'vitest';
import {
  applyFormFieldDraft,
  applyInlineCellDraft,
  applyInlineFieldDraft,
  buildDraftRowParams,
  getDraftRowValidationErrors,
  projectPipeFormValuesFromRecord,
  projectTankFormValuesFromRecord,
} from '@/utils/heatCalcInlineEdit';
import { pipeFormToApiParams } from '@/utils/objectWizardUtils';
import {
  makePipe,
  makeValidThreeLayerPipe,
} from './heatCalcInlineEdit.test-helpers';

describe('heatCalcInlineEdit layers and projection', () => {

  it('при переключении 3 -> 2 очищает только поля третьего слоя', () => {
    const record = makeValidThreeLayerPipe();
    const draft = applyFormFieldDraft(null, record, 'insulation_layer_count', '2')!;

    expect(draft.draftFormValues.second_insulation_thickness_mm).toBe(20);
    expect(draft.draftFormValues.second_insulation_material).toBe('polyurethane_foam');
    expect(draft.draftFormValues.third_insulation_thickness_mm).toBeUndefined();
    expect(draft.draftFormValues.third_insulation_material).toBeUndefined();

    const params = buildDraftRowParams(draft, { enforceRequired: true });
    expect(params.insulation_layer_count).toBe('2');
    expect(params.insulation_layers).toEqual([
      { thickness: 0.05, material: 'mineral_wool' },
      { thickness: 0.02, material: 'polyurethane_foam' },
    ]);
  });

  it('сохраняет parse-ошибку ячейки, если значение стало пустым из-за нечислового ввода', () => {
    const record = makePipe();
    const draft = applyInlineFieldDraft(null, record, 'vapor_temperature', null)!;
    const parseErrorDraft = {
      ...draft,
      errors: {
        vapor_temperature: 'Введите число',
      },
    };

    expect(getDraftRowValidationErrors(parseErrorDraft).vapor_temperature).toBe('Введите число');
    expect(getDraftRowValidationErrors(parseErrorDraft, { enforceRequired: true }).vapor_temperature).toBe('Введите число');
    expect(() => buildDraftRowParams(parseErrorDraft)).toThrow('Исправьте ошибки');
  });

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
