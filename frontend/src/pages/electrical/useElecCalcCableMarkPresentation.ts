/**
 * @module electrical/cable-mark-presentation
 * @owner electrical
 * @depends cable option/catalog models
 * @does-not heat
 */
import { useCallback, useMemo } from 'react';

import type { CableSource } from '@/api/calculations';
import type { ElectricalCalcSummary } from '@/types/calculation';
import type { CableTypeKey } from '@/domain/electrical/elecCalcMainTableModel';
import {
  AUTO_CABLE_MARK_VALUE,
  cableMarkOptionValue,
  catalogSourceFromSnapshot,
  shouldShowProjectCableOption,
  type CableMarkSelectOption,
} from '@/pages/electrical/elecCalcCableOptionModel';
import {
  resolveCableRowForMark,
  type CableStatusRow,
} from '@/pages/electrical/elecCalcCableCatalogModel';
import { getCableMark } from '@/domain/electrical/elecCalcResultValueModel';

export type UseElecCalcCableMarkPresentationArgs = {
  effectiveSource: CableSource;
  cableRowsForType: (type: CableTypeKey) => CableStatusRow[];
  manualCableOptionsForType: (type: CableTypeKey) => CableMarkSelectOption[];
  cableSizingEffectiveCableType: CableTypeKey | null | undefined;
  cableSizingManualMark: string | null | undefined;
  cableSizingModalCalc: ElectricalCalcSummary | undefined;
};

export function useElecCalcCableMarkPresentation({
  effectiveSource,
  cableRowsForType,
  manualCableOptionsForType,
  cableSizingEffectiveCableType,
  cableSizingManualMark,
  cableSizingModalCalc,
}: UseElecCalcCableMarkPresentationArgs) {
  const findCableRowForMark = useCallback((
    type: CableTypeKey,
    mark: string | undefined,
    calc: ElectricalCalcSummary | undefined,
    selectedSource?: CableSource | null,
  ): CableStatusRow | null => resolveCableRowForMark({
    type,
    mark,
    calc,
    rows: cableRowsForType(type),
    selectedSource,
  }), [cableRowsForType]);

  const cableSizingModalSelectedCable = useMemo<CableStatusRow | null>(() => (
    cableSizingEffectiveCableType
      ? findCableRowForMark(
          cableSizingEffectiveCableType,
          cableSizingManualMark ?? getCableMark(cableSizingModalCalc),
          cableSizingModalCalc,
          catalogSourceFromSnapshot(cableSizingModalCalc),
        )
      : null
  ), [
    cableSizingEffectiveCableType,
    cableSizingManualMark,
    cableSizingModalCalc,
    findCableRowForMark,
  ]);

  const cableMarkValueForCalc = useCallback((
    type: CableTypeKey,
    mark: string | undefined,
    calc: ElectricalCalcSummary | undefined,
  ) => {
    if (!mark) return AUTO_CABLE_MARK_VALUE;
    if (shouldShowProjectCableOption(calc)) return cableMarkOptionValue('project', mark);
    const savedSource = catalogSourceFromSnapshot(calc);
    const manualOptions = manualCableOptionsForType(type);
    const matchingOption = manualOptions.find((option) =>
      option.mark === mark && (!savedSource || option.cableSource === savedSource))
      ?? manualOptions.find((option) => option.mark === mark);
    return matchingOption?.value ?? cableMarkOptionValue(savedSource ?? effectiveSource, mark);
  }, [effectiveSource, manualCableOptionsForType]);

  return {
    findCableRowForMark,
    cableSizingModalSelectedCable,
    cableMarkValueForCalc,
  };
}
