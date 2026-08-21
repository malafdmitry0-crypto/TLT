/**
 * @module electrical/workspace-presentation-model
 * @owner electrical
 *
 * ELEC3 pure presentation assembly for ElecCalc workspace view bag.
 *
 * Owns:
 * - stable public view-key list
 * - identity-preserving assemble of view props (no domain mutation)
 *
 * Does-not:
 * - queries / mutations / invalidation
 * - UUID ER selection semantics
 * - Glide/Ant table domain logic
 */

/** Public keys returned by useElecCalcWorkspaceModel (view contract). */
export const ELEC_CALC_WORKSPACE_VIEW_KEYS = [
  'project',
  'canMutate',
  'projectId',
  'electricalVariant',
  'onAssignmentsChanged',
  'workspaceModalProps',
  'activateRowId',
  'activeElectricalErrorGuidance',
  'activeElectricalErrorItem',
  'activeJobId',
  'activeRowId',
  'applyElectricalGlideColumnDraftWidth',
  'assignmentByObjectId',
  'batchMut',
  'cableTypeOptions',
  'cableTypes',
  'calculatedCount',
  'cancelJobMut',
  'commitElectricalGlideColumnWidth',
  'compatibleSelectedRowKeys',
  'currentTableViewActive',
  'defaultElectricalTypeControls',
  'electricalCapabilitiesError',
  'electricalColumns',
  'electricalGlideColumns',
  'electricalGlideEnabled',
  'electricalInfiniteLoading',
  'electricalPage',
  'electricalPageError',
  'electricalPagination',
  'electricalRowClassName',
  'electricalTableScrollX',
  'electricalTableScrollY',
  'electricalVariantName',
  'failedCount',
  'getElectricalGlideCellState',
  'handleAssignmentAwareSelectionChange',
  'handleCableTypeControlChange',
  'handleElectricalGlideCellAction',
  'handleElectricalGlideCommitCell',
  'handleElectricalGlideLoadMore',
  'handleElectricalGlidePageChange',
  'handleElectricalGlideStartCellEdit',
  'handleElectricalTableChange',
  'handleTableRowDragEnd',
  'handleTableRowDragStart',
  'isElectricalCapabilitiesError',
  'isElectricalPageError',
  'isElectricalPageFetching',
  'isJobActive',
  'jobProgressLabel',
  'manualCableCount',
  'navigate',
  'onCancelJob',
  'onRecalculateAll',
  'onRecalculateObjectIds',
  'onRecalculateSelected',
  'openColumnSettings',
  'openElectricalRow',
  'overwriteManualChoices',
  'recalc',
  'renderManualOverwriteControl',
  'resetColumnFilter',
  'resetCurrentTableViewState',
  'resolvedTableFontSize',
  'retryElectricalCapabilities',
  'retryElectricalPage',
  'scopedObjects',
  'selectedHeatLossFailedCount',
  'selectedManualCableCount',
  'selectedRecalcCountLabel',
  'selectedRecalcDisabled',
  'selectedRecalcTooltip',
  'selectedRowKeys',
  'selectedValidObjectsCount',
  'setColumnFilter',
  'setElectricalTableSort',
  'setOverwriteManualChoices',
  'setRecalc',
  'setSelectedRowKeys',
  'setSystemView',
  'stats',
  'systemSummaries',
  'systemView',
  'tableDragging',
  'tableScrollRegionsRef',
  'tableViewState',
  'totalCableLength',
  'totalCurrent',
  'totalObjects',
  'validObjectsCount',
  'versionByObjectId',
] as const;

export type ElecCalcWorkspaceViewKey = (typeof ELEC_CALC_WORKSPACE_VIEW_KEYS)[number];

/**
 * Pure view bag assembly. Identity on the concrete object so host field types
 * are preserved (no unknown widening). KEYS list is the characterization SoT.
 */
export function assembleElecCalcWorkspaceViewModel<T extends object>(parts: T): T {
  return parts;
}

/** Characterization helper: missing keys fail loudly in tests. */
export function listMissingElecCalcWorkspaceViewKeys(
  parts: Partial<Record<ElecCalcWorkspaceViewKey, unknown>>,
): ElecCalcWorkspaceViewKey[] {
  return ELEC_CALC_WORKSPACE_VIEW_KEYS.filter((key) => !(key in parts));
}
