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
  objectIsValid?: boolean;
  objectValidationCategory?: unknown;
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
  objectIsValid,
  objectValidationCategory,
  activeRowId,
  calc,
  assignment,
}: ResolveElectricalRowClassNameOptions) {
  const stale = isElectricalObjectStale(calc, assignment);
  const heatValidationFailed = objectIsValid === false
    && objectValidationCategory !== 'unsupported';
  return [
    heatValidationFailed
      || (electricalCalcError(calc) && !isElectricalCalcUnsupported(calc) && !isElectricalCalcStale(calc))
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
  return useCallback((obj: Pick<ProjectObject, 'id' | 'is_valid' | 'validation_errors'>) => {
    return resolveElectricalRowClassName({
      objectId: obj.id,
      objectIsValid: obj.is_valid,
      objectValidationCategory: obj.validation_errors?.category,
      activeRowId,
      calc: calcByObjectId[obj.id],
      assignment: assignmentByObjectId?.get(obj.id),
    });
  }, [activeRowId, assignmentByObjectId, calcByObjectId]);
}
