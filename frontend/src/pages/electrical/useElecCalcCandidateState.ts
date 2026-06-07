import { useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';

import {
  listElectricalCandidateFolders,
  listElectricalCandidates,
  type CableSource,
} from '@/api/calculations';
import type { ElectricalCalcSummary } from '@/types/calculation';
import type { CalculationVariant } from '@/store/calculationVariantStore';
import type { HeatCalcTableViewState } from '@/utils/heatCalcTableFindability';
import { useElecCalcCableSizingModalState } from '@/pages/electrical/useElecCalcCableSizingModalState';
import { useElecCalcColumnViewModel } from '@/pages/electrical/useElecCalcColumnViewModel';
import { useElecCalcCandidateCompareState } from '@/pages/electrical/useElecCalcCandidateCompareState';
import { useElecCalcCandidateFolderUiState } from '@/pages/electrical/useElecCalcCandidateFolderUiState';
import { useElecCalcCandidateFolderViewModel } from '@/pages/electrical/useElecCalcCandidateFolderViewModel';
import { useElecCalcCandidateMutationFlow } from '@/pages/electrical/useElecCalcCandidateMutationFlow';

type CableSizingModalState = ReturnType<typeof useElecCalcCableSizingModalState>;
type ElectricalColumnViewModel = ReturnType<typeof useElecCalcColumnViewModel>;

type UseElecCalcCandidateStateOptions = {
  projectId: string | undefined;
  variant: CalculationVariant;
  effectiveSource: CableSource;
  setElectricalQueryCalculation: (calculation: ElectricalCalcSummary) => void;
  cableSizingModal: CableSizingModalState;
  candidateTableViewState: HeatCalcTableViewState;
  visibleCandidateColumnMetas: ElectricalColumnViewModel['visibleCandidateColumnMetas'];
};

/**
 * Группирует кандидатскую логику cable-sizing-модалки: UI-состояние папок,
 * мутации, серверные запросы кандидатов/папок, view-model папок и compare-режим.
 *
 * Glide-actions / glide-cell-state кандидатов сюда НЕ входят: они зависят от
 * candidateGlideColumnMetaByKey, который, в свою очередь, строится из
 * candidateEnumOptionsByColumn (filterOptions), а тот — из cableSizingCandidates.
 * Этот цикл на уровне страницы разрывается тем, что glide-часть остаётся в
 * ElecCalcPage после построения колонок.
 */
export function useElecCalcCandidateState({
  projectId,
  variant,
  effectiveSource,
  setElectricalQueryCalculation,
  cableSizingModal,
  candidateTableViewState,
  visibleCandidateColumnMetas,
}: UseElecCalcCandidateStateOptions) {
  const {
    activeCandidateFolderKey,
    setActiveCandidateFolderKey,
    candidateFolderModalMode,
    candidateFolderModalOpen,
    candidateFolderName,
    setCandidateFolderName,
    editingCandidateFolder,
    closeCandidateFolderModal,
    openCreateCandidateFolderModal,
    openRenameCandidateFolderModal,
  } = useElecCalcCandidateFolderUiState();

  const {
    objectId: cableSizingModalObjectId,
    effectiveCableType: cableSizingEffectiveCableType,
    candidateParams: cableSizingCandidateParams,
    candidatesQueryKey: cableSizingCandidatesQueryKey,
    candidateFoldersQueryKey: cableSizingCandidateFoldersQueryKey,
  } = cableSizingModal;

  const {
    createCandidateMut,
    updateCandidateMut,
    createCandidateFolderMut,
    updateCandidateFolderMut,
    deleteCandidateFolderMut,
    toggleCandidateFolderItemMut,
    applyCandidateMut,
    submitCandidateFolderModal,
  } = useElecCalcCandidateMutationFlow({
    projectId,
    variant,
    effectiveSource,
    cableSizingModalObjectId,
    cableSizingEffectiveCableType,
    cableSizingCandidateParams,
    cableSizingCandidatesQueryKey,
    cableSizingCandidateFoldersQueryKey,
    candidateFolderName,
    candidateFolderModalMode,
    editingCandidateFolder,
    activeCandidateFolderKey,
    setActiveCandidateFolderKey,
    closeCandidateFolderModal,
    setElectricalQueryCalculation,
  });

  const {
    data: cableSizingCandidates = [],
    isFetching: isCableSizingCandidatesFetching,
  } = useQuery({
    queryKey: cableSizingCandidatesQueryKey,
    queryFn: () =>
      listElectricalCandidates(projectId!, cableSizingModalObjectId!, variant),
    enabled: !!projectId && !!cableSizingModalObjectId,
  });
  const { data: cableSizingCandidateFolders = [] } = useQuery({
    queryKey: cableSizingCandidateFoldersQueryKey,
    queryFn: () =>
      listElectricalCandidateFolders(projectId!, cableSizingModalObjectId!, variant),
    enabled: !!projectId && !!cableSizingModalObjectId,
  });

  const {
    activeCustomCandidateFolder,
    candidatesByActiveFolder: cableSizingCandidatesByActiveFolder,
    candidateFolderCounts,
  } = useElecCalcCandidateFolderViewModel({
    activeCandidateFolderKey,
    setActiveCandidateFolderKey,
    candidates: cableSizingCandidates,
    candidateFolders: cableSizingCandidateFolders,
  });

  const {
    markedCandidateSet: markedCableSizingCandidateSet,
    candidateColumnValueAccessors,
    resetMarkedCandidates: resetMarkedCableSizingCandidates,
    toggleCandidateMarkedByRow: toggleElectricalCandidateGlideMarked,
    displayedCandidates: displayedCableSizingCandidates,
    displayedMarkedCandidates: displayedMarkedCableSizingCandidates,
    compareActive: cableSizingCandidateCompareActive,
    diffColumnKeys: candidateCompareDiffColumnKeys,
    candidateRowClassName: cableSizingCandidateRowClassName,
  } = useElecCalcCandidateCompareState({
    candidatesByActiveFolder: cableSizingCandidatesByActiveFolder,
    candidateTableViewState,
    visibleCandidateColumnMetas,
    resetKey: activeCandidateFolderKey,
  });

  const appliedCableSizingCandidate = useMemo(
    () => cableSizingCandidates.find((candidate) => candidate.is_applied) ?? null,
    [cableSizingCandidates],
  );

  return {
    // folder UI state
    activeCandidateFolderKey,
    setActiveCandidateFolderKey,
    candidateFolderModalMode,
    candidateFolderModalOpen,
    candidateFolderName,
    setCandidateFolderName,
    editingCandidateFolder,
    closeCandidateFolderModal,
    openCreateCandidateFolderModal,
    openRenameCandidateFolderModal,
    // mutations
    createCandidateMut,
    updateCandidateMut,
    createCandidateFolderMut,
    updateCandidateFolderMut,
    deleteCandidateFolderMut,
    toggleCandidateFolderItemMut,
    applyCandidateMut,
    submitCandidateFolderModal,
    // server queries
    cableSizingCandidates,
    isCableSizingCandidatesFetching,
    cableSizingCandidateFolders,
    // folder view model
    activeCustomCandidateFolder,
    cableSizingCandidatesByActiveFolder,
    candidateFolderCounts,
    // compare state
    markedCableSizingCandidateSet,
    candidateColumnValueAccessors,
    resetMarkedCableSizingCandidates,
    toggleElectricalCandidateGlideMarked,
    displayedCableSizingCandidates,
    displayedMarkedCableSizingCandidates,
    cableSizingCandidateCompareActive,
    candidateCompareDiffColumnKeys,
    cableSizingCandidateRowClassName,
    appliedCableSizingCandidate,
  };
}
