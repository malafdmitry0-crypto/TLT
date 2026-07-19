import { useCallback, useEffect, useMemo, useState } from 'react';

import type { ElectricalCalcSummary } from '@/types/calculation';
import {
  CABLE_TYPE_LABEL,
  type CableTypeKey,
} from '@/pages/electrical/elecCalcMainTableModel';
import {
  DEFAULT_CABLE_TYPE,
  buildCableTypeObjectOverrides,
  normalizeCableTypeForAvailableTypes,
  resolveUniformCableType,
} from '@/pages/electrical/elecCalcCableTypeModel';

type UseElecCalcCableTypeStateOptions = {
  availableCableTypes: ReadonlySet<CableTypeKey>;
  calcByObjectId: Record<string, ElectricalCalcSummary | undefined>;
  selectedRowKeys: string[];
  projectId?: string;
  variant: string | number;
};

export function useElecCalcCableTypeState({
  availableCableTypes,
  calcByObjectId,
  selectedRowKeys,
  projectId,
  variant,
}: UseElecCalcCableTypeStateOptions) {
  const [defaultCableType, setDefaultCableType] =
    useState<CableTypeKey>(DEFAULT_CABLE_TYPE);
  const [cableTypeDraftByObjectId, setCableTypeDraftByObjectId] =
    useState<Record<string, CableTypeKey>>({});

  const normalizeAvailableCableType = useCallback(
    (type: CableTypeKey | null | undefined): CableTypeKey =>
      normalizeCableTypeForAvailableTypes(type, availableCableTypes),
    [availableCableTypes],
  );

  useEffect(() => {
    setDefaultCableType((current) => normalizeAvailableCableType(current));
    setCableTypeDraftByObjectId((current) => {
      let changed = false;
      const next: Record<string, CableTypeKey> = {};
      for (const [objectId, cableType] of Object.entries(current)) {
        if (!availableCableTypes.has(cableType)) {
          changed = true;
          continue;
        }
        next[objectId] = cableType;
      }
      return changed ? next : current;
    });
  }, [availableCableTypes, normalizeAvailableCableType]);

  useEffect(() => {
    setCableTypeDraftByObjectId({});
  }, [projectId, variant]);

  const getCalculatedCableTypeForObject = useCallback((objectId: string): CableTypeKey | null => {
    const savedType = calcByObjectId[objectId]?.cable_type;
    return savedType && savedType in CABLE_TYPE_LABEL
      ? savedType as CableTypeKey
      : null;
  }, [calcByObjectId]);

  const getSavedCableTypeForObject = useCallback(
    (objectId: string): CableTypeKey =>
      normalizeAvailableCableType(getCalculatedCableTypeForObject(objectId) ?? DEFAULT_CABLE_TYPE),
    [getCalculatedCableTypeForObject, normalizeAvailableCableType],
  );

  const getDraftCableTypeForObject = useCallback((objectId: string): CableTypeKey =>
    normalizeAvailableCableType(cableTypeDraftByObjectId[objectId] ?? getSavedCableTypeForObject(objectId)),
  [cableTypeDraftByObjectId, getSavedCableTypeForObject, normalizeAvailableCableType]);

  const selectedCableTypes = useMemo(
    () => selectedRowKeys.map((objectId) => getDraftCableTypeForObject(objectId)),
    [getDraftCableTypeForObject, selectedRowKeys],
  );
  const selectedCableType = useMemo<CableTypeKey | null>(
    () => resolveUniformCableType(selectedCableTypes),
    [selectedCableTypes],
  );
  const selectedCableTypesMixed = selectedCableTypes.length > 0 && selectedCableType == null;
  const cableTypeForRecalculation = selectedCableTypesMixed
    ? defaultCableType
    : selectedCableType ?? defaultCableType;
  const visibleCableTypeControl = selectedCableTypesMixed ? null : cableTypeForRecalculation;

  const objectOverridesForIds = useCallback((objectIds: string[]) =>
    buildCableTypeObjectOverrides(objectIds, cableTypeDraftByObjectId, availableCableTypes),
  [availableCableTypes, cableTypeDraftByObjectId]);

  return {
    defaultCableType,
    setDefaultCableType,
    cableTypeDraftByObjectId,
    setCableTypeDraftByObjectId,
    normalizeAvailableCableType,
    getCalculatedCableTypeForObject,
    getSavedCableTypeForObject,
    getDraftCableTypeForObject,
    selectedCableTypes,
    selectedCableType,
    selectedCableTypesMixed,
    cableTypeForRecalculation,
    visibleCableTypeControl,
    objectOverridesForIds,
  };
}
