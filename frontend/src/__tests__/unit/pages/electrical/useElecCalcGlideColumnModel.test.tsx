import { renderHook } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import type { ObjectQueryFieldCapability } from '@/types/project';
import type { ElectricalCandidateResolvedColumnMeta } from '@/utils/electricalCandidateTableColumns';
import type { ElectricalResolvedColumnMeta } from '@/utils/electricalTableColumns';
import { useElecCalcGlideColumnModel } from '@/pages/electrical/useElecCalcGlideColumnModel';

function capability(
  key: string,
  dataType: ObjectQueryFieldCapability['data_type'],
  ops: ObjectQueryFieldCapability['filter']['ops'],
): ObjectQueryFieldCapability {
  return {
    key,
    label: key,
    title: key,
    data_type: dataType,
    unit: null,
    filter: { enabled: ops.length > 0, ops, include_empty: true },
    sort: { enabled: true, type: dataType === 'number' ? 'number' : 'text' },
    options: null,
  };
}

function electricalColumn(
  key: string,
  overrides: Partial<ElectricalResolvedColumnMeta> = {},
): ElectricalResolvedColumnMeta {
  return {
    key,
    labels: { short: key, full: key, compact: key },
    label: `${key} label`,
    title: `${key} title`,
    group: 'test',
    source: 'test',
    valueType: 'text',
    width: 120,
    widthPct: 10,
    defaultWidthPct: 10,
    minWidthPx: 80,
    visible: true,
    order: 1,
    ...overrides,
  };
}

function candidateColumn(
  key: string,
  overrides: Partial<ElectricalCandidateResolvedColumnMeta> = {},
): ElectricalCandidateResolvedColumnMeta {
  return {
    key,
    labels: { short: key, full: key, compact: key },
    label: `${key} label`,
    title: `${key} title`,
    group: 'test',
    source: 'test',
    valueType: 'text',
    width: 120,
    widthPct: 10,
    defaultWidthPct: 10,
    minWidthPx: 80,
    visible: true,
    order: 1,
    ...overrides,
  };
}

describe('useElecCalcGlideColumnModel', () => {
  it('builds main Glide columns from visible metas, capabilities and renderer alignment', () => {
    const visibleElectricalColumnMetas = [
      electricalColumn('index', { width: 40, minWidthPx: 56 }),
      electricalColumn('current', { width: 120, minWidthPx: 144 }),
      electricalColumn('electrical_status', { width: 150, minWidthPx: 80 }),
    ];
    const { result } = renderHook(() => useElecCalcGlideColumnModel({
      visibleElectricalColumnMetas,
      fieldCapabilityByKey: new Map([
        ['current', capability('current', 'number', ['range'])],
        ['electrical_status', capability('electrical_status', 'enum', ['in'])],
      ]),
      enumOptionsByColumn: {
        electrical_status: [{ value: 'success', label: 'Успешно' }],
      },
      getElectricalColumnAlign: (key) => (key === 'current' ? 'right' : undefined),
      visibleCandidateColumnMetas: [],
      candidateEnumOptionsByColumn: {},
    }));

    expect(result.current.electricalGlideColumns).toEqual([
      expect.objectContaining({
        key: 'index',
        width: 56,
        sortable: false,
        filterable: false,
      }),
      expect.objectContaining({
        key: 'current',
        align: 'right',
        width: 144,
        sortable: true,
        filterable: true,
        filterKind: 'numberRange',
      }),
      expect.objectContaining({
        key: 'electrical_status',
        filterKind: 'enum',
        enumOptions: [{ value: 'success', label: 'Успешно' }],
      }),
    ]);
  });

  it('builds candidate Glide columns and exposes candidate meta lookup', () => {
    const marked = candidateColumn('marked', { align: 'center', width: 56, minWidthPx: 56 });
    const actions = candidateColumn('actions', { width: 112, minWidthPx: 156 });
    const cableType = candidateColumn('cable_type', { width: 120, minWidthPx: 90 });
    const { result } = renderHook(() => useElecCalcGlideColumnModel({
      visibleElectricalColumnMetas: [],
      fieldCapabilityByKey: new Map(),
      enumOptionsByColumn: {},
      visibleCandidateColumnMetas: [marked, actions, cableType],
      candidateEnumOptionsByColumn: {
        cable_type: [{ value: 'self_regulating', label: 'Саморегулирующийся' }],
      },
    }));

    expect(result.current.candidateGlideColumnMetaByKey.get('marked')).toBe(marked);
    expect(result.current.candidateGlideColumnMetaByKey.get('actions')).toBe(actions);
    expect(result.current.electricalCandidateGlideColumns).toEqual([
      expect.objectContaining({
        key: 'marked',
        align: 'center',
        filterKind: 'boolean',
        sortable: true,
        filterable: true,
      }),
      expect.objectContaining({
        key: 'actions',
        width: 156,
        sortable: false,
        filterable: false,
      }),
      expect.objectContaining({
        key: 'cable_type',
        filterKind: 'enum',
        enumOptions: [{ value: 'self_regulating', label: 'Саморегулирующийся' }],
      }),
    ]);
  });
});
