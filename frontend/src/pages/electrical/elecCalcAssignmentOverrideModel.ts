import type { ElectricalQueryResponse } from '@/types/calculation';
import type {
  ElectricalAssignment,
  ElectricalAssignmentOverridesPatchRequest,
} from '@/types/electricalVariant';
import type { ProjectObject } from '@/types/project';

export type ElectricalLayoutOverrideIntent = {
  windingPitchMm: number | null;
  numberOfThreads: number | null;
};

export type ElectricalManualCableOverrideIntent = {
  value: string | null;
};

export type BuildElectricalAssignmentOverridePatchArgs = {
  expectedVersion: number;
  object: ProjectObject;
  supplyVoltage?: number | null;
  layout?: ElectricalLayoutOverrideIntent;
  manualCableModel?: ElectricalManualCableOverrideIntent;
};

export function exactManualCableModel(mark: string): string {
  return mark.trim();
}

export function buildElectricalAssignmentOverridePatch({
  expectedVersion,
  object,
  supplyVoltage,
  layout,
  manualCableModel,
}: BuildElectricalAssignmentOverridePatchArgs): ElectricalAssignmentOverridesPatchRequest {
  const rowLayout = layout
    ? {
        ...(object.object_type === 'pipe'
          ? {
              winding_pitch_mm: layout.windingPitchMm == null || layout.windingPitchMm === 0
                ? null
                : layout.windingPitchMm,
            }
          : {}),
        thread_count: layout.numberOfThreads,
      }
    : {};

  return {
    expected_version: expectedVersion,
    ...(supplyVoltage == null ? {} : { supply_voltage_v: supplyVoltage }),
    ...rowLayout,
    ...(manualCableModel === undefined
      ? {}
      : { manual_cable_model: manualCableModel.value }),
  };
}

export function updateElectricalQueryPageAssignment(
  current: ElectricalQueryResponse,
  updated: ElectricalAssignment,
): ElectricalQueryResponse {
  if (!current.assignments?.some((assignment) => assignment.object_id === updated.object_id)) {
    return current;
  }
  return {
    ...current,
    assignments: current.assignments.map((assignment) => (
      assignment.object_id === updated.object_id
        ? {
            ...assignment,
            system_type: updated.system_type,
            assignment_state: updated.assignment_state,
            version: updated.version,
            electrical_overrides: updated.electrical_overrides,
          }
        : assignment
    )),
  };
}
