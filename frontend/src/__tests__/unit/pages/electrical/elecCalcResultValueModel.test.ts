import { describe, expect, it } from 'vitest';

import {
  appliedIdopProjection,
  calcLayoutValues,
  cablePowerPerMeterValue,
  compactProvenanceValue,
  commercialNumber,
  commercialValue,
  currentElectricalCalc,
  engineeringResultNumber,
  engineeringResultValue,
  getCableMark,
  getCableMarkSource,
  getThreadSource,
  installedPowerPerMeterValue,
  numberText,
  objectResultNumber,
  orderCableLengthValue,
  powerText,
  resultNumber,
  selectionPolicyText,
  threadSourceTag,
  valueText,
} from '@/domain/electrical/elecCalcResultValueModel';
import type { ElectricalCalcSummary } from '@/types/calculation';
import type { ProjectObject } from '@/types/project';

function calc(overrides: Partial<ElectricalCalcSummary> = {}): ElectricalCalcSummary {
  return {
    id: 'calc-1',
    project_id: 'project-1',
    object_id: 'object-1',
    cable_type: 'self_regulating',
    cable_mark: 'ТЛТ-25',
    cable_mark_source: 'auto',
    variant_number: 1,
    params: {},
    results: {},
    created_at: '2026-05-31T00:00:00.000Z',
    updated_at: '2026-05-31T00:00:00.000Z',
    ...overrides,
  };
}

function projectObject(overrides: Partial<ProjectObject> = {}): ProjectObject {
  return {
    id: 'object-1',
    project_id: 'project-1',
    object_type: 'pipe',
    sort_order: 1,
    version: 1,
    params: {},
    results: {},
    is_valid: true,
    validation_errors: null,
    created_at: '2026-05-31T00:00:00.000Z',
    updated_at: '2026-05-31T00:00:00.000Z',
    ...overrides,
  };
}

