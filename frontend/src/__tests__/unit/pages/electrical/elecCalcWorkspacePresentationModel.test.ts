import { describe, expect, expectTypeOf, it } from 'vitest';
import {
  ELEC_CALC_WORKSPACE_VIEW_KEYS,
  assembleElecCalcWorkspaceViewModel,
  listMissingElecCalcWorkspaceViewKeys,
} from '@/pages/electrical/elecCalcWorkspacePresentationModel';
import {
  mapWorkspaceToPresentation,
  type WorkspacePresentationSource,
} from '@/pages/electrical/elecCalcWorkspacePresentationMap';
import type { ProjectObject } from '@/types/project';

describe('elecCalcWorkspacePresentationModel (ELEC3)', () => {
  it('documents the stable public view key contract (93 keys)', () => {
    expect(ELEC_CALC_WORKSPACE_VIEW_KEYS).toHaveLength(93);
    expect(new Set(ELEC_CALC_WORKSPACE_VIEW_KEYS).size).toBe(93);
  });

  it('assembles view bag as identity (preserves values and references)', () => {
    const stats = { totalPower: 1 };
    const parts = Object.fromEntries(
      ELEC_CALC_WORKSPACE_VIEW_KEYS.map((key) => [key, key === 'stats' ? stats : key]),
    ) as Record<(typeof ELEC_CALC_WORKSPACE_VIEW_KEYS)[number], unknown>;
    const view = assembleElecCalcWorkspaceViewModel(parts);
    expect(view).toBe(parts);
    expect(view.stats).toBe(stats);
  });

  it('lists missing keys for characterization failures', () => {
    expect(listMissingElecCalcWorkspaceViewKeys({ project: null })).toContain('canMutate');
    expect(listMissingElecCalcWorkspaceViewKeys(
      Object.fromEntries(ELEC_CALC_WORKSPACE_VIEW_KEYS.map((k) => [k, true])),
    )).toEqual([]);
  });

  it('keeps mapper input complete and preserves object/callback bindings', () => {
    expectTypeOf<Parameters<typeof mapWorkspaceToPresentation>[0]>()
      .toEqualTypeOf<WorkspacePresentationSource>();
    expectTypeOf<ReturnType<typeof mapWorkspaceToPresentation>['scopedObjects']>()
      .toEqualTypeOf<ProjectObject[]>();
    expectTypeOf<ReturnType<typeof mapWorkspaceToPresentation>['onAssignmentsChanged']>()
      .toEqualTypeOf<(() => void) | undefined>();
  });
});
