/**
 * Pure helpers: which electrical objects need recalculation (E3 / FE-21).
 */
import type { ElectricalCalcSummary, ElectricalQueryAssignment } from '@/types/calculation';
import { isElectricalCalcStale } from '@/utils/calcStatus';

/** Assignment-level or calc-level stale (heat/Iдоп/catalog change). */
export function isElectricalObjectStale(
  calc: ElectricalCalcSummary | null | undefined,
  assignment: ElectricalQueryAssignment | null | undefined,
): boolean {
  if (assignment?.assignment_state === 'stale') return true;
  if (assignment?.assignment_state === 'unassigned' || !assignment?.system_type) {
    return false;
  }
  return isElectricalCalcStale(calc);
}

export function listStaleObjectIds(
  objectIds: readonly string[],
  calcByObjectId: Record<string, ElectricalCalcSummary | undefined>,
  assignmentByObjectId: ReadonlyMap<string, ElectricalQueryAssignment>,
): string[] {
  return objectIds.filter((objectId) =>
    isElectricalObjectStale(calcByObjectId[objectId], assignmentByObjectId.get(objectId)));
}

export function countStaleObjects(
  objectIds: readonly string[],
  calcByObjectId: Record<string, ElectricalCalcSummary | undefined>,
  assignmentByObjectId: ReadonlyMap<string, ElectricalQueryAssignment>,
): number {
  return listStaleObjectIds(objectIds, calcByObjectId, assignmentByObjectId).length;
}
