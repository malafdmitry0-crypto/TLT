import { describe, expect, it } from 'vitest';

import {
  calcLayoutValues,
  cablePowerPerMeterValue,
  commercialNumber,
  commercialValue,
  currentElectricalCalc,
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
