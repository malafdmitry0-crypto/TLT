import type { ElectricalQueryAssignment } from '@/types/calculation';
import type { ElectricalSystemType } from '@/types/electricalVariant';
import type { ProjectObject } from '@/types/project';

/** Shared system tab on the electrical page (one table, one filter). */
export type ElectricalSystemView =
  | 'all'
  | 'unassigned'
  | ElectricalSystemType;

export const ELECTRICAL_SYSTEM_VIEWS: Array<{
  key: ElectricalSystemView;
  label: string;
}> = [
  { key: 'all', label: 'Все' },
  { key: 'unassigned', label: 'Нераспределённые объекты' },
  { key: 'self_regulating', label: 'Самрег' },
  { key: 'resistive', label: 'Резистив' },
  { key: 'skin', label: 'Скин' },
  { key: 'mineral', label: 'Минеральный' },
];

export function isUnassignedAssignment(
  assignment: ElectricalQueryAssignment | undefined,
): boolean {
  if (!assignment) return true;
  if (assignment.assignment_state === 'unassigned') return true;
  return assignment.system_type == null;
}

/** Whether an object belongs to the active system tab. */
export function objectMatchesSystemView(
  objectId: string,
  assignmentByObjectId: ReadonlyMap<string, ElectricalQueryAssignment>,
  view: ElectricalSystemView,
): boolean {
  if (view === 'all') return true;
  const assignment = assignmentByObjectId.get(objectId);
  if (view === 'unassigned') return isUnassignedAssignment(assignment);
  return assignment?.system_type === view;
}

export function filterObjectsBySystemView(
  objects: readonly ProjectObject[],
  assignmentByObjectId: ReadonlyMap<string, ElectricalQueryAssignment>,
  view: ElectricalSystemView,
): ProjectObject[] {
  return objects.filter((obj) =>
    objectMatchesSystemView(obj.id, assignmentByObjectId, view));
}

export function systemViewLabel(view: ElectricalSystemView): string {
  return ELECTRICAL_SYSTEM_VIEWS.find((item) => item.key === view)?.label ?? view;
}
