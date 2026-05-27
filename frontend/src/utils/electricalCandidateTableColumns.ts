import {
  ELECTRICAL_TABLE_COLUMN_CATALOG,
  ELECTRICAL_TABLE_COLUMN_MAX_WIDTH_PCT,
  ELECTRICAL_TABLE_COLUMN_MIN_WIDTH_PCT,
  clampElectricalTableColumnWidthPct,
  electricalTableColumnWidthPctToPx,
  electricalTableColumnWidthPxToPct,
  type ElectricalColumnKey,
  type ElectricalColumnLabels,
  type ElectricalColumnMeta,
} from '@/utils/electricalTableColumns';
import type { ElectricalTableLabelFormat } from '@/utils/electricalTableViewSettings';

export type ElectricalCandidateColumnKey = string;

export interface ElectricalCandidateColumnMeta {
  key: ElectricalCandidateColumnKey;
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
  fixed?: 'left';
  align?: 'left' | 'center' | 'right';
}

export interface ElectricalCandidateColumnLayout {
  widthPct: number;
}

export interface ElectricalCandidateTableColumnSettings {
  version: number;
  visibleOrder: ElectricalCandidateColumnKey[];
  columns: Record<ElectricalCandidateColumnKey, ElectricalCandidateColumnLayout>;
}

export interface ElectricalCandidateResolvedColumnMeta
  extends ElectricalCandidateColumnMeta,
    ElectricalCandidateColumnLayout {
  visible: boolean;
  order?: number;
}

interface RegisteredElectricalCandidateTableColumnCache {
  userId: string;
  settings: ElectricalCandidateTableColumnSettings;
  cachedAt: string;
}

export const ELECTRICAL_CANDIDATE_TABLE_COLUMNS_VERSION = 1;
export const ELECTRICAL_CANDIDATE_TABLE_COLUMN_PREF_KEY =
  `electrical.candidateTableColumns.v${ELECTRICAL_CANDIDATE_TABLE_COLUMNS_VERSION}`;
export const ELECTRICAL_GUEST_CANDIDATE_TABLE_COLUMN_STORAGE_KEY =
  `${ELECTRICAL_CANDIDATE_TABLE_COLUMN_PREF_KEY}.guest`;
export const ELECTRICAL_REGISTERED_CANDIDATE_TABLE_COLUMN_CACHE_KEY =
  `${ELECTRICAL_CANDIDATE_TABLE_COLUMN_PREF_KEY}.registered.cache`;

const CANDIDATE_FIELD_EXCLUDED_KEYS = new Set<ElectricalColumnKey>([
  'index',
  'object_name',
  'object_type',
  'heat_loss_status',
  'electrical_status',
  'cable_snapshot_status',
]);

const CANDIDATE_COLUMN_PRIORITY = [
  'cable_type',
  'cable_mark',
  'maintain_temperature',
  'vapor_temperature',
  'aggressive_product',
  'applied_selection_policy',
  'selection_reason',
  'winding_pitch_mm',
  'number_of_threads',
  'laying_step',
  'heating_height',
  'connection_type',
  'supply_voltage',
  'winding_coefficient',
] as const;

const CANDIDATE_COLUMN_PRIORITY_INDEX = new Map<string, number>(
  CANDIDATE_COLUMN_PRIORITY.map((key, index) => [key, index]),
);

const CANDIDATE_COLUMN_WIDTH_PCT_BY_KEY: Record<string, number> = {
  marked: 6.8,
  actions: 16.2,
  mode: 8.6,
  cable_mark: 19,
  selection_policy: 13,
  applied_selection_policy: 15,
  selection_reason: 32,
  winding_pitch_mm: 12,
  number_of_threads: 11,
  laying_step: 12,
  heating_height: 12,
  connection_type: 11,
  supply_voltage: 11,
  winding_coefficient: 8.6,
  maintain_temperature: 8.4,
  vapor_temperature: 10.4,
  aggressive_product: 7.2,
  installed_cable_length: 13,
  order_cable_length: 13,
  total_power: 12,
  current: 10,
  voltage: 11,
  price_per_meter: 12,
  required_order_length: 14,
  total_cost: 12,
  stock_status: 12,
  lead_time_days: 11,
};

