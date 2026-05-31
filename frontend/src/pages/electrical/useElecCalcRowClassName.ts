import { useCallback } from 'react';

import type { ElectricalCalcSummary } from '@/types/calculation';
import type { ProjectObject } from '@/types/project';
import {
  electricalCalcError,
  isElectricalCalcStale,
  isElectricalCalcUnsupported,
} from '@/utils/calcStatus';

type ResolveElectricalRowClassNameOptions = {
  objectId: string;
  activeRowId: string | null;
  calc?: ElectricalCalcSummary | null;
};

type UseElecCalcRowClassNameOptions = {
  activeRowId: string | null;
  calcByObjectId: Record<string, ElectricalCalcSummary | undefined>;
};

export function resolveElectricalRowClassName({
  objectId,
  activeRowId,
  calc,
}: ResolveElectricalRowClassNameOptions) {
  return [
    electricalCalcError(calc) && !isElectricalCalcUnsupported(calc) && !isElectricalCalcStale(calc)
      ? 'row-invalid'
      : '',
    activeRowId === objectId ? 'electrical-row-active' : '',
  ].filter(Boolean).join(' ');
}

export function useElecCalcRowClassName({
  activeRowId,
  calcByObjectId,
}: UseElecCalcRowClassNameOptions) {
  return useCallback((obj: Pick<ProjectObject, 'id'>) => {
    return resolveElectricalRowClassName({
      objectId: obj.id,
      activeRowId,
      calc: calcByObjectId[obj.id],
    });
  }, [activeRowId, calcByObjectId]);
}
