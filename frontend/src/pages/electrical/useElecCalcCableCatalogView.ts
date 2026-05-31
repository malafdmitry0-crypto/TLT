import { useCallback, useMemo } from 'react';

import type { CableSource } from '@/api/calculations';
import {
  resolveCableCatalogStatuses,
  resolveCableRowsForType,
  type CableStatusRow,
} from '@/pages/electrical/elecCalcCableCatalogModel';
import type { CableTypeKey } from '@/pages/electrical/elecCalcMainTableModel';

type UseElecCalcCableCatalogViewOptions = {
  availableCableTypes: ReadonlySet<CableTypeKey>;
  cables: CableStatusRow[];
  builtinCables: CableStatusRow[];
  ttCables: CableStatusRow[];
  resistiveCables?: {
    single_core?: CableStatusRow[];
    three_core?: CableStatusRow[];
  };
  builtinResistiveCables?: {
    single_core?: CableStatusRow[];
    three_core?: CableStatusRow[];
  };
  effectiveSource: CableSource;
  visibleCableTypeControl: CableTypeKey | null;
};

export function useElecCalcCableCatalogView({
  availableCableTypes,
  cables,
  builtinCables,
  ttCables,
  resistiveCables,
  builtinResistiveCables,
  effectiveSource,
  visibleCableTypeControl,
}: UseElecCalcCableCatalogViewOptions) {
  const cableRowsForType = useCallback((type: CableTypeKey): CableStatusRow[] => {
    return resolveCableRowsForType({
      type,
      availableCableTypes,
      cables,
      builtinCables,
      ttCables,
      resistiveCables,
      builtinResistiveCables,
      effectiveSource,
    });
  }, [
    availableCableTypes,
    builtinCables,
    builtinResistiveCables,
    cables,
    effectiveSource,
    resistiveCables,
    ttCables,
  ]);

  const visibleCableCatalog = useMemo<CableStatusRow[]>(() => {
    if (!visibleCableTypeControl) return [];
    return cableRowsForType(visibleCableTypeControl);
  }, [
    cableRowsForType,
    visibleCableTypeControl,
  ]);
  const {
    commercialDataStatus,
    technicalDataStatus,
  } = useMemo(
    () => resolveCableCatalogStatuses(visibleCableTypeControl, visibleCableCatalog),
    [visibleCableCatalog, visibleCableTypeControl],
  );

  return {
    cableRowsForType,
    visibleCableCatalog,
    commercialDataStatus,
    technicalDataStatus,
  };
}
