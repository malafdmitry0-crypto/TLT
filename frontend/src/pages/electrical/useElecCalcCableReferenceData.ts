import { useQuery } from '@tanstack/react-query';

import {
  listCables,
  type CableSource,
} from '@/api/calculations';
import { referenceQueryKeys, referenceQueryOptions } from '@/api/referenceQueries';
import { getCablesTt, getResistiveCables } from '@/api/references';
import type { CableTypeKey } from '@/domain/electrical/elecCalcMainTableModel';
import { useElecCalcCableCatalogView } from '@/pages/electrical/useElecCalcCableCatalogView';
import { useElecCalcCableMarkOptions } from '@/pages/electrical/useElecCalcCableMarkOptions';

type UseElecCalcCableReferenceDataOptions = {
  projectSelected: boolean;
  commercialFeaturesAvailable: boolean;
  availableCableTypes: ReadonlySet<CableTypeKey>;
  effectiveSource: CableSource;
  visibleCableTypeControl: CableTypeKey | null;
  aggressiveProduct: boolean;
  cableSizingEffectiveCableType: CableTypeKey;
};

export function useElecCalcCableReferenceData({
  projectSelected,
  commercialFeaturesAvailable,
  availableCableTypes,
  effectiveSource,
  visibleCableTypeControl,
  aggressiveProduct,
  cableSizingEffectiveCableType,
}: UseElecCalcCableReferenceDataOptions) {
  const { data: cables = [] } = useQuery({
    queryKey: referenceQueryKeys.cables(effectiveSource, 'self_regulating'),
    queryFn: () => listCables(effectiveSource, 'self_regulating'),
    enabled: projectSelected && availableCableTypes.has('self_regulating'),
    ...referenceQueryOptions,
  });
  const { data: builtinCables = [] } = useQuery({
    queryKey: referenceQueryKeys.cables('builtin', 'self_regulating'),
    queryFn: () => listCables('builtin', 'self_regulating'),
    enabled: projectSelected && availableCableTypes.has('self_regulating'),
    ...referenceQueryOptions,
  });
  const { data: ttCables = [] } = useQuery({
    queryKey: referenceQueryKeys.ttCables,
    queryFn: getCablesTt,
    enabled: projectSelected && commercialFeaturesAvailable,
    ...referenceQueryOptions,
  });
  const { data: resistiveCables } = useQuery({
    queryKey: referenceQueryKeys.resistiveCables(effectiveSource),
    queryFn: () => getResistiveCables(effectiveSource),
    enabled: projectSelected && commercialFeaturesAvailable,
    ...referenceQueryOptions,
  });
  const { data: builtinResistiveCables } = useQuery({
    queryKey: referenceQueryKeys.resistiveCables('builtin'),
    queryFn: () => getResistiveCables('builtin'),
    enabled: projectSelected && commercialFeaturesAvailable,
    ...referenceQueryOptions,
  });

  const {
    cableRowsForType,
    commercialDataStatus,
    technicalDataStatus,
  } = useElecCalcCableCatalogView({
    availableCableTypes,
    cables,
    builtinCables,
    ttCables,
    resistiveCables,
    builtinResistiveCables,
    effectiveSource,
    visibleCableTypeControl,
  });

  const {
    manualCableOptionsForType,
    cableMarkOptionsFor,
    cableSizingManualOptions,
  } = useElecCalcCableMarkOptions({
    availableCableTypes,
    cables,
    builtinCables,
    ttCables,
    resistiveCables,
    builtinResistiveCables,
    effectiveSource,
    aggressiveProduct,
    cableSizingEffectiveCableType,
  });

  return {
    cableRowsForType,
    commercialDataStatus,
    technicalDataStatus,
    manualCableOptionsForType,
    cableMarkOptionsFor,
    cableSizingManualOptions,
  };
}
