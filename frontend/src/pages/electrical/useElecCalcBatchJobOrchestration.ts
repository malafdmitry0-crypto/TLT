import {
  useEffect,
  useRef,
  type Dispatch,
  type SetStateAction,
} from 'react';
import { appMessage as message } from '@/feedback/appFeedback';
import { useMutation } from '@tanstack/react-query';

import {
  cancelCalcTask,
  enqueueElectricalVariantBatchJob,
  type CableSource,
} from '@/api/calculations';
import type { ElecCalcCableSizingParams } from '@/pages/electrical/useElecCalcCableSizingModalState';
import { isBatchElectricalResponse } from '@/pages/electrical/elecCalcApiResponseGuards';
import { isResistiveCableType } from '@/pages/electrical/elecCalcCableTypeModel';
import type { CableTypeKey } from '@/domain/electrical/elecCalcMainTableModel';
import type {
  ElectricalBatchMutationArgs,
} from '@/pages/electrical/elecCalcPageModel';
import type {
  ElectricalBatchJobCompletion,
  RegisterElectricalBatchJob,
  TrackedElectricalBatchJob,
} from '@/pages/electrical/useElectricalBatchJobTracker';

type ObjectOverride = {
  object_id: string;
  cable_type?: CableTypeKey | null;
};

type UseElecCalcBatchJobOrchestrationOptions = {
  canMutate: boolean;
  projectId: string;
  electricalVariantId: string;
  electricalVariantName: string;
  trackedJob: TrackedElectricalBatchJob | null;
  completion: ElectricalBatchJobCompletion | null;
  registerJob: RegisterElectricalBatchJob;
  effectiveSource: CableSource;
  recalc: ElecCalcCableSizingParams;
  selectedCableType: CableTypeKey | null;
  defaultCableType: CableTypeKey;
  cableTypeForRecalculation: CableTypeKey;
  normalizeAvailableCableType: (type: CableTypeKey | null | undefined) => CableTypeKey;
  objectOverridesForIds: (objectIds: string[]) => ObjectOverride[];
  setCableTypeDraftByObjectId: Dispatch<SetStateAction<Record<string, CableTypeKey>>>;
};

const READ_ONLY_ERROR = 'Проект открыт в режиме просмотра';
const ACTIVE_JOB_ERROR = 'Для выбранного ЭР уже выполняется электрорасчёт';

export function useElecCalcBatchJobOrchestration({
  canMutate,
  projectId,
  electricalVariantId,
  electricalVariantName,
  trackedJob,
  completion,
  registerJob,
  effectiveSource,
  recalc,
  selectedCableType,
  defaultCableType,
  cableTypeForRecalculation,
  normalizeAvailableCableType,
  objectOverridesForIds,
  setCableTypeDraftByObjectId,
}: UseElecCalcBatchJobOrchestrationOptions) {
  const processedCompletionIdsRef = useRef(new Set<string>());

  const batchMut = useMutation({
    mutationFn: ({
      scope,
      objectIds,
      skipManual = true,
      cableType: cableTypeOverride,
      objectOverrides: explicitOverrides,
    }: ElectricalBatchMutationArgs) => {
      if (!canMutate) throw new Error(READ_ONLY_ERROR);
      if (trackedJob) throw new Error(ACTIVE_JOB_ERROR);

      const selectedObjectIds = objectIds ?? [];
      const objectOverrides = explicitOverrides
        ?? (scope === 'selected' ? objectOverridesForIds(selectedObjectIds) : []);
      const fallbackCableType = cableTypeOverride
        ?? (scope === 'selected'
          ? selectedCableType ?? defaultCableType
          : cableTypeForRecalculation);
      const effectiveCableType = normalizeAvailableCableType(fallbackCableType);
      const selectionMode = isResistiveCableType(effectiveCableType) ? 'auto' : undefined;
      const cableSpecificOptions = effectiveCableType === 'self_regulating_tt'
        ? {
            supplyVoltage: recalc.supplyVoltage,
          }
        : {
            supplyVoltage: recalc.supplyVoltage,
            connectionType: recalc.connectionType,
            windingCoefficient: recalc.windingCoefficient,
            heatingHeight: recalc.heatingHeight,
            layingStep: recalc.layingStep,
          };
      return enqueueElectricalVariantBatchJob(
        projectId,
        electricalVariantId,
        effectiveSource,
        effectiveCableType,
        {
          selectionMode,
          selectionPolicy: recalc.selectionPolicy,
          ...cableSpecificOptions,
          skipManual,
          objectIds: scope === 'selected' ? selectedObjectIds : undefined,
          forceCableType: scope === 'all' || cableTypeOverride != null,
          objectOverrides: objectOverrides.length > 0 ? objectOverrides : undefined,
        },
      );
    },
    onSuccess: (task, variables) => {
      registerJob(task, {
        projectId,
        electricalVariantId,
        electricalVariantName,
        scope: variables.scope,
        objectIds: variables.scope === 'selected' ? variables.objectIds : undefined,
      });
    },
    onError: (error: Error) => message.error(error.message),
  });

  const cancelJobMut = useMutation({
    mutationFn: () => {
      if (!canMutate) throw new Error(READ_ONLY_ERROR);
      if (!trackedJob) throw new Error('Активная задача электрорасчёта не найдена');
      return cancelCalcTask(trackedJob.taskId);
    },
    onSuccess: (task) => {
      if (!trackedJob) return;
      registerJob(task, {
        projectId: trackedJob.projectId,
        electricalVariantId: trackedJob.electricalVariantId,
        electricalVariantName: trackedJob.electricalVariantName,
        scope: trackedJob.scope,
        objectIds: trackedJob.objectIds,
      });
    },
    onError: (error: Error) => message.error(error.message),
  });

  useEffect(() => {
    if (!completion || completion.status !== 'succeeded') return;
    if (
      completion.projectId !== projectId
      || completion.electricalVariantId !== electricalVariantId
      || processedCompletionIdsRef.current.has(completion.taskId)
    ) {
      return;
    }

    processedCompletionIdsRef.current.add(completion.taskId);
    const result = isBatchElectricalResponse(completion.task?.result)
      ? completion.task.result
      : null;
    const resultScope = result?.scope ?? completion.scope;
    setCableTypeDraftByObjectId((previous) => {
      if (resultScope === 'all') return {};
      if (completion.objectIds.length === 0) return previous;
      const next = { ...previous };
      completion.objectIds.forEach((objectId) => {
        delete next[objectId];
      });
      return next;
    });
  }, [
    completion,
    electricalVariantId,
    projectId,
    setCableTypeDraftByObjectId,
  ]);

  return {
    activeJob: trackedJob?.latestTask ?? null,
    activeJobId: trackedJob?.taskId ?? null,
    batchMut,
    cancelJobMut,
  };
}
