import { beforeEach, describe, expect, it } from 'vitest';

import {
  ELECTRICAL_GUEST_TABLE_COLUMN_STORAGE_KEY,
  createElectricalTableColumnSettingsPatch,
  getDefaultElectricalTableColumnSettings,
  getVisibleElectricalTableColumnMetas,
  normalizeElectricalTableColumnSettings,
  readGuestElectricalTableColumnSettings,
  setElectricalTableColumnVisibility,
  writeGuestElectricalTableColumnSettings,
} from '@/utils/electricalTableColumns';

describe('electricalTableColumns', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it('по умолчанию содержит колонки текущей таблицы электрорасчёта', () => {
    const visibleKeys = getVisibleElectricalTableColumnMetas(
      getDefaultElectricalTableColumnSettings(),
    ).map((column) => column.key);

    expect(visibleKeys).toEqual([
      'index',
      'object_name',
      'electrical_status',
      'cable_mark',
      'selection_policy',
      'applied_selection_policy',
      'winding_pitch_mm',
      'number_of_threads',
      'installed_cable_length',
      'order_cable_length',
      'total_power',
      'current',
    ]);
  });

  it('применяет формат названий колонок', () => {
    const settings = getDefaultElectricalTableColumnSettings();

    const shortTitle = getVisibleElectricalTableColumnMetas(settings, 'short')
      .find((column) => column.key === 'current')?.title;
    const fullTitle = getVisibleElectricalTableColumnMetas(settings, 'full')
      .find((column) => column.key === 'current')?.title;

    expect(shortTitle).toBe('Ток, А');
    expect(fullTitle).toBe('Расчётный ток, А');
  });

  it('нормализует неизвестные ключи и сохраняет обязательные колонки', () => {
    const settings = normalizeElectricalTableColumnSettings({
      version: 1,
      visibleOrder: ['current', 'unknown'],
      columns: {
        current: { widthPct: 80 },
      },
    });

    expect(settings.visibleOrder).toEqual(['current', 'index', 'object_name']);
    expect(settings.columns.current.widthPct).toBe(60);
  });

  it('хранит гостевые настройки в localStorage', () => {
    const settings = setElectricalTableColumnVisibility(
      getDefaultElectricalTableColumnSettings(),
      'current',
      false,
    );

    writeGuestElectricalTableColumnSettings(settings);

    expect(localStorage.getItem(ELECTRICAL_GUEST_TABLE_COLUMN_STORAGE_KEY)).toContain(
      'electrical_status',
    );
    expect(readGuestElectricalTableColumnSettings().visibleOrder).not.toContain('current');
  });

  it('умеет включить все колонки одним патчем', () => {
    const settings = createElectricalTableColumnSettingsPatch(
      getDefaultElectricalTableColumnSettings(),
      ['index', 'object_name', 'current', 'voltage'],
    );

    expect(settings.visibleOrder).toEqual(['index', 'object_name', 'current', 'voltage']);
  });
});
