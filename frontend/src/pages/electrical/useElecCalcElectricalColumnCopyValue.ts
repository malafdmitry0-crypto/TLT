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
  layingStep,
  heatingHeight,
  connectionType,
  supplyVoltage,
  windingCoefficient,
  vaporTemperature,
  maintainTemperature,
  aggressiveProduct,
}: UseElecCalcElectricalColumnCopyValueOptions) {
  return useCallback((
    key: ElectricalColumnKey,
    obj: ProjectObject,
    index: number,
  ) => mainElectricalColumnCopyValue(key, obj, index, {
    calcByObjectId,
    electricalDisplayOffset,
    getCableTypeForObject,
    layingStep,
    heatingHeight,
    connectionType,
    supplyVoltage,
    windingCoefficient,
    vaporTemperature,
    maintainTemperature,
    aggressiveProduct,
  }), [
    aggressiveProduct,
    calcByObjectId,
    connectionType,
    electricalDisplayOffset,
    getCableTypeForObject,
    heatingHeight,
    layingStep,
    maintainTemperature,
    supplyVoltage,
    vaporTemperature,
    windingCoefficient,
  ]);
}
