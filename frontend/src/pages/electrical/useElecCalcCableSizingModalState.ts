import { useCallback, useMemo, useState } from 'react';

import type { SelectionPolicy } from '@/api/calculations';
import { electricalDataQueryKeys } from '@/api/electricalQueryKeys';
import type { CalculationVariant } from '@/store/calculationVariantStore';
import type { ElectricalCalcSummary } from '@/types/calculation';
import type { ProjectObject } from '@/types/project';
import {
  DEFAULT_CABLE_TYPE,
  isResistiveCableType,
} from '@/pages/electrical/elecCalcCableTypeModel';
import type { CableTypeKey } from '@/domain/electrical/elecCalcMainTableModel';
import {
  currentElectricalCalc,
  getCableMark,
} from '@/domain/electrical/elecCalcResultValueModel';

type CableSizingMode = 'auto' | 'manual';

export type ElecCalcCableSizingParams = {
  selectionPolicy: SelectionPolicy;
  supplyVoltage: number | null;
  connectionType: string;
  windingCoefficient: number | null;
  heatingHeight: number | null;
  layingStep: number | null | undefined;
};

type UseElecCalcCableSizingModalStateOptions = {
  projectId?: string;
  electricalVariantId: string;
  variant: CalculationVariant;
  objects: readonly ProjectObject[];
  calcByObjectId: Record<string, ElectricalCalcSummary | undefined>;
  recalc: ElecCalcCableSizingParams;
  getSavedCableTypeForObject: (objectId: string) => CableTypeKey;
  normalizeAvailableCableType: (type: CableTypeKey) => CableTypeKey;
};

export function useElecCalcCableSizingModalState({
  projectId,
  electricalVariantId,
  objects,
  calcByObjectId,
  recalc,
  getSavedCableTypeForObject,
  normalizeAvailableCableType,
}: UseElecCalcCableSizingModalStateOptions) {
  const [objectId, setObjectId] = useState<string | null>(null);
  const [mode, setMode] = useState<CableSizingMode>('auto');
  const [cableType, setCableType] = useState<CableTypeKey>(DEFAULT_CABLE_TYPE);
  const [manualMark, setManualMark] = useState<string | null>(null);

  const effectiveCableType = normalizeAvailableCableType(cableType);
  const candidateParams = useMemo(() => {
    const shared = {
      selection_mode: isResistiveCableType(effectiveCableType) ? 'auto' : undefined,
      selection_policy: recalc.selectionPolicy,
    };
    if (effectiveCableType === 'self_regulating_tt') {
      return {
        ...shared,
        ...(recalc.heatingHeight == null
          ? {}
          : { heating_height: recalc.heatingHeight }),
        ...(recalc.layingStep == null
          ? {}
          : { laying_step: recalc.layingStep }),
      };
    }
    return {
      ...shared,
      supply_voltage: recalc.supplyVoltage,
      connection_type: recalc.connectionType,
      winding_coefficient: recalc.windingCoefficient,
      heating_height: recalc.heatingHeight,
      laying_step: recalc.layingStep,
    };
  }, [
    effectiveCableType,
    recalc.connectionType,
    recalc.heatingHeight,
    recalc.layingStep,
    recalc.selectionPolicy,
    recalc.supplyVoltage,
    recalc.windingCoefficient,
  ]);
  const candidatesQueryKey = useMemo(
    () => electricalDataQueryKeys.candidates(
      projectId ?? 'no-project',
      electricalVariantId,
      objectId,
    ),
    [electricalVariantId, objectId, projectId],
  );
  const candidateFoldersQueryKey = useMemo(
    () => electricalDataQueryKeys.candidateFolders(
      projectId ?? 'no-project',
      electricalVariantId,
      objectId,
    ),
    [electricalVariantId, objectId, projectId],
  );
  const object = objectId
    ? objects.find((candidateObject) => candidateObject.id === objectId) ?? null
    : null;
  const calc = object ? currentElectricalCalc(calcByObjectId[object.id]) : undefined;

  const resetModalState = useCallback(() => {
    setObjectId(null);
    setMode('auto');
    setManualMark(null);
  }, []);
  const openModalState = useCallback((nextObject: ProjectObject) => {
    const nextType = getSavedCableTypeForObject(nextObject.id);
    const nextCalc = currentElectricalCalc(calcByObjectId[nextObject.id]);
    setCableType(nextType);
    setManualMark(getCableMark(nextCalc) ?? null);
    setObjectId(nextObject.id);
  }, [calcByObjectId, getSavedCableTypeForObject]);

  return {
    objectId,
    setObjectId,
    mode,
    setMode,
    cableType,
    setCableType,
    manualMark,
    setManualMark,
    effectiveCableType,
    candidateParams,
    candidatesQueryKey,
    candidateFoldersQueryKey,
    object,
    calc,
    resetModalState,
    openModalState,
  };
}
