import { beforeEach, describe, expect, it } from 'vitest';

import {
  ELECTRICAL_GUEST_CANDIDATE_TABLE_COLUMN_STORAGE_KEY,
  createElectricalCandidateTableColumnSettingsPatch,
  getAvailableElectricalCandidateTableColumnKeys,
  getDefaultElectricalCandidateTableColumnSettings,
  getVisibleElectricalCandidateTableColumnMetas,
  normalizeElectricalCandidateTableColumnSettings,
  readGuestElectricalCandidateTableColumnSettings,
  setElectricalCandidateTableColumnVisibility,
  writeGuestElectricalCandidateTableColumnSettings,
} from '@/utils/electricalCandidateTableColumns';

describe('electricalCandidateTableColumns', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it('keeps candidate table settings separate from the main electrical table', () => {
    const defaults = getDefaultElectricalCandidateTableColumnSettings();

    expect(defaults.visibleOrder).toContain('marked');
    expect(defaults.visibleOrder).toContain('actions');
    expect(defaults.visibleOrder).toContain('mode');
    expect(defaults.visibleOrder).toContain('cable_mark');
    expect(defaults.visibleOrder).toContain('power_per_meter');
    expect(defaults.visibleOrder).not.toContain('object_name');
  });

  it('does not expose legacy T2/T3/R candidate columns', () => {
    const keys = getAvailableElectricalCandidateTableColumnKeys();

    expect(keys).not.toContain('vapor_temperature');
    expect(keys).not.toContain('maintain_temperature');
    expect(keys).not.toContain('aggressive_product');
  });

  it('normalizes unknown keys and keeps required action/cable columns visible', () => {
    const normalized = normalizeElectricalCandidateTableColumnSettings({
      version: 999,
      visibleOrder: ['marked', 'unknown', 'current'],
      columns: {
        current: { widthPct: 80 },
        cable_mark: { widthPct: 2 },
        unknown: { widthPct: 10 },
      },
    });

    expect(normalized.visibleOrder).toEqual(['marked', 'current', 'actions', 'cable_mark']);
    expect(normalized.columns.current.widthPct).toBe(60);
    expect(normalized.columns.cable_mark.widthPct).toBe(3);
  });

  it('does not hide required candidate action or cable mark columns', () => {
    const defaults = getDefaultElectricalCandidateTableColumnSettings();
    const withoutActions = setElectricalCandidateTableColumnVisibility(defaults, 'actions', false);
    const withoutMark = setElectricalCandidateTableColumnVisibility(defaults, 'cable_mark', false);

    expect(withoutActions.visibleOrder).toContain('actions');
    expect(withoutMark.visibleOrder).toContain('cable_mark');
  });

  it('persists guest candidate table settings under its own key', () => {
    const settings = createElectricalCandidateTableColumnSettingsPatch(
      getDefaultElectricalCandidateTableColumnSettings(),
      ['actions', 'mode', 'cable_mark', 'current'],
    );

    writeGuestElectricalCandidateTableColumnSettings(settings);

    const stored = JSON.parse(
      localStorage.getItem(ELECTRICAL_GUEST_CANDIDATE_TABLE_COLUMN_STORAGE_KEY) ?? '{}',
    );
    expect(stored.visibleOrder).toEqual(['actions', 'mode', 'cable_mark', 'current']);
    expect(readGuestElectricalCandidateTableColumnSettings()).toEqual(stored);
  });

  it('returns visible candidate metas in saved order', () => {
    const settings = createElectricalCandidateTableColumnSettingsPatch(
      getDefaultElectricalCandidateTableColumnSettings(),
      ['actions', 'cable_mark', 'current'],
    );

    expect(getVisibleElectricalCandidateTableColumnMetas(settings).map((meta) => meta.key))
      .toEqual(['actions', 'cable_mark', 'current']);
  });
});
