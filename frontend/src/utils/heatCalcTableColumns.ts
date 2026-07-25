/**
 * Public heat-calc table column settings API: mutators + compatibility re-exports.
 */
import {
  clampTableColumnWidthPct,
  defaultColumnWidthPct,
  defaultTypeSettings,
  getTableColumnMeta,
  getVisibleTableColumnMetas,
  normalizeTableColumnSettings,
  normalizeVisibleOrder,
  type HeatCalcColumnKey,
  type HeatCalcTableColumnScope,
  type HeatCalcTableColumnSettings,
} from '@/utils/heatCalcTableColumnNormalizeModel';

export type {
  HeatCalcObjectType,
  HeatCalcTableColumnScope,
  HeatCalcColumnKey,
  HeatCalcColumnLabels,
  HeatCalcColumnMeta,
  HeatCalcColumnLayout,
  HeatCalcTableColumnTypeSettings,
  HeatCalcTableColumnSettings,
  HeatCalcResolvedColumnMeta,
} from '@/utils/heatCalcTableColumnNormalizeModel';

export {
  HEATCALC_TABLE_COLUMNS_VERSION,
  HEATCALC_TABLE_COLUMN_PREF_KEY,
  HEATCALC_GUEST_TABLE_COLUMN_STORAGE_KEY,
  HEATCALC_REGISTERED_TABLE_COLUMN_CACHE_KEY,
  HEATCALC_TABLE_COLUMN_WIDTH_BASE_PX,
  HEATCALC_TABLE_COLUMN_MIN_WIDTH_PCT,
  HEATCALC_TABLE_COLUMN_MAX_WIDTH_PCT,
  HEATCALC_ALL_OBJECT_COLUMN_KEYS,
  HEATCALC_TABLE_COLUMN_CATALOG,
  clampTableColumnWidthPct,
  tableColumnWidthPxToPct,
  tableColumnWidthPctToPx,
  getAvailableTableColumnKeys,
  getDefaultTableColumnSettings,
  normalizeVisibleTableColumnKeys,
  normalizeTableColumnSettings,
  getTableColumnMeta,
  getAllTableColumnMetas,
  getVisibleTableColumnMetas,
  getDefaultVisibleTableColumnKeys,
} from '@/utils/heatCalcTableColumnNormalizeModel';

export {
  readGuestTableColumnSettings,
  writeGuestTableColumnSettings,
  readRegisteredTableColumnCache,
  writeRegisteredTableColumnCache,
  clearRegisteredTableColumnCache,
} from '@/utils/heatCalcTableColumnStorage';

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
