import type { ElecCalcCableSizingParams } from '@/pages/electrical/useElecCalcCableSizingModalState';
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
  recalc: ElecCalcCableSizingParams;
  layout?: ElectricalLayoutOverrideIntent;
  manualCableModel?: ElectricalManualCableOverrideIntent;
};

export function isSteamTracingDisabled(object: ProjectObject): boolean {
  const value = object.params?.steam_tracing;
  if (typeof value === 'boolean') return !value;
  if (typeof value !== 'string') return false;
  return ['no', 'false', '0', 'off'].includes(value.trim().toLowerCase());
}

export function baseManualCableModel(mark: string): string {
  return mark.trim().replace(/-(?:СТ|СР)$/u, '');
}

export function buildElectricalAssignmentOverridePatch({
  expectedVersion,
  object,
  recalc,
  layout,
  manualCableModel,
}: BuildElectricalAssignmentOverridePatchArgs): ElectricalAssignmentOverridesPatchRequest {
  const steamTemperature = isSteamTracingDisabled(object)
    ? { steam_temperature_c: null }
    : recalc.vaporTemperature == null
      ? {}
      : { steam_temperature_c: recalc.vaporTemperature };
  const tankLayout = object.object_type === 'tank'
    ? {
        ...(recalc.heatingHeight == null
          ? {}
          : { tank_heating_height_m: recalc.heatingHeight }),
        ...(recalc.layingStep == null
          ? {}
          : { tank_laying_step_m: recalc.layingStep }),
      }
    : {};
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
    ...steamTemperature,
    ...(recalc.maintainTemperature == null
      ? {}
      : { maintain_temperature_c: recalc.maintainTemperature }),
    ...(recalc.aggressiveProduct === undefined
      ? {}
      : { aggressive_product: recalc.aggressiveProduct }),
    ...tankLayout,
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
          }
        : assignment
    )),
  };
}
