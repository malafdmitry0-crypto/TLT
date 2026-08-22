import type {
  ElectricalQueryAssignment,
  ElectricalQueryResponse,
} from '@/types/calculation';
import type { ElectricalSupportedSystemType } from '@/types/electricalVariant';
import type { CableTypeKey } from '@/domain/electrical/elecCalcMainTableModel';

const SYSTEM_LABEL: Record<ElectricalSupportedSystemType, string> = {
  self_regulating: 'Самрег',
  resistive: 'Резистив',
};

export function electricalSystemForCableType(
  cableType: CableTypeKey | null | undefined,
): ElectricalSupportedSystemType | null {
  if (cableType === 'self_regulating' || cableType === 'self_regulating_tt') {
    return 'self_regulating';
  }
  if (cableType === 'single_core' || cableType === 'three_core') {
    return 'resistive';
  }
  return null;
}

export function electricalAssignmentProjectionMap(
  pages: readonly Pick<ElectricalQueryResponse, 'assignments'>[],
): Map<string, ElectricalQueryAssignment> {
  const result = new Map<string, ElectricalQueryAssignment>();
  pages.forEach((page) => {
    (page.assignments ?? []).forEach((assignment) => {
      result.set(assignment.object_id, assignment);
    });
  });
  return result;
}

/** Optimistic concurrency tokens for assignment mutations (finite versions only). */
export function electricalAssignmentVersionsMap(
  assignmentByObjectId: ReadonlyMap<string, ElectricalQueryAssignment>,
): Map<string, number> {
  const map = new Map<string, number>();
  assignmentByObjectId.forEach((assignment, objectId) => {
    if (Number.isFinite(assignment.version)) map.set(objectId, assignment.version);
  });
  return map;
}

export const ELECTRICAL_ASSIGNMENT_SELECTION_INCOMPATIBLE_WARNING =
  'Можно выбрать только объекты, назначенные в совместимую систему текущего ЭР.';

export function electricalAssignmentCompatibilityReason(
  assignment: ElectricalQueryAssignment | undefined,
  cableType: CableTypeKey | null | undefined,
): string | null {
  const availabilityReason = electricalAssignmentAvailabilityReason(assignment);
  if (availabilityReason) return availabilityReason;
  const assignedSystem = assignment?.system_type;
  if (assignedSystem !== 'self_regulating' && assignedSystem !== 'resistive') {
    return 'Назначенный тип системы пока не поддерживает электрический расчёт.';
  }
  const targetSystem = electricalSystemForCableType(cableType);
  if (!targetSystem) {
    return 'Выбранный тип кабеля пока не поддерживает электрический расчёт.';
  }
  if (assignedSystem !== targetSystem) {
    return `Объект назначен в «${SYSTEM_LABEL[assignedSystem]}». Выберите совместимый тип кабеля.`;
  }
  return null;
}

export function electricalAssignmentAvailabilityReason(
  assignment: ElectricalQueryAssignment | undefined,
): string | null {
  if (!assignment) {
    return 'Назначение объекта для выбранного ЭР не загружено. Обновите страницу.';
  }
  if (assignment.assignment_state === 'unassigned' || !assignment.system_type) {
    return 'Сначала назначьте объект в систему выбранного ЭР.';
  }
  if (assignment.assignment_state === 'unsupported') {
    return 'Назначенный тип системы пока не поддерживает электрический расчёт.';
  }
  return null;
}

export function preferredCableTypeForElectricalAssignment(
  assignment: ElectricalQueryAssignment | undefined,
  currentCableType: CableTypeKey | null | undefined,
): CableTypeKey | null {
  if (electricalAssignmentAvailabilityReason(assignment)) return null;
  const assignedSystem = assignment?.system_type;
  if (assignedSystem !== 'self_regulating' && assignedSystem !== 'resistive') return null;
  // E0: Samreg system always prefers TT calc cable type (legacy self_regulating is not calculable).
  if (assignedSystem === 'self_regulating') {
    return 'self_regulating_tt';
  }
  if (electricalSystemForCableType(currentCableType) === 'resistive') {
    return currentCableType ?? 'single_core';
  }
  return 'single_core';
}

export function compatibleAssignedObjectIds(
  objectIds: readonly string[],
  assignmentByObjectId: ReadonlyMap<string, ElectricalQueryAssignment>,
  cableType: CableTypeKey | null | undefined,
): string[] {
  return objectIds.filter((objectId) =>
    electricalAssignmentCompatibilityReason(assignmentByObjectId.get(objectId), cableType) == null,
  );
}
