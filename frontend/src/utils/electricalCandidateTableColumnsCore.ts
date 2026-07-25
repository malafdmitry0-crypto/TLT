import {
  ELECTRICAL_TABLE_COLUMN_MAX_WIDTH_PCT,
  ELECTRICAL_TABLE_COLUMN_MIN_WIDTH_PCT,
  clampElectricalTableColumnWidthPct,
  electricalTableColumnWidthPctToPx,
  type ElectricalColumnLabels,
} from '@/utils/electricalTableColumns';
import type { ElectricalTableLabelFormat } from '@/utils/electricalTableViewSettings';
import { isRecord } from '@/utils/typeGuards';
import {
  ELECTRICAL_CANDIDATE_TABLE_COLUMN_CATALOG,
  type ElectricalCandidateColumnKey,
  type ElectricalCandidateColumnLayout,
  type ElectricalCandidateColumnMeta,
} from '@/utils/electricalCandidateTableColumnCatalog';

export type {
  ElectricalCandidateColumnKey,
  ElectricalCandidateColumnLayout,
  ElectricalCandidateColumnMeta,
} from '@/utils/electricalCandidateTableColumnCatalog';

export { ELECTRICAL_CANDIDATE_TABLE_COLUMN_CATALOG } from '@/utils/electricalCandidateTableColumnCatalog';

export interface ElectricalCandidateTableColumnSettings {
  visibleOrder: ElectricalCandidateColumnKey[];
  columns: Record<ElectricalCandidateColumnKey, ElectricalCandidateColumnLayout>;
}

export interface ElectricalCandidateResolvedColumnMeta
  extends ElectricalCandidateColumnMeta,
    ElectricalCandidateColumnLayout {
  visible: boolean;
  order?: number;
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
    visibleOrder: normalizeVisibleOrder(defaultVisibleKeys()),
    columns: normalizeColumns(null),
  };
}

export function normalizeElectricalCandidateTableColumnSettings(
  value: unknown,
): ElectricalCandidateTableColumnSettings {
  const source = isRecord(value) ? value : {};
  return {
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

export {
  ELECTRICAL_TABLE_COLUMN_MAX_WIDTH_PCT,
  ELECTRICAL_TABLE_COLUMN_MIN_WIDTH_PCT,
  electricalTableColumnWidthPctToPx,
};
