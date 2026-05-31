import { describe, expect, it } from 'vitest';

import {
  backendFilterFromElectricalColumnFilter,
  buildElectricalQueryRequest,
} from '@/pages/electrical/elecCalcQueryModel';
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
});
