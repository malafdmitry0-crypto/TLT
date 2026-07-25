/**
 * @module electrical/workspace-candidate-catalog-data-plane
 * @owner electrical
 * Candidate/catalog slice: sizing modal, data-lifecycle effects, cable reference.
 */
import type { CableSource } from '@/api/calculations';
import type { CalculationVariant } from '@/store/calculationVariantStore';
import type { ElectricalCalcSummary, ElectricalQueryResponse } from '@/types/calculation';
import type { ProjectObject, ProjectObjectsPageCursor } from '@/types/project';
import type { CableTypeKey } from '@/domain/electrical/elecCalcMainTableModel';
import {
  useElecCalcCableSizingModalState,
  type ElecCalcCableSizingParams,
} from '@/pages/electrical/useElecCalcCableSizingModalState';
import { useElecCalcCableReferenceData } from '@/pages/electrical/useElecCalcCableReferenceData';
import { useElecCalcDataLifecycleEffects } from '@/pages/electrical/useElecCalcDataLifecycleEffects';
import type { useElecCalcCableTypeState } from '@/pages/electrical/useElecCalcCableTypeState';

type CableTypes = ReturnType<typeof useElecCalcCableTypeState>;

export type UseElecCalcWorkspaceCandidateCatalogDataPlaneArgs = {
  project: { id: string } | null | undefined;
  electricalVariantId: string;
  variant: CalculationVariant;
  objects: readonly ProjectObject[];
  calcByObjectId: Record<string, ElectricalCalcSummary | undefined>;
  recalc: ElecCalcCableSizingParams;
  cableTypes: CableTypes;
  commercialFeaturesAvailable: boolean;
  availableCableTypes: ReadonlySet<CableTypeKey>;
  effectiveSource: CableSource;
  electricalGlideEnabled: boolean;
  electricalPage: ElectricalQueryResponse | undefined;
  isElectricalPageFetching: boolean;
  isElectricalPagePlaceholderData: boolean;
  nextElectricalPageCursor: ProjectObjectsPageCursor | null | undefined;
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

export function useElecCalcWorkspaceCandidateCatalogDataPlane({
  project,
  electricalVariantId,
  variant,
  objects,
  calcByObjectId,
  recalc,
  cableTypes,
  commercialFeaturesAvailable,
  availableCableTypes,
  effectiveSource,
  electricalGlideEnabled,
  electricalPage,
  isElectricalPageFetching,
  isElectricalPagePlaceholderData,
  nextElectricalPageCursor,
  rememberElectricalPage,
  rememberNextCursor,
  resetCandidateTableViewState,
}: UseElecCalcWorkspaceCandidateCatalogDataPlaneArgs) {
  // Sizing modal state lives here so data-lifecycle + cable reference can
  // compose without a parent hook-order cycle (mark/folder modals stay in parent).
  const cableSizingModal = useElecCalcCableSizingModalState({
    projectId: project?.id,
    electricalVariantId,
    variant,
    objects,
    calcByObjectId,
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

  return {
    cableSizingModal,
    cableRowsForType,
    commercialDataStatus,
    technicalDataStatus,
    manualCableOptionsForType,
    cableMarkOptionsFor,
    cableSizingManualOptions,
  };
}
