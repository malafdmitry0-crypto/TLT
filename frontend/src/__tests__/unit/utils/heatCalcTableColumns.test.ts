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
    const pipeDn = HEATCALC_TABLE_COLUMN_CATALOG.pipe.find((column) => column.key === 'pipe_dn');

    expect(pipeDn).toMatchObject({
      labels: { short: 'DN', full: 'DN', compact: 'DN' },
      title: 'DN',
      label: 'DN',
      defaultWidthPct: 5.8,
    });
    expect(pipeDn?.minWidthPx).toBeGreaterThan(0);
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

  it('мигрирует v1 visible keys в layout без потери обязательной колонки', () => {
    const settings = normalizeTableColumnSettings({
      version: 1,
      table: {
        pipe: ['pipe_dn'],
        tank: ['tank_shape'],
      },
    });

    expect(settings.version).toBe(HEATCALC_TABLE_COLUMNS_VERSION);
    expect(settings.types.pipe.visibleOrder).toEqual(['pipe_dn', 'name']);
    expect(settings.types.pipe.columns.pipe_dn).toMatchObject({ widthPct: 5.8 });
    expect(settings.types.pipe.columns.pipe_dn).not.toHaveProperty('visible');
    expect(settings.types.pipe.columns.pipe_dn).not.toHaveProperty('order');
    expect(settings.types.pipe.visibleOrder).toContain('name');
    expect(settings.types.pipe.visibleOrder).not.toContain('pipe_outer_diameter');
  });

  it('нормализует порядок без дублей и перемещает колонку по номеру', () => {
    const settings = getDefaultTableColumnSettings();
    const moved = moveTableColumnToOrder(settings, 'pipe', 'pipe_dn', 3);
    const keys = getAllTableColumnMetas('pipe', moved).map((column) => column.key);

    expect(keys.slice(0, 5)).toEqual([
      'index',
      'name',
      'pipe_dn',
      'pipe_outer_diameter',
      'pipe_length',
    ]);
    expect(moved.types.pipe.visibleOrder.slice(0, 5)).toEqual([
      'index',
      'name',
      'pipe_dn',
      'pipe_outer_diameter',
      'pipe_length',
    ]);
    expect(new Set(moved.types.pipe.visibleOrder).size).toBe(moved.types.pipe.visibleOrder.length);
  });

  it('drag-and-drop reorder использует тот же order, что и числовой порядок', () => {
    const settings = getDefaultTableColumnSettings();
    const moved = reorderTableColumn(settings, 'pipe', 'pipe_dn', 'pipe_outer_diameter');

    expect(moved.types.pipe.visibleOrder.slice(2, 4)).toEqual([
      'pipe_dn',
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

  it('оставляет расчетные детали скрытыми по умолчанию, но доступными в каталоге', () => {
    const settings = getDefaultTableColumnSettings();
    const visiblePipe = getVisibleTableColumnMetas('pipe', settings).map((column) => column.key);
    const allPipe = getAllTableColumnMetas('pipe', settings).map((column) => column.key);
    const visibleTank = getVisibleTableColumnMetas('tank', settings).map((column) => column.key);
    const allTank = getAllTableColumnMetas('tank', settings).map((column) => column.key);

    expect(visiblePipe).not.toContain('delta_t');
    expect(visiblePipe).not.toContain('applied_alpha_vnesh');
    expect(visiblePipe).not.toContain('effective_length');
    expect(visibleTank).not.toContain('surface_area');
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
      'surface_area',
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
      'pipe_dn',
      'pipe_length',
      'tank_shape',
      'tank_dimensions',
      'delta_t',
      'effective_length',
      'surface_area',
    ]));
    expect(visible).toContain('type');
    expect(visible).not.toContain('pipe_dn');
    expect(visible).not.toContain('tank_shape');
    expect(visible).not.toContain('delta_t');
  });

  it('хранит ширину в процентах и умеет сбрасывать её к дефолту', () => {
    const settings = setTableColumnWidthPct(
      getDefaultTableColumnSettings(),
      'pipe',
      'pipe_dn',
      12.5,
    );

    expect(settings.types.pipe.columns.pipe_dn.widthPct).toBe(12.5);
    const reset = resetTableColumnWidth(settings, 'pipe', 'pipe_dn');
    expect(reset.types.pipe.columns.pipe_dn.widthPct).toBe(5.8);
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
      'pipe_dn',
      false,
    );

    expect(hidden.types.pipe.visibleOrder).not.toContain('pipe_dn');
    expect(hidden.types.pipe.columns.pipe_dn).not.toHaveProperty('order');

    const restored = setTableColumnVisibility(hidden, 'pipe', 'pipe_dn', true);

    expect(restored.types.pipe.visibleOrder.at(-1)).toBe('pipe_dn');
    expect(restored.types.pipe.columns.pipe_dn).not.toHaveProperty('visible');
    expect(restored.types.pipe.columns.pipe_dn).not.toHaveProperty('order');
  });
});
