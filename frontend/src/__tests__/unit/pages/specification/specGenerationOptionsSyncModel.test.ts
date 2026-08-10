import { describe, expect, it } from 'vitest';
import {
  buildSpecSettingsFormSnapshot,
  resolveSpecificationCatalogLabel,
} from '@/pages/specification/specGenerationOptionsSyncModel';

describe('buildSpecSettingsFormSnapshot (B7)', () => {
  it('defaults missing binary values to explicit Нет', () => {
    expect(buildSpecSettingsFormSnapshot({})).toEqual({
      exZone: false,
      reserveCoeff: '',
      indicationOnBoxes: false,
      endSectionIndication: false,
      topIndication: false,
      minLengthK2i: '',
      groupingMode: null,
    });
  });

  it('hydrates full canonical snapshot including display prefs', () => {
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
   * B7 contract: drawer state must re-hydrate when snapshot content changes
   * even if spec.id stays the same (regenerate snapshot).
   */
  it('maps distinct snapshot payloads to distinct form state (same-spec regenerate)', () => {
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

  it('shows resolved catalog identity and never invents an active default', () => {
    expect(resolveSpecificationCatalogLabel({
      catalog: { catalog_key: 'tnp-approved', version: '2026.08' },
    })).toBe('tnp-approved · 2026.08');
    expect(resolveSpecificationCatalogLabel(null))
      .toBe('Не определена — backend разрешит при формировании');
  });
});
