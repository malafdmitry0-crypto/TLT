import { describe, expect, it } from 'vitest';
import { getHeatCalcFieldByColumn } from '@/domain/heatCalcFields';
import { validateHeatCalcField } from '@/domain/heatCalcFieldRules';
import {
  applyInlineCellDraft,
  buildDraftRowParams,
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
    params: {
      name: 'Pipe 1',
      outer_diameter: 0.108,
      wall_thickness: 0.004,
      pipe_length: 50,
      insulation_thickness: 0.05,
      insulation_material: 'mineral_wool',
      ambient_temperature: -20,
      process_temperature: 80,
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
    expect(validateHeatCalcField('outer_diameter_mm', 108, {
      objectType: 'pipe',
      values: { outer_diameter_mm: 108 },
    })).toBeNull();
  });

  it('exposes the same Phase 1 metadata to ObjectWizard inputs', () => {
    expect(heatCalcTextInputProps('pipe', 'name')).toEqual({ maxLength: 200 });
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
});
