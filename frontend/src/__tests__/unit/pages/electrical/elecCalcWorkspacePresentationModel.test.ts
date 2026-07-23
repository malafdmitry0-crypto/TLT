import { describe, expect, it } from 'vitest';
import {
  ELEC_CALC_WORKSPACE_VIEW_KEYS,
  assembleElecCalcWorkspaceViewModel,
  listMissingElecCalcWorkspaceViewKeys,
} from '@/pages/electrical/elecCalcWorkspacePresentationModel';

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
});
