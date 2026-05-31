import { describe, expect, it } from 'vitest';

import {
  ELECTRICAL_TABLE_PAGE_SIZE,
  EMPTY_ELECTRICAL_CALCS,
  EMPTY_OBJECTS,
  SHOW_COMMERCIAL_CABLE_BASE_UI,
} from '@/pages/electrical/elecCalcPageModel';

describe('elecCalcPageModel', () => {
  it('keeps page-level defaults stable', () => {
    expect(ELECTRICAL_TABLE_PAGE_SIZE).toBe(50);
    expect(SHOW_COMMERCIAL_CABLE_BASE_UI).toBe(false);
    expect(EMPTY_OBJECTS).toEqual([]);
    expect(EMPTY_ELECTRICAL_CALCS).toEqual([]);
  });
});
