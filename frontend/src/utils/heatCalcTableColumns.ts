import defaultConfig from '@/config/heatcalc-table-columns.default.json';

export type HeatCalcObjectType = 'pipe' | 'tank';
export type HeatCalcColumnKey = string;

export interface HeatCalcColumnMeta {
  key: HeatCalcColumnKey;
  label: string;
  title: string;
  group: string;
  width: number;
  required?: boolean;
  ellipsis?: boolean;
  copyTitle?: string;
}

export interface HeatCalcTableColumnSettings {
  version: number;
  table: Record<HeatCalcObjectType, HeatCalcColumnKey[]>;
}

interface RegisteredTableColumnCache {
  userId: string;
  settings: HeatCalcTableColumnSettings;
  cachedAt: string;
}

export const HEATCALC_TABLE_COLUMNS_VERSION = 1;
export const HEATCALC_TABLE_COLUMN_PREF_KEY = 'heatcalc.tableColumns.v1';
export const HEATCALC_GUEST_TABLE_COLUMN_STORAGE_KEY = 'heatcalc.tableColumns.v1.guest';
export const HEATCALC_REGISTERED_TABLE_COLUMN_CACHE_KEY = 'heatcalc.tableColumns.v1.registered.cache';

export const HEATCALC_TABLE_COLUMN_CATALOG: Record<HeatCalcObjectType, HeatCalcColumnMeta[]> = {
  pipe: [
    { key: 'index', label: 'Номер строки', title: '№', group: 'Основные', width: 42, copyTitle: '№' },
    { key: 'type', label: 'Тип объекта', title: 'Тип', group: 'Основные', width: 70 },
    { key: 'name', label: 'Наименование', title: 'Наименование', group: 'Основные', width: 240, required: true, ellipsis: true },
    { key: 'pipe_outer_diameter', label: 'Наружный диаметр', title: 'Ø, мм', group: 'Геометрия', width: 76 },
    { key: 'pipe_dn', label: 'DN', title: 'DN', group: 'Геометрия', width: 58 },
    { key: 'pipe_length', label: 'Длина трубопровода', title: 'L, м', group: 'Геометрия', width: 74 },
    { key: 'pipe_wall_thickness', label: 'Толщина стенки', title: 'δ ст., мм', group: 'Геометрия', width: 88 },
    { key: 'pipe_material', label: 'Материал трубы', title: 'Материал трубы', group: 'Геометрия', width: 150, ellipsis: true },
    { key: 'pipe_lambda', label: 'λ трубы', title: 'λ тр.', group: 'Геометрия', width: 78 },
    { key: 'pipe_lambda_mode', label: 'Режим λ трубы', title: 'Режим λ', group: 'Геометрия', width: 94 },
    { key: 'placement', label: 'Размещение', title: 'Размещение', group: 'Геометрия', width: 116 },
    { key: 'insulation_layer_count', label: 'Количество слоёв ИЗ', title: 'Слоёв ИЗ', group: 'Теплоизоляция', width: 86 },
    { key: 'insulation_thickness', label: 'Толщина ИЗ', title: 'δ ИЗ, мм', group: 'Теплоизоляция', width: 92 },
    { key: 'insulation_material', label: 'Материал ИЗ', title: 'Материал ИЗ', group: 'Теплоизоляция', width: 160, ellipsis: true },
    { key: 'first_insulation_lambda', label: 'λ 1-го слоя', title: 'λ 1 слоя', group: 'Теплоизоляция', width: 86 },
    { key: 'second_insulation_thickness', label: 'Толщина 2-го слоя', title: 'δ 2 ИЗ, мм', group: 'Теплоизоляция', width: 98 },
    { key: 'second_insulation_material', label: 'Материал 2-го слоя', title: 'Материал 2 ИЗ', group: 'Теплоизоляция', width: 160, ellipsis: true },
    { key: 'second_insulation_lambda', label: 'λ 2-го слоя', title: 'λ 2 слоя', group: 'Теплоизоляция', width: 86 },
    { key: 'third_insulation_thickness', label: 'Толщина 3-го слоя', title: 'δ 3 ИЗ, мм', group: 'Теплоизоляция', width: 98 },
    { key: 'third_insulation_material', label: 'Материал 3-го слоя', title: 'Материал 3 ИЗ', group: 'Теплоизоляция', width: 160, ellipsis: true },
    { key: 'third_insulation_lambda', label: 'λ 3-го слоя', title: 'λ 3 слоя', group: 'Теплоизоляция', width: 86 },
    { key: 'insulation_cover_material', label: 'Материал покрытия', title: 'Покрытие', group: 'Теплоизоляция', width: 132, ellipsis: true },
    { key: 'process_temperature', label: 'Температура поддержания', title: 'T подд.', group: 'Температура и среда', width: 86 },
    { key: 'ambient_temperature', label: 'Температура окружающей среды', title: 'T окр.', group: 'Температура и среда', width: 82 },
    { key: 'ambient_temperature_source', label: 'Источник T окр.', title: 'T окр. ист.', group: 'Температура и среда', width: 94 },
    { key: 'max_ambient_temperature', label: 'Макс. T окружающей среды', title: 'Макс. T окр.', group: 'Температура и среда', width: 98 },
    { key: 'max_process_temperature', label: 'Макс. допуст. T продукта', title: 'Макс. T прод.', group: 'Температура и среда', width: 102 },
    { key: 'wind_speed', label: 'Скорость ветра', title: 'Ветер', group: 'Температура и среда', width: 78 },
    { key: 'wind_speed_source', label: 'Источник ветра', title: 'Ветер ист.', group: 'Температура и среда', width: 92 },
    { key: 'alpha_vnesh', label: 'α внеш', title: 'α внеш', group: 'Температура и среда', width: 82 },
    { key: 'environment', label: 'Среда', title: 'Среда', group: 'Температура и среда', width: 112 },
    { key: 'zone_classification', label: 'Классификация зоны', title: 'Зона', group: 'Температура и среда', width: 112 },
    { key: 'temperature_group', label: 'Температурная группа', title: 'Темп. группа', group: 'Температура и среда', width: 100 },
    { key: 'climate_city', label: 'Климатический город', title: 'Климат', group: 'Температура и среда', width: 160, ellipsis: true },
    { key: 'climate_region', label: 'Климатический регион', title: 'Регион', group: 'Температура и среда', width: 150, ellipsis: true },
    { key: 'climate_key', label: 'Ключ климата', title: 'Ключ клим.', group: 'Температура и среда', width: 110, ellipsis: true },
    { key: 'climate_temperature_basis', label: 'Обеспеченность климата', title: 'Обесп.', group: 'Температура и среда', width: 82 },
    { key: 'burial_depth', label: 'Глубина заложения', title: 'Глубина, м', group: 'Грунт', width: 92 },
    { key: 'ground_type', label: 'Тип грунта', title: 'Грунт', group: 'Грунт', width: 132, ellipsis: true },
    { key: 'ground_conductivity', label: 'λ грунта', title: 'λ гр.', group: 'Грунт', width: 78 },
    { key: 'min_switch_temperature', label: 'Мин. T включения', title: 'Мин. T вкл.', group: 'Электропараметры', width: 92 },
    { key: 'supply_voltage', label: 'Рабочее напряжение', title: 'U, В', group: 'Электропараметры', width: 72 },
    { key: 'safety_factor', label: 'Коэффициент запаса', title: 'Кзап', group: 'Электропараметры', width: 72 },
    { key: 'steam_tracing', label: 'Пропарка', title: 'Пропарка', group: 'Электропараметры', width: 86 },
    { key: 'valve_count', label: 'Задвижки', title: 'Зад.', group: 'Локальные элементы', width: 64 },
    { key: 'flange_count', label: 'Фланцы', title: 'Флн.', group: 'Локальные элементы', width: 64 },
    { key: 'support_count', label: 'Опоры', title: 'Опр.', group: 'Локальные элементы', width: 64 },
    { key: 'local_element_equiv_length', label: 'Эквивалентная длина локальных элементов', title: 'L экв.', group: 'Локальные элементы', width: 82 },
  ],
  tank: [
    { key: 'index', label: 'Номер строки', title: '№', group: 'Основные', width: 42, copyTitle: '№' },
    { key: 'type', label: 'Тип объекта', title: 'Тип', group: 'Основные', width: 70 },
    { key: 'name', label: 'Наименование', title: 'Наименование', group: 'Основные', width: 240, required: true, ellipsis: true },
    { key: 'tank_shape', label: 'Форма резервуара', title: 'Форма', group: 'Форма и геометрия', width: 92 },
    { key: 'tank_dimensions', label: 'Габариты', title: 'Габариты', group: 'Форма и геометрия', width: 190, ellipsis: true },
    { key: 'tank_diameter', label: 'Диаметр', title: 'Ø, мм', group: 'Форма и геометрия', width: 76 },
    { key: 'tank_height', label: 'Высота', title: 'H, мм', group: 'Форма и геометрия', width: 76 },
    { key: 'tank_length', label: 'Длина', title: 'L, мм', group: 'Форма и геометрия', width: 76 },
    { key: 'tank_width', label: 'Ширина', title: 'B, мм', group: 'Форма и геометрия', width: 76 },
    { key: 'tank_wall_thickness', label: 'Толщина стенки', title: 'δ ст., мм', group: 'Форма и геометрия', width: 88 },
    { key: 'tank_wall_lambda', label: 'λ стенки', title: 'λ ст.', group: 'Форма и геометрия', width: 78 },
    { key: 'placement', label: 'Размещение', title: 'Размещение', group: 'Форма и геометрия', width: 116 },
    { key: 'insulation_layer_count', label: 'Количество слоёв ИЗ', title: 'Слоёв ИЗ', group: 'Теплоизоляция', width: 86 },
    { key: 'insulation_thickness', label: 'Толщина ИЗ', title: 'δ ИЗ, мм', group: 'Теплоизоляция', width: 92 },
    { key: 'insulation_material', label: 'Материал ИЗ', title: 'Материал ИЗ', group: 'Теплоизоляция', width: 160, ellipsis: true },
    { key: 'first_insulation_lambda', label: 'λ 1-го слоя', title: 'λ 1 слоя', group: 'Теплоизоляция', width: 86 },
    { key: 'second_insulation_thickness', label: 'Толщина 2-го слоя', title: 'δ 2 ИЗ, мм', group: 'Теплоизоляция', width: 98 },
    { key: 'second_insulation_material', label: 'Материал 2-го слоя', title: 'Материал 2 ИЗ', group: 'Теплоизоляция', width: 160, ellipsis: true },
    { key: 'second_insulation_lambda', label: 'λ 2-го слоя', title: 'λ 2 слоя', group: 'Теплоизоляция', width: 86 },
    { key: 'third_insulation_thickness', label: 'Толщина 3-го слоя', title: 'δ 3 ИЗ, мм', group: 'Теплоизоляция', width: 98 },
    { key: 'third_insulation_material', label: 'Материал 3-го слоя', title: 'Материал 3 ИЗ', group: 'Теплоизоляция', width: 160, ellipsis: true },
    { key: 'third_insulation_lambda', label: 'λ 3-го слоя', title: 'λ 3 слоя', group: 'Теплоизоляция', width: 86 },
    { key: 'insulation_cover_material', label: 'Материал покрытия', title: 'Покрытие', group: 'Теплоизоляция', width: 132, ellipsis: true },
    { key: 'process_temperature', label: 'Температура поддержания', title: 'T подд.', group: 'Температура и среда', width: 86 },
    { key: 'ambient_temperature', label: 'Температура окружающей среды', title: 'T окр.', group: 'Температура и среда', width: 82 },
    { key: 'ambient_temperature_source', label: 'Источник T окр.', title: 'T окр. ист.', group: 'Температура и среда', width: 94 },
    { key: 'max_ambient_temperature', label: 'Макс. T окружающей среды', title: 'Макс. T окр.', group: 'Температура и среда', width: 98 },
    { key: 'max_process_temperature', label: 'Макс. допуст. T продукта', title: 'Макс. T прод.', group: 'Температура и среда', width: 102 },
    { key: 'wind_speed', label: 'Скорость ветра', title: 'Ветер', group: 'Температура и среда', width: 78 },
    { key: 'wind_speed_source', label: 'Источник ветра', title: 'Ветер ист.', group: 'Температура и среда', width: 92 },
    { key: 'alpha_vnesh', label: 'α внеш', title: 'α внеш', group: 'Температура и среда', width: 82 },
    { key: 'environment', label: 'Среда', title: 'Среда', group: 'Температура и среда', width: 112 },
    { key: 'zone_classification', label: 'Классификация зоны', title: 'Зона', group: 'Температура и среда', width: 112 },
    { key: 'temperature_group', label: 'Температурная группа', title: 'Темп. группа', group: 'Температура и среда', width: 100 },
    { key: 'climate_city', label: 'Климатический город', title: 'Климат', group: 'Температура и среда', width: 160, ellipsis: true },
    { key: 'climate_region', label: 'Климатический регион', title: 'Регион', group: 'Температура и среда', width: 150, ellipsis: true },
    { key: 'climate_key', label: 'Ключ климата', title: 'Ключ клим.', group: 'Температура и среда', width: 110, ellipsis: true },
    { key: 'climate_temperature_basis', label: 'Обеспеченность климата', title: 'Обесп.', group: 'Температура и среда', width: 82 },
    { key: 'burial_depth', label: 'Глубина заложения', title: 'Глубина, м', group: 'Грунт', width: 92 },
    { key: 'ground_type', label: 'Тип грунта', title: 'Грунт', group: 'Грунт', width: 132, ellipsis: true },
    { key: 'ground_conductivity', label: 'λ грунта', title: 'λ гр.', group: 'Грунт', width: 78 },
    { key: 'min_switch_temperature', label: 'Мин. T включения', title: 'Мин. T вкл.', group: 'Электропараметры', width: 92 },
    { key: 'supply_voltage', label: 'Рабочее напряжение', title: 'U, В', group: 'Электропараметры', width: 72 },
    { key: 'safety_factor', label: 'Коэффициент запаса', title: 'Кзап', group: 'Электропараметры', width: 72 },
    { key: 'q_additional', label: 'Q доп.', title: 'Q доп., Вт', group: 'Электропараметры', width: 94 },
    { key: 'steam_tracing', label: 'Пропарка', title: 'Пропарка', group: 'Электропараметры', width: 86 },
  ],
};

