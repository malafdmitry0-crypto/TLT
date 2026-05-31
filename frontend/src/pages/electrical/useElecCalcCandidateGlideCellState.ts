import { useCallback } from 'react';

import type { ElectricalCandidate } from '@/types/calculation';
import type {
  HeatCalcGlideGridCellAction,
  HeatCalcGlideGridCellState,
} from '@/utils/heatCalcGlideGrid';
import {
  candidateCompareDisplayValue,
} from '@/pages/electrical/elecCalcCandidateCompareModel';

type UseElecCalcCandidateGlideCellStateOptions = {
  markedCandidateSet: ReadonlySet<string>;
  candidateCompareActive: boolean;
  diffColumnKeys: ReadonlySet<string>;
  getColumnAlign: (columnKey: string) => HeatCalcGlideGridCellState['align'];
  getCellActions: (
    candidate: ElectricalCandidate,
    columnKey: string,
  ) => HeatCalcGlideGridCellAction[] | undefined;
};

export function useElecCalcCandidateGlideCellState({
  markedCandidateSet,
  candidateCompareActive,
  diffColumnKeys,
  getColumnAlign,
  getCellActions,
}: UseElecCalcCandidateGlideCellStateOptions) {
  return useCallback((
    candidate: ElectricalCandidate,
    columnKey: string,
  ): HeatCalcGlideGridCellState => {
    const marked = markedCandidateSet.has(candidate.id);
    const isDiff = (
      candidateCompareActive
      && marked
      && diffColumnKeys.has(columnKey)
    );
    return {
      displayValue: columnKey === 'marked'
        ? (marked ? '1' : '0')
        : columnKey === 'actions'
          ? ''
          : candidateCompareDisplayValue(columnKey, candidate),
      editable: false,
      align: getColumnAlign(columnKey),
      dirty: isDiff,
      error: candidate.status === 'error'
        ? candidate.reason_message ?? 'Ошибка варианта'
        : undefined,
      actions: getCellActions(candidate, columnKey),
    };
  }, [
    candidateCompareActive,
    diffColumnKeys,
    getCellActions,
    getColumnAlign,
    markedCandidateSet,
  ]);
}
