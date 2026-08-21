import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { appMessage as message } from '@/feedback/appFeedback';
import { useQueries, useQueryClient } from '@tanstack/react-query';

import { getCalcTask } from '@/api/calculations';
import { electricalDataQueryKeys } from '@/api/electricalQueryKeys';
import { electricalAssignmentQueryKeys } from '@/api/electricalVariants';
import { isBatchElectricalResponse } from '@/pages/electrical/elecCalcApiResponseGuards';
import type { ElectricalBatchScope } from '@/pages/electrical/elecCalcPageModel';
import type { CalculationTaskResponse } from '@/types/calculation';
import { getCalcJobRefetchInterval, isActiveCalcJobStatus } from '@/utils/calcJobPolling';

const calcTaskQueryKey = (taskId: string) => ['calc-job', taskId] as const;

export type ElectricalBatchJobMetadata = {
  projectId: string;
  electricalVariantId: string;
  electricalVariantName: string;
  scope: ElectricalBatchScope;
  objectIds?: readonly string[];
};

export type RegisterElectricalBatchJob = (
  task: CalculationTaskResponse,
  metadata: ElectricalBatchJobMetadata,
) => boolean;

type ElectricalBatchJobDescriptor = Omit<ElectricalBatchJobMetadata, 'objectIds'> & {
  taskId: string;
  objectIds: readonly string[];
};

export type ElectricalBatchJobCompletionStatus =
  | 'succeeded'
  | 'failed'
  | 'cancelled'
  | 'mismatch';

export type ElectricalBatchJobCompletion = ElectricalBatchJobDescriptor & {
  status: ElectricalBatchJobCompletionStatus;
  task: CalculationTaskResponse | null;
};

export type TrackedElectricalBatchJob = ElectricalBatchJobDescriptor & {
  latestTask: CalculationTaskResponse | null;
  error: Error | null;
};

class ElectricalBatchJobScopeMismatchError extends Error {
  readonly task: CalculationTaskResponse;

  constructor(task: CalculationTaskResponse) {
    super('Фоновая задача не соответствует ожидаемому проекту или ЭР');
    this.name = 'ElectricalBatchJobScopeMismatchError';
    this.task = task;
  }
}

function createDescriptor(
  taskId: string,
  metadata: ElectricalBatchJobMetadata,
): ElectricalBatchJobDescriptor {
  return {
    taskId,
    projectId: metadata.projectId,
    electricalVariantId: metadata.electricalVariantId,
    electricalVariantName: metadata.electricalVariantName,
    scope: metadata.scope,
    objectIds: [...(metadata.objectIds ?? [])],
  };
}

function taskMatchesDescriptor(
  task: CalculationTaskResponse,
  descriptor: ElectricalBatchJobDescriptor,
): boolean {
  return task.id === descriptor.taskId
    && task.type === 'electrical_batch'
    && task.project_id === descriptor.projectId
    && task.electrical_variant_id === descriptor.electricalVariantId;
}

function scopeLabel(descriptor: ElectricalBatchJobDescriptor): string {
  if (descriptor.scope === 'all') return 'всех объектов';
  if (descriptor.objectIds.length === 0) return 'выбранных объектов';
  return `выбранных объектов (${descriptor.objectIds.length})`;
}

function mismatchMessage(descriptor: ElectricalBatchJobDescriptor): string {
  return `${descriptor.electricalVariantName} · ответ задачи для ${scopeLabel(descriptor)} `
    + 'не соответствует проекту или ЭР; данные не обновлены';
}

function completionFrom(
  descriptor: ElectricalBatchJobDescriptor,
  status: ElectricalBatchJobCompletionStatus,
  task: CalculationTaskResponse | null,
): ElectricalBatchJobCompletion {
  return { ...descriptor, status, task };
}

function upsertDescriptor(
  descriptors: ElectricalBatchJobDescriptor[],
  nextDescriptor: ElectricalBatchJobDescriptor,
): ElectricalBatchJobDescriptor[] {
  const existingIndex = descriptors.findIndex(({ taskId }) => taskId === nextDescriptor.taskId);
  if (existingIndex < 0) return [...descriptors, nextDescriptor];
  const next = [...descriptors];
  next[existingIndex] = nextDescriptor;
  return next;
}

