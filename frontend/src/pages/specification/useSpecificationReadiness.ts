/**
 * @module specification/readiness
 * @owner specification
 * Read-only readiness query and recovery routing for the selected ER scope.
 */
import { useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import type { NavigateFunction } from 'react-router-dom';
import {
  getSpecificationReadiness,
  specificationReadinessQueryKey,
} from '@/api/specifications';
import { buildElectricalVariantNavigation } from '@/pages/specification/specificationPageModelHelpers';
import { resolveSpecificationReadinessView } from '@/pages/specification/specificationReadinessModel';
import { ROUTES } from '@/routes/routes';

type UseSpecificationReadinessArgs = {
  projectId?: string;
  variantIds: readonly string[];
  generationPending: boolean;
  generationFailed: boolean;
  navigate: NavigateFunction;
  openSettings: () => void;
};

export function useSpecificationReadiness({
  projectId,
  variantIds,
  generationPending,
  generationFailed,
  navigate,
  openSettings,
}: UseSpecificationReadinessArgs) {
  const sortedVariantIds = useMemo(() => [...variantIds].sort(), [variantIds]);
  const enabled = Boolean(projectId && sortedVariantIds.length > 0);
  const query = useQuery({
    queryKey: specificationReadinessQueryKey(projectId, sortedVariantIds),
    queryFn: () => getSpecificationReadiness(projectId!, sortedVariantIds),
    enabled,
    staleTime: 0,
    refetchOnMount: 'always',
  });
  const readiness = resolveSpecificationReadinessView({
    enabled,
    isLoading: query.isLoading,
    isError: query.isError,
    generationPending,
    generationFailed,
    data: query.data,
  });

  const handleRecovery = () => {
    const blocker = readiness.primaryBlocker;
    if (!blocker || blocker.next_action === 'retry_generation') {
      void query.refetch();
      return;
    }
    if (blocker.next_action === 'open_electrical_variant') {
      if (blocker.scope !== 'electrical_variant') return;
      const target = buildElectricalVariantNavigation(blocker.electrical_variant_id);
      navigate(target.to, { state: target.state });
      return;
    }
    if (blocker.next_action === 'recalculate_heat') {
      navigate(ROUTES.heatCalc);
      return;
    }
    openSettings();
  };

  return {
    readiness,
    retryReadiness: query.refetch,
    handleReadinessRecovery: handleRecovery,
  };
}
