import { describe, expect, it } from 'vitest';
import { getHeatCalcFieldByColumn } from '@/domain/heatCalcFields';
import { validateHeatCalcField } from '@/domain/heatCalcFieldRules';
import {
  applyFormFieldDraft,
  applyInlineCellDraft,
  applyInlineFieldDraft,
  buildDraftRowParams,
  getDraftRowValidationErrors,
  getInlineEditFieldConfig,
} from '@/utils/heatCalcInlineEdit';
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

describe('heatCalcInlineEdit', () => {
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
    expect(heatCalcSelectOptions('pipe', 'supply_voltage')).toEqual([
      { value: 220, label: '220' },
      { value: 380, label: '380' },
    ]);
  });

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

  it('keeps invalid values as row errors and blocks save', () => {
    const record = makePipe();
    const draft = applyInlineCellDraft(null, record, 'pipe_outer_diameter', 5);

    expect(draft?.draftFormValues.outer_diameter_mm).toBe(5);
    expect(draft?.dirtyFields.outer_diameter_mm).toBe(5);
    expect(draft?.errors.outer_diameter_mm).toBe('Минимальное значение — 10.8');
    expect(() => buildDraftRowParams(draft!)).toThrow('Исправьте ошибки');

    const fixedDraft = applyInlineCellDraft(draft, record, 'pipe_outer_diameter', 114);
    expect(fixedDraft?.errors.outer_diameter_mm).toBeUndefined();
    expect(fixedDraft?.draftFormValues.outer_diameter_mm).toBe(114);
    expect(buildDraftRowParams(fixedDraft!).outer_diameter).toBeCloseTo(0.114);
  });

  it('does not block new Excel row params only because required fields are empty', () => {
    const record = makePipe();
    record.id = 'new:pipe:1';
    record.params = {};
    const draft = applyInlineCellDraft(null, record, 'name', 'Новая строка');

    expect(buildDraftRowParams(draft!).name).toBe('Новая строка');
    expect(() => buildDraftRowParams(draft!, { enforceRequired: true })).toThrow('Исправьте ошибки');
  });

  it('очищает устаревшую ошибку ячейки, если текущее значение уже валидно', () => {
    const record = makePipe();
    const draft = applyInlineCellDraft(null, record, 'pipe_outer_diameter', 114)!;
    const staleDraft = {
      ...draft,
      errors: {
        pipe_outer_diameter: 'Введите число',
      },
    };

    expect(getDraftRowValidationErrors(staleDraft).outer_diameter_mm).toBeUndefined();
    expect(buildDraftRowParams(staleDraft).outer_diameter).toBeCloseTo(0.114);
  });

  it('не показывает устаревшие ошибки скрытых служебных полей Excel-строки', () => {
    const record = makePipe();
    const draft = applyInlineCellDraft(null, record, 'pipe_length', 55)!;
    const staleDraft = {
      ...draft,
      errors: {
        climate_city: 'Введите число',
        climate_region: 'Введите число',
        ambient_temperature_source: 'Введите число',
      },
    };

    expect(getDraftRowValidationErrors(staleDraft)).toEqual({});
    expect(buildDraftRowParams(staleDraft).pipe_length).toBe(55);
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
});
