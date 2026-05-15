import defaultConfig from '@/config/heatcalc-table-view.default.json';

export type ElectricalTableFontSize = 'compact' | 'standard' | 'comfortable' | 'large';
export type ElectricalTableLabelFormat = 'full' | 'short' | 'compact';

export interface ElectricalTableViewSettings {
  version: number;
  fontSize: ElectricalTableFontSize;
  tableLabelFormat: ElectricalTableLabelFormat;
  settingsLabelFormat: ElectricalTableLabelFormat;
}

export interface ElectricalResolvedTableFontSize {
  key: ElectricalTableFontSize;
  label: string;
  fontSizePx: number;
  lineHeight: number;
  cellPaddingY: number;
}

interface RegisteredElectricalTableViewCache {
  userId: string;
  settings: ElectricalTableViewSettings;
  cachedAt: string;
}

export const ELECTRICAL_TABLE_VIEW_VERSION = 1;
export const ELECTRICAL_TABLE_VIEW_PREF_KEY = 'electrical.tableView.v1';
export const ELECTRICAL_GUEST_TABLE_VIEW_STORAGE_KEY = 'electrical.tableView.v1.guest';
export const ELECTRICAL_REGISTERED_TABLE_VIEW_CACHE_KEY =
  'electrical.tableView.v1.registered.cache';

export const ELECTRICAL_TABLE_LABEL_FORMAT_OPTIONS: Array<{
  key: ElectricalTableLabelFormat;
  label: string;
}> = [
  { key: 'full', label: 'Полные' },
  { key: 'short', label: 'Краткие' },
  { key: 'compact', label: 'Компактные' },
];

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function normalizeFontSizeOption(
  key: string,
  value: unknown,
): ElectricalResolvedTableFontSize | null {
  if (key !== 'compact' && key !== 'standard' && key !== 'comfortable' && key !== 'large') return null;
  if (!isRecord(value)) return null;
  return {
    key,
    label: typeof value.label === 'string' ? value.label : key,
    fontSizePx: Number.isFinite(Number(value.fontSizePx)) ? Number(value.fontSizePx) : 12,
    lineHeight: Number.isFinite(Number(value.lineHeight)) ? Number(value.lineHeight) : 1.22,
    cellPaddingY: Number.isFinite(Number(value.cellPaddingY)) ? Number(value.cellPaddingY) : 2,
  };
}

function configuredFontSizeOptions(): ElectricalResolvedTableFontSize[] {
  const rawFontSizes = isRecord(defaultConfig.fontSizes) ? defaultConfig.fontSizes : {};
  const options = Object.entries(rawFontSizes)
    .map(([key, value]) => normalizeFontSizeOption(key, value))
    .filter((option): option is ElectricalResolvedTableFontSize => option != null);
  return options.length > 0
    ? options
    : [
      { key: 'standard', label: 'Стандартный', fontSizePx: 12, lineHeight: 1.22, cellPaddingY: 2 },
    ];
}

export const ELECTRICAL_TABLE_FONT_SIZE_OPTIONS: ElectricalResolvedTableFontSize[] =
  configuredFontSizeOptions();

const FONT_SIZE_BY_KEY = new Map<ElectricalTableFontSize, ElectricalResolvedTableFontSize>(
  ELECTRICAL_TABLE_FONT_SIZE_OPTIONS.map((option) => [option.key, option]),
);

function defaultFontSize(): ElectricalTableFontSize {
  const configured = isRecord(defaultConfig) ? defaultConfig.defaultFontSize : null;
  if (typeof configured === 'string' && FONT_SIZE_BY_KEY.has(configured as ElectricalTableFontSize)) {
    return configured as ElectricalTableFontSize;
  }
  return ELECTRICAL_TABLE_FONT_SIZE_OPTIONS[0]?.key ?? 'standard';
}

function normalizeFontSize(value: unknown): ElectricalTableFontSize {
  return typeof value === 'string' && FONT_SIZE_BY_KEY.has(value as ElectricalTableFontSize)
    ? value as ElectricalTableFontSize
    : defaultFontSize();
}

function normalizeLabelFormat(
  value: unknown,
  fallback: ElectricalTableLabelFormat,
): ElectricalTableLabelFormat {
  return value === 'full' || value === 'short' || value === 'compact'
    ? value
    : fallback;
}

export function getDefaultElectricalTableViewSettings(): ElectricalTableViewSettings {
  return {
    version: ELECTRICAL_TABLE_VIEW_VERSION,
    fontSize: defaultFontSize(),
    tableLabelFormat: 'short',
    settingsLabelFormat: 'full',
  };
}

export function normalizeElectricalTableViewSettings(
  value: unknown,
): ElectricalTableViewSettings {
  const source = isRecord(value) ? value : {};
  return {
    version: ELECTRICAL_TABLE_VIEW_VERSION,
    fontSize: normalizeFontSize(source.fontSize),
    tableLabelFormat: normalizeLabelFormat(source.tableLabelFormat, 'short'),
    settingsLabelFormat: normalizeLabelFormat(source.settingsLabelFormat, 'full'),
  };
}

export function resolveElectricalTableFontSize(
  settings: ElectricalTableViewSettings,
): ElectricalResolvedTableFontSize {
  const normalized = normalizeElectricalTableViewSettings(settings);
  return FONT_SIZE_BY_KEY.get(normalized.fontSize) ?? FONT_SIZE_BY_KEY.get(defaultFontSize()) ?? {
    key: 'standard',
    label: 'Стандартный',
    fontSizePx: 12,
    lineHeight: 1.22,
    cellPaddingY: 2,
  };
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

export function readGuestElectricalTableViewSettings() {
  const stored = readStorageJson(ELECTRICAL_GUEST_TABLE_VIEW_STORAGE_KEY);
  return stored
    ? normalizeElectricalTableViewSettings(stored)
    : getDefaultElectricalTableViewSettings();
}

export function writeGuestElectricalTableViewSettings(settings: ElectricalTableViewSettings) {
  if (typeof localStorage === 'undefined') return;
  localStorage.setItem(
    ELECTRICAL_GUEST_TABLE_VIEW_STORAGE_KEY,
    JSON.stringify(normalizeElectricalTableViewSettings(settings)),
  );
}

export function readRegisteredElectricalTableViewCache(userId?: string | null) {
  if (!userId) return null;
  const stored = readStorageJson(ELECTRICAL_REGISTERED_TABLE_VIEW_CACHE_KEY);
  if (!isRecord(stored) || stored.userId !== userId) return null;
  return normalizeElectricalTableViewSettings(stored.settings);
}

export function writeRegisteredElectricalTableViewCache(
  userId: string,
  settings: ElectricalTableViewSettings,
) {
  if (typeof localStorage === 'undefined') return;
  const payload: RegisteredElectricalTableViewCache = {
    userId,
    settings: normalizeElectricalTableViewSettings(settings),
    cachedAt: new Date().toISOString(),
  };
  localStorage.setItem(ELECTRICAL_REGISTERED_TABLE_VIEW_CACHE_KEY, JSON.stringify(payload));
}

export function clearRegisteredElectricalTableViewCache(userId?: string | null) {
  if (typeof localStorage === 'undefined') return;
  if (!userId) {
    localStorage.removeItem(ELECTRICAL_REGISTERED_TABLE_VIEW_CACHE_KEY);
    return;
  }
  const stored = readStorageJson(ELECTRICAL_REGISTERED_TABLE_VIEW_CACHE_KEY);
  if (!isRecord(stored) || stored.userId === userId) {
    localStorage.removeItem(ELECTRICAL_REGISTERED_TABLE_VIEW_CACHE_KEY);
  }
}
