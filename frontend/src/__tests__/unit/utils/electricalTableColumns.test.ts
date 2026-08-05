import { beforeEach, describe, expect, it } from 'vitest';

import {
  ELECTRICAL_GUEST_TABLE_COLUMN_STORAGE_KEY,
  createElectricalTableColumnSettingsPatch,
  getAvailableElectricalTableColumnKeys,
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
      'power_per_meter',
      'applied_selection_policy',
      'winding_pitch_mm',
      'number_of_threads',
      'required_installed_length_m',
      'installed_cable_length',
      'section_l_tok_m',
      'section_l_excess_m',
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

  it('скрывает запрошенный критерий подбора из интерфейса, но оставляет применённый', () => {
    const availableKeys = getAvailableElectricalTableColumnKeys();

    expect(availableKeys).not.toContain('selection_policy');
    expect(availableKeys).toContain('applied_selection_policy');
  });

  it('не отдаёт служебный номер СО как пользовательскую колонку', () => {
    expect(getAvailableElectricalTableColumnKeys()).not.toContain('variant_number');
  });

  it('не регистрирует legacy T2/T3/R как колонки Case 1 электрорасчёта', () => {
    const availableKeys = getAvailableElectricalTableColumnKeys();

    expect(availableKeys).not.toContain('vapor_temperature');
    expect(availableKeys).not.toContain('maintain_temperature');
    expect(availableKeys).not.toContain('aggressive_product');
  });

  it('даёт включить удельную и установленную мощность кабеля', () => {
    const availableKeys = getAvailableElectricalTableColumnKeys();

    expect(availableKeys).toContain('power_per_meter');
    expect(availableKeys).toContain('installed_power_per_meter');
  });

  it('shows core L* provenance columns by default (E7.4) and keeps advanced engineering opt-in', () => {
    const availableKeys = getAvailableElectricalTableColumnKeys();
    const defaultVisible = getDefaultElectricalTableColumnSettings().visibleOrder;
    // FE-26 core set: Lтреб / Lфакт / Lток / Lдоп / Lзаказ
    expect(defaultVisible).toContain('required_installed_length_m');
    expect(defaultVisible).toContain('installed_cable_length');
    expect(defaultVisible).toContain('section_l_tok_m');
    expect(defaultVisible).toContain('section_l_excess_m');
    expect(defaultVisible).toContain('order_cable_length');

    const advancedOptIn = ['section_l_max_m', 'section_l_ogr_m', 'provenance'];
    advancedOptIn.forEach((key) => {
      expect(availableKeys).toContain(key);
      expect(defaultVisible).not.toContain(key);
    });
    expect(setElectricalTableColumnVisibility(getDefaultElectricalTableColumnSettings(), 'section_l_ogr_m', true).visibleOrder)
      .toContain('section_l_ogr_m');
  });

  it('нормализует неизвестные ключи и сохраняет обязательные колонки', () => {
    const settings = normalizeElectricalTableColumnSettings({
      version: 1,
      visibleOrder: ['current', 'unknown'],
      columns: {
        current: { widthPct: 80 },
      },
    });

    expect(settings.visibleOrder).toEqual(['current', 'index', 'object_name', 'cable_mark']);
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
    expect(readGuestElectricalTableColumnSettings().visibleOrder).toContain('cable_mark');
  });

  it('умеет включить все колонки одним патчем', () => {
    const settings = createElectricalTableColumnSettingsPatch(
      getDefaultElectricalTableColumnSettings(),
      ['index', 'object_name', 'current', 'voltage'],
    );

    expect(settings.visibleOrder).toEqual([
      'index',
      'object_name',
      'current',
      'voltage',
      'cable_mark',
    ]);
  });

  it('не позволяет скрыть обязательную марку кабеля', () => {
    const settings = setElectricalTableColumnVisibility(
      getDefaultElectricalTableColumnSettings(),
      'cable_mark',
      false,
    );

    expect(settings.visibleOrder).toContain('cable_mark');
    expect(
      getVisibleElectricalTableColumnMetas(settings).find((column) => column.key === 'cable_mark')
        ?.required,
    ).toBe(true);
  });
});
