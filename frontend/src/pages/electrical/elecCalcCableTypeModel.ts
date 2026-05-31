import type { CableTypeKey } from '@/pages/electrical/elecCalcMainTableModel';

export const DEFAULT_CABLE_TYPE: CableTypeKey = 'self_regulating';
export const MVP_CABLE_TYPES: readonly CableTypeKey[] = [DEFAULT_CABLE_TYPE];
export const FULL_FEATURE_CABLE_TYPES: readonly CableTypeKey[] = [
  'self_regulating',
  'self_regulating_tt',
  'single_core',
  'three_core',
];

export const isResistiveCableType = (type: CableTypeKey) =>
  type === 'single_core' || type === 'three_core';

export type CableTypeObjectOverride = {
  object_id: string;
  cable_type: CableTypeKey;
};

export function normalizeCableTypeForAvailableTypes(
  type: CableTypeKey | null | undefined,
  availableCableTypes: ReadonlySet<CableTypeKey>,
): CableTypeKey {
  return type && availableCableTypes.has(type) ? type : DEFAULT_CABLE_TYPE;
}

export function resolveUniformCableType(types: CableTypeKey[]): CableTypeKey | null {
  if (types.length === 0) return null;
  const [firstType] = types;
  return types.every((type) => type === firstType) ? firstType : null;
}

export function buildCableTypeObjectOverrides(
  objectIds: string[],
  cableTypeDraftByObjectId: Record<string, CableTypeKey>,
  availableCableTypes: ReadonlySet<CableTypeKey>,
): CableTypeObjectOverride[] {
  return objectIds
    .map((objectId) => {
      const draftType = cableTypeDraftByObjectId[objectId];
      const cableType = normalizeCableTypeForAvailableTypes(draftType, availableCableTypes);
      return draftType
        ? {
            object_id: objectId,
            cable_type: cableType,
          }
        : null;
    })
    .filter((item): item is CableTypeObjectOverride => item != null);
}
