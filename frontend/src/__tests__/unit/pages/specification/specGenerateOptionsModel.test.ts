import { describe, expect, it } from 'vitest';

import {
  buildSpecGenerateOptions,
  missingSpecGenerateFields,
  isSpecificationPartial,
  resolveSpecificationExcludedGroups,
} from '@/pages/specification/specGenerateOptionsModel';

describe('specGenerateOptionsModel', () => {
  it('builds canonical options and preserves explicit false and zero', () => {
    expect(buildSpecGenerateOptions({
      exZone: false,
      reserveCoeff: '1.1',
      indicationOnBoxes: false,
      endSectionIndication: false,
      topIndication: true,
      minLengthK2i: '0',
      groupingMode: 'separate_by_object_type',
    })).toEqual({
      grouping_mode: 'separate_by_object_type',
      Ex: false,
      K1i: false,
      K2i: false,
      Kiu: true,
      L_K2i_m: '0',
      R_gr: '1.1',
    });
  });

  it('does not materialize missing values', () => {
    const input = {
      exZone: null,
      reserveCoeff: '',
      indicationOnBoxes: null,
      endSectionIndication: null,
      topIndication: null,
      minLengthK2i: '',
      groupingMode: null,
    } as const;
    expect(buildSpecGenerateOptions(input)).toEqual({});
    expect(missingSpecGenerateFields(input)).toEqual([
      'режим группировки', 'Ex', 'К1i', 'К2i', 'Кiu', 'L,К2i', 'R,гр',
    ]);
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
