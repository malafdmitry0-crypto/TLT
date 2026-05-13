import defaultConfig from '@/config/heatcalc-table-columns.default.json';

export type HeatCalcObjectType = 'pipe' | 'tank';
export type HeatCalcTableColumnScope = HeatCalcObjectType | 'all';
export type HeatCalcColumnKey = string;

export interface HeatCalcColumnLabels {
  short: string;
  full: string;
}

export interface HeatCalcColumnMeta {
  key: HeatCalcColumnKey;
  labels: HeatCalcColumnLabels;
  label: string;
  title: string;
  group: string;
  width: number;
  defaultWidthPct: number;
  minWidthPx: number;
  required?: boolean;
  ellipsis?: boolean;
  copyTitle?: string;
  unit?: string;
  helpText?: string;
  valueType?: string;
  defaultVisible?: boolean;
  sortable?: boolean;
  filterable?: boolean;
  resizable?: boolean;
}

export interface HeatCalcColumnLayout {
  widthPct: number;
}

export interface HeatCalcTableColumnTypeSettings {
  visibleOrder: HeatCalcColumnKey[];
  columns: Record<HeatCalcColumnKey, HeatCalcColumnLayout>;
}

export interface HeatCalcTableColumnSettings {
  version: number;
  types: Record<HeatCalcTableColumnScope, HeatCalcTableColumnTypeSettings>;
}

export interface HeatCalcResolvedColumnMeta extends HeatCalcColumnMeta, HeatCalcColumnLayout {
  visible: boolean;
  order?: number;
}

interface RegisteredTableColumnCache {
  userId: string;
  settings: HeatCalcTableColumnSettings;
  cachedAt: string;
}

export const HEATCALC_TABLE_COLUMNS_VERSION = 4;
// The preference key is intentionally unchanged: v4 extends the existing table
// config instead of creating a parallel source of truth.
export const HEATCALC_TABLE_COLUMN_PREF_KEY = 'heatcalc.tableColumns.v1';
export const HEATCALC_GUEST_TABLE_COLUMN_STORAGE_KEY = 'heatcalc.tableColumns.v1.guest';
export const HEATCALC_REGISTERED_TABLE_COLUMN_CACHE_KEY = 'heatcalc.tableColumns.v1.registered.cache';
export const HEATCALC_TABLE_COLUMN_WIDTH_BASE_PX = 1000;
export const HEATCALC_TABLE_COLUMN_MIN_WIDTH_PCT = 3;
export const HEATCALC_TABLE_COLUMN_MAX_WIDTH_PCT = 60;

export const HEATCALC_ALL_OBJECT_COLUMN_KEYS: HeatCalcColumnKey[] = [
  'index',
  'type',
  'name',
  'placement',
  'insulation_layer_count',
  'insulation_thickness',
  'insulation_material',
  'process_temperature',
  'ambient_temperature',
];

const configuredTableColumnRegistry = (defaultConfig as {
  registry?: Partial<Record<HeatCalcObjectType, unknown[]>>;
}).registry ?? {};

function normalizeRegistryColumn(column: unknown): HeatCalcColumnMeta | null {
  if (!isRecord(column) || typeof column.key !== 'string') return null;
  const labels = isRecord(column.labels) ? column.labels : {};
  const shortLabel = typeof labels.short === 'string'
    ? labels.short
    : typeof column.title === 'string'
      ? column.title
      : column.key;
  const fullLabel = typeof labels.full === 'string'
    ? labels.full
    : typeof column.label === 'string'
      ? column.label
      : shortLabel;
  const widthPct = Number.isFinite(Number(column.defaultWidthPct))
    ? clampTableColumnWidthPct(column.defaultWidthPct)
    : tableColumnWidthPxToPct(Number(column.width ?? 80));
  const width = tableColumnWidthPctToPx(widthPct);

  return {
    ...column,
    key: column.key,
    labels: {
      short: shortLabel,
      full: fullLabel,
    },
    label: fullLabel,
    title: shortLabel,
    group: typeof column.group === 'string' ? column.group : 'Прочее',
    width,
    defaultWidthPct: widthPct,
    minWidthPx: Number.isFinite(Number(column.minWidthPx)) ? Number(column.minWidthPx) : 48,
    copyTitle: typeof column.copyTitle === 'string' ? column.copyTitle : undefined,
    unit: typeof column.unit === 'string' ? column.unit : undefined,
    helpText: typeof column.helpText === 'string' ? column.helpText : undefined,
    valueType: typeof column.valueType === 'string' ? column.valueType : undefined,
    required: column.required === true,
    ellipsis: column.ellipsis === true,
    defaultVisible: column.defaultVisible === true,
    sortable: column.sortable !== false,
    filterable: column.filterable !== false,
    resizable: column.resizable !== false,
  };
}