describe('elecCalcResultValueModel', () => {
  it('projects the canonical applied I dop value and authority', () => {
    expect(appliedIdopProjection(calc({ results: {
      section_plan: {
        max_start_current_a: 18.5,
        max_start_current_source: 'section_catalog_derived',
      },
    } }))).toEqual({ state: 'value', valueA: 18.5, source: 'catalog' });

    expect(appliedIdopProjection(calc({ results: {
      section_plan: {
        max_start_current_a: 13.065,
        max_start_current_source: 'project_setting',
      },
    } }))).toEqual({ state: 'value', valueA: 13.065, source: 'project' });

    expect(appliedIdopProjection(calc({ results: {
      section_plan: {
        max_start_current_a: 12,
        max_start_current_source: 'manual_input',
      },
    } }))).toEqual({ state: 'value', valueA: 12, source: 'manual' });
  });

  it('keeps applied I dop lifecycle states explicit and never invents zero', () => {
    expect(appliedIdopProjection(undefined, 'pending')).toEqual({
      state: 'pending', valueA: null, source: null,
    });
    expect(appliedIdopProjection(undefined, 'error')).toEqual({
      state: 'error', valueA: null, source: null,
    });
    expect(appliedIdopProjection(calc({ results: {
      stale: true,
      section_plan: {
        max_start_current_a: 18.5,
        max_start_current_source: 'section_catalog_derived',
      },
    } }))).toEqual({ state: 'stale', valueA: null, source: null });
    expect(appliedIdopProjection(calc({ results: {
      error_code: 'SECTION_CURRENT_LIMIT_REQUIRED',
    } }))).toEqual({ state: 'error', valueA: null, source: null });
    expect(appliedIdopProjection(undefined)).toEqual({
      state: 'missing', valueA: null, source: null,
    });
    expect(appliedIdopProjection(calc({ results: {} }))).toEqual({
      state: 'missing', valueA: null, source: null,
    });
    expect(appliedIdopProjection(calc({
      params: { max_section_start_current_a: 25 },
      results: {},
    }))).toEqual({ state: 'missing', valueA: null, source: null });
  });

  it('reads cable mark from explicit field or selected_cable fallback', () => {
    expect(getCableMark(calc({ cable_mark: 'ТЛТ-30', results: { selected_cable: 'ТЛТ-25' } }))).toBe('ТЛТ-30');
    expect(getCableMark(calc({ cable_mark: null, results: { selected_cable: 'ТЛТ-25' } }))).toBe('ТЛТ-25');
    expect(getCableMark(calc({ cable_mark: null, results: { selected_cable: 25 } }))).toBeUndefined();
    expect(getCableMark(undefined)).toBeUndefined();
  });

  it('keeps only successful current calculations', () => {
    const success = calc({ cable_mark: null, results: { selected_cable: 'ТЛТ-25' } });

    expect(currentElectricalCalc(success)).toBe(success);
    expect(currentElectricalCalc(calc({ results: { error_code: 'bad_input', selected_cable: 'ТЛТ-25' } }))).toBeUndefined();
    expect(currentElectricalCalc(calc({ results: { category: 'validation', selected_cable: 'ТЛТ-25' } }))).toBeUndefined();
    expect(currentElectricalCalc(calc({ results: { stale: true, selected_cable: 'ТЛТ-25' } }))).toBeUndefined();
    expect(currentElectricalCalc(calc({ results: { stale: 'true', selected_cable: 'ТЛТ-25' } }))).toBeUndefined();
    expect(currentElectricalCalc(calc({ cable_mark: null, results: {} }))).toBeUndefined();
    expect(currentElectricalCalc(calc({ results: null }))).toBeUndefined();
  });

  it('formats result, commercial and object values without fallback calculations', () => {
    const row = calc({
      results: {
        order_cable_length: '55.5',
        installed_cable_length: 50,
        total_power: 1500,
        power_per_meter: '25',
        installed_power_per_meter: 20,
        commercial: {
          price_per_meter: '315.75',
        },
      },
    });

    expect(orderCableLengthValue(row)).toBe(55.5);
    expect(orderCableLengthValue(calc({ results: { order_cable_length: '' } }))).toBeUndefined();
    expect(cablePowerPerMeterValue(row)).toBe(25);
    expect(installedPowerPerMeterValue(row)).toBe(20);
    expect(resultNumber(row, 'installed_cable_length', 1)).toBe('50,0');
    expect(commercialValue(row, 'price_per_meter')).toBe('315.75');
    expect(commercialValue(calc({ results: { commercial: [] } }), 'price_per_meter')).toBeUndefined();
    expect(commercialNumber(row, 'price_per_meter', 2)).toBe('315,75');
    expect(objectResultNumber(projectObject({ results: { total_heat_loss_design: 1234.5 } }), 'total_heat_loss_design', 1))
      .toBe('1\u00a0234,5');
    expect(numberText(null, 1)).toBe('—');
    expect(numberText(12.345, 2)).toBe('12,35');
    expect(powerText(1500)).toBe('1,50 кВт');
    expect(valueText(true)).toBe('Да');
    expect(valueText('')).toBe('—');
  });

  it('reads canonical nested engineering values with legacy flat fallback and compacts provenance', () => {
    const canonical = calc({ results: {
      layout: {
        required_installed_length_m: 42.25,
        actual_installed_length_m: 44,
        required_order_length_m: 48.4,
      },
      installed_cable_length: 99,
      order_cable_length: 108.9,
      section_plan: { l_ogr_m: 18 },
      section_l_ogr_m: 17,
      provenance: {
        input_sources: { thread_count: 'manual' },
        catalogs: { section: { authority: 'database', version: 'approved-8' } },
        formula_version: 'electrical-tt-v2',
        formula_fingerprint: 'abcdef1234567890',
      },
    } });
    expect(engineeringResultValue(canonical, 'section_l_ogr_m')).toBe(18);
    expect(engineeringResultNumber(canonical, 'required_installed_length_m')).toBe('42,3');
    expect(engineeringResultValue(canonical, 'installed_cable_length')).toBe(44);
    expect(orderCableLengthValue(canonical)).toBe(48.4);
    expect(engineeringResultValue(calc({ results: { section_l_ogr_m: 17 } }), 'section_l_ogr_m')).toBe(17);
    expect(compactProvenanceValue(canonical)).toContain('electrical-tt-v2');
    expect(compactProvenanceValue(canonical)).toContain('abcdef123456');
    expect(compactProvenanceValue(calc({ results: { provenance: {} } }))).toBe('—');
  });

  it('maps selection policy and source metadata labels', () => {
    expect(selectionPolicyText('technical_minimum')).toBe('Технический');
    expect(selectionPolicyText('manual_selection')).toBe('Ручной');
    expect(selectionPolicyText('custom_policy')).toBe('custom_policy');
    expect(selectionPolicyText(undefined)).toBe('—');

    expect(getCableMarkSource(calc({ cable_mark_source: 'manual' }))).toBe('manual');
    expect(getCableMarkSource(calc({ cable_mark_source: 'auto', params: { cable_mark_source: 'manual' } })))
      .toBe('auto');
    expect(getCableMarkSource(calc({ cable_mark_source: undefined, params: { cable_mark_source: 'manual' } })))
      .toBe('manual');
  });

  it('keeps thread source and layout values strict', () => {
    expect(getThreadSource(calc({ results: { number_of_threads_source: 'auto' } }))).toBe('auto');
    expect(getThreadSource(calc({ params: { number_of_threads_source: 'previous_result' }, results: {} })))
      .toBe('previous_result');
    expect(getThreadSource(calc({ results: { number_of_threads_source: 'legacy' } }))).toBeNull();
    expect(threadSourceTag('manual')).toEqual({
      color: 'purple',
      label: 'ручн.',
      tooltip: 'Количество ниток задано вручную',
    });
    expect(threadSourceTag('default')?.label).toBe('по ум.');
    expect(threadSourceTag(null)).toBeNull();
    expect(calcLayoutValues(calc({ results: { winding_pitch: 60, num_circuits: 2 } }))).toEqual({
      windingPitchMm: 60,
      numberOfThreads: 2,
    });
    expect(calcLayoutValues(undefined)).toEqual({
      windingPitchMm: 0,
      numberOfThreads: 1,
    });
  });
});
