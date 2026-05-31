import { describe, expect, it } from 'vitest';

import {
  CANDIDATE_COMPARE_EMPTY_VALUE,
  candidateCommercialValue,
  candidateCompareDisplayValue,
  candidateCompareValue,
  candidateElectricalFieldValue,
  candidateInstalledPowerPerMeterValue,
  candidateOrderCableLengthValue,
  candidatePowerPerMeterValue,
  candidateThreadSource,
  isCandidateCompareColumn,
  normalizeCandidateCompareText,
} from '@/pages/electrical/elecCalcCandidateCompareModel';
import type { ElectricalCandidate } from '@/types/calculation';

function candidate(overrides: Partial<ElectricalCandidate> = {}): ElectricalCandidate {
  return {
    id: 'candidate-1',
    project_id: 'project-1',
    object_id: 'object-1',
    variant_number: 1,
    cable_type: 'self_regulating',
    cable_source: 'builtin',
    cable_mark: 'ТЛТ-25',
    dedupe_key: 'candidate-key',
    mode: 'auto',
    status: 'applicable',
    priority: 0,
    is_recommended: false,
    is_pinned: false,
    is_applied: false,
    reason_code: null,
    reason_message: null,
    engineer_comment: null,
    params: {},
    results: {},
    cable_snapshot: null,
    warnings: [],
    risk_flags: [],
    candidate_meta: {},
    created_at: '2026-05-31T00:00:00.000Z',
    updated_at: '2026-05-31T00:00:00.000Z',
    ...overrides,
  };
}

describe('elecCalcCandidateCompareModel', () => {
  it('reads candidate numeric and commercial helper values without fallback math', () => {
    const row = candidate({
      results: {
        order_cable_length: '55.5',
        power_per_meter: '12.5',
        installed_power_per_meter: 20,
        commercial: {
          price_per_meter: '315.75',
        },
      },
    });

    expect(candidateOrderCableLengthValue(row)).toBe(55.5);
    expect(candidatePowerPerMeterValue(row)).toBe(12.5);
    expect(candidateInstalledPowerPerMeterValue(row)).toBe(20);
    expect(candidateCommercialValue(row, 'price_per_meter')).toBe('315.75');
    expect(candidateOrderCableLengthValue(candidate({ results: { order_cable_length: '' } }))).toBeUndefined();
    expect(candidateCommercialValue(candidate({ results: { commercial: [] } }), 'price_per_meter')).toBeUndefined();
  });

  it('maps candidate table field values to the same Russian labels as the page', () => {
    const row = candidate({
      cable_type: 'self_regulating_tt',
      params: {
        connection_type: 'star_3ph',
        aggressive_product: true,
        maintain_temperature: 80,
      },
      results: {
        selection_policy: 'lowest_cost',
        applied_selection_policy: 'manual_selection',
        winding_pitch: 60,
        num_circuits: 2,
        commercial: {
          stock_status: 'limited',
        },
      },
    });

    expect(candidateElectricalFieldValue('marked', row, true)).toBe(true);
    expect(candidateElectricalFieldValue('mode', row)).toBe('Авто');
    expect(candidateElectricalFieldValue('cable_type', row)).toBe('ТТН/ТТВ/ТТХ');
    expect(candidateElectricalFieldValue('selection_policy', row)).toBe('Дешевле');
    expect(candidateElectricalFieldValue('applied_selection_policy', row)).toBe('Ручной');
    expect(candidateElectricalFieldValue('connection_type', row)).toBe('Звезда');
    expect(candidateElectricalFieldValue('stock_status', row)).toBe('Ограничено');
    expect(candidateElectricalFieldValue('aggressive_product', row)).toBe(true);
    expect(candidateElectricalFieldValue('maintain_temperature', row)).toBe(80);
  });

  it('formats comparison display values and normalizes empty/service values', () => {
    const row = candidate({
      cable_mark: 'ТЛТ-25',
      results: {
        order_cable_length: 55.5,
        total_power: 1500,
        commercial: {
          stock_status: 'on_order',
        },
      },
    });

    expect(isCandidateCompareColumn('marked')).toBe(false);
    expect(isCandidateCompareColumn('actions')).toBe(false);
    expect(isCandidateCompareColumn('cable_mark')).toBe(true);
    expect(candidateCompareDisplayValue('marked', row)).toBe(CANDIDATE_COMPARE_EMPTY_VALUE);
    expect(candidateCompareDisplayValue('order_cable_length', row)).toBe('55,5');
    expect(candidateCompareDisplayValue('total_power', row)).toBe('1,50 кВт');
    expect(candidateCompareDisplayValue('stock_status', row)).toBe('Под заказ');
    expect(candidateCompareValue('cable_mark', row)).toBe('тлт-25');
    expect(normalizeCandidateCompareText(' — ')).toBe(CANDIDATE_COMPARE_EMPTY_VALUE);
    expect(candidateCompareValue('selection_reason', candidate({ reason_message: '' }))).toBe(
      CANDIDATE_COMPARE_EMPTY_VALUE,
    );
  });

  it('keeps candidate thread source metadata strict', () => {
    expect(candidateThreadSource(candidate({
      results: { number_of_threads_source: 'manual' },
    }))).toBe('manual');
    expect(candidateThreadSource(candidate({
      params: { number_of_threads_source: 'previous_result' },
      results: {},
    }))).toBe('previous_result');
    expect(candidateThreadSource(candidate({
      results: { number_of_threads_source: 'legacy' },
    }))).toBeNull();
  });
});
