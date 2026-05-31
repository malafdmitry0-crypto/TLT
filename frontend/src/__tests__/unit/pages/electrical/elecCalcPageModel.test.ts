import { describe, expect, it } from 'vitest';

import {
  ELECTRICAL_TABLE_PAGE_SIZE,
  EMPTY_ELECTRICAL_CALCS,
  EMPTY_OBJECTS,
  SHOW_COMMERCIAL_CABLE_BASE_UI,
  electricalCalculationsForTable,
  electricalLoadedPagesForTable,
  electricalObjectsForTable,
} from '@/pages/electrical/elecCalcPageModel';
import type { ElectricalCalcSummary, ElectricalQueryResponse } from '@/types/calculation';
import type { ProjectObject } from '@/types/project';

const object = (id: string) => ({ id }) as ProjectObject;
const calc = (objectId: string) => ({ object_id: objectId }) as ElectricalCalcSummary;

const page = (
  items: ProjectObject[],
  calculations: ElectricalCalcSummary[],
): ElectricalQueryResponse => ({
  items,
  calculations,
  summary: {},
  page_info: {},
  counts: { total: items.length, filtered: items.length },
  query: { variant_number: 1, sort: null },
}) as ElectricalQueryResponse;

describe('elecCalcPageModel', () => {
  it('keeps page-level defaults stable', () => {
    expect(ELECTRICAL_TABLE_PAGE_SIZE).toBe(50);
    expect(SHOW_COMMERCIAL_CABLE_BASE_UI).toBe(false);
    expect(EMPTY_OBJECTS).toEqual([]);
    expect(EMPTY_ELECTRICAL_CALCS).toEqual([]);
  });

  it('uses the current page directly when glide pagination is disabled', () => {
    const firstPage = page([object('obj-1')], [calc('obj-1')]);

    expect(electricalLoadedPagesForTable({
      electricalGlideEnabled: false,
      electricalPage: firstPage,
      electricalInfinitePages: {},
      isElectricalPagePlaceholderData: false,
      tablePage: 3,
    })).toEqual([firstPage]);
    expect(electricalObjectsForTable(false, firstPage, [])).toEqual(firstPage.items);
    expect(electricalCalculationsForTable(false, firstPage, [])).toEqual(firstPage.calculations);
  });

  it('collects loaded glide pages in page order and deduplicates rows and calculations', () => {
    const firstPage = page([object('obj-1'), object('obj-2')], [calc('obj-1'), calc('obj-2')]);
    const secondPage = page([object('obj-2'), object('obj-3')], [calc('obj-2'), calc('obj-3')]);
    const loadedPages = electricalLoadedPagesForTable({
      electricalGlideEnabled: true,
      electricalPage: secondPage,
      electricalInfinitePages: { 2: secondPage, 1: firstPage },
      isElectricalPagePlaceholderData: false,
      tablePage: 2,
    });

    expect(loadedPages).toEqual([firstPage, secondPage]);
    expect(electricalObjectsForTable(true, secondPage, loadedPages).map((item) => item.id))
      .toEqual(['obj-1', 'obj-2', 'obj-3']);
    expect(electricalCalculationsForTable(true, secondPage, loadedPages).map((item) => item.object_id))
      .toEqual(['obj-1', 'obj-2', 'obj-3']);
  });

  it('falls back to the current glide page only when it is not placeholder data', () => {
    const firstPage = page([object('obj-1')], [calc('obj-1')]);

    expect(electricalLoadedPagesForTable({
      electricalGlideEnabled: true,
      electricalPage: firstPage,
      electricalInfinitePages: {},
      isElectricalPagePlaceholderData: false,
      tablePage: 1,
    })).toEqual([firstPage]);
    expect(electricalLoadedPagesForTable({
      electricalGlideEnabled: true,
      electricalPage: firstPage,
      electricalInfinitePages: {},
      isElectricalPagePlaceholderData: true,
      tablePage: 1,
    })).toEqual([]);
  });
});
