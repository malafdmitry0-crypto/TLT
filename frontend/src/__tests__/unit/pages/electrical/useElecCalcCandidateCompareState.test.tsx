import { act, renderHook } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { useElecCalcCandidateCompareState } from '@/pages/electrical/useElecCalcCandidateCompareState';
import type { ElectricalCandidate } from '@/types/calculation';
import type { HeatCalcTableViewState } from '@/utils/heatCalcTableFindability';

function candidate(
  id: string,
  cableMark: string,
  options: Partial<ElectricalCandidate> = {},
): ElectricalCandidate {
  return {
    id,
    project_id: 'project-1',
    object_id: 'object-1',
    variant_number: 1,
    cable_type: 'self_regulating',
    cable_source: 'builtin',
    cable_mark: cableMark,
    dedupe_key: id,
    mode: 'auto',
    status: 'applicable',
    priority: 0,
    is_recommended: false,
    is_pinned: false,
    is_applied: false,
    params: {},
    results: {},
    warnings: [],
    risk_flags: [],
    candidate_meta: {},
    created_at: '',
    updated_at: '',
    ...options,
  };
}

const columns = [
  { key: 'marked' },
  { key: 'cable_mark' },
  { key: 'status' },
  { key: 'actions' },
];
const tableViewState: HeatCalcTableViewState = { filters: {} };

describe('useElecCalcCandidateCompareState', () => {
  it('tracks marked candidates and detects visible diff columns', () => {
    const { result } = renderHook(() => useElecCalcCandidateCompareState({
      candidatesByActiveFolder: [
        candidate('candidate-1', 'ТЛТ-10'),
        candidate('candidate-2', 'ТЛТ-25'),
      ],
      candidateTableViewState: tableViewState,
      visibleCandidateColumnMetas: columns,
      resetKey: 'all',
    }));

    expect(result.current.compareActive).toBe(false);
    expect(result.current.displayedCandidates.map((item) => item.id)).toEqual([
      'candidate-1',
      'candidate-2',
    ]);

    act(() => {
      result.current.toggleCandidateMarked('candidate-1', true);
      result.current.toggleCandidateMarkedByRow(candidate('candidate-2', 'ТЛТ-25'), true);
    });

    expect(result.current.markedCandidateIds).toEqual(['candidate-1', 'candidate-2']);
    expect(result.current.compareActive).toBe(true);
    expect(result.current.diffColumnKeys.has('cable_mark')).toBe(true);
    expect(result.current.isCompareDiffCell(candidate('candidate-1', 'ТЛТ-10'), 'cable_mark')).toBe(true);
    expect(result.current.candidateRowClassName(candidate('candidate-1', 'ТЛТ-10'))).toBe(
      'electrical-cable-sizing-table__row--compared',
    );

    act(() => {
      result.current.resetMarkedCandidates();
    });

    expect(result.current.markedCandidateIds).toEqual([]);
    expect(result.current.compareActive).toBe(false);
  });

  it('keeps applied candidates first and preserves error row class', () => {
    const { result } = renderHook(() => useElecCalcCandidateCompareState({
      candidatesByActiveFolder: [
        candidate('candidate-1', 'ТЛТ-10'),
        candidate('candidate-2', 'ТЛТ-25', { is_applied: true, status: 'error' }),
      ],
      candidateTableViewState: tableViewState,
      visibleCandidateColumnMetas: columns,
      resetKey: 'all',
    }));

    expect(result.current.displayedCandidates.map((item) => item.id)).toEqual([
      'candidate-2',
      'candidate-1',
    ]);
    expect(result.current.candidateRowClassName(candidate('candidate-2', 'ТЛТ-25', {
      status: 'error',
    }))).toBe('electrical-cable-sizing-table__row--error');
  });
});
