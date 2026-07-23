import { useMemo } from 'react';

import type { ElectricalCandidate } from '@/types/calculation';
import type { ObjectQueryFieldCapability } from '@/types/project';
import type { ElectricalCandidateColumnKey } from '@/utils/electricalCandidateTableColumns';
import type { HeatCalcColumnValueAccessors } from '@/utils/heatCalcTableFindability';
import {
  buildCandidateEnumOptionsByColumn,
  buildElectricalEnumOptionsByColumn,
  buildFieldCapabilityByKey,
} from '@/domain/electrical/elecCalcTableFilterModel';

type UseElecCalcFilterOptionsOptions = {
  electricalFields?: readonly ObjectQueryFieldCapability[] | null;
  cableSizingCandidates: readonly ElectricalCandidate[];
  visibleCandidateColumnMetas: readonly { key: ElectricalCandidateColumnKey }[];
  candidateColumnValueAccessors: HeatCalcColumnValueAccessors<ElectricalCandidate>;
};

export function useElecCalcFilterOptions({
  electricalFields,
  cableSizingCandidates,
  visibleCandidateColumnMetas,
  candidateColumnValueAccessors,
}: UseElecCalcFilterOptionsOptions) {
  const fieldCapabilityByKey = useMemo(
    () => buildFieldCapabilityByKey(electricalFields),
    [electricalFields],
  );
  const enumOptionsByColumn = useMemo(
    () => buildElectricalEnumOptionsByColumn(electricalFields),
    [electricalFields],
  );
  const candidateEnumOptionsByColumn = useMemo(
    () => buildCandidateEnumOptionsByColumn(
      cableSizingCandidates,
      visibleCandidateColumnMetas,
      candidateColumnValueAccessors,
    ),
    [cableSizingCandidates, candidateColumnValueAccessors, visibleCandidateColumnMetas],
  );

  return {
    fieldCapabilityByKey,
    enumOptionsByColumn,
    candidateEnumOptionsByColumn,
  };
}
