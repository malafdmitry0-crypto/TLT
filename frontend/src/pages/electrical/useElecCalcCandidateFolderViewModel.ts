import { useEffect, useMemo } from 'react';
import type { Dispatch, SetStateAction } from 'react';

import type { ElectricalCandidate, ElectricalCandidateFolder } from '@/types/calculation';
import {
  buildCandidateFolderCounts,
  candidateCustomFolderId,
  type CandidateFolderKey,
  filterCandidatesByActiveFolder,
  findActiveCustomCandidateFolder,
} from '@/pages/electrical/elecCalcCandidateFolderModel';

type UseElecCalcCandidateFolderViewModelOptions = {
  activeCandidateFolderKey: CandidateFolderKey;
  setActiveCandidateFolderKey: Dispatch<SetStateAction<CandidateFolderKey>>;
  candidates: readonly ElectricalCandidate[];
  candidateFolders: readonly ElectricalCandidateFolder[];
};

export function useElecCalcCandidateFolderViewModel({
  activeCandidateFolderKey,
  setActiveCandidateFolderKey,
  candidates,
  candidateFolders,
}: UseElecCalcCandidateFolderViewModelOptions) {
  const activeCustomCandidateFolderId = candidateCustomFolderId(activeCandidateFolderKey);
  const activeCustomCandidateFolder = useMemo(
    () => findActiveCustomCandidateFolder(activeCandidateFolderKey, candidateFolders),
    [activeCandidateFolderKey, candidateFolders],
  );
  const candidatesByActiveFolder = useMemo(
    () => filterCandidatesByActiveFolder(
      candidates,
      activeCandidateFolderKey,
      activeCustomCandidateFolder,
    ),
    [activeCandidateFolderKey, activeCustomCandidateFolder, candidates],
  );
  const candidateFolderCounts = useMemo(
    () => buildCandidateFolderCounts(candidates, candidateFolders),
    [candidateFolders, candidates],
  );

  useEffect(() => {
    if (activeCustomCandidateFolderId && !activeCustomCandidateFolder) {
      setActiveCandidateFolderKey('all');
    }
  }, [
    activeCustomCandidateFolder,
    activeCustomCandidateFolderId,
    setActiveCandidateFolderKey,
  ]);

  return {
    activeCustomCandidateFolderId,
    activeCustomCandidateFolder,
    candidatesByActiveFolder,
    candidateFolderCounts,
  };
}
