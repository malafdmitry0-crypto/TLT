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
 *
 * Split: calc-objects plane + candidate/catalog plane.
 */
import type { CableSource } from '@/api/calculations';
import type { CalculationVariant } from '@/store/calculationVariantStore';
import type { ElectricalQueryResponse } from '@/types/calculation';
import type { ProjectObjectsPageCursor } from '@/types/project';
import type { CableTypeKey } from '@/domain/electrical/elecCalcMainTableModel';
import type { ElectricalSystemView } from '@/pages/electrical/elecCalcSystemViewModel';
import type { ElecCalcCableSizingParams } from '@/pages/electrical/useElecCalcCableSizingModalState';
import {
  useElecCalcWorkspaceCalcObjectsDataPlane,
} from '@/pages/electrical/useElecCalcWorkspaceCalcObjectsDataPlane';
import {
  useElecCalcWorkspaceCandidateCatalogDataPlane,
} from '@/pages/electrical/useElecCalcWorkspaceCandidateCatalogDataPlane';
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
  const calcObjects = useElecCalcWorkspaceCalcObjectsDataPlane({
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
  });

  const catalog = useElecCalcWorkspaceCandidateCatalogDataPlane({
    project,
    electricalVariantId,
    variant,
    objects: calcObjects.objects,
    calcByObjectId: calcObjects.stats.calcByObjectId,
    recalc,
    cableTypes: calcObjects.cableTypes,
    commercialFeaturesAvailable,
    availableCableTypes,
    effectiveSource,
    electricalGlideEnabled,
    electricalPage: calcObjects.electricalPage,
    isElectricalPageFetching: calcObjects.isElectricalPageFetching,
    isElectricalPagePlaceholderData: calcObjects.isElectricalPagePlaceholderData,
    nextElectricalPageCursor: calcObjects.nextElectricalPageCursor,
    rememberElectricalPage,
    rememberNextCursor,
    resetCandidateTableViewState,
  });

  /** Stable slice of data-plane fields consumed by the public view bag. */
  const presentationBindings = {
    activeJobId: calcObjects.activeJobId,
    activeRowId: calcObjects.activeRowId,
    assignmentByObjectId: calcObjects.assignmentByObjectId,
    batchMut: calcObjects.batchMut,
    cableTypes: calcObjects.cableTypes,
    cancelJobMut: calcObjects.cancelJobMut,
    compatibleSelectedRowKeys: calcObjects.compatibleSelectedRowKeys,
    electricalCapabilitiesError: calcObjects.electricalCapabilitiesError,
    electricalPage: calcObjects.electricalPage,
    electricalPageError: calcObjects.electricalPageError,
    isElectricalCapabilitiesError: calcObjects.isElectricalCapabilitiesError,
    isElectricalPageError: calcObjects.isElectricalPageError,
    isElectricalPageFetching: calcObjects.isElectricalPageFetching,
    openElectricalRow: calcObjects.openElectricalRow,
    retryElectricalCapabilities: calcObjects.retryElectricalCapabilities,
    retryElectricalPage: calcObjects.retryElectricalPage,
    scopedObjects: calcObjects.scopedObjects,
    selectedRowKeys: calcObjects.selectedRowKeys,
    setSelectedRowKeys: calcObjects.setSelectedRowKeys,
    stats: calcObjects.stats,
    versionByObjectId: calcObjects.versionByObjectId,
    handleAssignmentAwareSelectionChange: calcObjects.handleAssignmentAwareSelectionChange,
    commercialDataStatus: catalog.commercialDataStatus,
    technicalDataStatus: catalog.technicalDataStatus,
    cableSizingManualOptions: catalog.cableSizingManualOptions,
  };

  return {
    ...presentationBindings,
    presentationBindings,
    electricalQueryCapabilities: calcObjects.electricalQueryCapabilities,
    electricalQueryRequest: calcObjects.electricalQueryRequest,
    isElectricalPagePlaceholderData: calcObjects.isElectricalPagePlaceholderData,
    pageSummary: calcObjects.pageSummary,
    pageInfo: calcObjects.pageInfo,
    nextElectricalPageCursor: calcObjects.nextElectricalPageCursor,
    electricalLoadedPages: calcObjects.electricalLoadedPages,
    objects: calcObjects.objects,
    elecCalcs: calcObjects.elecCalcs,
    electricalDisplayOffset: calcObjects.electricalDisplayOffset,
    activateRowId: calcObjects.activateRowId,
    getObjectActionDisabledReason: calcObjects.getObjectActionDisabledReason,
    getObjectCalculationDisabledReason: calcObjects.getObjectCalculationDisabledReason,
    preferredObjectActionCableType: calcObjects.preferredObjectActionCableType,
    activeJob: calcObjects.activeJob,
    cableSizingModal: catalog.cableSizingModal,
    cableRowsForType: catalog.cableRowsForType,
    manualCableOptionsForType: catalog.manualCableOptionsForType,
    cableMarkOptionsFor: catalog.cableMarkOptionsFor,
    setElectricalQueryCalculation: calcObjects.setElectricalQueryCalculation,
  };
}
