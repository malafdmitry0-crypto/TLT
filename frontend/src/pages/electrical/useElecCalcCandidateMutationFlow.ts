import { useCallback, type Dispatch, type SetStateAction } from 'react';
import { message } from 'antd';
import { useMutation, useQueryClient } from '@tanstack/react-query';

import {
  addElectricalCandidateToFolder,
  applyElectricalCandidate,
  createElectricalCandidate,
  createElectricalCandidateFolder,
  deleteElectricalCandidateFolder,
  removeElectricalCandidateFromFolder,
  updateElectricalCandidate,
  updateElectricalCandidateFolder,
  type CableSource,
} from '@/api/calculations';
import { electricalDataQueryKeys } from '@/api/electricalQueryKeys';
import type { CalculationVariant } from '@/store/calculationVariantStore';
import type {
  ElectricalCalcSummary,
  ElectricalCandidate,
  ElectricalCandidateFolder,
} from '@/types/calculation';
import {
  candidateCustomFolderKey,
  type CandidateFolderKey,
} from '@/pages/electrical/elecCalcCandidateFolderModel';
import type { CableTypeKey } from '@/pages/electrical/elecCalcMainTableModel';
import type { CandidateFolderModalMode } from '@/pages/electrical/elecCalcPageModel';

type CandidateCreateArgs = {
  mode: 'auto' | 'manual';
  mark?: string | null;
};

type CandidatePatch = Partial<Pick<
  ElectricalCandidate,
  'priority' | 'is_recommended' | 'is_pinned' | 'status' | 'engineer_comment'
>>;

type CandidateUpdateArgs = {
  candidateId: string;
  patch: CandidatePatch;
};

type CandidateFolderToggleArgs = {
  folderId: string;
  candidateId: string;
  checked: boolean;
};

type UseElecCalcCandidateMutationFlowOptions = {
  projectId?: string;
  electricalVariantId: string;
  canMutate: boolean;
  variant: CalculationVariant;
  effectiveSource: CableSource;
  cableSizingModalObjectId: string | null;
  cableSizingEffectiveCableType: CableTypeKey;
  cableSizingCandidateParams: Record<string, unknown>;
  cableSizingCandidatesQueryKey: readonly unknown[];
  cableSizingCandidateFoldersQueryKey: readonly unknown[];
  candidateFolderName: string;
  candidateFolderModalMode: CandidateFolderModalMode;
  editingCandidateFolder: ElectricalCandidateFolder | null;
  activeCandidateFolderKey: CandidateFolderKey;
  setActiveCandidateFolderKey: Dispatch<SetStateAction<CandidateFolderKey>>;
  closeCandidateFolderModal: () => void;
  setElectricalQueryCalculation: (calculation: ElectricalCalcSummary) => void;
};

const CANDIDATE_READ_ONLY_ERROR =
  'Недостаточно прав для изменения вариантов подбора в этом проекте';

function requireCandidateMutation(canMutate: boolean) {
  if (!canMutate) throw new Error(CANDIDATE_READ_ONLY_ERROR);
}

