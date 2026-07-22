import type { CableTypeKey } from '@/pages/electrical/elecCalcMainTableModel';

// ТЛТ временно скрыт из приложения до подтверждения паспортной линейки.
// Для возврата достаточно снова включить его в FULL_FEATURE_CABLE_TYPES
// и при необходимости сделать типом по умолчанию.
export const DEFAULT_CABLE_TYPE: CableTypeKey = 'self_regulating_tt';
export const MVP_CABLE_TYPES: readonly CableTypeKey[] = [DEFAULT_CABLE_TYPE];
export const FULL_FEATURE_CABLE_TYPES: readonly CableTypeKey[] = [
  // 'self_regulating', // ТЛТ временно отключён: нет подтверждённого технического каталога.
  'self_regulating_tt',
  // 'single_core', // Резистив — будущее расширение по 1_Кейс.
  // 'three_core', // Резистив — будущее расширение по 1_Кейс.
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
