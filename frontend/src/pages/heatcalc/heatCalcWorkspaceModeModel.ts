/**
 * Pure workspace mode flags for HeatCalc data pipeline (P-BAND-21).
 */
import {
  createEmptyTableViewState,
  hasActiveTableViewState,
  type HeatCalcTableViewState,
} from '@/utils/heatCalcTableFindability';
import { isSavableExcelDraftRow } from '@/utils/heatCalcExcelRows';
import type { HeatCalcToolbarEditingMode } from '@/pages/heatcalc/HeatCalcToolbar';

const FINDABILITY_DISABLED_TABLE_VIEW_STATE = createEmptyTableViewState();

export type HeatCalcWorkspaceModeInput = {
  /** @deprecated Excel mode is not commercial-gated; kept optional for callers. */
  commercialFeaturesAvailable?: boolean;
  tableEditingMode: HeatCalcToolbarEditingMode;
  isAllObjectScope: boolean;
  tableFindabilityAvailable: boolean;
  activeTableViewState: HeatCalcTableViewState;
  allTableViewState: HeatCalcTableViewState;
};

/**
 * Pure mode + effective table-view flags for the workspace data pipeline.
 * Kept pure for focused characterization without mounting React Query hooks.
 */
export function buildHeatCalcWorkspaceModeModel({
  tableEditingMode,
  isAllObjectScope,
  tableFindabilityAvailable,
  activeTableViewState,
  allTableViewState,
}: HeatCalcWorkspaceModeInput) {
  const effectiveActiveTableViewState = tableFindabilityAvailable
    ? activeTableViewState
    : FINDABILITY_DISABLED_TABLE_VIEW_STATE;
  const effectiveAllTableViewState = tableFindabilityAvailable
    ? allTableViewState
    : FINDABILITY_DISABLED_TABLE_VIEW_STATE;
  // Excel table mode is a core HeatCalc editing mode (desktop), not commercial-gated.
  // commercialFeaturesAvailable still gates external catalog / paid cable features.
  const excelModeEnabled = tableEditingMode === 'excel' && !isAllObjectScope;
  const normalGlideEnabled = !excelModeEnabled;
  const tableCellEditingEnabled = excelModeEnabled;
  const currentTableViewActive = tableFindabilityAvailable
    && hasActiveTableViewState(effectiveActiveTableViewState);

  return {
    effectiveActiveTableViewState,
    effectiveAllTableViewState,
    excelModeEnabled,
    normalGlideEnabled,
    tableCellEditingEnabled,
    currentTableViewActive,
    isSavableDraftRow: isSavableExcelDraftRow,
  };
}
