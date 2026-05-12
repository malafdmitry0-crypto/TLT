import defaultConfig from '@/config/heatcalc-table-view.default.json';

export type HeatCalcTableFontSize = 'compact' | 'standard' | 'comfortable' | 'large';

export interface HeatCalcTableViewSettings {
  version: number;
  fontSize: HeatCalcTableFontSize;
  inlineEditingEnabled: boolean;
}

export interface HeatCalcResolvedTableFontSize {
  key: HeatCalcTableFontSize;
  label: string;
  fontSizePx: number;
  lineHeight: number;
  cellPaddingY: number;
}

interface RegisteredTableViewCache {
  userId: string;
  settings: HeatCalcTableViewSettings;
  cachedAt: string;
}

export const HEATCALC_TABLE_VIEW_VERSION = 1;
export const HEATCALC_TABLE_VIEW_PREF_KEY = 'heatcalc.tableView.v1';
export const HEATCALC_GUEST_TABLE_VIEW_STORAGE_KEY = 'heatcalc.tableView.v1.guest';
export const HEATCALC_REGISTERED_TABLE_VIEW_CACHE_KEY = 'heatcalc.tableView.v1.registered.cache';

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function normalizeFontSizeOption(key: string, value: unknown): HeatCalcResolvedTableFontSize | null {
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

function configuredFontSizeOptions(): HeatCalcResolvedTableFontSize[] {
  const rawFontSizes = isRecord(defaultConfig.fontSizes) ? defaultConfig.fontSizes : {};
  const options = Object.entries(rawFontSizes)
    .map(([key, value]) => normalizeFontSizeOption(key, value))
    .filter((option): option is HeatCalcResolvedTableFontSize => option != null);
  return options.length > 0
    ? options
    : [
      { key: 'standard', label: 'Стандартный', fontSizePx: 12, lineHeight: 1.22, cellPaddingY: 2 },
    ];
}

export const HEATCALC_TABLE_FONT_SIZE_OPTIONS: HeatCalcResolvedTableFontSize[] = configuredFontSizeOptions();

const FONT_SIZE_BY_KEY = new Map<HeatCalcTableFontSize, HeatCalcResolvedTableFontSize>(
  HEATCALC_TABLE_FONT_SIZE_OPTIONS.map((option) => [option.key, option]),
);

function defaultFontSize(): HeatCalcTableFontSize {
  const configured = isRecord(defaultConfig) ? defaultConfig.defaultFontSize : null;
  if (typeof configured === 'string' && FONT_SIZE_BY_KEY.has(configured as HeatCalcTableFontSize)) {
    return configured as HeatCalcTableFontSize;
  }
  return HEATCALC_TABLE_FONT_SIZE_OPTIONS[0]?.key ?? 'standard';
}

function normalizeFontSize(value: unknown): HeatCalcTableFontSize {
  return typeof value === 'string' && FONT_SIZE_BY_KEY.has(value as HeatCalcTableFontSize)
    ? value as HeatCalcTableFontSize
    : defaultFontSize();
}

export function getDefaultTableViewSettings(): HeatCalcTableViewSettings {
  return {
    version: HEATCALC_TABLE_VIEW_VERSION,
    fontSize: defaultFontSize(),
    inlineEditingEnabled: false,
  };
}

export function normalizeTableViewSettings(value: unknown): HeatCalcTableViewSettings {
  const source = isRecord(value) ? value : {};
  return {
    version: HEATCALC_TABLE_VIEW_VERSION,
    fontSize: normalizeFontSize(source.fontSize),
    inlineEditingEnabled: source.inlineEditingEnabled === true,
  };
}

export function isDefaultTableViewSettings(settings: HeatCalcTableViewSettings) {
  const normalized = normalizeTableViewSettings(settings);
  const defaults = getDefaultTableViewSettings();
  return normalized.fontSize === defaults.fontSize
    && normalized.inlineEditingEnabled === defaults.inlineEditingEnabled;
}

export function resolveTableFontSize(
  settings: HeatCalcTableViewSettings,
): HeatCalcResolvedTableFontSize {
  const normalized = normalizeTableViewSettings(settings);
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

export function readGuestTableViewSettings() {
  const stored = readStorageJson(HEATCALC_GUEST_TABLE_VIEW_STORAGE_KEY);
  return stored ? normalizeTableViewSettings(stored) : getDefaultTableViewSettings();
}

export function writeGuestTableViewSettings(settings: HeatCalcTableViewSettings) {
  if (typeof localStorage === 'undefined') return;
  localStorage.setItem(
    HEATCALC_GUEST_TABLE_VIEW_STORAGE_KEY,
    JSON.stringify(normalizeTableViewSettings(settings)),
  );
}

export function clearGuestTableViewSettings() {
  if (typeof localStorage === 'undefined') return;
  localStorage.removeItem(HEATCALC_GUEST_TABLE_VIEW_STORAGE_KEY);
}

export function readRegisteredTableViewCache(userId?: string | null) {
  if (!userId) return null;
  const stored = readStorageJson(HEATCALC_REGISTERED_TABLE_VIEW_CACHE_KEY);
  if (!isRecord(stored) || stored.userId !== userId) return null;
  return normalizeTableViewSettings(stored.settings);
}

export function writeRegisteredTableViewCache(
  userId: string,
  settings: HeatCalcTableViewSettings,
) {
  if (typeof localStorage === 'undefined') return;
  const payload: RegisteredTableViewCache = {
    userId,
    settings: normalizeTableViewSettings(settings),
    cachedAt: new Date().toISOString(),
  };
  localStorage.setItem(HEATCALC_REGISTERED_TABLE_VIEW_CACHE_KEY, JSON.stringify(payload));
}

export function clearRegisteredTableViewCache(userId?: string | null) {
  if (typeof localStorage === 'undefined') return;
  if (!userId) {
    localStorage.removeItem(HEATCALC_REGISTERED_TABLE_VIEW_CACHE_KEY);
    return;
  }
  const stored = readStorageJson(HEATCALC_REGISTERED_TABLE_VIEW_CACHE_KEY);
  if (!isRecord(stored) || stored.userId === userId) {
    localStorage.removeItem(HEATCALC_REGISTERED_TABLE_VIEW_CACHE_KEY);
  }
}
