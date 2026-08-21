// @vitest-environment node
import { describe, expect, it } from 'vitest';

import {
  buildSpecificationGeneratedToast,
  filterValidGenerateErIds,
  resolveGenerateVariantIds,
} from '@/pages/specification/specificationPageModelHelpers';

describe('specificationPageModelHelpers', () => {
  it('builds generate success and mixed-result toasts', () => {
    expect(buildSpecificationGeneratedToast({
      hasUnresolved: false,
      generatedCount: 1,
      electricalVariantName: 'ЭР-1',
    })).toContain('ЭР-1');
    expect(buildSpecificationGeneratedToast({
      hasUnresolved: true,
      generatedCount: 3,
      electricalVariantName: 'ЭР-1',
    })).toContain('остальные выбранные ЭР требуют действий');
  });

  it('resolves generate ER ids and filters stale selections', () => {
    expect(resolveGenerateVariantIds(['a', 'b'], 'fallback')).toEqual(['a', 'b']);
    expect(resolveGenerateVariantIds([], 'fallback')).toEqual(['fallback']);
    expect(filterValidGenerateErIds(
      ['gone'],
      new Set(['keep']),
      'keep',
    )).toEqual(['keep']);
    expect(filterValidGenerateErIds(
      ['gone'],
      new Set(['uuid-only']),
      'uuid-only',
    )).toEqual(['uuid-only']);
  });
});
