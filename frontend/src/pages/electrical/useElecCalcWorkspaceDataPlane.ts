/**
 * @module electrical/workspace-data-plane
 * @owner electrical
 * @depends electrical query keys, table projection, selection, batch jobs
 * @does-not column settings, candidate UI, presentation assembly, heat
 *
 * Data plane for ElecCalc workspace: capabilities/page queries, projection,
 * row/assignment/cable-type selection, batch orchestration, page-scope and
 * data-lifecycle effects, query-cache calculation updater, and cable reference
 * data (cohesion with sizing modal state required by lifecycle).
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
import { useElecCalcCableReferenceData } from '@/pages/electrical/useElecCalcCableReferenceData';
import {
  useElecCalcCableSizingModalState,
  type ElecCalcCableSizingParams,
} from '@/pages/electrical/useElecCalcCableSizingModalState';
import { useElecCalcCableTypeState } from '@/pages/electrical/useElecCalcCableTypeState';
import { useElecCalcDataLifecycleEffects } from '@/pages/electrical/useElecCalcDataLifecycleEffects';
import { useElecCalcPageScopeEffects } from '@/pages/electrical/useElecCalcPageScopeEffects';
import { useElecCalcRowSelectionState } from '@/pages/electrical/useElecCalcRowSelectionState';
import { useElecCalcTableProjection } from '@/pages/electrical/useElecCalcTableProjection';
import type {
  ElectricalBatchJobCompletion,
  RegisterElectricalBatchJob,
  TrackedElectricalBatchJob,
} from '@/pages/electrical/useElectricalBatchJobTracker';
import type { HeatCalcTableViewState } from '@/utils/heatCalcTableFindability';

export type UseElecCalcWorkspaceDataPlaneArgs = {
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
  commercialFeaturesAvailable: boolean;
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
  rememberElectricalPage: (options: {
    electricalGlideEnabled: boolean;
    electricalPage?: ElectricalQueryResponse;
    isFetching: boolean;
    isPlaceholderData: boolean;
  }) => void;
  rememberNextCursor: (options: {
    nextCursor?: ProjectObjectsPageCursor | null;
    isFetching: boolean;
    isPlaceholderData: boolean;
  }) => void;
  resetCandidateTableViewState: () => void;
};

export function useElecCalcWorkspaceDataPlane({
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
  commercialFeaturesAvailable,
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
  rememberElectricalPage,
  rememberNextCursor,
  resetCandidateTableViewState,
}: UseElecCalcWorkspaceDataPlaneArgs) {
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

  // Sizing modal state lives here so data-lifecycle + cable reference can
  // compose without a parent hook-order cycle (mark/folder modals stay in parent).
  const cableSizingModal = useElecCalcCableSizingModalState({
    projectId: project?.id,
    electricalVariantId,
    variant,
    objects,
    calcByObjectId: stats.calcByObjectId,
    recalc,
    getSavedCableTypeForObject: cableTypes.getSavedCableTypeForObject,
    normalizeAvailableCableType: cableTypes.normalizeAvailableCableType,
  });

  useElecCalcDataLifecycleEffects({
    electricalGlideEnabled,
    electricalPage,
    isElectricalPageFetching,
    isElectricalPagePlaceholderData,
    rememberElectricalPage,
    cableSizingModalObjectId: cableSizingModal.objectId,
    resetCandidateTableViewState,
    setCableSizingCableType: cableSizingModal.setCableType,
    normalizeAvailableCableType: cableTypes.normalizeAvailableCableType,
    nextElectricalPageCursor,
    rememberNextCursor,
  });

  const {
    cableRowsForType,
    commercialDataStatus,
    technicalDataStatus,
    manualCableOptionsForType,
    cableMarkOptionsFor,
    cableSizingManualOptions,
  } = useElecCalcCableReferenceData({
    projectSelected: Boolean(project),
    commercialFeaturesAvailable,
    availableCableTypes,
    effectiveSource,
    visibleCableTypeControl: cableTypes.visibleCableTypeControl,
    aggressiveProduct: recalc.aggressiveProduct,
    cableSizingEffectiveCableType: cableSizingModal.effectiveCableType,
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

  /** Stable slice of data-plane fields consumed by the public view bag. */
  const presentationBindings = {
    activeJobId,
    activeRowId,
    assignmentByObjectId,
    batchMut,
    cableTypes,
    cancelJobMut,
    compatibleSelectedRowKeys,
    electricalCapabilitiesError,
    electricalPage,
    electricalPageError,
    isElectricalCapabilitiesError,
    isElectricalPageError,
    isElectricalPageFetching,
    openElectricalRow,
    retryElectricalCapabilities,
    retryElectricalPage,
    scopedObjects,
    selectedRowKeys,
    setSelectedRowKeys,
    stats,
    versionByObjectId,
    handleAssignmentAwareSelectionChange,
    commercialDataStatus,
    technicalDataStatus,
    cableSizingManualOptions,
  };

  return {
    ...presentationBindings,
    presentationBindings,
    electricalQueryCapabilities,
    electricalQueryRequest,
    isElectricalPagePlaceholderData,
    pageSummary,
    pageInfo,
    nextElectricalPageCursor,
    electricalLoadedPages,
    objects,
    elecCalcs,
    electricalDisplayOffset,
    activateRowId,
    getObjectActionDisabledReason,
    getObjectCalculationDisabledReason,
    preferredObjectActionCableType,
    activeJob,
    cableSizingModal,
    cableRowsForType,
    manualCableOptionsForType,
    cableMarkOptionsFor,
    setElectricalQueryCalculation,
  };
}