const EMPTY_SETTINGS: HeatCalcTableColumnSettings = {
  version: HEATCALC_TABLE_COLUMNS_VERSION,
  table: {
    pipe: [],
    tank: [],
  },
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function unique(values: HeatCalcColumnKey[]) {
  return [...new Set(values)];
}

export function getAvailableTableColumnKeys(type: HeatCalcObjectType) {
  return HEATCALC_TABLE_COLUMN_CATALOG[type].map((column) => column.key);
}

export function getDefaultTableColumnSettings(): HeatCalcTableColumnSettings {
  return normalizeTableColumnSettings(defaultConfig);
}

export function getDefaultVisibleTableColumnKeys(type: HeatCalcObjectType) {
  return getDefaultTableColumnSettings().table[type];
}

export function normalizeVisibleTableColumnKeys(
  type: HeatCalcObjectType,
  keys: unknown,
): HeatCalcColumnKey[] {
  const available = getAvailableTableColumnKeys(type);
  const availableSet = new Set(available);
  const requested = Array.isArray(keys)
    ? unique(keys.filter((key): key is string => typeof key === 'string' && availableSet.has(key)))
    : [];
  const fallback = Array.isArray(defaultConfig.table[type])
    ? defaultConfig.table[type].filter((key) => availableSet.has(key))
    : [];
  const visibleSet = new Set(requested.length > 0 ? requested : fallback);
  for (const column of HEATCALC_TABLE_COLUMN_CATALOG[type]) {
    if (column.required) visibleSet.add(column.key);
  }
  return available.filter((key) => visibleSet.has(key));
}

export function normalizeTableColumnSettings(value: unknown): HeatCalcTableColumnSettings {
  const source = isRecord(value) ? value : {};
  const rawTable = isRecord(source.table) ? source.table : source;
  return {
    version: HEATCALC_TABLE_COLUMNS_VERSION,
    table: {
      pipe: normalizeVisibleTableColumnKeys('pipe', rawTable.pipe),
      tank: normalizeVisibleTableColumnKeys('tank', rawTable.tank),
    },
  };
}

export function getTableColumnMeta(type: HeatCalcObjectType, key: HeatCalcColumnKey) {
  return HEATCALC_TABLE_COLUMN_CATALOG[type].find((column) => column.key === key) ?? null;
}

export function getVisibleTableColumnMetas(
  type: HeatCalcObjectType,
  settings: HeatCalcTableColumnSettings,
) {
  const visible = new Set(normalizeVisibleTableColumnKeys(type, settings.table[type]));
  return HEATCALC_TABLE_COLUMN_CATALOG[type].filter((column) => visible.has(column.key));
}

function readStorageJson(key: string): unknown {
  if (typeof localStorage === 'undefined') return null;
  const raw = localStorage.getItem(key);
  if (!raw) return null;
  try {
    return JSON.parse(raw) as unknown;
  } catch {
    return null;
  }
}

export function readGuestTableColumnSettings() {
  const stored = readStorageJson(HEATCALC_GUEST_TABLE_COLUMN_STORAGE_KEY);
  return stored ? normalizeTableColumnSettings(stored) : getDefaultTableColumnSettings();
}

export function writeGuestTableColumnSettings(settings: HeatCalcTableColumnSettings) {
  if (typeof localStorage === 'undefined') return;
  localStorage.setItem(
    HEATCALC_GUEST_TABLE_COLUMN_STORAGE_KEY,
    JSON.stringify(normalizeTableColumnSettings(settings)),
  );
}

export function readRegisteredTableColumnCache(userId?: string | null) {
  if (!userId) return null;
  const stored = readStorageJson(HEATCALC_REGISTERED_TABLE_COLUMN_CACHE_KEY);
  if (!isRecord(stored) || stored.userId !== userId) return null;
  return normalizeTableColumnSettings(stored.settings);
}

export function writeRegisteredTableColumnCache(
  userId: string,
  settings: HeatCalcTableColumnSettings,
) {
  if (typeof localStorage === 'undefined') return;
  const payload: RegisteredTableColumnCache = {
    userId,
    settings: normalizeTableColumnSettings(settings),
    cachedAt: new Date().toISOString(),
  };
  localStorage.setItem(HEATCALC_REGISTERED_TABLE_COLUMN_CACHE_KEY, JSON.stringify(payload));
}

export function clearRegisteredTableColumnCache(userId?: string | null) {
  if (typeof localStorage === 'undefined') return;
  if (!userId) {
    localStorage.removeItem(HEATCALC_REGISTERED_TABLE_COLUMN_CACHE_KEY);
    return;
  }
  const stored = readStorageJson(HEATCALC_REGISTERED_TABLE_COLUMN_CACHE_KEY);
  if (!isRecord(stored) || stored.userId === userId) {
    localStorage.removeItem(HEATCALC_REGISTERED_TABLE_COLUMN_CACHE_KEY);
  }
}

export function createTableColumnSettingsPatch(
  settings: HeatCalcTableColumnSettings,
  type: HeatCalcObjectType,
  keys: HeatCalcColumnKey[],
) {
  return normalizeTableColumnSettings({
    ...EMPTY_SETTINGS,
    table: {
      ...settings.table,
      [type]: normalizeVisibleTableColumnKeys(type, keys),
    },
  });
}
