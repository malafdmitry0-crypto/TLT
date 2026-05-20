import {
  getElectricalColumnConfig,
  getElectricalColumnDescription,
  getElectricalColumnLabel,
  getElectricalDefaultVisibleTableKeys,
  getElectricalTableColumnRegistry,
  type ElectricalRegistryTableColumn,
} from '@/domain/electricalFieldRegistry';
import type { ElectricalTableLabelFormat } from '@/utils/electricalTableViewSettings';

export type ElectricalColumnKey = string;

export interface ElectricalColumnLabels {
  short: string;
  full: string;
  compact: string;
}

export interface ElectricalColumnMeta {
  key: ElectricalColumnKey;
  labels: ElectricalColumnLabels;
  label: string;
  title: string;
  group: string;
  source: string;
  valueType: string;
  width: number;
  defaultWidthPct: number;
  minWidthPx: number;
  required?: boolean;
  ellipsis?: boolean;
  helpText?: string;
}

export interface ElectricalColumnLayout {
  widthPct: number;
}

export interface ElectricalTableColumnSettings {
  version: number;
  visibleOrder: ElectricalColumnKey[];
  columns: Record<ElectricalColumnKey, ElectricalColumnLayout>;
}

export interface ElectricalResolvedColumnMeta extends ElectricalColumnMeta, ElectricalColumnLayout {
  visible: boolean;
  order?: number;
}

interface RegisteredElectricalTableColumnCache {
  userId: string;
  settings: ElectricalTableColumnSettings;
  cachedAt: string;
}

export const ELECTRICAL_TABLE_COLUMNS_VERSION = 5;
export const ELECTRICAL_TABLE_COLUMN_PREF_KEY = `electrical.tableColumns.v${ELECTRICAL_TABLE_COLUMNS_VERSION}`;
export const ELECTRICAL_GUEST_TABLE_COLUMN_STORAGE_KEY = `${ELECTRICAL_TABLE_COLUMN_PREF_KEY}.guest`;
export const ELECTRICAL_REGISTERED_TABLE_COLUMN_CACHE_KEY =
  `${ELECTRICAL_TABLE_COLUMN_PREF_KEY}.registered.cache`;
export const ELECTRICAL_TABLE_COLUMN_WIDTH_BASE_PX = 1000;
export const ELECTRICAL_TABLE_COLUMN_MIN_WIDTH_PCT = 3;
export const ELECTRICAL_TABLE_COLUMN_MAX_WIDTH_PCT = 60;

function roundWidthPct(value: number) {
  return Math.round(value * 10) / 10;
}

export function clampElectricalTableColumnWidthPct(value: unknown) {
  const numericValue = Number(value);
  if (!Number.isFinite(numericValue)) return ELECTRICAL_TABLE_COLUMN_MIN_WIDTH_PCT;
  return roundWidthPct(
    Math.min(
      ELECTRICAL_TABLE_COLUMN_MAX_WIDTH_PCT,
      Math.max(ELECTRICAL_TABLE_COLUMN_MIN_WIDTH_PCT, numericValue),
    ),
  );
}

export function electricalTableColumnWidthPctToPx(widthPct: number) {
  return Math.round(
    (clampElectricalTableColumnWidthPct(widthPct) / 100) *
      ELECTRICAL_TABLE_COLUMN_WIDTH_BASE_PX,
  );
}

export function electricalTableColumnWidthPxToPct(widthPx: number) {
  return clampElectricalTableColumnWidthPct(
    (widthPx / ELECTRICAL_TABLE_COLUMN_WIDTH_BASE_PX) * 100,
  );
}

