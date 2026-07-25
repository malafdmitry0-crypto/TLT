/**
 * @module electrical/batch-recalc-actions
 * @owner electrical
 * @depends assignment scope model
 * @does-not heat
 */
import { useCallback } from 'react';
import { appMessage as message } from '@/feedback/appFeedback';

import type { ElectricalQueryAssignment } from '@/types/calculation';
import type { CableTypeKey } from '@/domain/electrical/elecCalcMainTableModel';
import { compatibleAssignedObjectIds } from '@/pages/electrical/elecCalcAssignmentScopeModel';

export type BatchRecalcMutateArgs = {
  scope: 'selected' | 'all';
  objectIds?: string[];
  skipManual: boolean;
};

export type UseElecCalcBatchRecalcActionsArgs = {
  canMutate: boolean;
  selectedRowKeys: readonly string[];
  assignmentByObjectId: ReadonlyMap<string, ElectricalQueryAssignment>;
  cableTypeForRecalculation: CableTypeKey | null | undefined;
  mutateBatch: (args: BatchRecalcMutateArgs) => void;
  cancelJob: () => void;
};

export const BATCH_RECALC_INCOMPATIBLE_WARNING =
  'Несовместимые или нераспределённые строки исключены. Проверьте назначения ЭР.';

export function useElecCalcBatchRecalcActions({
  canMutate,
  selectedRowKeys,
  assignmentByObjectId,
  cableTypeForRecalculation,
  mutateBatch,
  cancelJob,
}: UseElecCalcBatchRecalcActionsArgs) {
  const onRecalculateSelected = useCallback((skipManual: boolean) => {
    if (!canMutate) return;
    const objectIds = compatibleAssignedObjectIds(
      selectedRowKeys,
      assignmentByObjectId,
      cableTypeForRecalculation,
    );
    if (objectIds.length !== selectedRowKeys.length) {
      message.warning(BATCH_RECALC_INCOMPATIBLE_WARNING);
    }
    if (objectIds.length === 0) return;
    mutateBatch({
      scope: 'selected',
      objectIds,
      skipManual,
    });
  }, [
    assignmentByObjectId,
    cableTypeForRecalculation,
    canMutate,
    mutateBatch,
    selectedRowKeys,
  ]);

  const onRecalculateAll = useCallback((skipManual: boolean) => {
    if (!canMutate) return;
    mutateBatch({
      scope: 'all',
      skipManual,
    });
  }, [canMutate, mutateBatch]);

  const onCancelJob = useCallback(() => {
    if (canMutate) cancelJob();
  }, [canMutate, cancelJob]);

  return {
    onRecalculateSelected,
    onRecalculateAll,
    onCancelJob,
  };
}
