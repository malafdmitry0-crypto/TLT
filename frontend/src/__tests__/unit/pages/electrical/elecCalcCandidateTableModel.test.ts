import { describe, expect, it } from 'vitest';

import {
  buildDisplayedCandidateRows,
} from '@/pages/electrical/elecCalcCandidateTableModel';
import type { ElectricalCandidate } from '@/types/calculation';
import type { HeatCalcColumnValueAccessors, HeatCalcTableViewState } from '@/utils/heatCalcTableFindability';

function candidate(overrides: Partial<ElectricalCandidate> = {}): ElectricalCandidate {
  return {
    id: 'candidate-1',
    project_id: 'project-1',
    object_id: 'object-1',
    variant_number: 1,
    cable_type: 'self_regulating',
    cable_source: 'builtin',
    cable_mark: null,
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

describe('elecCalcCandidateTableModel', () => {
  it('applies candidate filters and sort, then keeps applied rows first', () => {
    const candidates = [
      candidate({ id: 'regular-20', results: { total_power: 20 } }),
      candidate({ id: 'applied-30', is_applied: true, results: { total_power: 30 } }),
      candidate({ id: 'regular-10', results: { total_power: 10 } }),
    ];
    const tableViewState: HeatCalcTableViewState = {
      filters: {
        total_power: { kind: 'numberRange', min: 15 },
      },
      sort: {
        columnKey: 'total_power',
        direction: 'asc',
      },
    };
    const accessors: HeatCalcColumnValueAccessors<ElectricalCandidate> = {
      total_power: (row) => row.results?.total_power,
    };

    expect(buildDisplayedCandidateRows(candidates, tableViewState, accessors).map((row) => row.id))
      .toEqual(['applied-30', 'regular-20']);
  });
});
