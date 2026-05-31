import { useMemo } from 'react';

import {
  FULL_FEATURE_CABLE_TYPES,
  MVP_CABLE_TYPES,
} from '@/pages/electrical/elecCalcCableTypeModel';
import type { CableTypeKey } from '@/pages/electrical/elecCalcMainTableModel';
import type { ElectricalNavigationState } from '@/pages/electrical/elecCalcPageModel';
import {
  resolveElectricalCandidateTableEngine,
  resolveElectricalTableEngine,
} from '@/utils/electricalTableEngine';

type ElecCalcBootLocation = {
  search: string;
  state: unknown;
};

type UseElecCalcBootViewStateOptions = {
  commercialFeaturesAvailable: boolean;
  location: ElecCalcBootLocation;
};

export function useElecCalcBootViewState({
  commercialFeaturesAvailable,
  location,
}: UseElecCalcBootViewStateOptions) {
  const availableCableTypeKeys = useMemo(
    () => (commercialFeaturesAvailable ? FULL_FEATURE_CABLE_TYPES : MVP_CABLE_TYPES),
    [commercialFeaturesAvailable],
  );
  const availableCableTypes = useMemo(
    () => new Set<CableTypeKey>(availableCableTypeKeys),
    [availableCableTypeKeys],
  );
  const electricalTableEngine = useMemo(
    () => resolveElectricalTableEngine({ search: location.search }),
    [location.search],
  );
  const electricalCandidateTableEngine = useMemo(
    () => resolveElectricalCandidateTableEngine({
      search: location.search,
      fallback: electricalTableEngine,
    }),
    [electricalTableEngine, location.search],
  );
  const electricalGlideEnabled = electricalTableEngine === 'glide';
  const electricalCandidateGlideEnabled = electricalCandidateTableEngine === 'glide';
  const navigationActiveJobId =
    (location.state as ElectricalNavigationState | null | undefined)?.activeJobId ?? null;

  return {
    availableCableTypeKeys,
    availableCableTypes,
    electricalTableEngine,
    electricalCandidateTableEngine,
    electricalGlideEnabled,
    electricalCandidateGlideEnabled,
    navigationActiveJobId,
  };
}
