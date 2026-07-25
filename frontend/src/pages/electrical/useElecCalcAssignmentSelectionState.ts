/**
 * @module electrical/assignment-selection-state
 * @owner electrical
 * @depends elecCalcAssignmentScopeModel, elecCalcSystemViewModel
 * @does-not heat
 *
 * Scoped table selection + assignment projection for ElecCalcWorkspace.
 */
import { useCallback, useEffect, useMemo } from 'react';
import { appMessage as message } from '@/feedback/appFeedback';

import type { ElectricalQueryResponse } from '@/types/calculation';
import type { ProjectObject } from '@/types/project';
import type { CableTypeKey } from '@/domain/electrical/elecCalcMainTableModel';
import {
  compatibleAssignedObjectIds,
  electricalAssignmentAvailabilityReason,
  electricalAssignmentCompatibilityReason,
  electricalAssignmentProjectionMap,
  electricalAssignmentVersionsMap,
  ELECTRICAL_ASSIGNMENT_SELECTION_INCOMPATIBLE_WARNING,
  preferredCableTypeForElectricalAssignment,
} from '@/pages/electrical/elecCalcAssignmentScopeModel';
import {
  filterObjectsBySystemView,
  type ElectricalSystemView,
} from '@/pages/electrical/elecCalcSystemViewModel';

export type UseElecCalcAssignmentSelectionStateArgs = {
  electricalLoadedPages: readonly Pick<ElectricalQueryResponse, 'assignments'>[];
  objects: ProjectObject[];
  systemView: ElectricalSystemView;
  selectedRowKeys: string[];
  setSelectedRowKeys: (keys: string[] | ((prev: string[]) => string[])) => void;
  batchCableType: CableTypeKey | null | undefined;
  getSavedCableTypeForObject: (objectId: string) => CableTypeKey | null | undefined;
};

export function useElecCalcAssignmentSelectionState({
  electricalLoadedPages,
  objects,
  systemView,
  selectedRowKeys,
  setSelectedRowKeys,
  batchCableType,
  getSavedCableTypeForObject,
}: UseElecCalcAssignmentSelectionStateArgs) {
  const assignmentByObjectId = useMemo(
    () => electricalAssignmentProjectionMap(electricalLoadedPages),
    [electricalLoadedPages],
  );
  const versionByObjectId = useMemo(
    () => electricalAssignmentVersionsMap(assignmentByObjectId),
    [assignmentByObjectId],
  );

  /** Single object list: filtered by shared systemView (no second assignment table). */
  const scopedObjects = useMemo(
    () => filterObjectsBySystemView(objects, assignmentByObjectId, systemView),
    [assignmentByObjectId, objects, systemView],
  );

  useEffect(() => {
    // Drop selection that is no longer visible after tab change / reassignment.
    setSelectedRowKeys((prev) => {
      const visible = new Set(scopedObjects.map((obj) => obj.id));
      const next = prev.filter((id) => visible.has(id));
      return next.length === prev.length ? prev : next;
    });
  }, [scopedObjects, setSelectedRowKeys]);

  const compatibleSelectedRowKeys = useMemo(
    () => compatibleAssignedObjectIds(
      selectedRowKeys,
      assignmentByObjectId,
      batchCableType,
    ),
    [assignmentByObjectId, batchCableType, selectedRowKeys],
  );

  const handleAssignmentAwareSelectionChange = useCallback((keys: string[]) => {
    // Unassigned tab: select freely for assign/DnD.
    if (systemView === 'unassigned') {
      setSelectedRowKeys(keys);
      return;
    }
    // «Все» and system tabs: only calc-compatible selection (fail-closed batch).
    const compatible = compatibleAssignedObjectIds(
      keys,
      assignmentByObjectId,
      batchCableType,
    );
    if (compatible.length !== keys.length) {
      message.warning(ELECTRICAL_ASSIGNMENT_SELECTION_INCOMPATIBLE_WARNING);
    }
    setSelectedRowKeys(compatible);
  }, [assignmentByObjectId, batchCableType, setSelectedRowKeys, systemView]);

  useEffect(() => {
    if (systemView === 'unassigned') return;
    if (compatibleSelectedRowKeys.length === selectedRowKeys.length) return;
    setSelectedRowKeys(compatibleSelectedRowKeys);
  }, [compatibleSelectedRowKeys, selectedRowKeys.length, setSelectedRowKeys, systemView]);

  const getObjectActionDisabledReason = useCallback((obj: ProjectObject) => (
    electricalAssignmentAvailabilityReason(assignmentByObjectId.get(obj.id))
  ), [assignmentByObjectId]);

  const getObjectCalculationDisabledReason = useCallback((obj: ProjectObject) => (
    electricalAssignmentCompatibilityReason(
      assignmentByObjectId.get(obj.id),
      getSavedCableTypeForObject(obj.id),
    )
  ), [assignmentByObjectId, getSavedCableTypeForObject]);

  const preferredObjectActionCableType = useCallback((obj: ProjectObject) => (
    preferredCableTypeForElectricalAssignment(
      assignmentByObjectId.get(obj.id),
      getSavedCableTypeForObject(obj.id),
    )
  ), [assignmentByObjectId, getSavedCableTypeForObject]);

  return {
    assignmentByObjectId,
    versionByObjectId,
    scopedObjects,
    compatibleSelectedRowKeys,
    handleAssignmentAwareSelectionChange,
    getObjectActionDisabledReason,
    getObjectCalculationDisabledReason,
    preferredObjectActionCableType,
  };
}
