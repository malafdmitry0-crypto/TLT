import { useCallback } from 'react';

import type { ProjectObject } from '@/types/project';
import type { HeatCalcGlideGridCellAction } from '@/utils/heatCalcGlideGrid';

type UseElecCalcGlideActionsOptions = {
  activeRowId: string | null;
  projectSelected: boolean;
  canMutate: boolean;
  isCableMarkPending: boolean;
  getObjectActionDisabledReason?: (obj: ProjectObject) => string | null;
  onOpenCableMarkModal: (obj: ProjectObject) => void;
};

export function useElecCalcGlideActions({
  activeRowId,
  projectSelected,
  canMutate,
  isCableMarkPending,
  getObjectActionDisabledReason = () => null,
  onOpenCableMarkModal,
}: UseElecCalcGlideActionsOptions) {
  const getElectricalGlideCellActions = useCallback((
    obj: ProjectObject,
    columnKey: string,
  ): HeatCalcGlideGridCellAction[] | undefined => {
    if (columnKey !== 'cable_mark' || activeRowId !== obj.id) return undefined;
    const assignmentDisabledReason = getObjectActionDisabledReason(obj);
    return [{
      key: 'choose',
      label: 'Выбор',
      disabled:
        !canMutate
        || !obj.is_valid
        || !projectSelected
        || isCableMarkPending
        || assignmentDisabledReason != null,
    }];
  }, [
    activeRowId,
    canMutate,
    getObjectActionDisabledReason,
    isCableMarkPending,
    projectSelected,
  ]);

  const handleElectricalGlideCellAction = useCallback((
    obj: ProjectObject,
    columnKey: string,
    actionKey: string,
  ) => {
    if (columnKey !== 'cable_mark') return;
    if (getObjectActionDisabledReason(obj) != null) return;
    if (actionKey === 'choose') {
      if (!canMutate || !obj.is_valid || !projectSelected || isCableMarkPending) return;
      onOpenCableMarkModal(obj);
      return;
    }
  }, [
    canMutate,
    getObjectActionDisabledReason,
    isCableMarkPending,
    onOpenCableMarkModal,
    projectSelected,
  ]);

  return {
    getElectricalGlideCellActions,
    handleElectricalGlideCellAction,
  };
}