function normalizeRegistryColumn(column: ElectricalRegistryTableColumn): ElectricalColumnMeta | null {
  if (typeof column.key !== 'string') return null;
  const config = getElectricalColumnConfig(column.key);
  if (!config) return null;
  const widthPct = Number.isFinite(Number(column.defaultWidthPct))
    ? clampElectricalTableColumnWidthPct(column.defaultWidthPct)
    : clampElectricalTableColumnWidthPct(8);

  return {
    key: column.key,
    labels: {
      short: getElectricalColumnLabel(column.key, 'short'),
      full: getElectricalColumnLabel(column.key, 'full'),
      compact: getElectricalColumnLabel(column.key, 'compact'),
    },
    label: getElectricalColumnLabel(column.key, 'full'),
    title: getElectricalColumnLabel(column.key, 'short'),
    group: config.group,
    source: config.source,
    valueType: config.valueType,
    width: electricalTableColumnWidthPctToPx(widthPct),
    defaultWidthPct: widthPct,
    minWidthPx: Number.isFinite(Number(column.minWidthPx)) ? Number(column.minWidthPx) : 48,
    required: column.required === true,
    ellipsis: column.ellipsis === true,
    helpText: getElectricalColumnDescription(column.key) || undefined,
  };
}

export const ELECTRICAL_TABLE_COLUMN_CATALOG: ElectricalColumnMeta[] =
  getElectricalTableColumnRegistry()
    .map(normalizeRegistryColumn)
    .filter((column): column is ElectricalColumnMeta => column != null);

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function unique(values: ElectricalColumnKey[]) {
  return [...new Set(values)];
}

function defaultColumnWidthPct(column: ElectricalColumnMeta) {
  return column.defaultWidthPct;
}

export function getAvailableElectricalTableColumnKeys() {
  return ELECTRICAL_TABLE_COLUMN_CATALOG.map((column) => column.key);
}

function defaultVisibleKeys() {
  const available = new Set(getAvailableElectricalTableColumnKeys());
  const configured = getElectricalDefaultVisibleTableKeys().filter((key) => available.has(key));
  if (configured.length > 0) return configured;
  return ELECTRICAL_TABLE_COLUMN_CATALOG
    .filter((column) => column.required)
    .map((column) => column.key);
}

function normalizeVisibleOrder(keys: unknown, fallback: ElectricalColumnKey[] = []) {
  const availableSet = new Set(getAvailableElectricalTableColumnKeys());
  const requested = Array.isArray(keys)
    ? unique(keys.filter((key): key is string => typeof key === 'string' && availableSet.has(key)))
    : [];
  const seed = requested.length > 0 ? requested : fallback;
  const result = unique(seed.filter((key) => availableSet.has(key)));
  const resultSet = new Set(result);
  for (const column of ELECTRICAL_TABLE_COLUMN_CATALOG) {
    if (column.required && !resultSet.has(column.key)) {
      result.push(column.key);
      resultSet.add(column.key);
    }
  }
  return result;
}

function normalizeColumns(rawColumns: unknown): Record<ElectricalColumnKey, ElectricalColumnLayout> {
  const source = isRecord(rawColumns) ? rawColumns : {};
  const columns: Record<ElectricalColumnKey, ElectricalColumnLayout> = {};
  for (const column of ELECTRICAL_TABLE_COLUMN_CATALOG) {
    const rawLayout = source[column.key];
    const layout = isRecord(rawLayout) ? rawLayout : {};
    columns[column.key] = {
      widthPct: Number.isFinite(Number(layout.widthPct))
        ? clampElectricalTableColumnWidthPct(layout.widthPct)
        : defaultColumnWidthPct(column),
    };
  }
  return columns;
}

export function getDefaultElectricalTableColumnSettings(): ElectricalTableColumnSettings {
  return {
    version: ELECTRICAL_TABLE_COLUMNS_VERSION,
    visibleOrder: normalizeVisibleOrder(defaultVisibleKeys()),
    columns: normalizeColumns(null),
  };
}

export function normalizeElectricalTableColumnSettings(
  value: unknown,
): ElectricalTableColumnSettings {
  const source = isRecord(value) ? value : {};
  const visibleOrder = normalizeVisibleOrder(source.visibleOrder, defaultVisibleKeys());
  return {
    version: ELECTRICAL_TABLE_COLUMNS_VERSION,
    visibleOrder,
    columns: normalizeColumns(source.columns),
  };
}

