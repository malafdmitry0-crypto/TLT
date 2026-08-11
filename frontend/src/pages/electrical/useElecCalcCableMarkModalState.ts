import { useCallback, useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';

import {
  getCableOptions,
  type CableOptionOut,
  type CableSource,
} from '@/api/calculations';
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
  calcLayoutValues,
  currentElectricalCalc,
  getCableMark,
  getThreadSource,
} from '@/domain/electrical/elecCalcResultValueModel';
import type { CableTypeKey } from '@/domain/electrical/elecCalcMainTableModel';
import { buildElecCalcAutoAvailability } from '@/pages/electrical/elecCalcAutoAvailabilityModel';

type UseElecCalcCableMarkModalStateOptions = {
  objects: readonly ProjectObject[];
  calcByObjectId: Record<string, ElectricalCalcSummary | undefined>;
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
  const [threadCountValue, setThreadCountValue] = useState<'auto' | '1' | '2' | '3'>('auto');

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
  const {
    data: backendTtQueryData,
    status: backendTtQueryStatus,
    refetch: refetchBackendTtOptions,
  } = backendTtQuery;
  const backendTtOptions = backendTtQueryData ?? null;
  const autoAvailability = useMemo(() => buildElecCalcAutoAvailability({
    enabled: cableType === 'self_regulating_tt',
    status: backendTtQueryStatus,
    options: backendTtQueryData,
  }), [backendTtQueryData, backendTtQueryStatus, cableType]);
  const retryAutoAvailability = useCallback(() => {
    void refetchBackendTtOptions();
  }, [refetchBackendTtOptions]);
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
  const close = useCallback(() => {
    setObjectId(null);
    setCableType(null);
    setValue(null);
    setThreadCountValue('auto');
  }, []);
  const open = useCallback((nextObject: ProjectObject) => {
    const nextCalc = calcByObjectId[nextObject.id];
    const currentCalc = currentElectricalCalc(nextCalc);
    const nextType = getSavedCableTypeForObject(nextObject.id);
    const nextMarkValue = cableMarkValueForCalc(
      nextType,
      getCableMark(currentCalc),
      currentCalc,
    );
    onOpenObject?.(nextObject);
    setObjectId(nextObject.id);
    setCableType(nextType);
    setValue(nextMarkValue);
    const threadSource = getThreadSource(currentCalc);
    const threads = Math.round(calcLayoutValues(currentCalc).numberOfThreads);
    setThreadCountValue(
      (threadSource === 'manual' || threadSource === 'previous_result') && threads >= 1 && threads <= 3
        ? String(threads) as '1' | '2' | '3'
        : nextMarkValue === AUTO_CABLE_MARK_VALUE ? 'auto' : '1',
    );
  }, [
    calcByObjectId,
    cableMarkValueForCalc,
    getSavedCableTypeForObject,
    onOpenObject,
  ]);
  const changeCableType = useCallback((nextType: CableTypeKey) => {
    setCableType(normalizeAvailableCableType(nextType));
    setValue(AUTO_CABLE_MARK_VALUE);
    setThreadCountValue('auto');
    onCableTypeChange?.();
  }, [normalizeAvailableCableType, onCableTypeChange]);
  const normalizeSelectedCableType = useCallback(() => {
    setCableType((current) => current == null ? null : normalizeAvailableCableType(current));
  }, [normalizeAvailableCableType]);
  return {
    objectId,
    object,
    calc,
    cableType,
    setCableType,
    value,
    setValue: (nextValue: string) => {
      setValue(nextValue);
      if (nextValue === AUTO_CABLE_MARK_VALUE) {
        setThreadCountValue('auto');
      } else {
        setThreadCountValue((current) => current === 'auto' ? '1' : current);
      }
    },
    threadCountValue,
    setThreadCountValue,
    savedType,
    currentMark,
    options,
    optionByValue,
    selectedMark,
    selectedOption,
    selectedCable,
    autoAvailability,
    retryAutoAvailability,
    close,
    open,
    changeCableType,
    normalizeSelectedCableType,
  };
}
