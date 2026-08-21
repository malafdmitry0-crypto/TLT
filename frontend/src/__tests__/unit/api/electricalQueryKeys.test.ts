// @vitest-environment node
import { describe, expect, it } from 'vitest';

import {
  electricalDataQueryKeys,
} from '@/api/electricalQueryKeys';
import type { ElectricalQueryRequest } from '@/types/calculation';

describe('electrical UUID query keys', () => {
  it('does not reuse a data cache when a legacy slot belongs to another UUID', () => {
    const request = {
      project_id: 'project-a',
      variant_number: 2,
      cable_source: 'builtin',
      page: 1,
      page_size: 100,
      filters: [],
      sort: null,
    } satisfies ElectricalQueryRequest;

    const deletedVariantKey = electricalDataQueryKeys.page(
      'project-a',
      '11111111-1111-4111-8111-111111111111',
      request,
    );
    const replacementVariantKey = electricalDataQueryKeys.page(
      'project-a',
      '22222222-2222-4222-8222-222222222222',
      request,
    );

    expect(deletedVariantKey).not.toEqual(replacementVariantKey);
  });
});