export function getElectricalTableColumnMeta(key: ElectricalColumnKey) {
  return ELECTRICAL_TABLE_COLUMN_CATALOG.find((column) => column.key === key) ?? null;
}

function getColumnLabelByFormat(
  labels: ElectricalColumnLabels,
  format: ElectricalTableLabelFormat,
) {
  return labels[format] || labels.full || labels.short || labels.compact;
}

function applyColumnLabelFormat<T extends ElectricalColumnMeta>(
  column: T,
  format?: ElectricalTableLabelFormat,
): T {
  if (!format) return column;
  const displayLabel = getColumnLabelByFormat(column.labels, format);
  return {
    ...column,
    title: displayLabel,
  } as T;
}

export function getAllElectricalTableColumnMetas(
  settings: ElectricalTableColumnSettings,
  labelFormat?: ElectricalTableLabelFormat,
): ElectricalResolvedColumnMeta[] {
  const normalized = normalizeElectricalTableColumnSettings(settings);
  const visibleSet = new Set(normalized.visibleOrder);
  const orderByKey = new Map(normalized.visibleOrder.map((key, index) => [key, index + 1]));
  const catalogByKey = new Map(ELECTRICAL_TABLE_COLUMN_CATALOG.map((column) => [column.key, column]));
  const orderedColumns = [
    ...normalized.visibleOrder
      .map((key) => catalogByKey.get(key))
      .filter((column): column is ElectricalColumnMeta => column != null),
    ...ELECTRICAL_TABLE_COLUMN_CATALOG.filter((column) => !visibleSet.has(column.key)),
  ];

  return orderedColumns.map((column) => {
    const layout = normalized.columns[column.key];
    const order = orderByKey.get(column.key);
    return applyColumnLabelFormat({
      ...column,
      ...layout,
      visible: order != null,
      order,
      width: electricalTableColumnWidthPctToPx(layout.widthPct),
    }, labelFormat);
  });
}

export function getVisibleElectricalTableColumnMetas(
  settings: ElectricalTableColumnSettings,
  labelFormat?: ElectricalTableLabelFormat,
) {
  return getAllElectricalTableColumnMetas(settings, labelFormat).filter((column) => column.visible);
}