export function useElectricalBatchJobTracker() {
  const queryClient = useQueryClient();
  const [descriptors, setDescriptors] = useState<ElectricalBatchJobDescriptor[]>([]);
  const [completionByVariant, setCompletionByVariant] = useState<
    Record<string, ElectricalBatchJobCompletion>
  >({});
  const announcedTaskIdsRef = useRef(new Set<string>());
  const processedOutcomesRef = useRef(new Set<string>());
  const rejectedTaskIdsRef = useRef(new Set<string>());

  const clearPreviousCompletion = useCallback((descriptor: ElectricalBatchJobDescriptor) => {
    setCompletionByVariant((previous) => {
      const completion = previous[descriptor.electricalVariantId];
      if (!completion || completion.taskId === descriptor.taskId) return previous;
      const next = { ...previous };
      delete next[descriptor.electricalVariantId];
      return next;
    });
  }, []);

  const registerJob = useCallback((
    task: CalculationTaskResponse,
    metadata: ElectricalBatchJobMetadata,
  ): boolean => {
    const descriptor = createDescriptor(task.id, metadata);
    if (!taskMatchesDescriptor(task, descriptor)) {
      setCompletionByVariant((previous) => ({
        ...previous,
        [descriptor.electricalVariantId]: completionFrom(descriptor, 'mismatch', task),
      }));
      message.error(mismatchMessage(descriptor));
      return false;
    }

    queryClient.setQueryData(calcTaskQueryKey(task.id), task);
    clearPreviousCompletion(descriptor);
    setDescriptors((previous) => upsertDescriptor(previous, descriptor));

    if (isActiveCalcJobStatus(task.status) && !announcedTaskIdsRef.current.has(task.id)) {
      announcedTaskIdsRef.current.add(task.id);
      message.info(
        `${descriptor.electricalVariantName} · электрорасчёт ${scopeLabel(descriptor)} `
        + 'поставлен в очередь',
      );
    }
    return true;
  }, [clearPreviousCompletion, queryClient]);

  const registerJobId = useCallback((
    taskId: string,
    metadata: ElectricalBatchJobMetadata,
  ): boolean => {
    if (!taskId) return false;
    const descriptor = createDescriptor(taskId, metadata);
    clearPreviousCompletion(descriptor);
    setDescriptors((previous) => upsertDescriptor(previous, descriptor));
    return true;
  }, [clearPreviousCompletion]);

  const removeJob = useCallback((taskId: string) => {
    setDescriptors((previous) => previous.filter((descriptor) => descriptor.taskId !== taskId));
  }, []);

  const taskQueries = useQueries({
    queries: descriptors.map((descriptor) => ({
      queryKey: calcTaskQueryKey(descriptor.taskId),
      queryFn: async () => {
        const task = await getCalcTask(descriptor.taskId);
        if (!taskMatchesDescriptor(task, descriptor)) {
          throw new ElectricalBatchJobScopeMismatchError(task);
        }
        return task;
      },
      enabled: !rejectedTaskIdsRef.current.has(descriptor.taskId),
      retry: 2,
      retryDelay: (attemptIndex: number) => 250 * (attemptIndex + 1),
      staleTime: Infinity,
      refetchInterval: (query: { state: { data?: CalculationTaskResponse } }) =>
        getCalcJobRefetchInterval(query.state.data?.status),
      refetchIntervalInBackground: true,
    })),
  });

  const trackedJobs = useMemo<TrackedElectricalBatchJob[]>(() => descriptors.map(
    (descriptor, index) => {
      const query = taskQueries[index];
      const mismatchTask = query.error instanceof ElectricalBatchJobScopeMismatchError
        ? query.error.task
        : null;
      return {
        ...descriptor,
        latestTask: query.data ?? mismatchTask,
        error: query.error instanceof Error ? query.error : null,
      };
    },
  ), [descriptors, taskQueries]);

  useEffect(() => {
    trackedJobs.forEach((trackedJob) => {
      const { latestTask, error, ...descriptor } = trackedJob;

      if (error instanceof ElectricalBatchJobScopeMismatchError) {
        const outcomeKey = `${descriptor.taskId}:mismatch`;
        if (processedOutcomesRef.current.has(outcomeKey)) return;
        processedOutcomesRef.current.add(outcomeKey);
        rejectedTaskIdsRef.current.add(descriptor.taskId);
        setCompletionByVariant((previous) => ({
          ...previous,
          [descriptor.electricalVariantId]: completionFrom(
            descriptor,
            'mismatch',
            error.task,
          ),
        }));
        message.error(mismatchMessage(descriptor));
        removeJob(descriptor.taskId);
        return;
      }

      if (error && !latestTask) {
        const outcomeKey = `${descriptor.taskId}:poll-error:${error.message}`;
        if (processedOutcomesRef.current.has(outcomeKey)) return;
        processedOutcomesRef.current.add(outcomeKey);
        setCompletionByVariant((previous) => ({
          ...previous,
          [descriptor.electricalVariantId]: completionFrom(
            descriptor,
            'failed',
            null,
          ),
        }));
        message.error(
          `${descriptor.electricalVariantName} · не удалось получить состояние расчёта `
          + `${scopeLabel(descriptor)}: ${error.message}`,
        );
        removeJob(descriptor.taskId);
        return;
      }

      if (!latestTask || isActiveCalcJobStatus(latestTask.status)) return;
      if (!taskMatchesDescriptor(latestTask, descriptor)) {
        const outcomeKey = `${descriptor.taskId}:mismatch`;
        if (processedOutcomesRef.current.has(outcomeKey)) return;
        processedOutcomesRef.current.add(outcomeKey);
        rejectedTaskIdsRef.current.add(descriptor.taskId);
        setCompletionByVariant((previous) => ({
          ...previous,
          [descriptor.electricalVariantId]: completionFrom(
            descriptor,
            'mismatch',
            latestTask,
          ),
        }));
        message.error(mismatchMessage(descriptor));
        removeJob(descriptor.taskId);
        return;
      }

      const outcomeKey = `${latestTask.id}:${latestTask.status}:${latestTask.finished_at ?? ''}`;
      if (processedOutcomesRef.current.has(outcomeKey)) return;
      processedOutcomesRef.current.add(outcomeKey);

      if (latestTask.status === 'succeeded') {
        setCompletionByVariant((previous) => ({
          ...previous,
          [descriptor.electricalVariantId]: completionFrom(
            descriptor,
            'succeeded',
            latestTask,
          ),
        }));
        void queryClient.invalidateQueries({
          queryKey: electricalDataQueryKeys.variant(
            descriptor.projectId,
            descriptor.electricalVariantId,
          ),
        });
        void queryClient.invalidateQueries({
          queryKey: electricalAssignmentQueryKeys.root(
            descriptor.projectId,
            descriptor.electricalVariantId,
          ),
        });
        void queryClient.invalidateQueries({
          queryKey: ['project', descriptor.projectId, 'objects', 'summary'],
        });

        const result = isBatchElectricalResponse(latestTask.result)
          ? latestTask.result
          : null;
        if (result && result.calculated === 0 && result.heat_loss_failed > 0) {
          message.warning(
            `${descriptor.electricalVariantName} · электрорасчёт ${scopeLabel(descriptor)} `
            + `не выполнен: не рассчитаны теплопотери (${result.heat_loss_failed})`,
          );
        } else if (result && (result.skipped > 0 || result.heat_loss_failed > 0)) {
          message.warning(
            `${descriptor.electricalVariantName} · рассчитано для ${scopeLabel(descriptor)}: `
            + `${result.calculated}, пропущено: ${result.skipped}`
            + `${result.heat_loss_failed > 0
              ? `, ошибок теплопотерь: ${result.heat_loss_failed}`
              : ''}`,
          );
        } else if (result) {
          message.success(
            `${descriptor.electricalVariantName} · расчёт выполнен для `
            + `${scopeLabel(descriptor)}: ${result.calculated}`,
          );
        } else {
          message.success(
            `${descriptor.electricalVariantName} · расчёт ${scopeLabel(descriptor)} выполнен`,
          );
        }
        removeJob(descriptor.taskId);
        return;
      }

      if (latestTask.status === 'failed') {
        setCompletionByVariant((previous) => ({
          ...previous,
          [descriptor.electricalVariantId]: completionFrom(
            descriptor,
            'failed',
            latestTask,
          ),
        }));
        message.error(
          `${descriptor.electricalVariantName} · электрорасчёт ${scopeLabel(descriptor)} `
          + `завершился ошибкой: ${latestTask.error_message || 'неизвестная ошибка'}`,
        );
        removeJob(descriptor.taskId);
        return;
      }

      if (latestTask.status === 'cancelled') {
        setCompletionByVariant((previous) => ({
          ...previous,
          [descriptor.electricalVariantId]: completionFrom(
            descriptor,
            'cancelled',
            latestTask,
          ),
        }));
        message.warning(
          `${descriptor.electricalVariantName} · электрорасчёт ${scopeLabel(descriptor)} отменён`,
        );
        removeJob(descriptor.taskId);
      }
    });
  }, [queryClient, removeJob, trackedJobs]);

  return {
    registerJob,
    registerJobId,
    trackedJobs,
    completionByVariant,
    removeJob,
  };
}
