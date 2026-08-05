import { useCallback, useEffect, useMemo, useRef } from 'react';
import { useQueryClient } from '@tanstack/react-query';

import type { ApiError } from '@/api/client';
import { electricalDataQueryKeys } from '@/api/electricalQueryKeys';
import {
  electricalAssignmentQueryKeys,
  patchElectricalAssignmentOverrides,
} from '@/api/electricalVariants';
import {
  buildElectricalAssignmentOverridePatch,
  type ElectricalLayoutOverrideIntent,
  type ElectricalManualCableOverrideIntent,
  updateElectricalQueryPageAssignment,
} from '@/pages/electrical/elecCalcAssignmentOverrideModel';
import type { ElecCalcCableSizingParams } from '@/pages/electrical/useElecCalcCableSizingModalState';
import type {
  ElectricalQueryAssignment,
  ElectricalQueryResponse,
} from '@/types/calculation';
import type { ProjectObject } from '@/types/project';

const ASSIGNMENT_CONTEXT_REQUIRED =
  'Назначение объекта в текущем ЭР не загружено. Обновите страницу.';
export const ASSIGNMENT_VERSION_CONFLICT_MESSAGE =
  'Данные текущего ЭР изменились. Обновили их — повторите действие.';

type PersistElectricalAssignmentOverridesArgs = {
  objectId: string;
  supplyVoltage?: number | null;
  layout?: ElectricalLayoutOverrideIntent;
  manualCableModel?: ElectricalManualCableOverrideIntent;
};

type UseElecCalcAssignmentOverridePersistenceOptions = {
  projectId?: string;
  electricalVariantId: string;
  assignmentByObjectId: ReadonlyMap<string, ElectricalQueryAssignment>;
  objects: readonly ProjectObject[];
  recalc: ElecCalcCableSizingParams;
};

export function isAssignmentVersionConflict(error: unknown): boolean {
  const apiError = error as ApiError;
  return apiError?.status === 409
    || apiError?.code === 'ELECTRICAL_ASSIGNMENT_VERSION_CONFLICT';
}

export function electricalAssignmentOverrideErrorMessage(error: unknown): string {
  if (isAssignmentVersionConflict(error)) return ASSIGNMENT_VERSION_CONFLICT_MESSAGE;
  return error instanceof Error && error.message ? error.message : ASSIGNMENT_CONTEXT_REQUIRED;
}

export function useElecCalcAssignmentOverridePersistence({
  projectId,
  electricalVariantId,
  assignmentByObjectId,
  objects,
  recalc,
}: UseElecCalcAssignmentOverridePersistenceOptions) {
  const qc = useQueryClient();
  const objectById = useMemo(
    () => new Map(objects.map((object) => [object.id, object])),
    [objects],
  );
  const versionByObjectIdRef = useRef(new Map(
    [...assignmentByObjectId].map(([objectId, assignment]) => [objectId, assignment.version]),
  ));

  useEffect(() => {
    assignmentByObjectId.forEach((assignment, objectId) => {
      versionByObjectIdRef.current.set(objectId, assignment.version);
    });
  }, [assignmentByObjectId]);

  const invalidateConflictScope = useCallback(async () => {
    if (!projectId) return;
    await Promise.all([
      qc.invalidateQueries({
        queryKey: electricalDataQueryKeys.queries(projectId, electricalVariantId),
      }),
      qc.invalidateQueries({
        queryKey: electricalAssignmentQueryKeys.root(projectId, electricalVariantId),
      }),
    ]);
  }, [electricalVariantId, projectId, qc]);

  const persistTtOverrides = useCallback(async ({
    objectId,
    supplyVoltage,
    layout,
    manualCableModel,
  }: PersistElectricalAssignmentOverridesArgs) => {
    const object = objectById.get(objectId);
    const assignment = assignmentByObjectId.get(objectId);
    if (!projectId || !object || !assignment || assignment.system_type !== 'self_regulating') {
      throw new Error(ASSIGNMENT_CONTEXT_REQUIRED);
    }
    const expectedVersion = versionByObjectIdRef.current.get(objectId) ?? assignment.version;
    try {
      const updated = await patchElectricalAssignmentOverrides(
        projectId,
        electricalVariantId,
        objectId,
        buildElectricalAssignmentOverridePatch({
          expectedVersion,
          object,
          recalc,
          supplyVoltage,
          layout,
          manualCableModel,
        }),
      );
      versionByObjectIdRef.current.set(objectId, updated.version);
      qc.setQueriesData<ElectricalQueryResponse>(
        { queryKey: electricalDataQueryKeys.queries(projectId, electricalVariantId) },
        (current) => current
          ? updateElectricalQueryPageAssignment(current, updated)
          : current,
      );
      void qc.invalidateQueries({
        queryKey: electricalAssignmentQueryKeys.root(projectId, electricalVariantId),
      });
      void qc.invalidateQueries({
        queryKey: electricalDataQueryKeys.candidates(projectId, electricalVariantId, objectId),
      });
      return updated;
    } catch (error) {
      if (isAssignmentVersionConflict(error)) await invalidateConflictScope();
      throw error;
    }
  }, [
    assignmentByObjectId,
    electricalVariantId,
    invalidateConflictScope,
    objectById,
    projectId,
    qc,
    recalc,
  ]);

  return { objectById, persistTtOverrides };
}