const SERVICE_CANDIDATE_COLUMNS: ElectricalCandidateColumnMeta[] = [
  {
    key: 'marked',
    labels: {
      short: 'Пометка',
      full: 'Пометка варианта',
      compact: 'Пом.',
    },
    label: 'Пометка варианта',
    title: 'Пометка',
    group: 'Действия',
    source: 'candidate_ui',
    valueType: 'service',
    width: electricalTableColumnWidthPctToPx(CANDIDATE_COLUMN_WIDTH_PCT_BY_KEY.marked),
    defaultWidthPct: CANDIDATE_COLUMN_WIDTH_PCT_BY_KEY.marked,
    minWidthPx: 56,
    ellipsis: false,
    fixed: 'left',
    align: 'center',
    helpText: 'Временная отметка варианта в открытой модалке. Не выбирает кабель.',
  },
  {
    key: 'actions',
    labels: {
      short: 'Действия',
      full: 'Действия с вариантом',
      compact: 'Действ.',
    },
    label: 'Действия с вариантом',
    title: 'Действия',
    group: 'Действия',
    source: 'candidate_ui',
    valueType: 'service',
    width: electricalTableColumnWidthPctToPx(CANDIDATE_COLUMN_WIDTH_PCT_BY_KEY.actions),
    defaultWidthPct: CANDIDATE_COLUMN_WIDTH_PCT_BY_KEY.actions,
    minWidthPx: 156,
    required: true,
    ellipsis: false,
    fixed: 'left',
    helpText: 'Применить вариант, положить в папку или исключить вариант из подбора.',
  },
  {
    key: 'mode',
    labels: {
      short: 'Режим',
      full: 'Режим расчёта',
      compact: 'Режим',
    },
    label: 'Режим расчёта',
    title: 'Режим',
    group: 'Основные',
    source: 'electrical_candidates',
    valueType: 'computed',
    width: electricalTableColumnWidthPctToPx(CANDIDATE_COLUMN_WIDTH_PCT_BY_KEY.mode),
    defaultWidthPct: CANDIDATE_COLUMN_WIDTH_PCT_BY_KEY.mode,
    minWidthPx: 72,
    ellipsis: false,
    fixed: 'left',
    helpText: 'Автоматический или ручной вариант подбора.',
  },
];

function candidateWidthPct(column: ElectricalColumnMeta) {
  const configured = CANDIDATE_COLUMN_WIDTH_PCT_BY_KEY[column.key];
  if (Number.isFinite(configured)) return clampElectricalTableColumnWidthPct(configured);
  return electricalTableColumnWidthPxToPct(Math.max(column.minWidthPx, Math.min(column.width, 150)));
}

function normalizeCandidateColumn(column: ElectricalColumnMeta): ElectricalCandidateColumnMeta {
  const widthPct = candidateWidthPct(column);
  return {
    ...column,
    width: electricalTableColumnWidthPctToPx(widthPct),
    defaultWidthPct: widthPct,
    minWidthPx: Math.max(column.minWidthPx, column.key === 'cable_mark' ? 130 : 48),
    required: column.key === 'cable_mark' || column.required,
    fixed: undefined,
    align: column.key === 'cable_mark' || column.key === 'selection_reason' ? 'left' : undefined,
  };
}

export const ELECTRICAL_CANDIDATE_TABLE_COLUMN_CATALOG: ElectricalCandidateColumnMeta[] = [
  ...SERVICE_CANDIDATE_COLUMNS,
  ...ELECTRICAL_TABLE_COLUMN_CATALOG
    .filter((column) =>
      !CANDIDATE_FIELD_EXCLUDED_KEYS.has(column.key) &&
      (
        column.source === 'electrical_calculations' ||
        column.source === 'params' ||
        column.source === 'results' ||
        column.source === 'results.commercial'
      ),
    )
    .sort((left, right) => {
      const leftPriority = CANDIDATE_COLUMN_PRIORITY_INDEX.get(left.key) ?? Number.MAX_SAFE_INTEGER;
      const rightPriority = CANDIDATE_COLUMN_PRIORITY_INDEX.get(right.key) ?? Number.MAX_SAFE_INTEGER;
      if (leftPriority !== rightPriority) return leftPriority - rightPriority;
      return 0;
    })
    .map(normalizeCandidateColumn),
];

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function unique(values: ElectricalCandidateColumnKey[]) {
  return [...new Set(values)];
}

export function getAvailableElectricalCandidateTableColumnKeys() {
  return ELECTRICAL_CANDIDATE_TABLE_COLUMN_CATALOG.map((column) => column.key);
}

function normalizeVisibleOrder(
  keys: unknown,
  fallback: ElectricalCandidateColumnKey[] = [],
) {
  const availableSet = new Set(getAvailableElectricalCandidateTableColumnKeys());
  const requested = Array.isArray(keys)
    ? unique(keys.filter((key): key is string => typeof key === 'string' && availableSet.has(key)))
    : [];
  const seed = requested.length > 0 ? requested : fallback;
  const result = unique(seed.filter((key) => availableSet.has(key)));
  const resultSet = new Set(result);
  for (const column of ELECTRICAL_CANDIDATE_TABLE_COLUMN_CATALOG) {
    if (column.required && !resultSet.has(column.key)) {
      result.push(column.key);
      resultSet.add(column.key);
    }
  }
  return result;
}

