import { useCallback } from 'react';
import type { MenuProps } from 'antd';

import type {
  ElectricalCandidate,
  ElectricalCandidateFolder,
} from '@/types/calculation';
import type { HeatCalcGlideGridCellAction } from '@/utils/heatCalcGlideGrid';

type UpdateCandidatePatch = Partial<Pick<ElectricalCandidate, 'is_pinned' | 'status'>>;

type UpdateCandidateArgs = {
  candidateId: string;
  patch: UpdateCandidatePatch;
};

type ToggleCandidateFolderItemArgs = {
  folderId: string;
  candidateId: string;
  checked: boolean;
};

type UseElecCalcCandidateGlideActionsOptions = {
  candidateFolders: readonly ElectricalCandidateFolder[];
  canMutate: boolean;
  applyCandidatePending: boolean;
  updateCandidatePending: boolean;
  toggleCandidateFolderItemPending: boolean;
  onApplyCandidate: (candidateId: string) => void;
  onUpdateCandidate: (args: UpdateCandidateArgs) => void;
  onToggleCandidateFolderItem: (args: ToggleCandidateFolderItemArgs) => void;
};

export function useElecCalcCandidateGlideActions({
  candidateFolders,
  canMutate,
  applyCandidatePending,
  updateCandidatePending,
  toggleCandidateFolderItemPending,
  onApplyCandidate,
  onUpdateCandidate,
  onToggleCandidateFolderItem,
}: UseElecCalcCandidateGlideActionsOptions) {
  const getElectricalCandidateGlideCellActions = useCallback((
    candidate: ElectricalCandidate,
    columnKey: string,
  ): HeatCalcGlideGridCellAction[] | undefined => {
    if (columnKey !== 'actions') return undefined;
    return [
      {
        key: 'apply',
        label: candidate.is_applied ? 'Выбран' : 'Выбрать',
        disabled: !canMutate || candidate.status !== 'applicable' || applyCandidatePending,
      },
      {
        key: 'folder',
        label: 'Папка',
        disabled: !canMutate || toggleCandidateFolderItemPending,
      },
      {
        key: 'exclude',
        label: candidate.status === 'excluded' ? 'Вернуть' : 'Искл.',
        disabled: !canMutate || updateCandidatePending,
      },
    ];
  }, [
    applyCandidatePending,
    canMutate,
    toggleCandidateFolderItemPending,
    updateCandidatePending,
  ]);

  const handleElectricalCandidateGlideCellAction = useCallback((
    candidate: ElectricalCandidate,
    columnKey: string,
    actionKey: string,
  ) => {
    if (columnKey !== 'actions') return;
    if (!canMutate) return;
    if (actionKey === 'apply') {
      if (candidate.status !== 'applicable' || candidate.is_applied) return;
      onApplyCandidate(candidate.id);
      return;
    }
    if (actionKey === 'exclude') {
      onUpdateCandidate({
        candidateId: candidate.id,
        patch: {
          status: candidate.status === 'excluded' ? 'applicable' : 'excluded',
        },
      });
    }
  }, [canMutate, onApplyCandidate, onUpdateCandidate]);

  const candidateFolderMenuItems = useCallback((candidate: ElectricalCandidate): MenuProps['items'] => {
    const favoriteItem = {
      key: 'favorite',
      label: `${candidate.is_pinned ? '✓ ' : ''}Избранное`,
      disabled: !canMutate || updateCandidatePending,
      onClick: () => {
        if (!canMutate) return;
        onUpdateCandidate({
          candidateId: candidate.id,
          patch: {
            is_pinned: !candidate.is_pinned,
          },
        });
      },
    };
    const customFolderItems = candidateFolders.length > 0
      ? candidateFolders.map((folder) => {
          const checked = folder.candidate_ids.includes(candidate.id);
          return {
            key: folder.id,
            label: `${checked ? '✓ ' : ''}${folder.name}`,
            disabled: !canMutate || toggleCandidateFolderItemPending,
            onClick: () => {
              if (!canMutate) return;
              onToggleCandidateFolderItem({
                folderId: folder.id,
                candidateId: candidate.id,
                checked: !checked,
              });
            },
          };
        })
      : [{ key: 'empty', label: 'Создайте папку', disabled: true }];
    return [
      favoriteItem,
      { key: 'folders-divider', type: 'divider' as const },
      ...customFolderItems,
    ];
  }, [
    candidateFolders,
    canMutate,
    onToggleCandidateFolderItem,
    onUpdateCandidate,
    toggleCandidateFolderItemPending,
    updateCandidatePending,
  ]);

  const getElectricalCandidateGlideActionMenuItems = useCallback((
    candidate: ElectricalCandidate,
    columnKey: string,
    actionKey: string,
  ) => {
    if (columnKey === 'actions' && actionKey === 'folder') {
      return candidateFolderMenuItems(candidate);
    }
    return null;
  }, [candidateFolderMenuItems]);

  return {
    getElectricalCandidateGlideCellActions,
    handleElectricalCandidateGlideCellAction,
    candidateFolderMenuItems,
    getElectricalCandidateGlideActionMenuItems,
  };
}
