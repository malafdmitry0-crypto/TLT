/**
 * @module electrical/cable-type-options
 * @owner electrical
 * @depends elecCalcCableTypeOptionsModel, assignment scope
 * @does-not heat
 */
import { useCallback, useMemo } from 'react';
import { message } from 'antd';

import type { ElectricalQueryAssignment } from '@/types/calculation';
import type { CableTypeKey } from '@/domain/electrical/elecCalcMainTableModel';
import {
  buildCableSourceSelectOptions,
  buildCableTypeSelectOptions,
  CABLE_TYPE_SELECTION_INCOMPATIBLE_WARNING,
  filterCableTypeOptionsForAssignment,
} from '@/pages/electrical/elecCalcCableTypeOptionsModel';
import { compatibleAssignedObjectIds } from '@/pages/electrical/elecCalcAssignmentScopeModel';

export type UseElecCalcCableTypeOptionsArgs = {
  availableCableTypeKeys: readonly CableTypeKey[];
  assignmentByObjectId: ReadonlyMap<string, ElectricalQueryAssignment>;
  isEmployee: boolean;
  canMutate: boolean;
  selectedRowKeys: readonly string[];
  normalizeAvailableCableType: (type: CableTypeKey) => CableTypeKey;
  setDefaultCableType: (type: CableTypeKey) => void;
  setCableTypeDraftByObjectId: (
    updater: (prev: Record<string, CableTypeKey>) => Record<string, CableTypeKey>,
  ) => void;
  getSavedCableTypeForObject: (objectId: string) => CableTypeKey | null | undefined;
  resetConnectionType: () => void;
};

export function useElecCalcCableTypeOptions({
  availableCableTypeKeys,
  assignmentByObjectId,
  isEmployee,
  canMutate,
  selectedRowKeys,
  normalizeAvailableCableType,
  setDefaultCableType,
  setCableTypeDraftByObjectId,
  getSavedCableTypeForObject,
  resetConnectionType,
}: UseElecCalcCableTypeOptionsArgs) {
  const cableTypeOptions = useMemo(
    () => buildCableTypeSelectOptions(availableCableTypeKeys),
    [availableCableTypeKeys],
  );

  const cableTypeOptionsForObject = useCallback((objectId: string | undefined) => {
    if (!objectId) return cableTypeOptions;
    return filterCableTypeOptionsForAssignment(
      cableTypeOptions,
      assignmentByObjectId.get(objectId),
    );
  }, [assignmentByObjectId, cableTypeOptions]);

  const cableSourceOptions = useMemo(
    () => buildCableSourceSelectOptions(isEmployee),
    [isEmployee],
  );

  const handleCableTypeControlChange = useCallback((next: CableTypeKey) => {
    if (!canMutate) return;
    const nextType = normalizeAvailableCableType(next);
    if (selectedRowKeys.length === 0) {
      setDefaultCableType(nextType);
    } else {
      const compatibleForNextType = compatibleAssignedObjectIds(
        selectedRowKeys,
        assignmentByObjectId,
        nextType,
      );
      if (compatibleForNextType.length !== selectedRowKeys.length) {
        message.warning(CABLE_TYPE_SELECTION_INCOMPATIBLE_WARNING);
        return;
      }
      setCableTypeDraftByObjectId((prev) => {
        const nextDrafts = { ...prev };
        for (const objectId of selectedRowKeys) {
          if (nextType === getSavedCableTypeForObject(objectId)) {
            delete nextDrafts[objectId];
          } else {
            nextDrafts[objectId] = nextType;
          }
        }
        return nextDrafts;
      });
    }
    resetConnectionType();
  }, [
    assignmentByObjectId,
    canMutate,
    getSavedCableTypeForObject,
    normalizeAvailableCableType,
    resetConnectionType,
    selectedRowKeys,
    setCableTypeDraftByObjectId,
    setDefaultCableType,
  ]);

  return {
    cableTypeOptions,
    cableTypeOptionsForObject,
    cableSourceOptions,
    handleCableTypeControlChange,
  };
}
