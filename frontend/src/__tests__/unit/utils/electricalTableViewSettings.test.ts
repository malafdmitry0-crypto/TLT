import { beforeEach, describe, expect, it } from 'vitest';

import {
  ELECTRICAL_GUEST_TABLE_VIEW_STORAGE_KEY,
  getDefaultElectricalTableViewSettings,
  normalizeElectricalTableViewSettings,
  readGuestElectricalTableViewSettings,
  writeGuestElectricalTableViewSettings,
} from '@/utils/electricalTableViewSettings';

describe('electricalTableViewSettings', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it('normalizes only table view controls', () => {
    expect(normalizeElectricalTableViewSettings({
      version: 1,
      fontSize: 'compact',
      tableLabelFormat: 'full',
      settingsLabelFormat: 'compact',
      calculationCableSource: 'extended',
      cablePickerObjectFields: null,
      cablePickerCableFields: ['source'],
    })).toEqual({
      fontSize: 'compact',
      tableLabelFormat: 'full',
      settingsLabelFormat: 'compact',
      calculationCableSource: 'extended',
    });
  });

  it('writes guest settings without cable picker field arrays', () => {
    writeGuestElectricalTableViewSettings({
      ...getDefaultElectricalTableViewSettings(),
      fontSize: 'comfortable',
      tableLabelFormat: 'full',
      settingsLabelFormat: 'short',
      calculationCableSource: 'all',
    });

    const stored = JSON.parse(localStorage.getItem(ELECTRICAL_GUEST_TABLE_VIEW_STORAGE_KEY) ?? '{}');
    expect(stored).toMatchObject({
      fontSize: 'comfortable',
      tableLabelFormat: 'full',
      settingsLabelFormat: 'short',
      calculationCableSource: 'all',
    });
    expect(stored).not.toHaveProperty('cablePickerObjectFields');
    expect(stored).not.toHaveProperty('cablePickerCableFields');
    expect(readGuestElectricalTableViewSettings()).toEqual(stored);
  });
});
