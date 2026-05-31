import { useCallback } from 'react';

import type { ProjectObject } from '@/types/project';
import type { HeatCalcGlideGridCellAction } from '@/utils/heatCalcGlideGrid';

type UseElecCalcGlideActionsOptions = {
  activeRowId: string | null;
  projectSelected: boolean;
  isCableMarkPending: boolean;
  onOpenCableMarkModal: (obj: ProjectObject) => void;
  onOpenCableSizingModal: (obj: ProjectObject) => void;
};

export function useElecCalcGlideActions({
  activeRowId,
  projectSelected,
  isCableMarkPending,
  onOpenCableMarkModal,
  onOpenCableSizingModal,
}: UseElecCalcGlideActionsOptions) {
  const getElectricalGlideCellActions = useCallback((
    obj: ProjectObject,
    columnKey: string,
  ): HeatCalcGlideGridCellAction[] | undefined => {
    if (columnKey !== 'cable_mark' || activeRowId !== obj.id) return undefined;
    return [
      {
        key: 'choose',
        label: 'Выбор',
        disabled: !obj.is_valid || !projectSelected || isCableMarkPending,
      },
      {
        key: 'size',
        label: 'Подбор',
        disabled: !projectSelected,
      },
    ];
  }, [
    activeRowId,
    isCableMarkPending,
    projectSelected,
  ]);

  const handleElectricalGlideCellAction = useCallback((
    obj: ProjectObject,
    columnKey: string,
    actionKey: string,
  ) => {
    if (columnKey !== 'cable_mark') return;
    if (actionKey === 'choose') {
      if (!obj.is_valid || !projectSelected || isCableMarkPending) return;
      onOpenCableMarkModal(obj);
      return;
    }
    if (actionKey === 'size') {
      if (!projectSelected) return;
      onOpenCableSizingModal(obj);
    }
  }, [
    isCableMarkPending,
    onOpenCableMarkModal,
    onOpenCableSizingModal,
    projectSelected,
  ]);

  return {
    getElectricalGlideCellActions,
    handleElectricalGlideCellAction,
  };
}
