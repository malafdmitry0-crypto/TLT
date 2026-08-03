// @vitest-environment node
import { describe, expect, it } from 'vitest';

import {
  countStaleObjects,
  isElectricalObjectStale,
  listStaleObjectIds,
} from '@/pages/electrical/elecCalcStaleModel';
import type { ElectricalCalcSummary, ElectricalQueryAssignment } from '@/types/calculation';

function calc(results: Record<string, unknown>): ElectricalCalcSummary {
  return {
    id: 'c1',
    object_id: 'o1',
    cable_type: 'self_regulating',
    cable_mark: null,
    variant_number: 1,
    results,
  };
}

function assignment(
  partial: Partial<ElectricalQueryAssignment> & { object_id: string },
): ElectricalQueryAssignment {
  return {
    system_type: 'self_regulating',
    assignment_state: 'ready',
    version: 1,
    ...partial,
  };
}

describe('elecCalcStaleModel', () => {
  it('detects assignment_state stale', () => {
    expect(isElectricalObjectStale(
      calc({ selected_cable: 'ТТН-10' }),
      assignment({ object_id: 'a', assignment_state: 'stale' }),
    )).toBe(true);
  });

  it('detects results.category stale and results.stale flag', () => {
    expect(isElectricalObjectStale(
      calc({ category: 'stale', message: 'old' }),
      assignment({ object_id: 'a' }),
    )).toBe(true);
    expect(isElectricalObjectStale(
      calc({ selected_cable: 'ТТН-10', stale: true }),
      assignment({ object_id: 'a' }),
    )).toBe(true);
  });

  it('ignores unassigned rows even with calc noise', () => {
    expect(isElectricalObjectStale(
      calc({ category: 'stale' }),
      assignment({ object_id: 'a', system_type: null, assignment_state: 'unassigned' }),
    )).toBe(false);
    expect(isElectricalObjectStale(calc({ category: 'stale' }), undefined)).toBe(false);
  });

  it('lists and counts stale object ids in order', () => {
    const calcs: Record<string, ElectricalCalcSummary | undefined> = {
      ok: calc({ selected_cable: 'ТТН-10' }),
      staleCalc: calc({ category: 'stale' }),
      staleAssign: calc({ selected_cable: 'ТТН-20' }),
      unassigned: calc({ category: 'stale' }),
    };
    const assignments = new Map<string, ElectricalQueryAssignment>([
      ['ok', assignment({ object_id: 'ok' })],
      ['staleCalc', assignment({ object_id: 'staleCalc' })],
      ['staleAssign', assignment({ object_id: 'staleAssign', assignment_state: 'stale' })],
      ['unassigned', assignment({ object_id: 'unassigned', system_type: null, assignment_state: 'unassigned' })],
    ]);
    const ids = ['ok', 'staleCalc', 'staleAssign', 'unassigned', 'missing'];
    expect(listStaleObjectIds(ids, calcs, assignments)).toEqual(['staleCalc', 'staleAssign']);
    expect(countStaleObjects(ids, calcs, assignments)).toBe(2);
  });
});
