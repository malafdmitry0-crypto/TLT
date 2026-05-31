import { useEffect, useRef } from 'react';

import type { ElectricalBatchScope } from '@/pages/electrical/elecCalcPageModel';
import type { CableSource } from '@/api/calculations';
import type { HeatCalcTableViewState } from '@/utils/heatCalcTableFindability';

type UseElecCalcPageScopeEffectsOptions = {
  projectId?: string;
  variant: number;
  effectiveSource: CableSource;
  tablePageSize: number;
  tableViewState: HeatCalcTableViewState;
  navigationActiveJobId: string | null;
  resetTablePage: () => void;
  resetPaginationCache: () => void;
  setActiveJobId: (jobId: string | null) => void;
  setActiveBatchScope: (scope: ElectricalBatchScope | null) => void;
};

export function useElecCalcPageScopeEffects({
  projectId,
  variant,
  effectiveSource,
  tablePageSize,
  tableViewState,
  navigationActiveJobId,
  resetTablePage,
  resetPaginationCache,
  setActiveJobId,
  setActiveBatchScope,
}: UseElecCalcPageScopeEffectsOptions) {
  const pageScopeRef = useRef<{ projectId?: string; variant: number } | null>(null);

  useEffect(() => {
    resetTablePage();
  }, [projectId, resetTablePage, variant]);

  useEffect(() => {
    resetPaginationCache();
  }, [effectiveSource, projectId, resetPaginationCache, tablePageSize, tableViewState, variant]);

  useEffect(() => {
    if (navigationActiveJobId) {
      setActiveJobId(navigationActiveJobId);
    }
  }, [navigationActiveJobId, setActiveJobId]);

  useEffect(() => {
    const currentScope = { projectId, variant };
    const previousScope = pageScopeRef.current;
    pageScopeRef.current = currentScope;
    if (!previousScope) return;
    if (!previousScope.projectId && currentScope.projectId) return;
    if (
      previousScope.projectId !== currentScope.projectId ||
      previousScope.variant !== currentScope.variant
    ) {
      setActiveJobId(null);
      setActiveBatchScope(null);
    }
  }, [projectId, setActiveBatchScope, setActiveJobId, variant]);
}
