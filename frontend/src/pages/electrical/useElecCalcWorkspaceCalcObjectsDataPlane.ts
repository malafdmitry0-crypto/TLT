/**
 * @module electrical/workspace-calc-objects-data-plane
 * @owner electrical
 * Calc-objects slice: capabilities/page queries, projection, row/assignment
 * selection, batch orchestration, page-scope effects, query-cache updater.
 */
import { useCallback, useMemo } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';

import {
  getElectricalQueryCapabilities,
  queryElectrical,
  type CableSource,
} from '@/api/calculations';
import { electricalDataQueryKeys } from '@/api/electricalQueryKeys';
import type { CalculationVariant } from '@/store/calculationVariantStore';
import type {
  ElectricalCalcSummary,
  ElectricalQueryResponse,
} from '@/types/calculation';
import type { ProjectObjectsPageCursor } from '@/types/project';
import type { CableTypeKey } from '@/domain/electrical/elecCalcMainTableModel';
import {
  buildElectricalQueryRequest,
  updateElectricalQueryPageCalculation,
} from '@/pages/electrical/elecCalcQueryModel';
import type { ElectricalSystemView } from '@/pages/electrical/elecCalcSystemViewModel';
import type { LegacyElectricalVariantTarget } from '@/pages/electrical/elecCalcVariantModel';
import { useElecCalcAssignmentSelectionState } from '@/pages/electrical/useElecCalcAssignmentSelectionState';
import { useElecCalcBatchJobOrchestration } from '@/pages/electrical/useElecCalcBatchJobOrchestration';
import { useElecCalcCableTypeState } from '@/pages/electrical/useElecCalcCableTypeState';
import { useElecCalcPageScopeEffects } from '@/pages/electrical/useElecCalcPageScopeEffects';
import { useElecCalcRowSelectionState } from '@/pages/electrical/useElecCalcRowSelectionState';
import { useElecCalcTableProjection } from '@/pages/electrical/useElecCalcTableProjection';
import type {
  ElectricalBatchJobCompletion,
  RegisterElectricalBatchJob,
  TrackedElectricalBatchJob,
} from '@/pages/electrical/useElectricalBatchJobTracker';
import type { ElecCalcCableSizingParams } from '@/pages/electrical/useElecCalcCableSizingModalState';
import type { HeatCalcTableViewState } from '@/utils/heatCalcTableFindability';

export type UseElecCalcWorkspaceCalcObjectsDataPlaneArgs = {
  projectId: string;
  project: { id: string } | null | undefined;
  electricalVariantId: string;
  electricalVariantName: string;
  variant: CalculationVariant;
  canMutate: boolean;
  trackedJob: TrackedElectricalBatchJob | null;
  completion: ElectricalBatchJobCompletion | null;
  registerJob: RegisterElectricalBatchJob;
  cableSource: CableSource;
  effectiveSource: CableSource;
  availableCableTypes: ReadonlySet<CableTypeKey>;
  electricalGlideEnabled: boolean;
  systemView: ElectricalSystemView;
  tableViewState: HeatCalcTableViewState;
  tablePage: number;
  tablePageSize: number;
  electricalPageCursor: ProjectObjectsPageCursor | null;
  electricalInfinitePages: Record<number, ElectricalQueryResponse>;
  recalc: ElecCalcCableSizingParams;
  resetTablePage: () => void;
  resetPaginationCache: () => void;
};

