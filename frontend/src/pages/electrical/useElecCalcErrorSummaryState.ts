/**
 * @module electrical/error-summary-state
 * @owner electrical
 * @depends elecCalcErrorSummaryModel
 * @does-not heat
 */
import { useMemo } from 'react';

import type { ElectricalCalcSummary } from '@/types/calculation';
import type { ProjectObject } from '@/types/project';
import {
  buildElectricalErrorItems,
  electricalErrorGuidanceForItem,
  resolveActiveElectricalErrorItem,
} from '@/pages/electrical/elecCalcErrorSummaryModel';

export type UseElecCalcErrorSummaryStateArgs = {
  objects: ProjectObject[];
  calcByObjectId: Record<string, ElectricalCalcSummary | undefined>;
  electricalDisplayOffset: number;
  activeRowId: string | null;
};

export function useElecCalcErrorSummaryState({
  objects,
  calcByObjectId,
  electricalDisplayOffset,
  activeRowId,
}: UseElecCalcErrorSummaryStateArgs) {
  const electricalErrorItems = useMemo(
    () => buildElectricalErrorItems({
      objects,
      calcByObjectId,
      electricalDisplayOffset,
    }),
    [electricalDisplayOffset, objects, calcByObjectId],
  );

  const activeElectricalErrorItem = useMemo(
    () => resolveActiveElectricalErrorItem({
      activeRowId,
      objects,
      calcByObjectId,
      electricalDisplayOffset,
      electricalErrorItems,
    }),
    [activeRowId, electricalDisplayOffset, electricalErrorItems, objects, calcByObjectId],
  );

  const activeElectricalErrorGuidance = useMemo(
    () => electricalErrorGuidanceForItem(activeElectricalErrorItem),
    [activeElectricalErrorItem],
  );

  return {
    electricalErrorItems,
    activeElectricalErrorItem,
    activeElectricalErrorGuidance,
  };
}
