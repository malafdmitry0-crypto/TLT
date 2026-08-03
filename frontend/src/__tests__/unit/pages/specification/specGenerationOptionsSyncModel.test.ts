import { describe, expect, it } from 'vitest';
import { buildSpecSettingsFormSnapshot } from '@/pages/specification/specGenerationOptionsSyncModel';

describe('buildSpecSettingsFormSnapshot (B7)', () => {
  it('keeps missing keys unset', () => {
    expect(buildSpecSettingsFormSnapshot({})).toEqual({
      exZone: null,
      reserveCoeff: '',
      indicationOnBoxes: null,
      endSectionIndication: null,
      topIndication: null,
      minLengthK2i: '',
      groupingMode: null,
    });
  });

  it('hydrates full generation_options snapshot including display prefs', () => {
    expect(
      buildSpecSettingsFormSnapshot({
        resolved_options: {
          Ex: false,
          R_gr: '1.5',
          K1i: true,
          K2i: true,
          Kiu: false,
          L_K2i_m: '0',
          grouping_mode: 'merge_materials',
        },
      }),
    ).toEqual({
      exZone: false,
      reserveCoeff: '1.5',
      indicationOnBoxes: true,
      endSectionIndication: true,
      topIndication: false,
      minLengthK2i: '0',
      groupingMode: 'merge_materials',
    });
  });

  /**
   * B7 contract: drawer state must re-hydrate when generation_options content
   * changes even if spec.id stays the same (regenerate snapshot). Pure model is
   * the source of the next state; effect deps include generation_options.
   */
  it('maps distinct generation_options payloads to distinct form state (same-spec regenerate)', () => {
    const before = buildSpecSettingsFormSnapshot({
      R_gr: '1',
      Ex: false,
      L_K2i_m: '0',
    });
    const after = buildSpecSettingsFormSnapshot({
      R_gr: '1.25',
      Ex: true,
      L_K2i_m: '50',
    });
    expect(before).not.toEqual(after);
    expect(after.reserveCoeff).toBe('1.25');
    expect(after.exZone).toBe(true);
    expect(after.minLengthK2i).toBe('50');
  });
});
