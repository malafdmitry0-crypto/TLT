import { renderHook } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import type { ElectricalCandidate } from '@/types/calculation';
import { useElecCalcCandidateGlideCellState } from '@/pages/electrical/useElecCalcCandidateGlideCellState';

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
    created_at: '2026-06-01T00:00:00.000Z',
    updated_at: '2026-06-01T00:00:00.000Z',
    ...overrides,
  };
}

function setup(
  options: Partial<Parameters<typeof useElecCalcCandidateGlideCellState>[0]> = {},
) {
  const getColumnAlign = vi.fn((columnKey: string) =>
    columnKey === 'total_power' ? 'right' : undefined,
  );
  const getCellActions = vi.fn((_: ElectricalCandidate, columnKey: string) =>
    columnKey === 'actions'
      ? [{ key: 'apply', label: 'Выбрать', disabled: false }]
      : undefined,
  );

  return {
    getColumnAlign,
    getCellActions,
    ...renderHook(() => useElecCalcCandidateGlideCellState({
      markedCandidateSet: new Set(['candidate-1']),
      candidateCompareActive: true,
      diffColumnKeys: new Set(['total_power']),
      getColumnAlign,
      getCellActions,
      ...options,
    })),
  };
}

describe('useElecCalcCandidateGlideCellState', () => {
  it('returns marked display state and delegates actions to the page callback', () => {
    const row = candidate();
    const { result, getCellActions } = setup();

    expect(result.current(row, 'marked')).toEqual({
      displayValue: '1',
      editable: false,
      align: undefined,
      dirty: false,
      error: undefined,
      actions: undefined,
    });
    expect(result.current(row, 'actions')).toMatchObject({
      displayValue: '',
      editable: false,
      actions: [{ key: 'apply', label: 'Выбрать', disabled: false }],
    });
    expect(getCellActions).toHaveBeenCalledWith(row, 'actions');
  });

  it('marks compare diff cells dirty only for marked rows while preserving alignment', () => {
    const row = candidate({ results: { total_power: 1500 } });
    const { result } = setup();

    expect(result.current(row, 'total_power')).toMatchObject({
      displayValue: '1,50 кВт',
      editable: false,
      align: 'right',
      dirty: true,
    });

    const { result: unmarkedResult } = setup({
      markedCandidateSet: new Set(),
    });

    expect(unmarkedResult.current(row, 'total_power')).toMatchObject({
      dirty: false,
    });
  });

  it('returns candidate error text without coupling to action handlers', () => {
    const row = candidate({
      status: 'error',
      reason_message: null,
    });
    const { result } = setup();

    expect(result.current(row, 'cable_mark')).toMatchObject({
      displayValue: 'ТЛТ-25',
      error: 'Ошибка варианта',
    });
  });
});
