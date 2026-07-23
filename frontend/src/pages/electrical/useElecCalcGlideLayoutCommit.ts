/**
 * @module electrical/glide-layout-commit
 * @owner electrical
 * @depends elecCalcLayoutModel, calcStatus helpers
 * @does-not heat
 *
 * Glide inline layout cell commit for winding pitch / threads / related fields.
 */
import { useCallback } from 'react';

import type { CableSource } from '@/api/calculations';
import type { ElectricalCalcSummary } from '@/types/calculation';
import type { ProjectObject } from '@/types/project';
import type { CableTypeKey } from '@/domain/electrical/elecCalcMainTableModel';
import {
  isElectricalLayoutCellEditable as resolveElectricalLayoutCellEditable,
  validateElectricalLayoutCellCommit,
  type ElectricalLayoutCableType,
} from '@/pages/electrical/elecCalcLayoutModel';
import { catalogSourceFromSnapshot } from '@/pages/electrical/elecCalcCableOptionModel';
import { getCableMarkSource } from '@/domain/electrical/elecCalcResultValueModel';

export const ELECCALC_READ_ONLY_MESSAGE =
  'Проект открыт в режиме просмотра. Изменять электрорасчёт может только владелец или администратор.';

export type ElectricalLayoutMutatePayload = {
  objectId: string;
  cableMark: string | null;
  cableSource: CableSource;
  cableType: CableTypeKey;
  windingPitchMm: number | null;
  numberOfThreads: number | null;
};

export type UseElecCalcGlideLayoutCommitArgs = {
  canMutate: boolean;
  projectSelected: boolean;
  effectiveSource: CableSource;
  calcByObjectId: Record<string, ElectricalCalcSummary | undefined>;
  getCableTypeForObject: (objectId: string) => ElectricalLayoutCableType;
  getObjectCalculationDisabledReason: (obj: ProjectObject) => string | null;
  isCableMarkPending: boolean;
  electricalLayoutMutate: (payload: ElectricalLayoutMutatePayload) => void;
  activateRowId: (objectId: string) => void;
};

export function useElecCalcGlideLayoutCommit({
  canMutate,
  projectSelected,
  effectiveSource,
  calcByObjectId,
  getCableTypeForObject,
  getObjectCalculationDisabledReason,
  isCableMarkPending,
  electricalLayoutMutate,
  activateRowId,
}: UseElecCalcGlideLayoutCommitArgs) {
  const isElectricalLayoutCellEditable = useCallback((obj: ProjectObject, columnKey: string) => {
    if (getObjectCalculationDisabledReason(obj)) return false;
    return resolveElectricalLayoutCellEditable({
      obj,
      columnKey,
      projectSelected: projectSelected && canMutate,
      isCableMarkPending,
      calcByObjectId,
      getCableTypeForObject,
    });
  }, [
    calcByObjectId,
    canMutate,
    getCableTypeForObject,
    getObjectCalculationDisabledReason,
    isCableMarkPending,
    projectSelected,
  ]);

  const handleElectricalGlideStartCellEdit = useCallback((obj: ProjectObject) => {
    activateRowId(obj.id);
  }, [activateRowId]);

  const handleElectricalGlideCommitCell = useCallback((
    obj: ProjectObject,
    columnKey: string,
    value: unknown,
  ) => {
    if (!canMutate) return ELECCALC_READ_ONLY_MESSAGE;
    const assignmentReason = getObjectCalculationDisabledReason(obj);
    if (assignmentReason) return assignmentReason;
    const validation = validateElectricalLayoutCellCommit({
      obj,
      columnKey,
      value,
      projectSelected,
      calcByObjectId,
      getCableTypeForObject,
    });
    if (validation.status === 'ignored') return null;
    if (validation.status === 'error') return validation.error;
    if (validation.status !== 'valid') return null;

    const markSource = getCableMarkSource(validation.calc);
    electricalLayoutMutate({
      objectId: obj.id,
      cableMark: markSource === 'manual' ? validation.mark : null,
      cableSource: markSource === 'manual'
        ? catalogSourceFromSnapshot(validation.calc) ?? effectiveSource
        : effectiveSource,
      cableType: validation.cableType,
      windingPitchMm: validation.windingPitchMm,
      numberOfThreads: validation.numberOfThreads,
    });
    return null;
  }, [
    calcByObjectId,
    canMutate,
    effectiveSource,
    electricalLayoutMutate,
    getCableTypeForObject,
    getObjectCalculationDisabledReason,
    projectSelected,
  ]);

  return {
    isElectricalLayoutCellEditable,
    handleElectricalGlideStartCellEdit,
    handleElectricalGlideCommitCell,
  };
}
