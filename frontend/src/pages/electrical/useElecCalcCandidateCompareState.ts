import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

import type { ElectricalCandidate } from '@/types/calculation';
import type { ElectricalCandidateColumnKey } from '@/utils/electricalCandidateTableColumns';
import type { HeatCalcTableViewState } from '@/utils/heatCalcTableFindability';
import {
  buildCandidateCompareDiffColumnKeys,
  buildCandidateColumnValueAccessors,
} from '@/domain/electrical/elecCalcCandidateCompareModel';
import {
  buildDisplayedCandidateRows,
  filterMarkedCandidateRows,
} from '@/pages/electrical/elecCalcCandidateTableModel';

type UseElecCalcCandidateCompareStateOptions = {
  candidatesByActiveFolder: readonly ElectricalCandidate[];
  candidateTableViewState: HeatCalcTableViewState;
  visibleCandidateColumnMetas: readonly { key: ElectricalCandidateColumnKey }[];
  resetKey: unknown;
};

export function useElecCalcCandidateCompareState({
  candidatesByActiveFolder,
  candidateTableViewState,
  visibleCandidateColumnMetas,
  resetKey,
}: UseElecCalcCandidateCompareStateOptions) {
  const [markedCandidateIds, setMarkedCandidateIds] = useState<string[]>([]);
  const previousResetKeyRef = useRef(resetKey);
  const markedCandidateSet = useMemo(
    () => new Set(markedCandidateIds),
    [markedCandidateIds],
  );
  const candidateColumnValueAccessors = useMemo(
    () => buildCandidateColumnValueAccessors(visibleCandidateColumnMetas, markedCandidateSet),
    [markedCandidateSet, visibleCandidateColumnMetas],
  );
  const resetMarkedCandidates = useCallback(() => {
    setMarkedCandidateIds([]);
  }, []);
  useEffect(() => {
    if (previousResetKeyRef.current === resetKey) return;
    previousResetKeyRef.current = resetKey;
    resetMarkedCandidates();
  }, [resetKey, resetMarkedCandidates]);
  const toggleCandidateMarked = useCallback((candidateId: string, checked: boolean) => {
    setMarkedCandidateIds((current) => {
      if (checked) {
        return current.includes(candidateId) ? current : [...current, candidateId];
      }
      return current.filter((id) => id !== candidateId);
    });
  }, []);
  const toggleCandidateMarkedByRow = useCallback((
    candidate: ElectricalCandidate,
    checked: boolean,
  ) => {
    toggleCandidateMarked(candidate.id, checked);
  }, [toggleCandidateMarked]);

  const displayedCandidates = useMemo(
    () => buildDisplayedCandidateRows(
      candidatesByActiveFolder,
      candidateTableViewState,
      candidateColumnValueAccessors,
    ),
    [candidatesByActiveFolder, candidateColumnValueAccessors, candidateTableViewState],
  );
  const displayedMarkedCandidates = useMemo(
    () => filterMarkedCandidateRows(displayedCandidates, markedCandidateSet),
    [displayedCandidates, markedCandidateSet],
  );
  const compareActive = displayedMarkedCandidates.length >= 2;
  const diffColumnKeys = useMemo(
    () => buildCandidateCompareDiffColumnKeys(displayedMarkedCandidates, visibleCandidateColumnMetas),
    [displayedMarkedCandidates, visibleCandidateColumnMetas],
  );
  const isCandidateMarked = useCallback(
    (candidateId: string) => markedCandidateSet.has(candidateId),
    [markedCandidateSet],
  );
  const isCompareDiffCell = useCallback((
    candidate: ElectricalCandidate,
    columnKey: ElectricalCandidateColumnKey,
  ) => compareActive && markedCandidateSet.has(candidate.id) && diffColumnKeys.has(columnKey),
  [compareActive, diffColumnKeys, markedCandidateSet]);
  const candidateRowClassName = useCallback((candidate: ElectricalCandidate) => [
    candidate.status === 'error' ? 'electrical-cable-sizing-table__row--error' : '',
    compareActive && markedCandidateSet.has(candidate.id)
      ? 'electrical-cable-sizing-table__row--compared'
      : '',
  ].filter(Boolean).join(' '), [compareActive, markedCandidateSet]);

  return {
    markedCandidateIds,
    markedCandidateSet,
    candidateColumnValueAccessors,
    resetMarkedCandidates,
    toggleCandidateMarked,
    toggleCandidateMarkedByRow,
    displayedCandidates,
    displayedMarkedCandidates,
    compareActive,
    diffColumnKeys,
    isCandidateMarked,
    isCompareDiffCell,
    candidateRowClassName,
  };
}
