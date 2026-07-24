import { describe, expect, it, vi } from 'vitest';

import {
  buildHeatCalcWorkspaceModeModel,
} from '@/pages/heatcalc/useHeatCalcWorkspaceDataModel';
import {
  buildHeatCalcWorkspaceLoadState,
} from '@/pages/heatcalc/useHeatCalcObjectsDataModel';
import {
  createEmptyTableViewState,
  type HeatCalcTableViewState,
} from '@/utils/heatCalcTableFindability';
import { isSavableExcelDraftRow } from '@/utils/heatCalcExcelRows';

function activeViewState(overrides: Partial<HeatCalcTableViewState> = {}): HeatCalcTableViewState {
  return {
    filters: {
      name: { kind: 'text', value: 'pipe' },
    },
    sort: { columnKey: 'name', direction: 'asc' },
    ...overrides,
  };
}

describe('buildHeatCalcWorkspaceModeModel', () => {
  const activeTableViewState = activeViewState();
  const allTableViewState = createEmptyTableViewState();

  it('enables excel mode only when commercial features allow it and scope is not all', () => {
    expect(buildHeatCalcWorkspaceModeModel({
      commercialFeaturesAvailable: true,
      tableEditingMode: 'excel',
      isAllObjectScope: false,
      tableFindabilityAvailable: true,
      activeTableViewState,
      allTableViewState,
    })).toMatchObject({
      excelModeEnabled: true,
      normalGlideEnabled: false,
      tableCellEditingEnabled: true,
    });

    expect(buildHeatCalcWorkspaceModeModel({
      commercialFeaturesAvailable: true,
      tableEditingMode: 'excel',
      isAllObjectScope: true,
      tableFindabilityAvailable: true,
      activeTableViewState,
      allTableViewState,
    }).excelModeEnabled).toBe(false);

    expect(buildHeatCalcWorkspaceModeModel({
      commercialFeaturesAvailable: false,
      tableEditingMode: 'excel',
      isAllObjectScope: false,
      tableFindabilityAvailable: true,
      activeTableViewState,
      allTableViewState,
    }).excelModeEnabled).toBe(false);
  });

  it('uses empty table view state when findability is unavailable', () => {
    const empty = createEmptyTableViewState();
    const result = buildHeatCalcWorkspaceModeModel({
      commercialFeaturesAvailable: true,
      tableEditingMode: 'normal',
      isAllObjectScope: false,
      tableFindabilityAvailable: false,
      activeTableViewState,
      allTableViewState: activeViewState({ sort: { columnKey: 'length', direction: 'desc' } }),
    });

    expect(result.effectiveActiveTableViewState).toEqual(empty);
    expect(result.effectiveAllTableViewState).toEqual(empty);
    expect(result.currentTableViewActive).toBe(false);
  });

  it('marks current table view active when findability has filters/sort', () => {
    const result = buildHeatCalcWorkspaceModeModel({
      commercialFeaturesAvailable: true,
      tableEditingMode: 'normal',
      isAllObjectScope: false,
      tableFindabilityAvailable: true,
      activeTableViewState,
      allTableViewState,
    });

    expect(result.effectiveActiveTableViewState).toBe(activeTableViewState);
    expect(result.currentTableViewActive).toBe(true);
    expect(result.isSavableDraftRow).toBe(isSavableExcelDraftRow);
  });
});

describe('workspace load-state contract (re-export path)', () => {
  it('does not treat all-objects failure as blocker when that query is disabled', () => {
    // normal single-type mode: all-objects disabled; summary error blocks without snapshot
    const state = buildHeatCalcWorkspaceLoadState([
      {
        enabled: true,
        isError: true,
        error: new Error('summary'),
        isFetching: false,
        hasUsableSnapshot: false,
        refetch: vi.fn(),
      },
      {
        enabled: false,
        isError: true,
        error: new Error('all-objects'),
        isFetching: false,
        hasUsableSnapshot: false,
        refetch: vi.fn(),
      },
    ]);
    expect(state.error?.message).toBe('summary');
    expect(state.isBlockingError).toBe(true);
  });
});
