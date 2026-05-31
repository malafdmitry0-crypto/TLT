import { useCallback, useMemo, useState } from 'react';

import type { CableSource } from '@/api/calculations';
import {
  CALCULATION_VARIANTS,
  type CalculationVariant,
} from '@/store/calculationVariantStore';
import type { ElectricalCalcSummary } from '@/types/calculation';
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
} from '@/pages/electrical/elecCalcResultValueModel';
import { normalizeCalculationVariantList } from '@/pages/electrical/elecCalcVariantModel';
import type { CableTypeKey } from '@/pages/electrical/elecCalcMainTableModel';

type UseElecCalcCableMarkModalStateOptions = {
  objects: readonly ProjectObject[];
  calcByObjectId: Record<string, ElectricalCalcSummary | undefined>;
  variant: CalculationVariant;
  getSavedCableTypeForObject: (objectId: string) => CableTypeKey;
  normalizeAvailableCableType: (type: CableTypeKey) => CableTypeKey;
  cableMarkOptionsFor: (
    type: CableTypeKey,
    currentMark: string | undefined,
    calc: ElectricalCalcSummary | undefined,
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
  variant,
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
  const [targetVariants, setTargetVariants] = useState<CalculationVariant[]>([]);

  const object = objectId
    ? objects.find((candidateObject) => candidateObject.id === objectId) ?? null
    : null;
  const calc = object ? calcByObjectId[object.id] : undefined;
  const savedType = object ? getSavedCableTypeForObject(object.id) : null;
  const currentMark = cableType === savedType ? getCableMark(calc) : undefined;
  const options = useMemo(
    () => (
      cableType
        ? cableMarkOptionsFor(cableType, currentMark, calc)
        : []
    ),
    [cableType, cableMarkOptionsFor, calc, currentMark],
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
    () => CALCULATION_VARIANTS.map((targetVariant) => ({
      label: `СО${targetVariant}`,
      value: targetVariant,
    })),
    [],
  );
  const targetVariantsForSubmit = targetVariants.length > 0 ? targetVariants : [variant];

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
    onOpenObject?.(nextObject);
    setObjectId(nextObject.id);
    setCableType(nextType);
    setTargetVariants([variant]);
    setValue(cableMarkValueForCalc(nextType, getCableMark(currentCalc), currentCalc));
  }, [
    calcByObjectId,
    cableMarkValueForCalc,
    getSavedCableTypeForObject,
    onOpenObject,
    variant,
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
    setTargetVariants(normalizeCalculationVariantList(values));
  }, []);

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
