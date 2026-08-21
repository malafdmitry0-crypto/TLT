import { useMemo } from 'react';

import { FULL_FEATURE_CABLE_TYPES } from '@/pages/electrical/elecCalcCableTypeModel';
import type { CableTypeKey } from '@/domain/electrical/elecCalcMainTableModel';
import type { ElectricalNavigationState } from '@/pages/electrical/elecCalcPageModel';
import {
  resolveElectricalTableEngine,
} from '@/utils/electricalTableEngine';

type ElecCalcBootLocation = {
  search: string;
  state: unknown;
};

type UseElecCalcBootViewStateOptions = {
  location: ElecCalcBootLocation;
};

export function useElecCalcBootViewState({
  location,
}: UseElecCalcBootViewStateOptions) {
  // Набор расчётных типов кабеля больше не гейтится коммерческим фича-флагом.
  // ТЛТ намеренно исключён из FULL_FEATURE_CABLE_TYPES, пока не подтверждён
  // его технический каталог; реализация и справочник ТЛТ сохранены в коде.
  // ТТН/ТТВ/ТТХ и ТТ Р1/ТТ Р3 доступны всегда.
  // Коммерческие функции (внешняя БД, цены, ранжирование) гейтятся отдельно.
  const availableCableTypeKeys = FULL_FEATURE_CABLE_TYPES;
  const availableCableTypes = useMemo(
    () => new Set<CableTypeKey>(availableCableTypeKeys),
    [availableCableTypeKeys],
  );
  const electricalTableEngine = useMemo(
    () => resolveElectricalTableEngine({ search: location.search }),
    [location.search],
  );
  const electricalGlideEnabled = electricalTableEngine === 'glide';
  const navigationActiveJobId =
    (location.state as ElectricalNavigationState | null | undefined)?.activeJobId ?? null;

  return {
    availableCableTypeKeys,
    availableCableTypes,
    electricalTableEngine,
    electricalGlideEnabled,
    navigationActiveJobId,
  };
}
