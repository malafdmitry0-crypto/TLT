import { useCallback, useRef, useState } from 'react';

import type { ElectricalCandidateFolder } from '@/types/calculation';
import type { CandidateFolderKey } from '@/pages/electrical/elecCalcCandidateFolderModel';
import type { CandidateFolderModalMode } from '@/pages/electrical/elecCalcPageModel';

export function useElecCalcCandidateFolderUiState() {
  const [activeCandidateFolderKey, setActiveCandidateFolderKey] =
    useState<CandidateFolderKey>('all');
  const previousActiveCandidateFolderKeyRef = useRef<CandidateFolderKey>('all');
  const [candidateFolderModalMode, setCandidateFolderModalMode] =
    useState<CandidateFolderModalMode>('create');
  const [candidateFolderModalOpen, setCandidateFolderModalOpen] = useState(false);
  const [candidateFolderName, setCandidateFolderName] = useState('');
  const [editingCandidateFolder, setEditingCandidateFolder] =
    useState<ElectricalCandidateFolder | null>(null);

  const closeCandidateFolderModal = useCallback(() => {
    setCandidateFolderModalOpen(false);
    setEditingCandidateFolder(null);
    setCandidateFolderName('');
  }, []);

  const openCreateCandidateFolderModal = useCallback(() => {
    setCandidateFolderModalMode('create');
    setEditingCandidateFolder(null);
    setCandidateFolderName('');
    setCandidateFolderModalOpen(true);
  }, []);

  const openRenameCandidateFolderModal = useCallback((folder: ElectricalCandidateFolder) => {
    setCandidateFolderModalMode('rename');
    setEditingCandidateFolder(folder);
    setCandidateFolderName(folder.name);
    setCandidateFolderModalOpen(true);
  }, []);

  return {
    activeCandidateFolderKey,
    setActiveCandidateFolderKey,
    previousActiveCandidateFolderKeyRef,
    candidateFolderModalMode,
    candidateFolderModalOpen,
    candidateFolderName,
    setCandidateFolderName,
    editingCandidateFolder,
    closeCandidateFolderModal,
    openCreateCandidateFolderModal,
    openRenameCandidateFolderModal,
  };
}