export function useElecCalcCandidateMutationFlow({
  projectId,
  electricalVariantId,
  canMutate,
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
}: UseElecCalcCandidateMutationFlowOptions) {
  const qc = useQueryClient();

  const setCableSizingCandidateApplied = useCallback((
    candidateId: string | null,
    appliedCandidate?: ElectricalCandidate,
  ) => {
    qc.setQueryData<ElectricalCandidate[]>(
      cableSizingCandidatesQueryKey,
      (current) => {
        const next = current?.map((candidate) => {
          const isApplied = candidateId !== null && candidate.id === candidateId;
          return {
            ...candidate,
            ...(isApplied && appliedCandidate ? appliedCandidate : {}),
            is_applied: isApplied,
          };
        });
        if (!next || !appliedCandidate || next.some((candidate) => candidate.id === appliedCandidate.id)) {
          return next;
        }
        return [{ ...appliedCandidate, is_applied: true }, ...next];
      },
    );
  }, [cableSizingCandidatesQueryKey, qc]);

  const invalidateCableSizingCandidates = useCallback(() => {
    qc.invalidateQueries({
      queryKey: cableSizingCandidatesQueryKey,
    });
  }, [cableSizingCandidatesQueryKey, qc]);

  const invalidateCableSizingCandidateFolders = useCallback(() => {
    qc.invalidateQueries({
      queryKey: cableSizingCandidateFoldersQueryKey,
    });
  }, [cableSizingCandidateFoldersQueryKey, qc]);

  const createCandidateMut = useMutation({
    mutationFn: ({ mode, mark }: CandidateCreateArgs) => {
      requireCandidateMutation(canMutate);
      return createElectricalCandidate({
        project_id: projectId!,
        object_id: cableSizingModalObjectId!,
        variant_number: variant,
        electrical_variant_id: electricalVariantId,
        cable_type: cableSizingEffectiveCableType,
        cable_source: effectiveSource,
        mode,
        cable_mark: mode === 'manual' ? mark ?? null : null,
        electrical_params: cableSizingCandidateParams,
      });
    },
    onSuccess: ({ candidate, action }) => {
      invalidateCableSizingCandidates();
      const statusMessage = candidate.status === 'applicable'
        ? action === 'updated'
          ? 'Вариант обновлён'
          : 'Вариант добавлен'
        : candidate.reason_message || 'Вариант подбора сохранён с диагностикой';
      message[candidate.status === 'applicable' ? 'success' : 'warning'](statusMessage);
    },
    onError: (error: Error) => message.error(error.message),
  });

  const updateCandidateMut = useMutation({
    mutationFn: ({ candidateId, patch }: CandidateUpdateArgs) => {
      requireCandidateMutation(canMutate);
      return updateElectricalCandidate(candidateId, patch);
    },
    onSuccess: invalidateCableSizingCandidates,
    onError: (error: Error) => message.error(error.message),
  });

  const createCandidateFolderMut = useMutation({
    mutationFn: () => {
      requireCandidateMutation(canMutate);
      return createElectricalCandidateFolder({
        project_id: projectId!,
        object_id: cableSizingModalObjectId!,
        variant_number: variant,
        electrical_variant_id: electricalVariantId,
        name: candidateFolderName.trim(),
      });
    },
    onSuccess: (folder) => {
      invalidateCableSizingCandidateFolders();
      setActiveCandidateFolderKey(candidateCustomFolderKey(folder.id));
      closeCandidateFolderModal();
      message.success('Папка создана');
    },
    onError: (error: Error) => message.error(error.message),
  });

  const updateCandidateFolderMut = useMutation({
    mutationFn: ({ folderId, name }: { folderId: string; name: string }) => {
      requireCandidateMutation(canMutate);
      return updateElectricalCandidateFolder(folderId, { name });
    },
    onSuccess: () => {
      invalidateCableSizingCandidateFolders();
      closeCandidateFolderModal();
      message.success('Папка переименована');
    },
    onError: (error: Error) => message.error(error.message),
  });

  const deleteCandidateFolderMut = useMutation({
    mutationFn: (folderId: string) => {
      requireCandidateMutation(canMutate);
      return deleteElectricalCandidateFolder(folderId);
    },
    onSuccess: (_result, folderId) => {
      invalidateCableSizingCandidateFolders();
      if (activeCandidateFolderKey === candidateCustomFolderKey(folderId)) {
        setActiveCandidateFolderKey('all');
      }
      message.success('Папка удалена');
    },
    onError: (error: Error) => message.error(error.message),
  });

  const toggleCandidateFolderItemMut = useMutation({
    mutationFn: ({ folderId, candidateId, checked }: CandidateFolderToggleArgs) => {
      requireCandidateMutation(canMutate);
      return checked
        ? addElectricalCandidateToFolder(folderId, candidateId)
        : removeElectricalCandidateFromFolder(folderId, candidateId);
    },
    onSuccess: invalidateCableSizingCandidateFolders,
    onError: (error: Error) => message.error(error.message),
  });

  const applyCandidateMut = useMutation({
    mutationFn: (candidateId: string) => {
      requireCandidateMutation(canMutate);
      return applyElectricalCandidate(candidateId);
    },
    onMutate: async (candidateId) => {
      if (!canMutate) return { previous: undefined };
      await qc.cancelQueries({ queryKey: cableSizingCandidatesQueryKey });
      const previous = qc.getQueryData<ElectricalCandidate[]>(cableSizingCandidatesQueryKey);
      setCableSizingCandidateApplied(candidateId);
      return { previous };
    },
    onSuccess: ({ candidate, calculation }) => {
      setCableSizingCandidateApplied(String(candidate.id), candidate);
      setElectricalQueryCalculation(calculation);
      invalidateCableSizingCandidates();
      if (projectId) {
        qc.invalidateQueries({
          queryKey: electricalDataQueryKeys.queries(projectId, electricalVariantId),
        });
        qc.invalidateQueries({
          queryKey: electricalDataQueryKeys.capabilities(projectId, electricalVariantId),
        });
      }
      qc.invalidateQueries({ queryKey: ['project', projectId, 'objects', 'summary'] });
      message.success('Кандидат применён в электрорасчёт');
    },
    onError: (error: Error, _candidateId, context) => {
      if (context?.previous) qc.setQueryData(cableSizingCandidatesQueryKey, context.previous);
      message.error(error.message);
    },
  });

  const submitCandidateFolderModal = useCallback(() => {
    if (!canMutate) {
      message.warning(CANDIDATE_READ_ONLY_ERROR);
      return;
    }
    const name = candidateFolderName.trim();
    if (!name) {
      message.warning('Введите название папки');
      return;
    }
    if (candidateFolderModalMode === 'rename' && editingCandidateFolder) {
      updateCandidateFolderMut.mutate({ folderId: editingCandidateFolder.id, name });
      return;
    }
    createCandidateFolderMut.mutate();
  }, [
    candidateFolderModalMode,
    candidateFolderName,
    canMutate,
    createCandidateFolderMut,
    editingCandidateFolder,
    updateCandidateFolderMut,
  ]);

  return {
    createCandidateMut,
    updateCandidateMut,
    createCandidateFolderMut,
    updateCandidateFolderMut,
    deleteCandidateFolderMut,
    toggleCandidateFolderItemMut,
    applyCandidateMut,
    submitCandidateFolderModal,
  };
}
