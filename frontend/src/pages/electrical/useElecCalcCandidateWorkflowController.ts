/**
 * @module electrical/candidate-workflow-controller
 * @owner electrical
 * Owns: candidate folders/compare/mutations (via candidate state), candidate
 *   Glide columns, cell actions, cell state for the cable-sizing table surface.
 * Writes: none beyond sub-hooks (folder UI state, mark/compare set, mutations).
 * Does-not: main electrical table columns/layout, batch jobs, mark/sizing open
 *   gates, column preference persistence, summary chrome.
 */
import { useCallback, useMemo } from 'react';

import type { CableSource } from '@/api/calculations';
import type { ElectricalCalcSummary } from '@/types/calculation';
import type { CalculationVariant } from '@/store/calculationVariantStore';
import type { HeatCalcTableViewState } from '@/utils/heatCalcTableFindability';
import type {
  ElectricalCandidateColumnKey,
  ElectricalCandidateResolvedColumnMeta,
} from '@/utils/electricalCandidateTableColumns';
import {
  buildCandidateEnumOptionsByColumn,
  filterKindForCandidateColumn,
} from '@/domain/electrical/elecCalcTableFilterModel';
import { buildElectricalCandidateGlideColumns } from '@/utils/electricalCandidateGlideGrid';
import { useElecCalcCableSizingModalState } from '@/pages/electrical/useElecCalcCableSizingModalState';
import { useElecCalcCandidateGlideActions } from '@/pages/electrical/useElecCalcCandidateGlideActions';
import { useElecCalcCandidateGlideCellState } from '@/pages/electrical/useElecCalcCandidateGlideCellState';
import { useElecCalcCandidateState } from '@/pages/electrical/useElecCalcCandidateState';

type CableSizingModalState = ReturnType<typeof useElecCalcCableSizingModalState>;

export type UseElecCalcCandidateWorkflowControllerArgs = {
  projectId: string | undefined;
  electricalVariantId: string;
  canMutate: boolean;
  variant: CalculationVariant;
  effectiveSource: CableSource;
  setElectricalQueryCalculation: (calculation: ElectricalCalcSummary) => void;
  cableSizingModal: CableSizingModalState;
  candidateTableViewState: HeatCalcTableViewState;
  visibleCandidateColumnMetas: ElectricalCandidateResolvedColumnMeta[];
};

export function useElecCalcCandidateWorkflowController(
  args: UseElecCalcCandidateWorkflowControllerArgs,
) {
  const {
    projectId,
    electricalVariantId,
    canMutate,
    variant,
    effectiveSource,
    setElectricalQueryCalculation,
    cableSizingModal,
    candidateTableViewState,
    visibleCandidateColumnMetas,
  } = args;

  const candidate = useElecCalcCandidateState({
    projectId,
    electricalVariantId,
    canMutate,
    variant,
    effectiveSource,
    setElectricalQueryCalculation,
    cableSizingModal,
    candidateTableViewState,
    visibleCandidateColumnMetas,
  });

  const {
    cableSizingCandidates,
    candidateColumnValueAccessors,
    cableSizingCandidateFolders,
    applyCandidateMut,
    updateCandidateMut,
    toggleCandidateFolderItemMut,
    markedCableSizingCandidateSet,
    cableSizingCandidateCompareActive,
    candidateCompareDiffColumnKeys,
  } = candidate;

  const candidateEnumOptionsByColumn = useMemo(
    () => buildCandidateEnumOptionsByColumn(
      cableSizingCandidates,
      visibleCandidateColumnMetas,
      candidateColumnValueAccessors,
    ),
    [
      cableSizingCandidates,
      candidateColumnValueAccessors,
      visibleCandidateColumnMetas,
    ],
  );

  const candidateGlideColumnMetaByKey = useMemo(
    () => new Map<ElectricalCandidateColumnKey, ElectricalCandidateResolvedColumnMeta>(
      visibleCandidateColumnMetas.map((column) => [column.key, column]),
    ),
    [visibleCandidateColumnMetas],
  );

  const electricalCandidateGlideColumns = useMemo(
    () => buildElectricalCandidateGlideColumns({
      columns: [...visibleCandidateColumnMetas],
      enumOptionsByColumn: candidateEnumOptionsByColumn,
      getFilterKind: filterKindForCandidateColumn,
    }),
    [candidateEnumOptionsByColumn, visibleCandidateColumnMetas],
  );

  const {
    getElectricalCandidateGlideCellActions,
    handleElectricalCandidateGlideCellAction,
    getElectricalCandidateGlideActionMenuItems,
  } = useElecCalcCandidateGlideActions({
    candidateFolders: cableSizingCandidateFolders,
    canMutate,
    applyCandidatePending: applyCandidateMut.isPending,
    updateCandidatePending: updateCandidateMut.isPending,
    toggleCandidateFolderItemPending: toggleCandidateFolderItemMut.isPending,
    onApplyCandidate: applyCandidateMut.mutate,
    onUpdateCandidate: updateCandidateMut.mutate,
    onToggleCandidateFolderItem: toggleCandidateFolderItemMut.mutate,
  });

  const getElectricalCandidateGlideColumnAlign = useCallback(
    (columnKey: string) => candidateGlideColumnMetaByKey.get(
      columnKey as ElectricalCandidateColumnKey,
    )?.align,
    [candidateGlideColumnMetaByKey],
  );

  const getElectricalCandidateGlideCellState = useElecCalcCandidateGlideCellState({
    markedCandidateSet: markedCableSizingCandidateSet,
    candidateCompareActive: cableSizingCandidateCompareActive,
    diffColumnKeys: candidateCompareDiffColumnKeys,
    getColumnAlign: getElectricalCandidateGlideColumnAlign,
    getCellActions: getElectricalCandidateGlideCellActions,
  });

  return {
    candidate,
    electricalCandidateGlideColumns,
    getElectricalCandidateGlideCellState,
    handleElectricalCandidateGlideCellAction,
    getElectricalCandidateGlideActionMenuItems,
  };
}
