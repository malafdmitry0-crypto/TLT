import { describe, expect, it } from 'vitest';

import {
  buildCandidateEnumOptionsByColumn,
  buildElectricalEnumOptionsByColumn,
  buildFieldCapabilityByKey,
  CANDIDATE_BOOLEAN_FILTER_KEYS,
  CANDIDATE_ENUM_FILTER_KEYS,
  CANDIDATE_NUMERIC_FILTER_KEYS,
  filterKindForCandidateColumn,
  filterKindForElectricalColumn,
  toInputNumberValue,
  updateTableViewColumnFilter,
  updateTableViewSort,
} from '@/pages/electrical/elecCalcTableFilterModel';
import type { ElectricalCandidate } from '@/types/calculation';
import type { ObjectQueryFieldCapability, ObjectQueryFilterOp } from '@/types/project';
import type {
  HeatCalcColumnFilter,
  HeatCalcColumnValueAccessors,
  HeatCalcTableViewState,
} from '@/utils/heatCalcTableFindability';

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

  it('builds field capabilities lookup by backend field key', () => {
    const totalPowerCapability = {
      ...capability(['range'], 'number'),
      key: 'total_power',
    } satisfies ObjectQueryFieldCapability;
    const statusCapability = {
      ...capability(['in'], 'enum'),
      key: 'electrical_status',
    } satisfies ObjectQueryFieldCapability;

    const byKey = buildFieldCapabilityByKey([totalPowerCapability, statusCapability]);

    expect(byKey.get('total_power')).toBe(totalPowerCapability);
    expect(byKey.get('electrical_status')).toBe(statusCapability);
    expect(buildFieldCapabilityByKey(null).size).toBe(0);
  });

  it('builds main table enum filter options from backend capabilities', () => {
    const statusCapability = {
      ...capability(['in'], 'enum'),
      key: 'electrical_status',
      options: {
        mode: 'inline',
        include_empty: true,
        items: [
          { value: 'success', label: 'Успешно' },
          { value: 404, label: 'Ошибка 404' },
        ],
      },
    } satisfies ObjectQueryFieldCapability;
    const textCapability = {
      ...capability(['contains'], 'text'),
      key: 'object_name',
    } satisfies ObjectQueryFieldCapability;

    expect(buildElectricalEnumOptionsByColumn([statusCapability, textCapability])).toEqual({
      electrical_status: [
        { value: 'success', label: 'Успешно' },
        { value: '404', label: 'Ошибка 404' },
      ],
    });
    expect(buildElectricalEnumOptionsByColumn(null)).toEqual({});
  });

  it('builds candidate enum filter options from visible enum columns and accessors', () => {
    const candidates = [
      { id: 'candidate-1', cable_type: 'tt', mode: 'manual' },
      { id: 'candidate-2', cable_type: 'selfreg', mode: 'auto' },
      { id: 'candidate-3', cable_type: 'tt', mode: '—' },
    ] as ElectricalCandidate[];
    const accessors: HeatCalcColumnValueAccessors<ElectricalCandidate> = {
      cable_type: (candidate) => candidate.cable_type,
      mode: (candidate) => candidate.mode,
      cable_mark: (candidate) => candidate.cable_mark,
    };

    expect(buildCandidateEnumOptionsByColumn(
      candidates,
      [{ key: 'cable_type' }, { key: 'mode' }, { key: 'cable_mark' }],
      accessors,
    )).toEqual({
      cable_type: [
        { value: 'selfreg', label: 'selfreg' },
        { value: 'tt', label: 'tt' },
      ],
      mode: [
        { value: 'auto', label: 'auto' },
        { value: 'manual', label: 'manual' },
      ],
    });
  });
});
