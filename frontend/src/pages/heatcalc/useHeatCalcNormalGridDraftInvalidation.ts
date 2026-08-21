/**
 * @module heatcalc/normal-grid-draft-invalidation
 * @owner heat
 * @depends heatCalcDraftRowsModel
 * @does-not electrical
 */
import { useCallback, useEffect, useRef } from 'react';

import type { DraftRowsById } from '@/utils/heatCalcInlineEdit';
import { changedDraftRowIds } from '@/pages/heatcalc/heatCalcDraftRowsModel';

export type NormalGridDraftInvalidator = (rowIds?: readonly string[] | null) => void;

export function useHeatCalcNormalGridDraftInvalidation(
  draftRowsById: DraftRowsById,
  excelModeEnabled: boolean,
) {
  const normalGridDraftInvalidatorRef = useRef<NormalGridDraftInvalidator | null>(null);
  const previousNormalGridDraftRowsRef = useRef<DraftRowsById>({});

  const registerNormalGridDraftInvalidator = useCallback((invalidateRows: NormalGridDraftInvalidator) => {
    normalGridDraftInvalidatorRef.current = invalidateRows;
    return () => {
      if (normalGridDraftInvalidatorRef.current === invalidateRows) {
        normalGridDraftInvalidatorRef.current = null;
      }
    };
  }, []);

  useEffect(() => {
    const previous = previousNormalGridDraftRowsRef.current;
    previousNormalGridDraftRowsRef.current = draftRowsById;
    if (excelModeEnabled) return;
    const changedRowIds = changedDraftRowIds(previous, draftRowsById);
    if (changedRowIds.length > 0) {
      normalGridDraftInvalidatorRef.current?.(changedRowIds);
    }
  }, [draftRowsById, excelModeEnabled]);

  return {
    registerNormalGridDraftInvalidator,
  };
}
