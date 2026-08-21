import { useCallback } from 'react';

import type { ElectricalCalcSummary } from '@/types/calculation';
import type { ProjectObject } from '@/types/project';
import type { ElectricalColumnKey } from '@/utils/electricalTableColumns';
import type {
  HeatCalcGlideGridCellAction,
  HeatCalcGlideGridCellState,
} from '@/utils/heatCalcGlideGrid';
import {
  calcLayoutValues,
  currentElectricalCalc,
} from '@/domain/electrical/elecCalcResultValueModel';

type UseElecCalcGlideCellStateOptions = {
  calcByObjectId: Record<string, ElectricalCalcSummary | undefined>;
  electricalColumnCopyValue: (
    key: ElectricalColumnKey,
    obj: ProjectObject,
    index: number,
  ) => unknown;
  isElectricalLayoutCellEditable: (obj: ProjectObject, columnKey: string) => boolean;
  getColumnAlign: (columnKey: ElectricalColumnKey) => HeatCalcGlideGridCellState['align'];
  getCellActions: (
    obj: ProjectObject,
    columnKey: string,
  ) => HeatCalcGlideGridCellAction[] | undefined;
};

export function useElecCalcGlideCellState({
  calcByObjectId,
  electricalColumnCopyValue,
  isElectricalLayoutCellEditable,
  getColumnAlign,
  getCellActions,
}: UseElecCalcGlideCellStateOptions) {
  return useCallback((
    obj: ProjectObject,
    columnKey: string,
    rowIndex: number,
  ): HeatCalcGlideGridCellState => {
    const layoutEditable = isElectricalLayoutCellEditable(obj, columnKey);
    const currentCalc = currentElectricalCalc(calcByObjectId[obj.id]);
    const layoutValues = layoutEditable ? calcLayoutValues(currentCalc) : null;
    const displayValue = layoutValues && columnKey === 'winding_pitch_mm'
      ? String(layoutValues.windingPitchMm)
      : layoutValues && columnKey === 'number_of_threads'
        ? String(layoutValues.numberOfThreads)
        : String(electricalColumnCopyValue(columnKey, obj, rowIndex) ?? '');

    return {
      displayValue,
      editable: layoutEditable,
      align: getColumnAlign(columnKey),
      editor: layoutEditable ? 'number' : undefined,
      step: layoutEditable ? 1 : undefined,
      actions: getCellActions(obj, columnKey),
    };
  }, [
    calcByObjectId,
    electricalColumnCopyValue,
    getCellActions,
    getColumnAlign,
    isElectricalLayoutCellEditable,
  ]);
}
