import { beforeEach, describe, expect, it } from 'vitest';

import {
  ELECTRICAL_CABLE_PICKER_CABLE_FIELDS,
  ELECTRICAL_CABLE_PICKER_OBJECT_FIELDS,
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

  it('keeps fixed cable picker field arrays in normalized payloads', () => {
    expect(normalizeElectricalTableViewSettings({
      version: 3,
      fontSize: 'compact',
      tableLabelFormat: 'full',
      settingsLabelFormat: 'compact',
      calculationCableSource: 'extended',
      cablePickerObjectFields: null,
      cablePickerCableFields: ['source'],
    })).toEqual({
      version: 3,
      fontSize: 'compact',
      tableLabelFormat: 'full',
      settingsLabelFormat: 'compact',
      calculationCableSource: 'extended',
      cablePickerObjectFields: [...ELECTRICAL_CABLE_PICKER_OBJECT_FIELDS],
      cablePickerCableFields: [...ELECTRICAL_CABLE_PICKER_CABLE_FIELDS],
    });
  });

  it('writes guest settings with backend-required fixed field arrays', () => {
    writeGuestElectricalTableViewSettings({
      ...getDefaultElectricalTableViewSettings(),
      fontSize: 'comfortable',
      tableLabelFormat: 'full',
      settingsLabelFormat: 'short',
      calculationCableSource: 'all',
      cablePickerObjectFields: [],
      cablePickerCableFields: [],
    });

    const stored = JSON.parse(localStorage.getItem(ELECTRICAL_GUEST_TABLE_VIEW_STORAGE_KEY) ?? '{}');
    expect(stored).toMatchObject({
      version: 3,
      fontSize: 'comfortable',
      tableLabelFormat: 'full',
      settingsLabelFormat: 'short',
      calculationCableSource: 'all',
      cablePickerObjectFields: [...ELECTRICAL_CABLE_PICKER_OBJECT_FIELDS],
      cablePickerCableFields: [...ELECTRICAL_CABLE_PICKER_CABLE_FIELDS],
    });
    expect(readGuestElectricalTableViewSettings()).toEqual(stored);
  });
});
