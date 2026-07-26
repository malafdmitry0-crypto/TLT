// @vitest-environment node
import { describe, expect, it } from 'vitest';
import {
  applyFormFieldDraft,
  applyInlineCellDraft,
  applyInlineFieldDraft,
  buildDraftRowParams,
  getDraftRowValidationErrors,
} from '@/utils/heatCalcInlineEdit';
import {
  makePipe,
  makeInvalidDeclaredThreeLayerPipe,
} from './heatCalcInlineEdit.test-helpers';

describe('heatCalcInlineEdit draft and errors', () => {

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

  it('подставляет Excel-строке те же дефолты, что и форме объекта', () => {
    const record = makePipe();
    record.id = 'new:pipe:1';
    record.params = {};

    let draft = applyInlineFieldDraft(null, record, 'name', 'Новая строка');
    draft = applyInlineFieldDraft(draft, record, 'outer_diameter_mm', 108);
    draft = applyInlineFieldDraft(draft, record, 'pipe_length', 10);
    draft = applyInlineFieldDraft(draft, record, 'wall_thickness_mm', 4);
    draft = applyInlineFieldDraft(draft, record, 'insulation_thickness_mm', 50);
    draft = applyInlineFieldDraft(draft, record, 'insulation_material', 'mineral_wool');
    draft = applyInlineFieldDraft(draft, record, 'ambient_temperature', -30);
    draft = applyInlineFieldDraft(draft, record, 'process_temperature', 80);

    const params = buildDraftRowParams(draft!);
    expect(params.name).toBe('Новая строка');
    expect(params.pipe_material).toBe('carbon_steel');
    expect(params.placement).toBe('outdoor');
    expect(params.insulation_temperature_basis).toBe('outdoor_winter');
    expect(params.insulation_layer_count).toBe('1');
    expect(params.insulation_cover_material).toBe('none');
    expect(params.environment).toBe('normal');
    expect(params.zone_classification).toBe('safe');
    expect(params.temperature_group).toBe('T1');
    expect(params.supply_voltage).toBe(220);
    expect(params.steam_tracing).toBe('no');
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

  it('не сохраняет ошибки скрытых слоёв после уменьшения количества слоёв до одного', () => {
    const record = makeInvalidDeclaredThreeLayerPipe();
    const draft = applyFormFieldDraft(null, record, 'insulation_layer_count', '1')!;
    const staleDraft = {
      ...draft,
      errors: {
        second_insulation_thickness_mm: 'Укажите значение',
        second_insulation_material: 'Выберите значение',
        third_insulation_thickness_mm: 'Укажите значение',
        third_insulation_material: 'Выберите значение',
      },
    };

    expect(getDraftRowValidationErrors(staleDraft, { enforceRequired: true })).toEqual({});
    const params = buildDraftRowParams(staleDraft, { enforceRequired: true });
    expect(params.insulation_layer_count).toBe('1');
    expect(params.insulation_layers).toEqual([
      { thickness: 0.05, material: 'mineral_wool' },
    ]);
  });
});
