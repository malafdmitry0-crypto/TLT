import { useCallback, useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';

import {
  getCableOptions,
  type CableOptionOut,
  type CableSource,
} from '@/api/calculations';
import type { ElectricalCalcSummary } from '@/types/calculation';
import type { ElectricalVariant } from '@/types/electricalVariant';
import type { ProjectObject } from '@/types/project';
import {
  AUTO_CABLE_MARK_VALUE,
  type CableMarkSelectOption,
} from '@/pages/electrical/elecCalcCableOptionModel';
import {
  cableSnapshotRow,
  type CableStatusRow,
} from '@/pages/electrical/elecCalcCableCatalogModel';
import {
  currentElectricalCalc,
  getCableMark,
} from '@/domain/electrical/elecCalcResultValueModel';
import {
  electricalVariantTargetOptions,
  legacyElectricalVariantTargetsForIds,
  normalizeElectricalVariantIdList,
} from '@/pages/electrical/elecCalcVariantModel';
import type { CableTypeKey } from '@/domain/electrical/elecCalcMainTableModel';

type UseElecCalcCableMarkModalStateOptions = {
  objects: readonly ProjectObject[];
  calcByObjectId: Record<string, ElectricalCalcSummary | undefined>;
  electricalVariants: readonly ElectricalVariant[];
  electricalVariantId: string;
  getSavedCableTypeForObject: (objectId: string) => CableTypeKey;
  normalizeAvailableCableType: (type: CableTypeKey) => CableTypeKey;
  cableMarkOptionsFor: (
    type: CableTypeKey,
    currentMark: string | undefined,
    calc: ElectricalCalcSummary | undefined,
    backendTtOptions?: readonly CableOptionOut[] | null,
  ) => CableMarkSelectOption[];
  cableMarkValueForCalc: (
    type: CableTypeKey,
    mark: string | undefined,
    calc: ElectricalCalcSummary | undefined,
  ) => string;
  findCableRowForMark: (
    type: CableTypeKey,
    mark: string | undefined,
    calc: ElectricalCalcSummary | undefined,
    selectedSource?: CableSource | null,
  ) => CableStatusRow | null;
  onOpenObject?: (object: ProjectObject) => void;
  onCableTypeChange?: () => void;
};

export function useElecCalcCableMarkModalState({
  objects,
  calcByObjectId,
  electricalVariants,
  electricalVariantId,
  getSavedCableTypeForObject,
  normalizeAvailableCableType,
  cableMarkOptionsFor,
  cableMarkValueForCalc,
  findCableRowForMark,
  onOpenObject,
  onCableTypeChange,
}: UseElecCalcCableMarkModalStateOptions) {
  const [objectId, setObjectId] = useState<string | null>(null);
  const [cableType, setCableType] = useState<CableTypeKey | null>(null);
  const [value, setValue] = useState<string | null>(null);
  const [targetVariants, setTargetVariants] = useState<string[]>([]);

  const object = objectId
    ? objects.find((candidateObject) => candidateObject.id === objectId) ?? null
    : null;
  const calc = object ? calcByObjectId[object.id] : undefined;
  const savedType = object ? getSavedCableTypeForObject(object.id) : null;
  const currentMark = cableType === savedType ? getCableMark(calc) : undefined;
  const needsBackendTtOptions = Boolean(
    objectId && (cableType === 'self_regulating_tt' || savedType === 'self_regulating_tt'),
  );
  const backendTtQuery = useQuery({
    queryKey: ['electrical', 'cable-options', objectId, electricalVariantId],
    queryFn: () => getCableOptions(objectId!, electricalVariantId),
    enabled: Boolean(objectId && needsBackendTtOptions),
    staleTime: 30_000,
  });
  const backendTtOptions = backendTtQuery.data ?? null;
  const options = useMemo(
    () => (
      cableType
        ? cableMarkOptionsFor(
            cableType,
            currentMark,
            calc,
            cableType === 'self_regulating_tt' ? backendTtOptions : null,
          )
        : []
    ),
    [backendTtOptions, cableType, cableMarkOptionsFor, calc, currentMark],
  );
  const optionByValue = useMemo(
    () => new Map(options.map((option) => [option.value, option])),
    [options],
  );
  const selectedMark = value ?? AUTO_CABLE_MARK_VALUE;
  const selectedOption = optionByValue.get(selectedMark);
  const selectedCable = useMemo<CableStatusRow | null>(() => {
    if (!cableType || !selectedOption?.mark) return null;
    const snapshotRow = cableSnapshotRow(calc);
    if (selectedOption.optionSource === 'project') return snapshotRow;
    return findCableRowForMark(
      cableType,
      selectedOption.mark,
      calc,
      selectedOption.cableSource,
    );
  }, [cableType, calc, findCableRowForMark, selectedOption]);
  const targetVariantOptions = useMemo(
    () => electricalVariantTargetOptions(electricalVariants),
    [electricalVariants],
  );
  const targetVariantsForSubmit = useMemo(
    () => legacyElectricalVariantTargetsForIds(
      targetVariants,
      electricalVariants,
    ),
    [electricalVariants, targetVariants],
  );

  const close = useCallback(() => {
    setObjectId(null);
    setCableType(null);
    setValue(null);
    setTargetVariants([]);
  }, []);
  const open = useCallback((nextObject: ProjectObject) => {
    const nextCalc = calcByObjectId[nextObject.id];
    const currentCalc = currentElectricalCalc(nextCalc);
    const nextType = getSavedCableTypeForObject(nextObject.id);
    const selectedVariantExists = electricalVariants.some(
      (electricalVariant) => electricalVariant.id === electricalVariantId,
    );
    onOpenObject?.(nextObject);
    setObjectId(nextObject.id);
    setCableType(nextType);
    setTargetVariants(selectedVariantExists ? [electricalVariantId] : []);
    setValue(cableMarkValueForCalc(nextType, getCableMark(currentCalc), currentCalc));
  }, [
    calcByObjectId,
    cableMarkValueForCalc,
    electricalVariantId,
    electricalVariants,
    getSavedCableTypeForObject,
    onOpenObject,
  ]);
  const changeCableType = useCallback((nextType: CableTypeKey) => {
    setCableType(normalizeAvailableCableType(nextType));
    setValue(AUTO_CABLE_MARK_VALUE);
    onCableTypeChange?.();
  }, [normalizeAvailableCableType, onCableTypeChange]);
  const normalizeSelectedCableType = useCallback(() => {
    setCableType((current) => current == null ? null : normalizeAvailableCableType(current));
  }, [normalizeAvailableCableType]);
  const setTargetVariantsFromValues = useCallback((values: readonly unknown[]) => {
    setTargetVariants(normalizeElectricalVariantIdList(values, electricalVariants));
  }, [electricalVariants]);

  return {
    objectId,
    object,
    calc,
    cableType,
    setCableType,
    value,
    setValue,
    targetVariants,
    setTargetVariants,
    targetVariantsForSubmit,
    savedType,
    currentMark,
    options,
    optionByValue,
    selectedMark,
    selectedOption,
    selectedCable,
    targetVariantOptions,
    close,
    open,
    changeCableType,
    normalizeSelectedCableType,
    setTargetVariantsFromValues,
  };
}
