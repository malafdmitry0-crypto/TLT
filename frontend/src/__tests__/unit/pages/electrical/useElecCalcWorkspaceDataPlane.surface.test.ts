/**
 * Characterization: data-plane surface keys used by workspace orchestration.
 * Does not mount React Query — documents the stable return contract only.
 */
import { describe, expect, it } from 'vitest';

/** Keys the parent orchestration reads from useElecCalcWorkspaceDataPlane. */
export const ELEC_CALC_WORKSPACE_DATA_PLANE_KEYS = [
  'presentationBindings',
  'electricalQueryCapabilities',
  'electricalQueryRequest',
  'isElectricalPagePlaceholderData',
  'pageSummary',
  'pageInfo',
  'nextElectricalPageCursor',
  'electricalLoadedPages',
  'objects',
  'elecCalcs',
  'electricalDisplayOffset',
  'activateRowId',
  'getObjectActionDisabledReason',
  'getObjectCalculationDisabledReason',
  'preferredObjectActionCableType',
  'activeJob',
  'cableSizingModal',
  'cableRowsForType',
  'manualCableOptionsForType',
  'cableMarkOptionsFor',
  'setElectricalQueryCalculation',
  // also on presentationBindings (flat return for convenience)
  'activeJobId',
  'activeRowId',
  'assignmentByObjectId',
  'batchMut',
  'cableTypes',
  'cancelJobMut',
  'compatibleSelectedRowKeys',
  'electricalCapabilitiesError',
  'electricalPage',
  'electricalPageError',
  'isElectricalCapabilitiesError',
  'isElectricalPageError',
  'isElectricalPageFetching',
  'openElectricalRow',
  'retryElectricalCapabilities',
  'retryElectricalPage',
  'scopedObjects',
  'selectedRowKeys',
  'setSelectedRowKeys',
  'stats',
  'versionByObjectId',
  'handleAssignmentAwareSelectionChange',
  'commercialDataStatus',
  'technicalDataStatus',
  'cableSizingManualOptions',
] as const;

/** PresentationBindings subset that must land in the public view bag. */
export const ELEC_CALC_DATA_PLANE_PRESENTATION_BINDING_KEYS = [
  'activeJobId',
  'activeRowId',
  'assignmentByObjectId',
  'batchMut',
  'cableTypes',
  'cancelJobMut',
  'compatibleSelectedRowKeys',
  'electricalCapabilitiesError',
  'electricalPage',
  'electricalPageError',
  'isElectricalCapabilitiesError',
  'isElectricalPageError',
  'isElectricalPageFetching',
  'openElectricalRow',
  'retryElectricalCapabilities',
  'retryElectricalPage',
  'scopedObjects',
  'selectedRowKeys',
  'setSelectedRowKeys',
  'stats',
  'versionByObjectId',
  'handleAssignmentAwareSelectionChange',
  'commercialDataStatus',
  'technicalDataStatus',
  'cableSizingManualOptions',
] as const;

describe('useElecCalcWorkspaceDataPlane surface (characterization)', () => {
  it('documents a stable data-plane key contract', () => {
    expect(ELEC_CALC_WORKSPACE_DATA_PLANE_KEYS.length).toBeGreaterThan(30);
    expect(new Set(ELEC_CALC_WORKSPACE_DATA_PLANE_KEYS).size).toBe(
      ELEC_CALC_WORKSPACE_DATA_PLANE_KEYS.length,
    );
  });

  it('presentationBindings keys are a subset of the flat data-plane surface', () => {
    const surface = new Set<string>(ELEC_CALC_WORKSPACE_DATA_PLANE_KEYS);
    for (const key of ELEC_CALC_DATA_PLANE_PRESENTATION_BINDING_KEYS) {
      expect(surface.has(key)).toBe(true);
    }
  });
});