function normalizeRegistry(columns: unknown[] | undefined) {
  return (columns ?? []).map(normalizeRegistryColumn).filter((column): column is HeatCalcColumnMeta => column != null);
}

const pipeColumnCatalog = normalizeRegistry(configuredTableColumnRegistry.pipe);
const tankColumnCatalog = normalizeRegistry(configuredTableColumnRegistry.tank);

function buildAllObjectColumnCatalog() {
  const byKey = new Map<HeatCalcColumnKey, HeatCalcColumnMeta>();
  const addColumn = (column: HeatCalcColumnMeta | undefined) => {
    if (!column || byKey.has(column.key)) return;
    byKey.set(column.key, column);
  };

  HEATCALC_ALL_OBJECT_COLUMN_KEYS.forEach((key) => {
    addColumn(pipeColumnCatalog.find((column) => column.key === key));
    addColumn(tankColumnCatalog.find((column) => column.key === key));
  });
  pipeColumnCatalog.forEach(addColumn);
  tankColumnCatalog.forEach(addColumn);

  return [...byKey.values()];
}

export const HEATCALC_TABLE_COLUMN_CATALOG: Record<HeatCalcTableColumnScope, HeatCalcColumnMeta[]> = {
  pipe: pipeColumnCatalog,
  tank: tankColumnCatalog,
  all: buildAllObjectColumnCatalog(),
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function unique(values: HeatCalcColumnKey[]) {
  return [...new Set(values)];
}

function roundWidthPct(value: number) {
  return Math.round(value * 10) / 10;
}

export function clampTableColumnWidthPct(value: unknown) {
  const numericValue = Number(value);
  if (!Number.isFinite(numericValue)) return HEATCALC_TABLE_COLUMN_MIN_WIDTH_PCT;
  return roundWidthPct(
    Math.min(
      HEATCALC_TABLE_COLUMN_MAX_WIDTH_PCT,
      Math.max(HEATCALC_TABLE_COLUMN_MIN_WIDTH_PCT, numericValue),
    ),
  );
}

export function tableColumnWidthPxToPct(widthPx: number) {
  return clampTableColumnWidthPct((widthPx / HEATCALC_TABLE_COLUMN_WIDTH_BASE_PX) * 100);
}

export function tableColumnWidthPctToPx(widthPct: number) {
  return Math.round(
    (clampTableColumnWidthPct(widthPct) / 100) * HEATCALC_TABLE_COLUMN_WIDTH_BASE_PX,
  );
}

function defaultColumnWidthPct(column: HeatCalcColumnMeta) {
  return column.defaultWidthPct;
}

function defaultVisibleKeys(type: HeatCalcTableColumnScope) {
  if (type === 'all') {
    const available = new Set(getAvailableTableColumnKeys('all'));
    return HEATCALC_ALL_OBJECT_COLUMN_KEYS.filter((key) => available.has(key));
  }
  const config: Record<string, unknown> = isRecord(defaultConfig) ? defaultConfig : {};
  const rawTable = isRecord(config.table) ? config.table : {};
  const available = new Set(getAvailableTableColumnKeys(type));
  const configured = Array.isArray(rawTable[type])
    ? rawTable[type].filter((key: unknown): key is string => typeof key === 'string' && available.has(key))
    : [];
  return configured.length > 0
    ? configured
    : HEATCALC_TABLE_COLUMN_CATALOG[type].filter((column) => column.required).map((column) => column.key);
}

function defaultTypeSettings(type: HeatCalcTableColumnScope): HeatCalcTableColumnTypeSettings {
  const columns: Record<HeatCalcColumnKey, HeatCalcColumnLayout> = {};
  HEATCALC_TABLE_COLUMN_CATALOG[type].forEach((column) => {
    columns[column.key] = {
      widthPct: defaultColumnWidthPct(column),
    };
  });
  return {
    visibleOrder: normalizeVisibleOrder(type, defaultVisibleKeys(type)),
    columns,
  };
}

function normalizeVisibleOrder(
  type: HeatCalcTableColumnScope,
  keys: unknown,
  fallback: HeatCalcColumnKey[] = [],
) {
  const availableSet = new Set(getAvailableTableColumnKeys(type));
  const requested = Array.isArray(keys)
    ? unique(keys.filter((key): key is string => typeof key === 'string' && availableSet.has(key)))
    : [];
  const seed = requested.length > 0 ? requested : fallback;
  const result = unique(seed.filter((key) => availableSet.has(key)));
  const resultSet = new Set(result);
  for (const column of HEATCALC_TABLE_COLUMN_CATALOG[type]) {
    if (column.required && !resultSet.has(column.key)) {
      result.push(column.key);
      resultSet.add(column.key);
    }
  }
  return result;
}

function visibleOrderFromLegacyColumns(
  type: HeatCalcTableColumnScope,
  rawColumns: unknown,
) {
  const source = isRecord(rawColumns) ? rawColumns : {};
  const defaultOrder = new Map(
    HEATCALC_TABLE_COLUMN_CATALOG[type].map((column, index) => [column.key, index + 1]),
  );
  const keys = HEATCALC_TABLE_COLUMN_CATALOG[type]
    .map((column) => {
      const rawLayout = source[column.key];
      const layout = isRecord(rawLayout) ? rawLayout : {};
      const visible = column.required || layout.visible === true;
      const order = Number.isFinite(Number(layout.order))
        ? Math.round(Number(layout.order))
        : defaultOrder.get(column.key) ?? 999;
      return { key: column.key, visible, order };
    })
    .filter((column) => column.visible)
    .sort((left, right) => {
      if (left.order !== right.order) return left.order - right.order;
      return (defaultOrder.get(left.key) ?? 999) - (defaultOrder.get(right.key) ?? 999);
    })
    .map((column) => column.key);
  return normalizeVisibleOrder(type, keys);
}

function normalizeColumns(
  type: HeatCalcTableColumnScope,
  rawColumns: unknown,
): Record<HeatCalcColumnKey, HeatCalcColumnLayout> {
  const source = isRecord(rawColumns) ? rawColumns : {};
  const columns: Record<HeatCalcColumnKey, HeatCalcColumnLayout> = {};

  for (const column of HEATCALC_TABLE_COLUMN_CATALOG[type]) {
    const rawLayout = source[column.key];
    const layout = isRecord(rawLayout) ? rawLayout : {};
    columns[column.key] = {
      widthPct: Number.isFinite(Number(layout.widthPct))
        ? clampTableColumnWidthPct(layout.widthPct)
        : defaultColumnWidthPct(column),
    };
  }

  return columns;
}

function normalizeTypeSettingsFromStructuredValue(
  type: HeatCalcTableColumnScope,
  rawType: unknown,
): HeatCalcTableColumnTypeSettings {
  const defaults = defaultTypeSettings(type);
  const source = isRecord(rawType) ? rawType : {};
  const rawColumns = source.columns;
  const hasColumns = isRecord(rawColumns) && Object.keys(rawColumns).length > 0;
  const visibleOrder = Array.isArray(source.visibleOrder)
    ? normalizeVisibleOrder(type, source.visibleOrder)
    : hasColumns
      ? visibleOrderFromLegacyColumns(type, rawColumns)
      : defaults.visibleOrder;

  return {
    visibleOrder,
    columns: normalizeColumns(type, rawColumns),
  };
}

function normalizeTypeSettingsFromVisibleKeys(
  type: HeatCalcTableColumnScope,
  keys: unknown,
): HeatCalcTableColumnTypeSettings {
  const fallback = defaultVisibleKeys(type);
  return {
    visibleOrder: normalizeVisibleOrder(type, keys, fallback),
    columns: normalizeColumns(type, null),
  };
}

export function getAvailableTableColumnKeys(type: HeatCalcTableColumnScope) {
  return HEATCALC_TABLE_COLUMN_CATALOG[type].map((column) => column.key);
}

export function getDefaultTableColumnSettings(): HeatCalcTableColumnSettings {
  return {
    version: HEATCALC_TABLE_COLUMNS_VERSION,
    types: {
      pipe: defaultTypeSettings('pipe'),
      tank: defaultTypeSettings('tank'),
      all: defaultTypeSettings('all'),
    },
  };
}

export function normalizeVisibleTableColumnKeys(
  type: HeatCalcTableColumnScope,
  keys: unknown,
): HeatCalcColumnKey[] {
  const settings = normalizeTableColumnSettings({
    table: {
      [type]: keys,
    },
  });
  return getVisibleTableColumnMetas(type, settings).map((column) => column.key);
}

export function normalizeTableColumnSettings(value: unknown): HeatCalcTableColumnSettings {
  const source = isRecord(value) ? value : {};
  const sourceTypes = isRecord(source.types) ? source.types : null;

  if (sourceTypes) {
    const pipe = isRecord(sourceTypes.pipe) ? sourceTypes.pipe : {};
    const tank = isRecord(sourceTypes.tank) ? sourceTypes.tank : {};
    const all = isRecord(sourceTypes.all) ? sourceTypes.all : {};
    return {
      version: HEATCALC_TABLE_COLUMNS_VERSION,
      types: {
        pipe: normalizeTypeSettingsFromStructuredValue('pipe', pipe),
        tank: normalizeTypeSettingsFromStructuredValue('tank', tank),
        all: normalizeTypeSettingsFromStructuredValue('all', all),
      },
    };
  }

  const rawTable = isRecord(source.table) ? source.table : source;
  return {
    version: HEATCALC_TABLE_COLUMNS_VERSION,
    types: {
      pipe: normalizeTypeSettingsFromVisibleKeys('pipe', rawTable.pipe),
      tank: normalizeTypeSettingsFromVisibleKeys('tank', rawTable.tank),
      all: normalizeTypeSettingsFromVisibleKeys('all', rawTable.all),
    },
  };
}

export function getTableColumnMeta(type: HeatCalcTableColumnScope, key: HeatCalcColumnKey) {
  return HEATCALC_TABLE_COLUMN_CATALOG[type].find((column) => column.key === key) ?? null;
}

export function getAllTableColumnMetas(
  type: HeatCalcTableColumnScope,
  settings: HeatCalcTableColumnSettings,
): HeatCalcResolvedColumnMeta[] {
  const normalized = normalizeTableColumnSettings(settings);
  const visibleOrder = normalized.types[type].visibleOrder;
  const visibleSet = new Set(visibleOrder);
  const orderByKey = new Map(visibleOrder.map((key, index) => [key, index + 1]));
  const catalogByKey = new Map(HEATCALC_TABLE_COLUMN_CATALOG[type].map((column) => [column.key, column]));
  const orderedColumns = [
    ...visibleOrder
      .map((key) => catalogByKey.get(key))
      .filter((column): column is HeatCalcColumnMeta => column != null),
    ...HEATCALC_TABLE_COLUMN_CATALOG[type].filter((column) => !visibleSet.has(column.key)),
  ];
  return orderedColumns.map((column) => {
    const layout = normalized.types[type].columns[column.key];
    const order = orderByKey.get(column.key);
    return {
      ...column,
      ...layout,
      visible: order != null,
      order,
      width: tableColumnWidthPctToPx(layout.widthPct),
    };
  });
}

export function getVisibleTableColumnMetas(
  type: HeatCalcTableColumnScope,
  settings: HeatCalcTableColumnSettings,
) {
  return getAllTableColumnMetas(type, settings).filter((column) => column.visible);
}

export function getDefaultVisibleTableColumnKeys(type: HeatCalcTableColumnScope) {
  return getVisibleTableColumnMetas(type, getDefaultTableColumnSettings()).map((column) => column.key);
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

export function setTableColumnVisibility(
  settings: HeatCalcTableColumnSettings,
  type: HeatCalcTableColumnScope,
  key: HeatCalcColumnKey,
  visible: boolean,
) {
  const normalized = normalizeTableColumnSettings(settings);
  const column = getTableColumnMeta(type, key);
  if (!column) return normalized;
  const currentOrder = normalized.types[type].visibleOrder;
  const shouldShow = column.required || visible;
  const nextVisibleOrder = shouldShow
    ? currentOrder.includes(key)
      ? currentOrder
      : [...currentOrder, key]
    : currentOrder.filter((item) => item !== key);
  return normalizeTableColumnSettings({
    ...normalized,
    types: {
      ...normalized.types,
      [type]: {
        ...normalized.types[type],
        visibleOrder: nextVisibleOrder,
      },
    },
  });
}

export function setTableColumnWidthPct(
  settings: HeatCalcTableColumnSettings,
  type: HeatCalcTableColumnScope,
  key: HeatCalcColumnKey,
  widthPct: number,
) {
  const normalized = normalizeTableColumnSettings(settings);
  if (!normalized.types[type].columns[key]) return normalized;
  return normalizeTableColumnSettings({
    ...normalized,
    types: {
      ...normalized.types,
      [type]: {
        ...normalized.types[type],
        columns: {
          ...normalized.types[type].columns,
          [key]: {
            ...normalized.types[type].columns[key],
            widthPct: clampTableColumnWidthPct(widthPct),
          },
        },
      },
    },
  });
}

export function resetTableColumnWidth(
  settings: HeatCalcTableColumnSettings,
  type: HeatCalcTableColumnScope,
  key: HeatCalcColumnKey,
) {
  const column = getTableColumnMeta(type, key);
  return column ? setTableColumnWidthPct(settings, type, key, defaultColumnWidthPct(column)) : settings;
}

export function moveTableColumnToOrder(
  settings: HeatCalcTableColumnSettings,
  type: HeatCalcTableColumnScope,
  key: HeatCalcColumnKey,
  nextOrder: number,
) {
  const normalized = normalizeTableColumnSettings(settings);
  const visibleOrder = [...normalized.types[type].visibleOrder];
  const fromIndex = visibleOrder.indexOf(key);
  if (fromIndex < 0) return normalized;
  const boundedOrder = Math.min(visibleOrder.length, Math.max(1, Math.round(nextOrder)));
  if (fromIndex === boundedOrder - 1) return normalized;
  const [moved] = visibleOrder.splice(fromIndex, 1);
  visibleOrder.splice(boundedOrder - 1, 0, moved);
  return normalizeTableColumnSettings({
    ...normalized,
    types: {
      ...normalized.types,
      [type]: {
        ...normalized.types[type],
        visibleOrder,
      },
    },
  });
}

export function reorderTableColumn(
  settings: HeatCalcTableColumnSettings,
  type: HeatCalcTableColumnScope,
  activeKey: HeatCalcColumnKey,
  overKey: HeatCalcColumnKey,
) {
  const metas = getVisibleTableColumnMetas(type, settings);
  const over = metas.find((column) => column.key === overKey);
  return over?.order ? moveTableColumnToOrder(settings, type, activeKey, over.order) : normalizeTableColumnSettings(settings);
}

export function resetTableColumnTypeSettings(
  settings: HeatCalcTableColumnSettings,
  type: HeatCalcTableColumnScope,
) {
  const normalized = normalizeTableColumnSettings(settings);
  return normalizeTableColumnSettings({
    ...normalized,
    types: {
      ...normalized.types,
      [type]: defaultTypeSettings(type),
    },
  });
}

export function createTableColumnSettingsPatch(
  settings: HeatCalcTableColumnSettings,
  type: HeatCalcTableColumnScope,
  keys: HeatCalcColumnKey[],
) {
  const normalized = normalizeTableColumnSettings(settings);
  return normalizeTableColumnSettings({
    ...normalized,
    types: {
      ...normalized.types,
      [type]: {
        ...normalized.types[type],
        visibleOrder: normalizeVisibleOrder(type, keys),
      },
    },
  });
}
