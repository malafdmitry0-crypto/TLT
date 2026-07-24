/**
 * @module heatcalc/table-session-controller
 * @owner heat
 * Owns: table state, editing mode, Excel selection state, focus boundary.
 * Does-not: query/data model, object editor, preferences, toolbar, route actions.
 */
import { useEffect, useRef, useState } from 'react';

import { areCommercialFeaturesEnabled } from '@/config/featureFlags';
import { useFocusableTableScrollRegions } from '@/hooks/useFocusableTableScrollRegions';
import type { HeatCalcToolbarEditingMode } from '@/pages/heatcalc/HeatCalcToolbar';
import {
  useHeatCalcExcelInteractionState,
} from '@/pages/heatcalc/useHeatCalcExcelInteractionModel';
import { useHeatCalcTableState } from '@/pages/heatcalc/useHeatCalcTableState';
import type { ProjectObject } from '@/types/project';

export type UseHeatCalcTableSessionControllerArgs = {
  projectId?: string | null;
};

/**
 * Owner-local table session for HeatCalc workspace.
 * Returns named groups (table / editing / excel / focus) — not a flat mega-bag.
 */
export function useHeatCalcTableSessionController({
  projectId,
}: UseHeatCalcTableSessionControllerArgs) {
  const table = useHeatCalcTableState({ projectId });

  const [tableEditingMode, setTableEditingMode] = useState<HeatCalcToolbarEditingMode>('normal');
  const commercialFeaturesAvailable = areCommercialFeaturesEnabled();
  const tableFindabilityAvailable = true;

  useEffect(() => {
    if (!commercialFeaturesAvailable && tableEditingMode === 'excel') {
      setTableEditingMode('normal');
    }
  }, [commercialFeaturesAvailable, tableEditingMode]);

  const excel = useHeatCalcExcelInteractionState();

  const sideWorkspaceRef = useRef<HTMLDivElement | null>(null);
  useFocusableTableScrollRegions(
    sideWorkspaceRef,
    'Таблица расчёта теплопотерь',
    Boolean(projectId),
  );

  const [pendingTableFocusObject, setPendingTableFocusObject] = useState<ProjectObject | null>(null);

  return {
    table,
    editing: {
      tableEditingMode,
      setTableEditingMode,
      commercialFeaturesAvailable,
      tableFindabilityAvailable,
    },
    excel,
    focus: {
      sideWorkspaceRef,
      pendingTableFocusObject,
      setPendingTableFocusObject,
    },
  };
}
