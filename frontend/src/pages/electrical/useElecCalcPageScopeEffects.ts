import { useEffect } from 'react';

import type { CableSource } from '@/api/calculations';
import type { HeatCalcTableViewState } from '@/utils/heatCalcTableFindability';

type UseElecCalcPageScopeEffectsOptions = {
  projectId?: string;
  variant: string | number;
  effectiveSource: CableSource;
  tablePageSize: number;
  tableViewState: HeatCalcTableViewState;
  resetTablePage: () => void;
  resetPaginationCache: () => void;
};

export function useElecCalcPageScopeEffects({
  projectId,
  variant,
  effectiveSource,
  tablePageSize,
  tableViewState,
  resetTablePage,
  resetPaginationCache,
}: UseElecCalcPageScopeEffectsOptions) {
  useEffect(() => {
    resetTablePage();
  }, [projectId, resetTablePage, variant]);

  useEffect(() => {
    resetPaginationCache();
  }, [effectiveSource, projectId, resetPaginationCache, tablePageSize, tableViewState, variant]);
}
