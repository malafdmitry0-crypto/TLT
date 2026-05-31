import { renderHook } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { useElecCalcTableProjection } from '@/pages/electrical/useElecCalcTableProjection';
import type { ElectricalCalcSummary, ElectricalQueryResponse } from '@/types/calculation';
import type { ProjectObject } from '@/types/project';

function object(id: string, isValid = true): ProjectObject {
  return {
    id,
    is_valid: isValid,
  } as ProjectObject;
}

function calc(objectId: string, variantNumber = 1): ElectricalCalcSummary {
  return {
    id: `calc-${objectId}-${variantNumber}`,
    project_id: 'project-1',
    object_id: objectId,
    cable_type: 'self_regulating',
    cable_mark: 'ТЛТ-25',
    cable_mark_source: 'auto',
    variant_number: variantNumber,
    params: {},
    results: {
      selected_cable: 'ТЛТ-25',
      order_cable_length: 11,
      total_power: 250,
      current: 1.14,
    },
    created_at: '',
    updated_at: '',
  };
}

function page(
  items: ProjectObject[],
  calculations: ElectricalCalcSummary[],
  offset = 0,
): ElectricalQueryResponse {
  return {
    items,
    calculations,
    summary: {},
    page_info: { offset },
    counts: { total: items.length, filtered: items.length },
    query: { variant_number: 1, sort: null },
  } as ElectricalQueryResponse;
}

describe('useElecCalcTableProjection', () => {
  it('projects the current page directly for the Ant table engine', () => {
    const currentPage = page([object('obj-1'), object('obj-2', false)], [calc('obj-1')], 50);
    const { result } = renderHook(() => useElecCalcTableProjection({
      electricalGlideEnabled: false,
      electricalPage: currentPage,
      electricalInfinitePages: {},
      isElectricalPagePlaceholderData: false,
      tablePage: 2,
    }));

    expect(result.current.electricalLoadedPages).toEqual([currentPage]);
    expect(result.current.objects.map((item) => item.id)).toEqual(['obj-1', 'obj-2']);
    expect(result.current.elecCalcs.map((item) => item.object_id)).toEqual(['obj-1']);
    expect(result.current.electricalDisplayOffset).toBe(50);
    expect(result.current.stats.validObjects.map((item) => item.id)).toEqual(['obj-1']);
    expect(result.current.stats.calcedCount).toBe(1);
  });

  it('collects cached Glide pages, deduplicates rows and keeps display offset at zero', () => {
    const firstPage = page([object('obj-1'), object('obj-2')], [calc('obj-1'), calc('obj-2')]);
    const secondPage = page([object('obj-2'), object('obj-3')], [calc('obj-2', 2), calc('obj-3')], 50);
    const { result } = renderHook(() => useElecCalcTableProjection({
      electricalGlideEnabled: true,
      electricalPage: secondPage,
      electricalInfinitePages: { 2: secondPage, 1: firstPage },
      isElectricalPagePlaceholderData: false,
      tablePage: 2,
    }));

    expect(result.current.electricalLoadedPages).toEqual([firstPage, secondPage]);
    expect(result.current.objects.map((item) => item.id)).toEqual(['obj-1', 'obj-2', 'obj-3']);
    expect(result.current.elecCalcs.map((item) => item.object_id)).toEqual(['obj-1', 'obj-2', 'obj-3']);
    expect(result.current.electricalDisplayOffset).toBe(0);
    expect(result.current.stats.calcByObjectId['obj-2'].variant_number).toBe(1);
    expect(result.current.stats.totalCableLength).toBe(33);
  });
});
