import { useMemo } from 'react';

import { useElectricalStats } from '@/hooks/useElectricalStats';
import {
  electricalCalculationsForTable,
  electricalLoadedPagesForTable,
  electricalObjectsForTable,
} from '@/pages/electrical/elecCalcPageModel';
import type { ElectricalQueryResponse } from '@/types/calculation';

type UseElecCalcTableProjectionOptions = {
  electricalGlideEnabled: boolean;
  electricalPage?: ElectricalQueryResponse;
  electricalInfinitePages: Record<number, ElectricalQueryResponse>;
  isElectricalPagePlaceholderData: boolean;
  tablePage: number;
};

export function useElecCalcTableProjection({
  electricalGlideEnabled,
  electricalPage,
  electricalInfinitePages,
  isElectricalPagePlaceholderData,
  tablePage,
}: UseElecCalcTableProjectionOptions) {
  const electricalLoadedPages = useMemo(() => {
    return electricalLoadedPagesForTable({
      electricalGlideEnabled,
      electricalPage,
      electricalInfinitePages,
      isElectricalPagePlaceholderData,
      tablePage,
    });
  }, [
    electricalGlideEnabled,
    electricalInfinitePages,
    electricalPage,
    isElectricalPagePlaceholderData,
    tablePage,
  ]);
  const objects = useMemo(
    () => electricalObjectsForTable(electricalGlideEnabled, electricalPage, electricalLoadedPages),
    [electricalGlideEnabled, electricalLoadedPages, electricalPage],
  );
  const elecCalcs = useMemo(
    () => electricalCalculationsForTable(electricalGlideEnabled, electricalPage, electricalLoadedPages),
    [electricalGlideEnabled, electricalLoadedPages, electricalPage],
  );
  const electricalDisplayOffset = electricalGlideEnabled ? 0 : (electricalPage?.page_info?.offset ?? 0);
  const stats = useElectricalStats(objects, elecCalcs);

  return {
    electricalLoadedPages,
    objects,
    elecCalcs,
    electricalDisplayOffset,
    stats,
  };
}
