import { useMemo } from 'react';

import type { ObjectQueryFieldCapability } from '@/types/project';
import {
  buildElectricalCandidateGlideColumns,
} from '@/utils/electricalCandidateGlideGrid';
import type {
  ElectricalCandidateColumnKey,
  ElectricalCandidateResolvedColumnMeta,
} from '@/utils/electricalCandidateTableColumns';
import {
  buildElectricalGlideColumns,
} from '@/utils/electricalGlideGrid';
import type {
  ElectricalColumnKey,
  ElectricalResolvedColumnMeta,
} from '@/utils/electricalTableColumns';
import type { HeatCalcGlideGridColumn } from '@/utils/heatCalcGlideGrid';
import {
  filterKindForCandidateColumn,
} from '@/domain/electrical/elecCalcTableFilterModel';

type ElecCalcGlideEnumOptionsByColumn = Record<string, Array<{ value: string; label: string }>>;

type UseElecCalcGlideColumnModelOptions = {
  visibleElectricalColumnMetas: readonly ElectricalResolvedColumnMeta[];
  fieldCapabilityByKey: Map<string, ObjectQueryFieldCapability>;
  enumOptionsByColumn: ElecCalcGlideEnumOptionsByColumn;
  getElectricalColumnAlign?: (key: ElectricalColumnKey) => HeatCalcGlideGridColumn['align'];
  visibleCandidateColumnMetas: readonly ElectricalCandidateResolvedColumnMeta[];
  candidateEnumOptionsByColumn: ElecCalcGlideEnumOptionsByColumn;
};

export function useElecCalcGlideColumnModel({
  visibleElectricalColumnMetas,
  fieldCapabilityByKey,
  enumOptionsByColumn,
  getElectricalColumnAlign,
  visibleCandidateColumnMetas,
  candidateEnumOptionsByColumn,
}: UseElecCalcGlideColumnModelOptions) {
  const electricalGlideColumns = useMemo(
    () => buildElectricalGlideColumns({
      columns: [...visibleElectricalColumnMetas],
      capabilitiesByKey: fieldCapabilityByKey,
      enumOptionsByColumn,
      getAlign: getElectricalColumnAlign,
    }),
    [
      enumOptionsByColumn,
      fieldCapabilityByKey,
      getElectricalColumnAlign,
      visibleElectricalColumnMetas,
    ],
  );
  const candidateGlideColumnMetaByKey = useMemo(
    () => new Map<ElectricalCandidateColumnKey, ElectricalCandidateResolvedColumnMeta>(
      visibleCandidateColumnMetas.map((column) => [column.key, column]),
    ),
    [visibleCandidateColumnMetas],
  );
  const electricalCandidateGlideColumns = useMemo(
    () => buildElectricalCandidateGlideColumns({
      columns: [...visibleCandidateColumnMetas],
      enumOptionsByColumn: candidateEnumOptionsByColumn,
      getFilterKind: filterKindForCandidateColumn,
    }),
    [
      candidateEnumOptionsByColumn,
      visibleCandidateColumnMetas,
    ],
  );

  return {
    electricalGlideColumns,
    candidateGlideColumnMetaByKey,
    electricalCandidateGlideColumns,
  };
}
