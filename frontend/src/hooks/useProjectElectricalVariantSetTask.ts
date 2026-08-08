import { useEffect, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import {
  cancelElectricalVariantSetTask,
  getActiveElectricalVariantSetTask,
  getElectricalVariantSetTask,
} from '@/api/electricalVariantSetTasks';

export const projectElectricalVariantSetTaskQueryKey = (projectId?: string) => (
  ['project-electrical-variant-set-task', projectId] as const
);
export const electricalVariantSetTaskDetailQueryKey = (taskId?: string | null) => (
  ['electrical-variant-set-task', taskId] as const
);

export function useProjectElectricalVariantSetTask(projectId?: string) {
  const queryClient = useQueryClient();
  const [trackedTaskId, setTrackedTaskId] = useState<string | null>(null);
  useEffect(() => setTrackedTaskId(null), [projectId]);
  const activeQuery = useQuery({
    queryKey: projectElectricalVariantSetTaskQueryKey(projectId),
    queryFn: ({ signal }) => getActiveElectricalVariantSetTask(projectId!, signal),
    enabled: Boolean(projectId),
    staleTime: 0,
    refetchOnMount: 'always',
    refetchOnReconnect: true,
    refetchOnWindowFocus: true,
    refetchInterval: 2_000,
  });
  useEffect(() => {
    if (!activeQuery.isSuccess) return;
    setTrackedTaskId(activeQuery.data?.id ?? null);
  }, [activeQuery.data?.id, activeQuery.isSuccess]);
  const detailQuery = useQuery({
    queryKey: electricalVariantSetTaskDetailQueryKey(trackedTaskId),
    queryFn: ({ signal }) => getElectricalVariantSetTask(trackedTaskId!, signal),
    enabled: Boolean(trackedTaskId),
    staleTime: 0,
    refetchInterval: (state) => (
      state.state.data && ['queued', 'enqueued', 'running'].includes(
        state.state.data.status,
      )
        ? 2_000
        : false
    ),
  });
  const cancelMutation = useMutation({
    mutationFn: (taskId: string) => cancelElectricalVariantSetTask(taskId),
    onSuccess: () => queryClient.invalidateQueries({
      queryKey: projectElectricalVariantSetTaskQueryKey(projectId),
    }),
  });
  const task = detailQuery.data && detailQuery.data.project_id === projectId
    ? detailQuery.data
    : activeQuery.data ?? null;
  const isCalculationLocked = task != null && [
    'queued',
    'enqueued',
    'running',
  ].includes(task.status);

  return {
    task,
    isCalculationLocked,
    query: activeQuery,
    cancelTask: cancelMutation.mutateAsync,
    cancelPending: cancelMutation.isPending,
  };
}
