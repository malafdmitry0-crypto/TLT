import { useCallback } from 'react';

import type { ElectricalCalcSummary, ElectricalQueryAssignment } from '@/types/calculation';
import type { ProjectObject } from '@/types/project';
import {
  electricalCalcError,
  isElectricalCalcStale,
  isElectricalCalcUnsupported,
} from '@/utils/calcStatus';
import { isElectricalObjectStale } from '@/pages/electrical/elecCalcStaleModel';

type ResolveElectricalRowClassNameOptions = {
  objectId: string;
  activeRowId: string | null;
  calc?: ElectricalCalcSummary | null;
  assignment?: ElectricalQueryAssignment | null;
};

type UseElecCalcRowClassNameOptions = {
  activeRowId: string | null;
  calcByObjectId: Record<string, ElectricalCalcSummary | undefined>;
  assignmentByObjectId?: ReadonlyMap<string, ElectricalQueryAssignment>;
};

export function resolveElectricalRowClassName({
  objectId,
  activeRowId,
  calc,
  assignment,
}: ResolveElectricalRowClassNameOptions) {
  const stale = isElectricalObjectStale(calc, assignment);
  return [
    electricalCalcError(calc) && !isElectricalCalcUnsupported(calc) && !isElectricalCalcStale(calc)
      ? 'row-invalid'
      : '',
    stale ? 'row-stale' : '',
    activeRowId === objectId ? 'electrical-row-active' : '',
  ].filter(Boolean).join(' ');
}

export function useElecCalcRowClassName({
  activeRowId,
  calcByObjectId,
  assignmentByObjectId,
}: UseElecCalcRowClassNameOptions) {
  return useCallback((obj: Pick<ProjectObject, 'id'>) => {
    return resolveElectricalRowClassName({
      objectId: obj.id,
      activeRowId,
      calc: calcByObjectId[obj.id],
      assignment: assignmentByObjectId?.get(obj.id),
    });
  }, [activeRowId, assignmentByObjectId, calcByObjectId]);
}
