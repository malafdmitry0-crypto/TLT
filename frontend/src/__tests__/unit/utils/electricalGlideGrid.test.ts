import { describe, expect, it } from 'vitest';

import type { ObjectQueryFieldCapability } from '@/types/project';
import type { ElectricalResolvedColumnMeta } from '@/utils/electricalTableColumns';
import {
  buildElectricalGlideColumns,
  electricalGlideFilterKindForCapability,
  nextElectricalGlideSortDirection,
} from '@/utils/electricalGlideGrid';

function capability(
  key: string,
  dataType: ObjectQueryFieldCapability['data_type'],
  ops: ObjectQueryFieldCapability['filter']['ops'],
  sortEnabled = true,
): ObjectQueryFieldCapability {
  return {
    key,
    label: key,
    title: key,
    data_type: dataType,
    unit: null,
    filter: { enabled: ops.length > 0, ops, include_empty: true },
    sort: { enabled: sortEnabled, type: dataType === 'number' ? 'number' : 'text', nulls: 'last' },
    options: null,
  };
}

function column(key: string, width = 120): ElectricalResolvedColumnMeta {
  return {
    key,
    labels: { short: key, full: key, compact: key },
    label: `${key} label`,
    title: `${key} title`,
    group: 'test',
    source: 'test',
    valueType: 'text',
    width,
    widthPct: width / 10,
    defaultWidthPct: width / 10,
    minWidthPx: 80,
    visible: true,
    order: 1,
  };
}

describe('electricalGlideGrid adapter', () => {
  it('maps backend capabilities to Glide filter kinds', () => {
    expect(electricalGlideFilterKindForCapability(
      'current',
      capability('current', 'number', ['range']),
    )).toBe('numberRange');
    expect(electricalGlideFilterKindForCapability(
      'electrical_status',
      capability('electrical_status', 'enum', ['in']),
    )).toBe('enum');
    expect(electricalGlideFilterKindForCapability(
      'aggressive_product',
      capability('aggressive_product', 'boolean', ['equals']),
    )).toBe('boolean');
    expect(electricalGlideFilterKindForCapability('voltage')).toBe('numberRange');
  });

  it('builds visible Glide columns from electrical table settings and query metadata', () => {
    const capabilitiesByKey = new Map([
      ['object_name', capability('object_name', 'text', ['contains'])],
      ['current', capability('current', 'number', ['range'], false)],
      ['index', capability('index', 'text', [])],
    ]);

    const columns = buildElectricalGlideColumns({
      columns: [column('index', 40), column('object_name', 160), column('current', 120)],
      capabilitiesByKey,
      enumOptionsByColumn: {},
      getAlign: (key) => (key === 'current' ? 'right' : undefined),
    });

    expect(columns).toEqual([
      expect.objectContaining({
        key: 'index',
        title: 'index title',
        width: 80,
        sortable: false,
        filterable: false,
      }),
      expect.objectContaining({
        key: 'object_name',
        width: 160,
        sortable: true,
        filterable: true,
        filterKind: 'text',
      }),
      expect.objectContaining({
        key: 'current',
        align: 'right',
        sortable: false,
        filterable: true,
        filterKind: 'numberRange',
      }),
    ]);
  });

  it('cycles sort state like the AntD electrical table', () => {
    expect(nextElectricalGlideSortDirection({ filters: {} }, 'object_name')).toBe('asc');
    expect(nextElectricalGlideSortDirection({
      filters: {},
      sort: { columnKey: 'object_name', direction: 'asc' },
    }, 'object_name')).toBe('desc');
    expect(nextElectricalGlideSortDirection({
      filters: {},
      sort: { columnKey: 'object_name', direction: 'desc' },
    }, 'object_name')).toBeUndefined();
  });
});
