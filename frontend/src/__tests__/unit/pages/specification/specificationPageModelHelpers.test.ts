import { describe, expect, it } from 'vitest';

import {
  buildExcludedGroupsToast,
  buildPreflightSummaryText,
  buildSpecificationGeneratedToast,
  filterValidGenerateErIds,
  resolveGenerateVariantIds,
} from '@/pages/specification/specificationPageModelHelpers';

describe('specificationPageModelHelpers', () => {
  it('builds generate success / partial toasts', () => {
    expect(buildSpecificationGeneratedToast({
      partial: false,
      generatedCount: 1,
      electricalVariantName: 'ЭР-1',
    })).toContain('ЭР-1');
    expect(buildSpecificationGeneratedToast({
      partial: true,
      generatedCount: 3,
      electricalVariantName: 'ЭР-1',
    })).toContain('неполная');
  });

  it('builds excluded groups and preflight summary text', () => {
    expect(buildExcludedGroupsToast([{ error_code: 'E1' }, { error_code: 'E2' }]))
      .toBe('Исключённые группы: E1, E2');
    expect(buildPreflightSummaryText({
      total_skipped_objects: 2,
      variants: [{ electrical_variant_name: 'A', skipped_objects: 2 }],
    })).toContain('Всего исключений: 2');
  });

  it('resolves generate ER ids and filters stale selections', () => {
    expect(resolveGenerateVariantIds(['a', 'b'], 'fallback')).toEqual(['a', 'b']);
    expect(resolveGenerateVariantIds([], 'fallback')).toEqual(['fallback']);
    expect(filterValidGenerateErIds(
      ['gone'],
      new Set(['keep']),
      'keep',
      true,
    )).toEqual(['keep']);
  });
});
