/**
 * @module electrical/workspace-modal-props-model
 * @owner electrical
 * Pure presentation helpers for ElecCalc workspace modals.
 */

import {
  buildCableSizingCandidateTableScrollX,
  type CandidateColumnWidthMeta,
} from '@/pages/electrical/elecCalcCandidateTableScrollModel';

export function resolveObjectActionDisabledReasonOrNull<T>(
  object: T | null | undefined,
  getReason: (object: T) => string | null,
): string | null {
  return object ? getReason(object) : null;
}

export type ElecCalcWorkspaceModalPresentationInput<
  TObject extends { id: string },
  TCableTypeOption = unknown,
> = {
  cableMarkModalObject: TObject | null | undefined;
  cableSizingModalObject: TObject | null | undefined;
  cableTypeOptionsForObject: (objectId: string | undefined) => TCableTypeOption[];
  getObjectActionDisabledReason: (object: TObject) => string | null;
  visibleCandidateColumnMetas: readonly CandidateColumnWidthMeta[];
};

/**
 * Resolves cable-type options, assignment disable reasons, and candidate table scrollX
 * for mark/sizing modals.
 */
export function buildElecCalcWorkspaceModalPresentation<
  TObject extends { id: string },
  TCableTypeOption = unknown,
>(
  input: ElecCalcWorkspaceModalPresentationInput<TObject, TCableTypeOption>,
) {
  const {
    cableMarkModalObject,
    cableSizingModalObject,
    cableTypeOptionsForObject,
    getObjectActionDisabledReason,
    visibleCandidateColumnMetas,
  } = input;

  return {
    cableMarkModalCableTypeOptions: cableTypeOptionsForObject(cableMarkModalObject?.id),
    cableSizingModalCableTypeOptions: cableTypeOptionsForObject(cableSizingModalObject?.id),
    cableMarkModalAssignmentReason: resolveObjectActionDisabledReasonOrNull(
      cableMarkModalObject,
      getObjectActionDisabledReason,
    ),
    cableSizingModalAssignmentReason: resolveObjectActionDisabledReasonOrNull(
      cableSizingModalObject,
      getObjectActionDisabledReason,
    ),
    cableSizingCandidateTableScrollX: buildCableSizingCandidateTableScrollX(
      visibleCandidateColumnMetas,
    ),
  };
}

/**
 * Documents modal props bag assembly for the view layer.
 * Identity-shaped so the hook can keep a single object literal without drift.
 */
export function buildElecCalcWorkspaceModalProps<T extends Record<string, unknown>>(props: T): T {
  return props;
}
