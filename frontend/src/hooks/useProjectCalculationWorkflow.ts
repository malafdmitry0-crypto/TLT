import { useEffect, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import {
  cancelCalculationWorkflow,
  getActiveCalculationWorkflow,
  getCalculationWorkflow,
} from '@/api/calculationWorkflows';

export const projectCalculationWorkflowQueryKey = (projectId?: string) => (
  ['project-calculation-workflow', projectId] as const
);
export const calculationWorkflowDetailQueryKey = (workflowId?: string | null) => (
  ['calculation-workflow', workflowId] as const
);

export function useProjectCalculationWorkflow(projectId?: string) {
  const queryClient = useQueryClient();
  const [trackedWorkflowId, setTrackedWorkflowId] = useState<string | null>(null);
  useEffect(() => setTrackedWorkflowId(null), [projectId]);
  const activeQuery = useQuery({
    queryKey: projectCalculationWorkflowQueryKey(projectId),
    queryFn: ({ signal }) => getActiveCalculationWorkflow(projectId!, signal),
    enabled: Boolean(projectId),
    staleTime: 0,
    refetchOnMount: 'always',
    refetchOnReconnect: true,
    refetchOnWindowFocus: true,
    refetchInterval: 2_000,
  });
  useEffect(() => {
    if (!activeQuery.isSuccess) return;
    setTrackedWorkflowId(activeQuery.data?.id ?? null);
  }, [activeQuery.data?.id, activeQuery.isSuccess]);
  const detailQuery = useQuery({
    queryKey: calculationWorkflowDetailQueryKey(trackedWorkflowId),
    queryFn: ({ signal }) => getCalculationWorkflow(trackedWorkflowId!, signal),
    enabled: Boolean(trackedWorkflowId),
    staleTime: 0,
    refetchInterval: (state) => (
      state.state.data && ['queued', 'enqueued', 'running', 'waiting_input'].includes(
        state.state.data.status,
      )
        ? 2_000
        : false
    ),
  });
  const cancelMutation = useMutation({
    mutationFn: (workflowId: string) => cancelCalculationWorkflow(workflowId),
    onSuccess: () => queryClient.invalidateQueries({
      queryKey: projectCalculationWorkflowQueryKey(projectId),
    }),
  });
  const workflow = detailQuery.data && detailQuery.data.project_id === projectId
    ? detailQuery.data
    : activeQuery.data ?? null;
  const isCalculationLocked = workflow != null && [
    'queued',
    'enqueued',
    'running',
    'waiting_input',
  ].includes(workflow.status);

  return {
    workflow,
    isCalculationLocked,
    query: activeQuery,
    cancelWorkflow: cancelMutation.mutateAsync,
    cancelPending: cancelMutation.isPending,
  };
}
