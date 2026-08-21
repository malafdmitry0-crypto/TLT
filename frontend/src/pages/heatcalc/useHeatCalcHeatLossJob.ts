import { useCallback, useEffect, useMemo, useState } from 'react';
import { appMessage as antdMessage } from '@/feedback/appFeedback';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import { cancelCalcTask, enqueueHeatLossBatchJob, getCalcTask } from '@/api/calculations';
import type { ProjectObject } from '@/types/project';
import { getCalcJobRefetchInterval, isActiveCalcJobStatus } from '@/utils/calcJobPolling';
import type { HeatCalcIndexedTableRow } from '@/utils/heatCalcTableFindability';
import { isBatchHeatLossResponse } from '@/utils/heatCalcPageUtils';

interface UseHeatCalcHeatLossJobOptions {
  dirtyDraftRowCount: number;
  projectId?: string | null;
  projectObjectCount: number;
  selectedRowId?: string | null;
  selectedVisibleRows: HeatCalcIndexedTableRow<ProjectObject>[];
  submittingObject: boolean;
}

export function useHeatCalcHeatLossJob({
  dirtyDraftRowCount,
  projectId,
  projectObjectCount,
  selectedRowId,
  selectedVisibleRows,
  submittingObject,
}: UseHeatCalcHeatLossJobOptions) {
  const queryClient = useQueryClient();
  const [activeHeatLossJobId, setActiveHeatLossJobId] = useState<string | null>(null);

  useEffect(() => {
    setActiveHeatLossJobId(null);
  }, [projectId]);

  const { data: activeHeatLossJob } = useQuery({
    queryKey: ['calc-job', activeHeatLossJobId],
    queryFn: () => getCalcTask(activeHeatLossJobId!),
    enabled: !!activeHeatLossJobId,
    refetchInterval: (query) => getCalcJobRefetchInterval(query.state.data?.status),
    refetchIntervalInBackground: true,
  });

  const invalidateHeatLossProjectData = useCallback(() => {
    if (!projectId) return;
    queryClient.invalidateQueries({ queryKey: ['project', projectId, 'objects'] });
    queryClient.invalidateQueries({ queryKey: ['project', projectId, 'electrical-page'] });
    queryClient.invalidateQueries({ queryKey: ['project', projectId, 'electrical-query'] });
    queryClient.invalidateQueries({ queryKey: ['project', projectId, 'electrical-query-capabilities'] });
  }, [projectId, queryClient]);

  const heatLossBatchMut = useMutation({
    mutationFn: (objectIds?: string[]) => enqueueHeatLossBatchJob(projectId!, true, objectIds),
    onSuccess: (task) => {
      setActiveHeatLossJobId(task.id);
      queryClient.invalidateQueries({ queryKey: ['calc-job', task.id] });
      antdMessage.info('Пересчёт теплопотерь поставлен в очередь');
    },
    onError: (error) => {
      antdMessage.error(error instanceof Error ? error.message : 'Не удалось запустить пересчёт теплопотерь');
    },
  });

  const cancelHeatLossJobMut = useMutation({
    mutationFn: () => cancelCalcTask(activeHeatLossJobId!),
    onSuccess: (task) => {
      setActiveHeatLossJobId(task.id);
      antdMessage.warning('Пересчёт теплопотерь остановлен');
    },
    onError: (error) => {
      antdMessage.error(error instanceof Error ? error.message : 'Не удалось остановить пересчёт теплопотерь');
    },
  });

  useEffect(() => {
    if (!activeHeatLossJob) return;
    if (activeHeatLossJob.status === 'succeeded') {
      invalidateHeatLossProjectData();
      const result = isBatchHeatLossResponse(activeHeatLossJob.result) ? activeHeatLossJob.result : null;
      if (result && result.failed > 0) {
        antdMessage.warning(
          `Пересчёт теплопотерь завершён: пересчитано ${result.updated}, ошибок ${result.failed}`,
          10,
        );
      } else if (result) {
        antdMessage.success(`Пересчёт теплопотерь завершён: пересчитано ${result.updated}`);
      } else {
        antdMessage.success('Пересчёт теплопотерь завершён');
      }
      setActiveHeatLossJobId(null);
    }
    if (activeHeatLossJob.status === 'failed') {
      antdMessage.error(activeHeatLossJob.error_message || 'Пересчёт теплопотерь завершился ошибкой');
      setActiveHeatLossJobId(null);
    }
    if (activeHeatLossJob.status === 'cancelled') {
      setActiveHeatLossJobId(null);
    }
  }, [activeHeatLossJob, invalidateHeatLossProjectData]);

  const activeHeatLossJobStatus = activeHeatLossJob?.status ?? null;
  const isHeatLossJobActive = isActiveCalcJobStatus(activeHeatLossJobStatus);
  const heatLossJobProgress = activeHeatLossJob?.progress;
  const heatLossJobProgressLabel = heatLossJobProgress?.total
    ? `${heatLossJobProgress.current}/${heatLossJobProgress.total}` +
      `${heatLossJobProgress.percent != null ? ` (${heatLossJobProgress.percent}%)` : ''}`
    : activeHeatLossJobStatus ?? '';

  const heatLossRecalcObjectIds = useMemo(() => {
    const selectedIds = selectedVisibleRows.map(({ record }) => record.id);
    if (selectedIds.length > 0) return selectedIds;
    if (selectedRowId) return [selectedRowId];
    return undefined;
  }, [selectedRowId, selectedVisibleRows]);

  const heatLossRecalcDisabled =
    projectObjectCount === 0 ||
    dirtyDraftRowCount > 0 ||
    submittingObject ||
    isHeatLossJobActive;
  const heatLossScopedRecalcDisabled = heatLossRecalcDisabled || !heatLossRecalcObjectIds;
  const heatLossRecalcTooltip = dirtyDraftRowCount > 0
    ? 'Сохраните или сбросьте изменения в таблице перед пересчётом'
    : projectObjectCount === 0
      ? 'Добавьте объекты для пересчёта'
      : isHeatLossJobActive
        ? 'Пересчёт теплопотерь уже выполняется'
        : heatLossRecalcObjectIds
          ? selectedVisibleRows.length > 0
            ? `Пересчитать теплопотери выбранных строк (${heatLossRecalcObjectIds.length})`
            : 'Пересчитать теплопотери активной строки'
          : 'Выберите строку для точечного пересчёта или нажмите «Пересчитать все»';
  const heatLossRecalcAriaLabel = heatLossRecalcObjectIds
    ? selectedVisibleRows.length > 0
      ? `Пересчитать теплопотери выбранных строк (${heatLossRecalcObjectIds.length})`
      : 'Пересчитать теплопотери активной строки'
    : 'Пересчитать теплопотери выбранных или активной строки';
  const heatLossRecalcAllTooltip = dirtyDraftRowCount > 0
    ? 'Сохраните или сбросьте изменения в таблице перед пересчётом'
    : projectObjectCount === 0
      ? 'Добавьте объекты для пересчёта'
      : isHeatLossJobActive
        ? 'Пересчёт теплопотерь уже выполняется'
        : 'Пересчитать теплопотери всех объектов проекта';

  const recalcScoped = useCallback(() => {
    heatLossBatchMut.mutate(heatLossRecalcObjectIds);
  }, [heatLossBatchMut, heatLossRecalcObjectIds]);

  const recalcAll = useCallback(() => {
    heatLossBatchMut.mutate(undefined);
  }, [heatLossBatchMut]);

  const cancelJob = useCallback(() => {
    cancelHeatLossJobMut.mutate();
  }, [cancelHeatLossJobMut]);

  return {
    activeHeatLossJobId,
    isHeatLossJobActive,
    heatLossJobProgressLabel,
    heatLossRecalcObjectIds,
    heatLossRecalcDisabled,
    heatLossScopedRecalcDisabled,
    heatLossRecalcTooltip,
    heatLossRecalcAriaLabel,
    heatLossRecalcAllTooltip,
    heatLossBatchPending: heatLossBatchMut.isPending,
    cancelHeatLossJobPending: cancelHeatLossJobMut.isPending,
    recalcScoped,
    recalcAll,
    cancelJob,
  };
}
