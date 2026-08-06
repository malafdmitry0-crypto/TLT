import { useCallback } from 'react';

import type { ProjectObject } from '@/types/project';
import type { ElectricalColumnKey } from '@/utils/electricalTableColumns';
import {
  mainElectricalColumnCopyValue,
  type MainElectricalColumnCopyContext,
} from '@/domain/electrical/elecCalcMainTableModel';

type UseElecCalcElectricalColumnCopyValueOptions = MainElectricalColumnCopyContext;

export function useElecCalcElectricalColumnCopyValue({
  calcByObjectId,
  electricalDisplayOffset,
  getCableTypeForObject,
  connectionType,
  supplyVoltage,
  windingCoefficient,
}: UseElecCalcElectricalColumnCopyValueOptions) {
  return useCallback((
    key: ElectricalColumnKey,
    obj: ProjectObject,
    index: number,
  ) => mainElectricalColumnCopyValue(key, obj, index, {
    calcByObjectId,
    electricalDisplayOffset,
    getCableTypeForObject,
    connectionType,
    supplyVoltage,
    windingCoefficient,
  }), [
    calcByObjectId,
    connectionType,
    electricalDisplayOffset,
    getCableTypeForObject,
    supplyVoltage,
    windingCoefficient,
  ]);
}
