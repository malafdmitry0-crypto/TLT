// @vitest-environment node
import { describe, expect, it } from 'vitest';
import {
  HEATCALC_ALL_OBJECT_COLUMN_KEYS,
  HEATCALC_TABLE_COLUMNS_VERSION,
  HEATCALC_TABLE_COLUMN_CATALOG,
  getAllTableColumnMetas,
  getDefaultTableColumnSettings,
  getVisibleTableColumnMetas,
  moveTableColumnToOrder,
  normalizeTableColumnSettings,
  reorderTableColumn,
  resetTableColumnWidth,
  setTableColumnVisibility,
  setTableColumnWidthPct,
} from '@/utils/heatCalcTableColumns';

describe('heatCalcTableColumns', () => {
  it('берёт названия и дефолтные размеры колонок из JSON registry', () => {
    const outerDiameter = HEATCALC_TABLE_COLUMN_CATALOG.pipe
      .find((column) => column.key === 'pipe_outer_diameter');
    const pipeMaximum = HEATCALC_TABLE_COLUMN_CATALOG.pipe
      .find((column) => column.key === 'max_ambient_temperature');
    const tankMaximum = HEATCALC_TABLE_COLUMN_CATALOG.tank
      .find((column) => column.key === 'max_ambient_temperature');

    expect(outerDiameter).toMatchObject({
      labels: { short: 'Ø, мм', full: 'Наружный диаметр', compact: 'Ø' },
      title: 'Ø, мм',
      label: 'Наружный диаметр',
      defaultWidthPct: 7.6,
    });
    expect(outerDiameter?.minWidthPx).toBeGreaterThan(0);
    expect(HEATCALC_TABLE_COLUMN_CATALOG.pipe.map((column) => column.key))
      .not.toContain('pipe_dn');
    expect(HEATCALC_TABLE_COLUMNS_VERSION).toBe(9);
    for (const maximum of [pipeMaximum, tankMaximum]) {
      expect(maximum).toMatchObject({
        labels: {
          short: 'T окр. max',
          full: 'Максимальная температура окружающей среды',
          compact: 'T окр. max',
        },
        unit: '°C',
        valueType: 'number',
        defaultVisible: true,
        sortable: false,
        filterable: false,
        defaultWidthPct: 8.2,
      });
    }
    expect(HEATCALC_TABLE_COLUMN_CATALOG.all
      .filter((column) => column.key === 'max_ambient_temperature')).toHaveLength(1);
  });

  it('показывает maximum по умолчанию сразу после minimum', () => {
    const settings = getDefaultTableColumnSettings();

    for (const type of ['pipe', 'tank', 'all'] as const) {
      const visible = settings.types[type].visibleOrder;
      expect(visible.indexOf('max_ambient_temperature'))
        .toBe(visible.indexOf('ambient_temperature') + 1);
    }
  });

  it('подставляет выбранный формат названия без изменения настроек колонок', () => {
    const settings = getDefaultTableColumnSettings();
    const defaultOuterDiameter = getVisibleTableColumnMetas('pipe', settings)
      .find((column) => column.key === 'pipe_outer_diameter');
    const compactOuterDiameter = getVisibleTableColumnMetas('pipe', settings, 'compact')
      .find((column) => column.key === 'pipe_outer_diameter');
    const fullOuterDiameter = getVisibleTableColumnMetas('pipe', settings, 'full')
      .find((column) => column.key === 'pipe_outer_diameter');

    expect(defaultOuterDiameter).toMatchObject({
      label: 'Наружный диаметр',
      title: 'Ø, мм',
    });
    expect(compactOuterDiameter).toMatchObject({
      label: 'Наружный диаметр',
      title: 'Ø',
    });
    expect(fullOuterDiameter).toMatchObject({
      label: 'Наружный диаметр',
      title: 'Наружный диаметр',
    });
    expect(settings.types.pipe.visibleOrder).toContain('pipe_outer_diameter');
  });

  it('сбрасывает настройки старой версии к текущему формату без миграции', () => {
    const settings = normalizeTableColumnSettings({
      version: 1,
      table: {
        pipe: ['pipe_outer_diameter'],
        tank: ['tank_shape'],
      },
    });

    expect(settings).toEqual(getDefaultTableColumnSettings());
  });

  it('не возвращает размещение трубопровода после ручного скрытия в новой версии', () => {
    const columns = getDefaultTableColumnSettings().types.pipe.columns;
    const settings = normalizeTableColumnSettings({
      version: HEATCALC_TABLE_COLUMNS_VERSION,
      types: {
        pipe: {
          visibleOrder: ['index', 'name', 'pipe_outer_diameter'],
          columns,
        },
      },
    });

    expect(settings.types.pipe.visibleOrder).not.toContain('placement');
  });

  it('добавляет только новую default-visible колонку, сохраняя order и widths', () => {
    const defaultColumns = getDefaultTableColumnSettings().types.pipe.columns;
    const legacyColumns = { ...defaultColumns };
    delete legacyColumns.max_ambient_temperature;
    legacyColumns.pipe_length = { widthPct: 12.5 };
    legacyColumns.ambient_temperature = { widthPct: 17.5 };
    const previousVisibleOrder = ['pipe_length', 'name', 'ambient_temperature'];

    const settings = normalizeTableColumnSettings({
      version: HEATCALC_TABLE_COLUMNS_VERSION,
      types: {
        pipe: { visibleOrder: previousVisibleOrder, columns: legacyColumns },
      },
    });

    expect(settings.types.pipe.visibleOrder).toEqual([
      ...previousVisibleOrder,
      'max_ambient_temperature',
    ]);
    expect(settings.types.pipe.columns.pipe_length.widthPct).toBe(12.5);
    expect(settings.types.pipe.columns.ambient_temperature.widthPct).toBe(17.5);
    expect(settings.types.pipe.columns.max_ambient_temperature.widthPct).toBe(8.2);
  });

  it('сохраняет явно скрытый maximum и его width при повторной нормализации', () => {
    const columns = {
      ...getDefaultTableColumnSettings().types.pipe.columns,
      max_ambient_temperature: { widthPct: 13.5 },
    };
    const hidden = normalizeTableColumnSettings({
      version: HEATCALC_TABLE_COLUMNS_VERSION,
      types: {
        pipe: {
          visibleOrder: ['name', 'ambient_temperature'],
          columns,
        },
      },
    });
    const reloaded = normalizeTableColumnSettings(hidden);

    expect(hidden.types.pipe.visibleOrder).not.toContain('max_ambient_temperature');
    expect(hidden.types.pipe.columns.max_ambient_temperature.widthPct).toBe(13.5);
    expect(reloaded.types.pipe.visibleOrder).not.toContain('max_ambient_temperature');
    expect(reloaded.types.pipe.columns.max_ambient_temperature.widthPct).toBe(13.5);
  });

  it('нормализует порядок без дублей и перемещает колонку по номеру', () => {
    const settings = getDefaultTableColumnSettings();
    const moved = moveTableColumnToOrder(settings, 'pipe', 'pipe_length', 3);
    const keys = getAllTableColumnMetas('pipe', moved).map((column) => column.key);

    expect(keys.slice(0, 7)).toEqual([
      'index',
      'heat_loss_status',
      'pipe_length',
      'heat_loss_per_meter_base',
      'total_heat_loss_design',
      'name',
      'placement',
    ]);
    expect(moved.types.pipe.visibleOrder.slice(0, 7)).toEqual([
      'index',
      'heat_loss_status',
      'pipe_length',
      'heat_loss_per_meter_base',
      'total_heat_loss_design',
      'name',
      'placement',
    ]);
    expect(new Set(moved.types.pipe.visibleOrder).size).toBe(moved.types.pipe.visibleOrder.length);
  });

  it('drag-and-drop reorder использует тот же order, что и числовой порядок', () => {
    const settings = getDefaultTableColumnSettings();
    const moved = reorderTableColumn(settings, 'pipe', 'pipe_length', 'pipe_outer_diameter');

    expect(moved.types.pipe.visibleOrder.slice(4, 8)).toEqual([
      'name',
      'placement',
      'pipe_length',
      'pipe_outer_diameter',
    ]);
  });

  it('не показывает колонку типа по умолчанию, но оставляет её доступной', () => {
    const settings = getDefaultTableColumnSettings();
    const visible = getVisibleTableColumnMetas('pipe', settings).map((column) => column.key);
    const all = getAllTableColumnMetas('pipe', settings).map((column) => column.key);

    expect(visible).not.toContain('type');
    expect(all).toContain('type');
  });

  it('добавляет T проп. как скрытую настраиваемую колонку объекта', () => {
    const settings = getDefaultTableColumnSettings();
    const visiblePipe = getVisibleTableColumnMetas('pipe', settings).map((column) => column.key);
    const allPipe = getAllTableColumnMetas('pipe', settings).map((column) => column.key);
    const visibleTank = getVisibleTableColumnMetas('tank', settings).map((column) => column.key);
    const allTank = getAllTableColumnMetas('tank', settings).map((column) => column.key);

    expect(visiblePipe).not.toContain('vapor_temperature');
    expect(visibleTank).not.toContain('vapor_temperature');
    expect(allPipe).toContain('vapor_temperature');
    expect(allTank).toContain('vapor_temperature');
  });

  it('не отдаёт служебные колонки в таблицу и настройки даже из сохранённых пользовательских настроек', () => {
    const settings = normalizeTableColumnSettings({
      version: HEATCALC_TABLE_COLUMNS_VERSION,
      types: {
        pipe: {
          visibleOrder: ['index', 'name', 'pipe_dn', 'ground_type', 'climate_key'],
          columns: { pipe_dn: { widthPct: 12 }, ground_type: { widthPct: 24 }, climate_key: { widthPct: 24 } },
        },
        tank: {
          visibleOrder: ['index', 'name', 'ground_type', 'climate_key'],
          columns: { ground_type: { widthPct: 24 }, climate_key: { widthPct: 24 } },
        },
        all: {
          visibleOrder: ['index', 'type', 'name', 'pipe_dn', 'ground_type', 'climate_key'],
          columns: { pipe_dn: { widthPct: 12 }, ground_type: { widthPct: 24 }, climate_key: { widthPct: 24 } },
        },
      },
    });

    const hiddenServiceColumns = ['pipe_dn', 'ground_type', 'climate_key'];
    for (const type of ['pipe', 'tank', 'all'] as const) {
      const visibleKeys = getVisibleTableColumnMetas(type, settings).map((column) => column.key);
      const allKeys = getAllTableColumnMetas(type, settings).map((column) => column.key);
      for (const columnKey of hiddenServiceColumns) {
        expect(settings.types[type].visibleOrder).not.toContain(columnKey);
        expect(settings.types[type].columns).not.toHaveProperty(columnKey);
        expect(visibleKeys).not.toContain(columnKey);
        expect(allKeys).not.toContain(columnKey);
      }
    }
  });

  it('показывает теплопотери как результатные колонки по умолчанию', () => {
    const settings = getDefaultTableColumnSettings();
    const visiblePipe = getVisibleTableColumnMetas('pipe', settings).map((column) => column.key);
    const visibleTank = getVisibleTableColumnMetas('tank', settings).map((column) => column.key);
    const visibleAll = getVisibleTableColumnMetas('all', settings).map((column) => column.key);

    expect(visiblePipe).toEqual(expect.arrayContaining([
      'heat_loss_per_meter_base',
      'total_heat_loss_design',
    ]));
    expect(visibleTank).toEqual(expect.arrayContaining([
      'heat_loss_per_m2_bare_base',
      'total_heat_loss_design',
    ]));
    expect(visibleAll).toContain('total_heat_loss_design');
  });

  it('показывает размещение трубопровода в дефолтной таблице', () => {
    const settings = getDefaultTableColumnSettings();
    const visiblePipe = getVisibleTableColumnMetas('pipe', settings).map((column) => column.key);

    expect(visiblePipe).toContain('placement');
  });

  it('показывает Lэкв рядом с локальными элементами в дефолтной таблице труб', () => {
    const settings = getDefaultTableColumnSettings();
    const visiblePipe = getVisibleTableColumnMetas('pipe', settings).map((column) => column.key);

    expect(visiblePipe.slice(visiblePipe.indexOf('num_local_elements'), visiblePipe.indexOf('local_element_equiv_length') + 1))
      .toEqual(['num_local_elements', 'local_element_equiv_length']);
  });

  it('оставляет расчетные детали скрытыми по умолчанию, но доступными в каталоге', () => {
    const settings = getDefaultTableColumnSettings();
    const visiblePipe = getVisibleTableColumnMetas('pipe', settings).map((column) => column.key);
    const allPipe = getAllTableColumnMetas('pipe', settings).map((column) => column.key);
    const visibleTank = getVisibleTableColumnMetas('tank', settings).map((column) => column.key);
    const allTank = getAllTableColumnMetas('tank', settings).map((column) => column.key);

    expect(visiblePipe).not.toContain('delta_t');
    expect(visiblePipe).not.toContain('applied_alpha_vnesh');
    expect(visiblePipe).not.toContain('effective_length');
    expect(visibleTank).not.toContain('surface_area_bare');
    expect(visibleTank).not.toContain('ground_resistance');
    expect(allPipe).toEqual(expect.arrayContaining([
      'delta_t',
      'applied_alpha_vnesh',
      'applied_safety_factor',
      'thermal_resistance',
      'effective_length',
    ]));
    expect(allTank).toEqual(expect.arrayContaining([
      'delta_t',
      'applied_alpha_vnesh',
      'applied_safety_factor',
      'surface_area_bare',
      'ground_resistance',
    ]));
  });

  it('создаёт отдельный общий набор колонок для режима «Все»', () => {
    const settings = getDefaultTableColumnSettings();
    const visible = getVisibleTableColumnMetas('all', settings).map((column) => column.key);
    const all = getAllTableColumnMetas('all', settings).map((column) => column.key);

    expect(visible).toEqual(HEATCALC_ALL_OBJECT_COLUMN_KEYS);
    expect(all.slice(0, HEATCALC_ALL_OBJECT_COLUMN_KEYS.length)).toEqual(HEATCALC_ALL_OBJECT_COLUMN_KEYS);
    expect(new Set(all).size).toBe(all.length);
    expect(all).toEqual(expect.arrayContaining([
      'pipe_length',
      'tank_shape',
      'tank_dimensions',
      'delta_t',
      'effective_length',
      'surface_area_bare',
    ]));
    expect(visible).toContain('type');
    expect(all).not.toContain('pipe_dn');
    expect(visible).not.toContain('tank_shape');
    expect(visible).not.toContain('delta_t');
  });

  it('хранит ширину в процентах и умеет сбрасывать её к дефолту', () => {
    const settings = setTableColumnWidthPct(
      getDefaultTableColumnSettings(),
      'pipe',
      'pipe_length',
      12.5,
    );

    expect(settings.types.pipe.columns.pipe_length.widthPct).toBe(12.5);
    const reset = resetTableColumnWidth(settings, 'pipe', 'pipe_length');
    expect(reset.types.pipe.columns.pipe_length.widthPct).toBe(7.4);
  });

  it('не позволяет скрыть обязательное наименование', () => {
    const settings = setTableColumnVisibility(
      getDefaultTableColumnSettings(),
      'pipe',
      'name',
      false,
    );

    expect(settings.types.pipe.visibleOrder).toContain('name');
    expect(getVisibleTableColumnMetas('pipe', settings).map((column) => column.key))
      .toContain('name');
  });

  it('удаляет скрытую колонку из visibleOrder и возвращает включенную в конец', () => {
    const hidden = setTableColumnVisibility(
      getDefaultTableColumnSettings(),
      'pipe',
      'pipe_length',
      false,
    );

    expect(hidden.types.pipe.visibleOrder).not.toContain('pipe_length');
    expect(hidden.types.pipe.columns.pipe_length).not.toHaveProperty('order');

    const restored = setTableColumnVisibility(hidden, 'pipe', 'pipe_length', true);

    expect(restored.types.pipe.visibleOrder.at(-1)).toBe('pipe_length');
    expect(restored.types.pipe.columns.pipe_length).not.toHaveProperty('visible');
    expect(restored.types.pipe.columns.pipe_length).not.toHaveProperty('order');
  });
});
