/**
 * @module electrical/assign-auto-calc-model
 * @owner electrical
 * @depends none
 * @does-not heat
 *
 * PDF-ER-08: after assign → auto cable selection payload for batch.
 */
import type { ElectricalSupportedSystemType } from '@/types/electricalVariant';
import type { CableTypeKey } from '@/domain/electrical/elecCalcMainTableModel';

export type AssignAutoCalcBatchInput = {
  systemType: ElectricalSupportedSystemType | 'self_regulating' | 'resistive' | string;
  objectIds: readonly string[];
};

export type AssignAutoCalcBatchPayload = {
  scope: 'selected';
  objectIds: string[];
  skipManual: true;
  cableType: CableTypeKey;
  objectOverrides: Array<{ object_id: string; cable_type: CableTypeKey }>;
  nextSystemView: 'self_regulating' | 'resistive';
};

/** Build batch mutate payload after assignment; null when nothing to run. */
export function buildAssignAutoCalcBatchPayload({
  systemType,
  objectIds,
}: AssignAutoCalcBatchInput): AssignAutoCalcBatchPayload | null {
  if (objectIds.length === 0) return null;
  if (systemType !== 'resistive' && systemType !== 'self_regulating') return null;

  // E0 / FE-13: Samreg assignment runs TT calc (self_regulating_tt), not legacy TLT.
  // Resistive remains single_core for residual UI until E1 hides it (BE will 422).
  const cableType: CableTypeKey = systemType === 'resistive'
    ? 'single_core'
    : 'self_regulating_tt';

  return {
    scope: 'selected',
    objectIds: [...objectIds],
    skipManual: true,
    cableType,
    objectOverrides: objectIds.map((object_id) => ({
      object_id,
      cable_type: cableType,
    })),
    nextSystemView: systemType,
  };
}