function normalizeColumns(
  rawColumns: unknown,
): Record<ElectricalCandidateColumnKey, ElectricalCandidateColumnLayout> {
  const source = isRecord(rawColumns) ? rawColumns : {};
  const columns: Record<ElectricalCandidateColumnKey, ElectricalCandidateColumnLayout> = {};
  for (const column of ELECTRICAL_CANDIDATE_TABLE_COLUMN_CATALOG) {
    const rawLayout = source[column.key];
    const layout = isRecord(rawLayout) ? rawLayout : {};
    columns[column.key] = {
      widthPct: Number.isFinite(Number(layout.widthPct))
        ? clampElectricalTableColumnWidthPct(layout.widthPct)
        : column.defaultWidthPct,
    };
  }
  return columns;
}

function defaultVisibleKeys() {
  return ELECTRICAL_CANDIDATE_TABLE_COLUMN_CATALOG.map((column) => column.key);
}

export function getDefaultElectricalCandidateTableColumnSettings(): ElectricalCandidateTableColumnSettings {
  return {
    version: ELECTRICAL_CANDIDATE_TABLE_COLUMNS_VERSION,
    visibleOrder: normalizeVisibleOrder(defaultVisibleKeys()),
    columns: normalizeColumns(null),
  };
}

export function normalizeElectricalCandidateTableColumnSettings(
  value: unknown,
): ElectricalCandidateTableColumnSettings {
  const source = isRecord(value) ? value : {};
  return {
    version: ELECTRICAL_CANDIDATE_TABLE_COLUMNS_VERSION,
    visibleOrder: normalizeVisibleOrder(source.visibleOrder, defaultVisibleKeys()),
    columns: normalizeColumns(source.columns),
  };
}

function getColumnLabelByFormat(
  labels: ElectricalColumnLabels,
  format: ElectricalTableLabelFormat,
) {
  return labels[format] || labels.full || labels.short || labels.compact;
}

function applyColumnLabelFormat<T extends ElectricalCandidateColumnMeta>(
  column: T,
  format?: ElectricalTableLabelFormat,
): T {
  if (!format) return column;
  return {
    ...column,
    title: getColumnLabelByFormat(column.labels, format),
  } as T;
}

