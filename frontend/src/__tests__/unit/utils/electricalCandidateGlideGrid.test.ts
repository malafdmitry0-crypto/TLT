import { describe, expect, it } from 'vitest';

import type { ElectricalCandidateResolvedColumnMeta } from '@/utils/electricalCandidateTableColumns';
import { buildElectricalCandidateGlideColumns } from '@/utils/electricalCandidateGlideGrid';

function column(
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

describe('electricalCandidateGlideGrid adapter', () => {
  it('maps candidate table metadata to Glide columns without enabling filters on actions', () => {
    const columns = buildElectricalCandidateGlideColumns({
      columns: [
        column('marked', { align: 'center', width: 56, minWidthPx: 56 }),
        column('actions', { width: 96, minWidthPx: 88 }),
        column('total_power', { align: 'right' }),
        column('cable_type'),
      ],
      enumOptionsByColumn: {
        cable_type: [{ value: 'self_regulating', label: 'Саморегулирующийся' }],
      },
      getFilterKind: (key) => (key === 'total_power' ? 'numberRange' : 'enum'),
    });

    expect(columns).toEqual([
      expect.objectContaining({
        key: 'marked',
        align: 'center',
        width: 56,
        sortable: true,
        filterable: true,
      }),
      expect.objectContaining({
        key: 'actions',
        width: 96,
        sortable: false,
        filterable: false,
      }),
      expect.objectContaining({
        key: 'total_power',
        align: 'right',
        filterKind: 'numberRange',
      }),
      expect.objectContaining({
        key: 'cable_type',
        filterKind: 'enum',
        enumOptions: [{ value: 'self_regulating', label: 'Саморегулирующийся' }],
      }),
    ]);
  });
});