export function getDefaultVisibleElectricalTableColumnKeys() {
  return getVisibleElectricalTableColumnMetas(
    getDefaultElectricalTableColumnSettings(),
  ).map((column) => column.key);
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

export function readGuestElectricalTableColumnSettings() {
  const stored = readStorageJson(ELECTRICAL_GUEST_TABLE_COLUMN_STORAGE_KEY);
  return stored
    ? normalizeElectricalTableColumnSettings(stored)
    : getDefaultElectricalTableColumnSettings();
}

export function writeGuestElectricalTableColumnSettings(
  settings: ElectricalTableColumnSettings,
) {
  if (typeof localStorage === 'undefined') return;
  localStorage.setItem(
    ELECTRICAL_GUEST_TABLE_COLUMN_STORAGE_KEY,
    JSON.stringify(normalizeElectricalTableColumnSettings(settings)),
  );
}

export function readRegisteredElectricalTableColumnCache(userId?: string | null) {
  if (!userId) return null;
  const stored = readStorageJson(ELECTRICAL_REGISTERED_TABLE_COLUMN_CACHE_KEY);
  if (!isRecord(stored) || stored.userId !== userId) return null;
  return normalizeElectricalTableColumnSettings(stored.settings);
}

export function writeRegisteredElectricalTableColumnCache(
  userId: string,
  settings: ElectricalTableColumnSettings,
) {
  if (typeof localStorage === 'undefined') return;
  const payload: RegisteredElectricalTableColumnCache = {
    userId,
    settings: normalizeElectricalTableColumnSettings(settings),
    cachedAt: new Date().toISOString(),
  };
  localStorage.setItem(ELECTRICAL_REGISTERED_TABLE_COLUMN_CACHE_KEY, JSON.stringify(payload));
}

export function clearRegisteredElectricalTableColumnCache(userId?: string | null) {
  if (typeof localStorage === 'undefined') return;
  if (!userId) {
    localStorage.removeItem(ELECTRICAL_REGISTERED_TABLE_COLUMN_CACHE_KEY);
    return;
  }
  const stored = readStorageJson(ELECTRICAL_REGISTERED_TABLE_COLUMN_CACHE_KEY);
  if (!isRecord(stored) || stored.userId === userId) {
    localStorage.removeItem(ELECTRICAL_REGISTERED_TABLE_COLUMN_CACHE_KEY);
  }
}

export function setElectricalTableColumnVisibility(
  settings: ElectricalTableColumnSettings,
  key: ElectricalColumnKey,
  visible: boolean,
) {
  const normalized = normalizeElectricalTableColumnSettings(settings);
  const column = getElectricalTableColumnMeta(key);
  if (!column) return normalized;
  const currentOrder = normalized.visibleOrder;
  const shouldShow = column.required || visible;
  const nextVisibleOrder = shouldShow
    ? currentOrder.includes(key)
      ? currentOrder
      : [...currentOrder, key]
    : currentOrder.filter((item) => item !== key);
  return normalizeElectricalTableColumnSettings({
    ...normalized,
    visibleOrder: nextVisibleOrder,
  });
}

export function setElectricalTableColumnWidthPct(
  settings: ElectricalTableColumnSettings,
  key: ElectricalColumnKey,
  widthPct: number,
) {
  const normalized = normalizeElectricalTableColumnSettings(settings);
  if (!normalized.columns[key]) return normalized;
  return normalizeElectricalTableColumnSettings({
    ...normalized,
    columns: {
      ...normalized.columns,
      [key]: {
        ...normalized.columns[key],
        widthPct: clampElectricalTableColumnWidthPct(widthPct),
      },
    },
  });
}

export function resetElectricalTableColumnWidth(
  settings: ElectricalTableColumnSettings,
  key: ElectricalColumnKey,
) {
  const column = getElectricalTableColumnMeta(key);
  return column
    ? setElectricalTableColumnWidthPct(settings, key, defaultColumnWidthPct(column))
    : settings;
}

export function moveElectricalTableColumnToOrder(
  settings: ElectricalTableColumnSettings,
  key: ElectricalColumnKey,
  nextOrder: number,
) {
  const normalized = normalizeElectricalTableColumnSettings(settings);
  const visibleOrder = [...normalized.visibleOrder];
  const fromIndex = visibleOrder.indexOf(key);
  if (fromIndex < 0) return normalized;
  const boundedOrder = Math.min(visibleOrder.length, Math.max(1, Math.round(nextOrder)));
  if (fromIndex === boundedOrder - 1) return normalized;
  const [moved] = visibleOrder.splice(fromIndex, 1);
  visibleOrder.splice(boundedOrder - 1, 0, moved);
  return normalizeElectricalTableColumnSettings({
    ...normalized,
    visibleOrder,
  });
}

export function reorderElectricalTableColumn(
  settings: ElectricalTableColumnSettings,
  activeKey: ElectricalColumnKey,
  overKey: ElectricalColumnKey,
) {
  const metas = getVisibleElectricalTableColumnMetas(settings);
  const over = metas.find((column) => column.key === overKey);
  return over?.order
    ? moveElectricalTableColumnToOrder(settings, activeKey, over.order)
    : normalizeElectricalTableColumnSettings(settings);
}

export function resetElectricalTableColumnSettings() {
  return getDefaultElectricalTableColumnSettings();
}

export function createElectricalTableColumnSettingsPatch(
  settings: ElectricalTableColumnSettings,
  keys: ElectricalColumnKey[],
) {
  const normalized = normalizeElectricalTableColumnSettings(settings);
  return normalizeElectricalTableColumnSettings({
    ...normalized,
    visibleOrder: normalizeVisibleOrder(keys),
  });
}
