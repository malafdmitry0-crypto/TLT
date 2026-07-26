// @vitest-environment node
import { describe, expect, it } from 'vitest';

import {
  buildSpecGenerateOptions,
  isSpecificationPartial,
  resolveSpecificationExcludedGroups,
} from '@/pages/specification/specGenerateOptionsModel';

describe('specGenerateOptionsModel', () => {
  it('builds snake_case generate options', () => {
    expect(buildSpecGenerateOptions({
      exZone: true,
      reserveCoeff: 1.1,
      indicationOnBoxes: true,
      endSectionIndication: false,
      topIndication: true,
      minLengthK2i: 5,
      connectorKitSectionsPerKit: 2,
      groupBy: 'object_section',
      mergeIdentical: true,
    })).toEqual({
      ex_zone: true,
      reserve_coefficient: 1.1,
      indication_on_boxes: true,
      end_section_indication: false,
      top_indication: true,
      min_length_for_end_indication: 5,
      connector_kit_sections_per_kit: 2,
      group_by: 'object_section',
      merge_identical: true,
    });
  });

  it('detects partial flag from root or generation_options', () => {
    expect(isSpecificationPartial({ is_partial: true })).toBe(true);
    expect(isSpecificationPartial({ generation_options: { is_partial: true } })).toBe(true);
    expect(isSpecificationPartial({})).toBe(false);
  });

  it('resolves excluded groups with fallback', () => {
    expect(resolveSpecificationExcludedGroups({
      excluded_groups: [{ group: 'a' }],
    })).toEqual([{ group: 'a' }]);
    expect(resolveSpecificationExcludedGroups({
      generation_options: { excluded_groups: [{ group: 'b' }] },
    })).toEqual([{ group: 'b' }]);
    expect(resolveSpecificationExcludedGroups(null)).toEqual([]);
  });
});
