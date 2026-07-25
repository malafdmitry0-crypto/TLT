/**
 * @module electrical/object-action-modals
 * @owner electrical
 * @depends none (callbacks only)
 * @does-not heat
 *
 * Gates mark/sizing modals on assignment availability and applies preferred cable type.
 */
import { useCallback } from 'react';
import { appMessage as message } from '@/feedback/appFeedback';

import type { ProjectObject } from '@/types/project';
import type { CableTypeKey } from '@/domain/electrical/elecCalcMainTableModel';
import type { CandidateFolderKey } from '@/pages/electrical/elecCalcCandidateFolderModel';

export type UseElecCalcObjectActionModalsArgs = {
  getObjectActionDisabledReason: (obj: ProjectObject) => string | null;
  preferredObjectActionCableType: (obj: ProjectObject) => CableTypeKey | null;
  objectActionCableType: (objectId: string) => CableTypeKey | null | undefined;
  openCableMarkModalState: (obj: ProjectObject) => void;
  changeCableMarkModalCableType: (type: CableTypeKey) => void;
  activateRowId: (objectId: string) => void;
  openCableSizingModalState: (obj: ProjectObject) => void;
  setCableSizingCableType: (type: CableTypeKey) => void;
  resetConnectionTypeOnPreferredChange: () => void;
  resetMarkedCableSizingCandidates: () => void;
  setActiveCandidateFolderKey: (key: CandidateFolderKey) => void;
  resetCableSizingModalState: () => void;
  closeCandidateFolderModal: () => void;
  setCandidateColumnSettingsOpen: (open: boolean) => void;
};

export function useElecCalcObjectActionModals({
  getObjectActionDisabledReason,
  preferredObjectActionCableType,
  objectActionCableType,
  openCableMarkModalState,
  changeCableMarkModalCableType,
  activateRowId,
  openCableSizingModalState,
  setCableSizingCableType,
  resetConnectionTypeOnPreferredChange,
  resetMarkedCableSizingCandidates,
  setActiveCandidateFolderKey,
  resetCableSizingModalState,
  closeCandidateFolderModal,
  setCandidateColumnSettingsOpen,
}: UseElecCalcObjectActionModalsArgs) {
  const openCableMarkModal = useCallback((obj: ProjectObject) => {
    const reason = getObjectActionDisabledReason(obj);
    if (reason) {
      message.warning(reason);
      return;
    }
    openCableMarkModalState(obj);
    const preferredType = preferredObjectActionCableType(obj);
    if (preferredType && preferredType !== objectActionCableType(obj.id)) {
      changeCableMarkModalCableType(preferredType);
    }
  }, [
    changeCableMarkModalCableType,
    getObjectActionDisabledReason,
    objectActionCableType,
    openCableMarkModalState,
    preferredObjectActionCableType,
  ]);

  const closeCableSizingModal = useCallback(() => {
    resetCableSizingModalState();
    resetMarkedCableSizingCandidates();
    setActiveCandidateFolderKey('all');
    closeCandidateFolderModal();
    setCandidateColumnSettingsOpen(false);
  }, [
    closeCandidateFolderModal,
    resetCableSizingModalState,
    resetMarkedCableSizingCandidates,
    setActiveCandidateFolderKey,
    setCandidateColumnSettingsOpen,
  ]);

  const openCableSizingModal = useCallback((obj: ProjectObject) => {
    const reason = getObjectActionDisabledReason(obj);
    if (reason) {
      message.warning(reason);
      return;
    }
    activateRowId(obj.id);
    openCableSizingModalState(obj);
    const preferredType = preferredObjectActionCableType(obj);
    if (preferredType) {
      setCableSizingCableType(preferredType);
      if (preferredType !== objectActionCableType(obj.id)) {
        resetConnectionTypeOnPreferredChange();
      }
    }
    resetMarkedCableSizingCandidates();
    setActiveCandidateFolderKey('all');
  }, [
    activateRowId,
    getObjectActionDisabledReason,
    objectActionCableType,
    openCableSizingModalState,
    preferredObjectActionCableType,
    resetConnectionTypeOnPreferredChange,
    resetMarkedCableSizingCandidates,
    setActiveCandidateFolderKey,
    setCableSizingCableType,
  ]);

  return {
    openCableMarkModal,
    openCableSizingModal,
    closeCableSizingModal,
  };
}
