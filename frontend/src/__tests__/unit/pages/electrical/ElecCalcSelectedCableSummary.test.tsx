import { render, screen, within } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import ElecCalcSelectedCableSummary from '@/pages/electrical/ElecCalcSelectedCableSummary';
import type { ElectricalCalcSummary, ElectricalCandidate } from '@/types/calculation';

function calc(overrides: Partial<ElectricalCalcSummary> = {}): ElectricalCalcSummary {
  return {
    id: 'calc-1',
    object_id: 'object-1',
    cable_type: 'self_regulating',
    cable_mark: 'ТЛТ-30',
    variant_number: 1,
    results: {
      total_power: 1500,
      order_cable_length: 55.55,
      current: 6.789,
    },
    ...overrides,
  };
}

function candidate(overrides: Partial<ElectricalCandidate> = {}): ElectricalCandidate {
  return {
    id: 'candidate-1',
    project_id: 'project-1',
    object_id: 'object-1',
    variant_number: 1,
    cable_type: 'self_regulating_tt',
    cable_source: 'builtin',
    cable_mark: 'ТЛТ-45Т',
    dedupe_key: 'candidate-1',
    mode: 'manual',
    status: 'applicable',
    priority: 0,
    is_recommended: false,
    is_pinned: false,
    is_applied: true,
    params: {},
    results: {
      total_power: 2200,
      order_cable_length: 66.64,
      current: 10.123,
    },
    warnings: [],
    risk_flags: [],
    candidate_meta: {},
    created_at: '2026-06-01T00:00:00Z',
    updated_at: '2026-06-01T00:00:00Z',
    ...overrides,
  };
}

describe('ElecCalcSelectedCableSummary', () => {
  it('shows empty state when cable mark is absent', () => {
    render(
      <ElecCalcSelectedCableSummary
        appliedCandidate={null}
        calc={calc({ cable_mark: null, results: null })}
        fallbackCableType="self_regulating"
      />,
    );

    expect(screen.getByText('Выбранный кабель:')).toBeInTheDocument();
    expect(screen.getByText('Кабель не выбран')).toBeInTheDocument();
  });

  it('formats current calculation summary', () => {
    render(
      <ElecCalcSelectedCableSummary
        appliedCandidate={null}
        calc={calc()}
        fallbackCableType="self_regulating"
      />,
    );

    const summary = screen.getByText('Выбранный кабель:')
      .closest('.electrical-selected-cable-summary') as HTMLElement | null;
    expect(summary).not.toBeNull();
    expect(within(summary!).getByText('ТЛТ-30')).toBeInTheDocument();
    expect(within(summary!).getByText('Саморегулирующийся')).toBeInTheDocument();
    expect(within(summary!).getByText('1,50 кВт')).toBeInTheDocument();
    expect(within(summary!).getByText(/55,6 м/)).toBeInTheDocument();
    expect(within(summary!).getByText(/6,79 А/)).toBeInTheDocument();
  });

  it('prefers applied candidate over current calculation', () => {
    render(
      <ElecCalcSelectedCableSummary
        appliedCandidate={candidate()}
        calc={calc()}
        fallbackCableType="self_regulating"
      />,
    );

    expect(screen.getByText('ТЛТ-45Т')).toBeInTheDocument();
    expect(screen.getByText('ТТН/ТТВ/ТТХ')).toBeInTheDocument();
    expect(screen.getByText('2,20 кВт')).toBeInTheDocument();
    expect(screen.getByText(/66,6 м/)).toBeInTheDocument();
    expect(screen.getByText(/10,12 А/)).toBeInTheDocument();
    expect(screen.queryByText('ТЛТ-30')).not.toBeInTheDocument();
  });
});