export function getAllElectricalCandidateTableColumnMetas(
  settings: ElectricalCandidateTableColumnSettings,
  labelFormat?: ElectricalTableLabelFormat,
): ElectricalCandidateResolvedColumnMeta[] {
  const normalized = normalizeElectricalCandidateTableColumnSettings(settings);
  const visibleSet = new Set(normalized.visibleOrder);
  const orderByKey = new Map(normalized.visibleOrder.map((key, index) => [key, index + 1]));
  const catalogByKey = new Map(
    ELECTRICAL_CANDIDATE_TABLE_COLUMN_CATALOG.map((column) => [column.key, column]),
  );
  const orderedColumns = [
    ...normalized.visibleOrder
      .map((key) => catalogByKey.get(key))
      .filter((column): column is ElectricalCandidateColumnMeta => column != null),
    ...ELECTRICAL_CANDIDATE_TABLE_COLUMN_CATALOG.filter(
      (column) => !visibleSet.has(column.key),
    ),
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

export function getVisibleElectricalCandidateTableColumnMetas(
  settings: ElectricalCandidateTableColumnSettings,
  labelFormat?: ElectricalTableLabelFormat,
) {
  return getAllElectricalCandidateTableColumnMetas(settings, labelFormat).filter(
    (column) => column.visible,
  );
}

export function resetElectricalCandidateTableColumnSettings() {
  return getDefaultElectricalCandidateTableColumnSettings();
}

export function setElectricalCandidateTableColumnVisibility(
  settings: ElectricalCandidateTableColumnSettings,
  key: ElectricalCandidateColumnKey,
  visible: boolean,
) {
  const normalized = normalizeElectricalCandidateTableColumnSettings(settings);
  const column = ELECTRICAL_CANDIDATE_TABLE_COLUMN_CATALOG.find((item) => item.key === key);
  if (!column || (column.required && !visible)) return normalized;
  const current = normalized.visibleOrder.filter((item) => item !== key);
  return normalizeElectricalCandidateTableColumnSettings({
    ...normalized,
    visibleOrder: visible ? [...current, key] : current,
  });
}

export function setElectricalCandidateTableColumnWidthPct(
  settings: ElectricalCandidateTableColumnSettings,
  key: ElectricalCandidateColumnKey,
  widthPct: number,
) {
  const normalized = normalizeElectricalCandidateTableColumnSettings(settings);
  if (!normalized.columns[key]) return normalized;
  return normalizeElectricalCandidateTableColumnSettings({
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

export function resetElectricalCandidateTableColumnWidth(
  settings: ElectricalCandidateTableColumnSettings,
  key: ElectricalCandidateColumnKey,
) {
  const column = ELECTRICAL_CANDIDATE_TABLE_COLUMN_CATALOG.find((item) => item.key === key);
  if (!column) return normalizeElectricalCandidateTableColumnSettings(settings);
  return setElectricalCandidateTableColumnWidthPct(settings, key, column.defaultWidthPct);
}

export function moveElectricalCandidateTableColumnToOrder(
  settings: ElectricalCandidateTableColumnSettings,
  key: ElectricalCandidateColumnKey,
  order: number,
) {
  const normalized = normalizeElectricalCandidateTableColumnSettings(settings);
  if (!normalized.visibleOrder.includes(key)) return normalized;
  const nextOrder = Math.max(1, Math.min(normalized.visibleOrder.length, Math.round(order)));
  const withoutKey = normalized.visibleOrder.filter((item) => item !== key);
  withoutKey.splice(nextOrder - 1, 0, key);
  return normalizeElectricalCandidateTableColumnSettings({
    ...normalized,
    visibleOrder: withoutKey,
  });
}

export function reorderElectricalCandidateTableColumn(
  settings: ElectricalCandidateTableColumnSettings,
  activeKey: ElectricalCandidateColumnKey,
  overKey: ElectricalCandidateColumnKey,
) {
  const normalized = normalizeElectricalCandidateTableColumnSettings(settings);
  const activeIndex = normalized.visibleOrder.indexOf(activeKey);
  const overIndex = normalized.visibleOrder.indexOf(overKey);
  if (activeIndex < 0 || overIndex < 0 || activeIndex === overIndex) return normalized;
  const nextOrder = [...normalized.visibleOrder];
  const [active] = nextOrder.splice(activeIndex, 1);
  nextOrder.splice(overIndex, 0, active);
  return normalizeElectricalCandidateTableColumnSettings({
    ...normalized,
    visibleOrder: nextOrder,
  });
}

export function createElectricalCandidateTableColumnSettingsPatch(
  settings: ElectricalCandidateTableColumnSettings,
  visibleOrder: ElectricalCandidateColumnKey[],
) {
  return normalizeElectricalCandidateTableColumnSettings({
    ...settings,
    visibleOrder,
  });
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

export function readGuestElectricalCandidateTableColumnSettings() {
  const stored = readStorageJson(ELECTRICAL_GUEST_CANDIDATE_TABLE_COLUMN_STORAGE_KEY);
  return stored
    ? normalizeElectricalCandidateTableColumnSettings(stored)
    : getDefaultElectricalCandidateTableColumnSettings();
}

export function writeGuestElectricalCandidateTableColumnSettings(
  settings: ElectricalCandidateTableColumnSettings,
) {
  if (typeof localStorage === 'undefined') return;
  localStorage.setItem(
    ELECTRICAL_GUEST_CANDIDATE_TABLE_COLUMN_STORAGE_KEY,
    JSON.stringify(normalizeElectricalCandidateTableColumnSettings(settings)),
  );
}

export function readRegisteredElectricalCandidateTableColumnCache(userId?: string | null) {
  if (!userId) return null;
  const stored = readStorageJson(ELECTRICAL_REGISTERED_CANDIDATE_TABLE_COLUMN_CACHE_KEY);
  if (!isRecord(stored) || stored.userId !== userId) return null;
  return normalizeElectricalCandidateTableColumnSettings(stored.settings);
}

export function writeRegisteredElectricalCandidateTableColumnCache(
  userId: string,
  settings: ElectricalCandidateTableColumnSettings,
) {
  if (typeof localStorage === 'undefined') return;
  const payload: RegisteredElectricalCandidateTableColumnCache = {
    userId,
    settings: normalizeElectricalCandidateTableColumnSettings(settings),
    cachedAt: new Date().toISOString(),
  };
  localStorage.setItem(
    ELECTRICAL_REGISTERED_CANDIDATE_TABLE_COLUMN_CACHE_KEY,
    JSON.stringify(payload),
  );
}

export function clearRegisteredElectricalCandidateTableColumnCache(userId?: string | null) {
  if (typeof localStorage === 'undefined') return;
  if (!userId) {
    localStorage.removeItem(ELECTRICAL_REGISTERED_CANDIDATE_TABLE_COLUMN_CACHE_KEY);
    return;
  }
  const stored = readStorageJson(ELECTRICAL_REGISTERED_CANDIDATE_TABLE_COLUMN_CACHE_KEY);
  if (!isRecord(stored) || stored.userId === userId) {
    localStorage.removeItem(ELECTRICAL_REGISTERED_CANDIDATE_TABLE_COLUMN_CACHE_KEY);
  }
}

export {
  ELECTRICAL_TABLE_COLUMN_MAX_WIDTH_PCT,
  ELECTRICAL_TABLE_COLUMN_MIN_WIDTH_PCT,
  electricalTableColumnWidthPctToPx,
};