export function useElecCalcWorkspaceCalcObjectsDataPlane({
  projectId,
  project,
  electricalVariantId,
  electricalVariantName,
  variant,
  canMutate,
  trackedJob,
  completion,
  registerJob,
  cableSource,
  effectiveSource,
  availableCableTypes,
  electricalGlideEnabled,
  systemView,
  tableViewState,
  tablePage,
  tablePageSize,
  electricalPageCursor,
  electricalInfinitePages,
  recalc,
  resetTablePage,
  resetPaginationCache,
}: UseElecCalcWorkspaceCalcObjectsDataPlaneArgs) {
  const qc = useQueryClient();

  const {
    data: electricalQueryCapabilities,
    error: electricalCapabilitiesError,
    isError: isElectricalCapabilitiesError,
    refetch: retryElectricalCapabilities,
  } = useQuery({
    queryKey: electricalDataQueryKeys.capabilities(project!.id, electricalVariantId),
    queryFn: () => getElectricalQueryCapabilities(
      project!.id,
      variant,
      electricalVariantId,
    ),
    enabled: !!project,
    staleTime: 60_000,
  });

  const electricalQueryRequest = useMemo(
    () => (project
      ? buildElectricalQueryRequest(
        project.id,
        electricalVariantId,
        variant,
        cableSource,
        tableViewState,
        tablePage,
        tablePageSize,
        electricalQueryCapabilities,
        electricalPageCursor,
      )
      : null),
    [
      electricalPageCursor,
      electricalQueryCapabilities,
      electricalVariantId,
      project,
      cableSource,
      tablePage,
      tablePageSize,
      tableViewState,
      variant,
    ],
  );

  const {
    data: electricalPage,
    isFetching: isElectricalPageFetching,
    isPlaceholderData: isElectricalPagePlaceholderData,
    error: electricalPageError,
    isError: isElectricalPageError,
    refetch: retryElectricalPage,
  } = useQuery({
    queryKey: electricalDataQueryKeys.page(
      project!.id,
      electricalVariantId,
      electricalQueryRequest,
    ),
    queryFn: () => queryElectrical(electricalQueryRequest!),
    enabled: !!project && electricalQueryRequest != null && !!electricalQueryCapabilities,
  });

  const pageSummary = electricalPage?.summary;
  const pageInfo = electricalPage?.page_info;
  const nextElectricalPageCursor = pageInfo?.next_cursor;

  const {
    electricalLoadedPages,
    objects,
    elecCalcs,
    electricalDisplayOffset,
    stats,
  } = useElecCalcTableProjection({
    selectedLegacyVariantNumber: variant,
    electricalGlideEnabled,
    electricalPage,
    electricalInfinitePages,
    isElectricalPagePlaceholderData,
    tablePage,
  });

  const {
    activeRowId,
    selectedRowKeys,
    setSelectedRowKeys,
    activateRowId,
    openElectricalRow,
  } = useElecCalcRowSelectionState({
    projectId: project?.id,
    variant: electricalVariantId,
    tablePage,
    tablePageSize,
    objects,
  });

  const cableTypes = useElecCalcCableTypeState({
    availableCableTypes,
    calcByObjectId: stats.calcByObjectId,
    selectedRowKeys,
    projectId: project?.id,
    variant: electricalVariantId,
  });

  const {
    assignmentByObjectId,
    versionByObjectId,
    scopedObjects,
    compatibleSelectedRowKeys,
    handleAssignmentAwareSelectionChange,
    getObjectActionDisabledReason,
    getObjectCalculationDisabledReason,
    preferredObjectActionCableType,
  } = useElecCalcAssignmentSelectionState({
    electricalLoadedPages,
    objects,
    systemView,
    selectedRowKeys,
    setSelectedRowKeys,
    batchCableType: cableTypes.cableTypeForRecalculation,
    getSavedCableTypeForObject: cableTypes.getSavedCableTypeForObject,
  });

  const {
    activeJob,
    activeJobId,
    batchMut,
    cancelJobMut,
  } = useElecCalcBatchJobOrchestration({
    canMutate,
    projectId,
    electricalVariantId,
    electricalVariantName,
    trackedJob,
    completion,
    registerJob,
    effectiveSource,
    recalc,
    selectedCableType: cableTypes.selectedCableType,
    defaultCableType: cableTypes.defaultCableType,
    cableTypeForRecalculation: cableTypes.cableTypeForRecalculation,
    normalizeAvailableCableType: cableTypes.normalizeAvailableCableType,
    objectOverridesForIds: cableTypes.objectOverridesForIds,
    setCableTypeDraftByObjectId: cableTypes.setCableTypeDraftByObjectId,
  });

  useElecCalcPageScopeEffects({
    projectId: project?.id,
    variant: electricalVariantId,
    effectiveSource,
    tablePageSize,
    tableViewState,
    resetTablePage,
    resetPaginationCache,
  });

  const setElectricalQueryCalculation = useCallback((
    calculation: ElectricalCalcSummary,
    target?: LegacyElectricalVariantTarget,
  ) => {
    if (!project?.id) return;
    const targetVariantId = target?.id ?? electricalVariantId;
    const targetLegacyVariantNumber = target?.legacyVariantNumber ?? variant;
    if (calculation.variant_number !== targetLegacyVariantNumber) return;
    qc.setQueriesData<ElectricalQueryResponse>(
      { queryKey: electricalDataQueryKeys.queries(project.id, targetVariantId) },
      (current) => {
        if (!current) return current;
        return updateElectricalQueryPageCalculation(current, calculation);
      },
    );
  }, [electricalVariantId, project?.id, qc, variant]);

  return {
    electricalQueryCapabilities,
    electricalCapabilitiesError,
    isElectricalCapabilitiesError,
    retryElectricalCapabilities,
    electricalQueryRequest,
    electricalPage,
    isElectricalPageFetching,
    isElectricalPagePlaceholderData,
    electricalPageError,
    isElectricalPageError,
    retryElectricalPage,
    pageSummary,
    pageInfo,
    nextElectricalPageCursor,
    electricalLoadedPages,
    objects,
    elecCalcs,
    electricalDisplayOffset,
    stats,
    activeRowId,
    selectedRowKeys,
    setSelectedRowKeys,
    activateRowId,
    openElectricalRow,
    cableTypes,
    assignmentByObjectId,
    versionByObjectId,
    scopedObjects,
    compatibleSelectedRowKeys,
    handleAssignmentAwareSelectionChange,
    getObjectActionDisabledReason,
    getObjectCalculationDisabledReason,
    preferredObjectActionCableType,
    activeJob,
    activeJobId,
    batchMut,
    cancelJobMut,
    setElectricalQueryCalculation,
  };
}
