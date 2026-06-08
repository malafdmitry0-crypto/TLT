import { useMemo } from 'react';

import { FULL_FEATURE_CABLE_TYPES } from '@/pages/electrical/elecCalcCableTypeModel';
import type { CableTypeKey } from '@/pages/electrical/elecCalcMainTableModel';
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
  // Набор расчётных типов кабеля больше не гейтится коммерческим фича-флагом:
  // все рассчитываемые типы (ТЛТ, ТТН/ТТВ/ТТХ, ТТ Р1, ТТ Р3) доступны всегда.
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
