import { useEffect, type Dispatch, type SetStateAction } from 'react';

import type { ElectricalQueryResponse } from '@/types/calculation';
import type { ProjectObjectsPageCursor } from '@/types/project';
import type { CableTypeKey } from '@/domain/electrical/elecCalcMainTableModel';

type RememberElectricalPage = (options: {
  electricalGlideEnabled: boolean;
  electricalPage?: ElectricalQueryResponse;
  isFetching: boolean;
  isPlaceholderData: boolean;
}) => void;

type RememberNextCursor = (options: {
  nextCursor?: ProjectObjectsPageCursor | null;
  isFetching: boolean;
  isPlaceholderData: boolean;
}) => void;

type UseElecCalcDataLifecycleEffectsOptions = {
  electricalGlideEnabled: boolean;
  electricalPage?: ElectricalQueryResponse;
  isElectricalPageFetching: boolean;
  isElectricalPagePlaceholderData: boolean;
  rememberElectricalPage: RememberElectricalPage;
  cableSizingModalObjectId: string | null;
  resetCandidateTableViewState: () => void;
  setCableSizingCableType: Dispatch<SetStateAction<CableTypeKey>>;
  normalizeAvailableCableType: (type: CableTypeKey) => CableTypeKey;
  nextElectricalPageCursor?: ProjectObjectsPageCursor | null;
  rememberNextCursor: RememberNextCursor;
};

export function useElecCalcDataLifecycleEffects({
  electricalGlideEnabled,
  electricalPage,
  isElectricalPageFetching,
  isElectricalPagePlaceholderData,
  rememberElectricalPage,
  cableSizingModalObjectId,
  resetCandidateTableViewState,
  setCableSizingCableType,
  normalizeAvailableCableType,
  nextElectricalPageCursor,
  rememberNextCursor,
}: UseElecCalcDataLifecycleEffectsOptions) {
  useEffect(() => {
    rememberElectricalPage({
      electricalGlideEnabled,
      electricalPage,
      isFetching: isElectricalPageFetching,
      isPlaceholderData: isElectricalPagePlaceholderData,
    });
  }, [
    electricalGlideEnabled,
    electricalPage,
    isElectricalPageFetching,
    isElectricalPagePlaceholderData,
    rememberElectricalPage,
  ]);

  useEffect(() => {
    resetCandidateTableViewState();
  }, [cableSizingModalObjectId, resetCandidateTableViewState]);

  useEffect(() => {
    setCableSizingCableType((current) => normalizeAvailableCableType(current));
  }, [normalizeAvailableCableType, setCableSizingCableType]);

  useEffect(() => {
    rememberNextCursor({
      nextCursor: nextElectricalPageCursor,
      isFetching: isElectricalPageFetching,
      isPlaceholderData: isElectricalPagePlaceholderData,
    });
  }, [
    isElectricalPageFetching,
    isElectricalPagePlaceholderData,
    nextElectricalPageCursor,
    rememberNextCursor,
  ]);
}
