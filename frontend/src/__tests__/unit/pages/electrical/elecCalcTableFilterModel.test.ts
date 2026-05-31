import { describe, expect, it } from 'vitest';

import {
  CANDIDATE_BOOLEAN_FILTER_KEYS,
  CANDIDATE_ENUM_FILTER_KEYS,
  CANDIDATE_NUMERIC_FILTER_KEYS,
  filterKindForCandidateColumn,
  filterKindForElectricalColumn,
  toInputNumberValue,
  updateTableViewColumnFilter,
  updateTableViewSort,
} from '@/pages/electrical/elecCalcTableFilterModel';
import type { ObjectQueryFieldCapability, ObjectQueryFilterOp } from '@/types/project';
import type { HeatCalcColumnFilter, HeatCalcTableViewState } from '@/utils/heatCalcTableFindability';

function capability(
  ops: ObjectQueryFilterOp[],
  dataType: ObjectQueryFieldCapability['data_type'] = 'text',
  enabled = true,
): ObjectQueryFieldCapability {
  return {
    key: 'field',
    label: 'Field',
    title: 'Field',
    data_type: dataType,
    unit: null,
    filter: {
      enabled,
      ops,
      include_empty: true,
    },
    sort: {
      enabled: false,
    },
    options: null,
  };
}

describe('elecCalcTableFilterModel', () => {
  it('prefers backend capability filter ops for main electrical columns', () => {
    expect(filterKindForElectricalColumn('object_name', capability(['range'], 'number')))
      .toBe('numberRange');
    expect(filterKindForElectricalColumn('object_name', capability(['in'], 'enum')))
      .toBe('enum');
    expect(filterKindForElectricalColumn('object_name', capability(['equals'], 'boolean')))
      .toBe('boolean');
    expect(filterKindForElectricalColumn('total_power', capability(['contains'], 'text')))
      .toBe('text');
  });

  it('falls back to stable main table filter kinds when capability is absent or disabled', () => {
    expect(filterKindForElectricalColumn('total_power')).toBe('numberRange');
    expect(filterKindForElectricalColumn('current')).toBe('numberRange');
    expect(filterKindForElectricalColumn('electrical_status')).toBe('enum');
    expect(filterKindForElectricalColumn('object_type')).toBe('enum');
    expect(filterKindForElectricalColumn('object_name')).toBe('text');
    expect(filterKindForElectricalColumn('total_power', capability(['range'], 'number', false)))
      .toBe('numberRange');
  });

  it('keeps candidate filter key groups and fallback kinds stable', () => {
    expect(CANDIDATE_NUMERIC_FILTER_KEYS.has('lead_time_days')).toBe(true);
    expect(CANDIDATE_ENUM_FILTER_KEYS.has('stock_status')).toBe(true);
    expect(CANDIDATE_BOOLEAN_FILTER_KEYS.has('marked')).toBe(true);

    expect(filterKindForCandidateColumn('marked')).toBe('boolean');
    expect(filterKindForCandidateColumn('aggressive_product')).toBe('boolean');
    expect(filterKindForCandidateColumn('lead_time_days')).toBe('numberRange');
    expect(filterKindForCandidateColumn('total_cost')).toBe('numberRange');
    expect(filterKindForCandidateColumn('mode')).toBe('enum');
    expect(filterKindForCandidateColumn('stock_status')).toBe('enum');
    expect(filterKindForCandidateColumn('cable_mark')).toBe('text');
  });

  it('keeps InputNumber value coercion stable for range filters', () => {
    expect(toInputNumberValue(10)).toBe(10);
    expect(toInputNumberValue('12.5')).toBe(12.5);
    expect(toInputNumberValue(null)).toBe(0);
    expect(toInputNumberValue(undefined)).toBeNull();
    expect(toInputNumberValue('bad')).toBeNull();
  });

  it('adds and removes table view filters without changing other state', () => {
    const totalPowerFilter: HeatCalcColumnFilter = { kind: 'numberRange', min: 10 };
    const currentFilter: HeatCalcColumnFilter = { kind: 'numberRange', max: 30 };
    const initial: HeatCalcTableViewState = {
      filters: {
        current: currentFilter,
      },
      sort: {
        columnKey: 'current',
        direction: 'desc',
      },
    };

    const withFilter = updateTableViewColumnFilter(initial, 'total_power', totalPowerFilter);

    expect(withFilter).toEqual({
      filters: {
        current: currentFilter,
        total_power: totalPowerFilter,
      },
      sort: {
        columnKey: 'current',
        direction: 'desc',
      },
    });
    expect(updateTableViewColumnFilter(withFilter, 'total_power', { kind: 'text', value: '  ' }))
      .toEqual(initial);
  });

  it('updates table view sort and preserves active filters', () => {
    const filter: HeatCalcColumnFilter = { kind: 'text', value: 'ТЛТ' };
    const initial: HeatCalcTableViewState = {
      filters: {
        cable_mark: filter,
      },
      sort: {
        columnKey: 'current',
        direction: 'desc',
      },
    };

    expect(updateTableViewSort(initial, 'total_cost', 'asc')).toEqual({
      filters: {
        cable_mark: filter,
      },
      sort: {
        columnKey: 'total_cost',
        direction: 'asc',
      },
    });
    expect(updateTableViewSort(initial, 'total_cost')).toEqual({
      filters: {
        cable_mark: filter,
      },
      sort: undefined,
    });
  });
});
