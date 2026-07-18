import { describe, expect, it } from 'vitest';

import {
  backendFilterFromElectricalColumnFilter,
  buildElectricalQueryRequest,
  updateElectricalQueryPageCalculation,
} from '@/pages/electrical/elecCalcQueryModel';
import type { ElectricalCalcSummary, ElectricalQueryResponse } from '@/types/calculation';
import type {
  ObjectQueryFieldCapability,
  ObjectQueryFilterOp,
} from '@/types/project';
import type { HeatCalcTableViewState } from '@/utils/heatCalcTableFindability';

function capability(
  key: string,
  ops: ObjectQueryFilterOp[],
  options: {
    sortEnabled?: boolean;
    dataType?: ObjectQueryFieldCapability['data_type'];
  } = {},
): ObjectQueryFieldCapability {
  return {
    key,
    label: key,
    title: key,
    data_type: options.dataType ?? (ops.includes('range') ? 'number' : 'text'),
    unit: null,
    filter: { enabled: true, ops, include_empty: true },
    sort: { enabled: options.sortEnabled ?? true },
    options: null,
  };
}

function calculation(id: string, objectId: string, cableMark: string): ElectricalCalcSummary {
  return {
    id,
    project_id: 'project-1',
    object_id: objectId,
    cable_type: 'self_regulating',
    cable_mark: cableMark,
    variant_number: 1,
    results: { calculated: true },
  };
}

function page(objectIds: string[], calculations: ElectricalCalcSummary[]): ElectricalQueryResponse {
  return {
    items: objectIds.map((id, sortOrder) => ({
      id,
      project_id: 'project-1',
      object_type: 'pipe',
      sort_order: sortOrder,
      version: 1,
      params: { name: id },
      results: { total_heat_loss: 100 },
      is_valid: true,
      validation_errors: null,
      created_at: '2026-07-18T00:00:00Z',
      updated_at: '2026-07-18T00:00:00Z',
    })),
    calculations,
    summary: {
      total_objects: objectIds.length,
      valid_objects: objectIds.length,
      invalid_objects: 0,
      electrical_calculations_total: calculations.length,
      calculated_count: calculations.length,
      failed_count: 0,
      total_cable_length: 0,
      total_power: 0,
      total_current: 0,
    },
    page_info: {
      page: 1,
      page_size: 50,
      offset: 0,
      total_pages: objectIds.length > 0 ? 1 : 0,
      has_next_page: false,
      has_previous_page: false,
    },
    counts: { total: objectIds.length, filtered: objectIds.length },
    query: { variant_number: 1, sort: null },
  };
}

describe('elecCalcQueryModel', () => {
  it('builds electrical backend query with filters, sort, cable source, variant and cursor', () => {
    const state: HeatCalcTableViewState = {
      filters: {
        object_name: { kind: 'text', value: 'P01' },
        current: { kind: 'numberRange', min: 1.5, max: 10, includeEmpty: true },
        cable_type: { kind: 'enum', values: ['self_regulating'], includeEmpty: false },
        aggressive_product: { kind: 'boolean', value: 'empty' },
      },
      sort: { columnKey: 'current', direction: 'desc' },
    };

    const request = buildElectricalQueryRequest(
      'project-1',
      'er-1',
      3,
      'commercial',
      state,
      4,
      50,
      {
        fields: [
          capability('object_name', ['contains']),
          capability('current', ['range']),
          capability('cable_type', ['equals', 'in']),
          capability('aggressive_product', ['equals'], { dataType: 'boolean' }),
        ],
      },
      {
        sort_order: 150,
        id: 'object-150',
        key: 'current',
        value: 7.2,
        value_is_null: false,
      },
    );

    expect(request).toEqual({
      project_id: 'project-1',
      electrical_variant_id: 'er-1',
      variant_number: 3,
      cable_source: 'commercial',
      page: 4,
      page_size: 50,
      after_sort_order: 150,
      after_id: 'object-150',
      after_key: 'current',
      after_value: 7.2,
      after_value_is_null: false,
      filters: [
        { key: 'object_name', op: 'contains', value: 'P01' },
        {
          key: 'current',
          op: 'range',
          min: 1.5,
          max: 10,
          include_empty: true,
        },
        {
          key: 'cable_type',
          op: 'equals',
          value: 'self_regulating',
          values: undefined,
          include_empty: false,
        },
        {
          key: 'aggressive_product',
          op: 'equals',
          value: null,
          include_empty: true,
        },
      ],
      sort: { key: 'current', dir: 'desc' },
    });
  });

  it('drops inactive filters and disables sort when backend capability forbids it', () => {
    const state: HeatCalcTableViewState = {
      filters: {
        object_name: { kind: 'text', value: '   ' },
        voltage: { kind: 'numberRange' },
        cable_type: { kind: 'enum', values: [], includeEmpty: false },
        aggressive_product: { kind: 'boolean', value: undefined },
      },
      sort: { columnKey: 'voltage', direction: 'asc' },
    };

    const request = buildElectricalQueryRequest(
      'project-1',
      'er-1',
      1,
      'builtin',
      state,
      1,
      25,
      {
        fields: [
          capability('object_name', ['contains']),
          capability('voltage', ['range'], { sortEnabled: false }),
          capability('cable_type', ['in']),
          capability('aggressive_product', ['equals'], { dataType: 'boolean' }),
        ],
      },
    );

    expect(request.filters).toEqual([]);
    expect(request.sort).toBeNull();
  });

  it('maps enum filters to in when multiple values are selected', () => {
    expect(backendFilterFromElectricalColumnFilter(
      'electrical_status',
      { kind: 'enum', values: ['calculated', 'failed'], includeEmpty: true },
      capability('electrical_status', ['equals', 'in']),
    )).toEqual({
      key: 'electrical_status',
      op: 'in',
      value: undefined,
      values: ['calculated', 'failed'],
      include_empty: true,
    });
  });

  it('updates a calculation only in cached query pages that contain its object', () => {
    const oldCalculation = calculation('calc-old', 'object-1', 'OLD');
    const nextCalculation = calculation('calc-next', 'object-1', 'NEW');
    const containingPage = page(['object-1', 'object-2'], [oldCalculation]);
    const filteredPageWithoutObject = page(['object-2'], []);

    const updated = updateElectricalQueryPageCalculation(containingPage, nextCalculation);
    const untouched = updateElectricalQueryPageCalculation(
      filteredPageWithoutObject,
      nextCalculation,
    );

    expect(updated).not.toBe(containingPage);
    expect(updated.calculations).toEqual([nextCalculation]);
    expect(untouched).toBe(filteredPageWithoutObject);
    expect(untouched.calculations).toEqual([]);
  });

  it('appends a calculation when the cached page contains the object without a result', () => {
    const currentPage = page(['object-1'], []);
    const nextCalculation = calculation('calc-next', 'object-1', 'NEW');

    expect(updateElectricalQueryPageCalculation(currentPage, nextCalculation).calculations)
      .toEqual([nextCalculation]);
  });
});
