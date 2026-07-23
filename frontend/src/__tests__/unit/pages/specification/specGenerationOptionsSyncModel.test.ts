import { describe, expect, it } from 'vitest';
import { buildSpecSettingsFormSnapshot } from '@/pages/specification/specGenerationOptionsSyncModel';

describe('buildSpecSettingsFormSnapshot (B7)', () => {
  it('applies defaults for missing keys', () => {
    expect(buildSpecSettingsFormSnapshot({})).toEqual({
      exZone: false,
      reserveCoeff: 1,
      indicationOnBoxes: false,
      endSectionIndication: false,
      topIndication: false,
      minLengthK2i: 0,
      connectorKitSectionsPerKit: 1,
    });
  });

  it('hydrates full generation_options snapshot including display prefs', () => {
    expect(
      buildSpecSettingsFormSnapshot({
        ex_zone: true,
        reserve_coefficient: 1.5,
        indication_on_boxes: true,
        end_section_indication: true,
        top_indication: false,
        min_length_for_end_indication: 120,
        connector_kit_sections_per_kit: 2,
        merge_identical: true,
        group_by: 'category',
      }),
    ).toEqual({
      exZone: true,
      reserveCoeff: 1.5,
      indicationOnBoxes: true,
      endSectionIndication: true,
      topIndication: false,
      minLengthK2i: 120,
      connectorKitSectionsPerKit: 2,
      mergeIdentical: true,
      groupBy: 'category',
    });
  });

  it('coerces connector kit sections to 1 or 2 only', () => {
    expect(buildSpecSettingsFormSnapshot({ connector_kit_sections_per_kit: 3 }).connectorKitSectionsPerKit).toBe(1);
    expect(buildSpecSettingsFormSnapshot({ connector_kit_sections_per_kit: 2 }).connectorKitSectionsPerKit).toBe(2);
  });
});
