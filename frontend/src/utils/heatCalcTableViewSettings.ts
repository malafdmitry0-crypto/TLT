import defaultConfig from '@/config/heatcalc-table-view.default.json';

export type HeatCalcTableFontSize = 'compact' | 'standard' | 'comfortable' | 'large';
export type HeatCalcFormPlacement = 'top' | 'bottom' | 'left' | 'right';
export type HeatCalcTableLabelFormat = 'full' | 'short' | 'compact';

export interface HeatCalcTableViewSettings {
  version: number;
  fontSize: HeatCalcTableFontSize;
  tableLabelFormat: HeatCalcTableLabelFormat;
  settingsLabelFormat: HeatCalcTableLabelFormat;
  formPlacement: HeatCalcFormPlacement;
  sideFormWidthPct: number;
  formSectionWeights: HeatCalcFormSectionWeights;
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

export const HEATCALC_TABLE_VIEW_VERSION = 2;
export const HEATCALC_TABLE_VIEW_PREF_KEY = 'heatcalc.tableView.v2';
export const HEATCALC_GUEST_TABLE_VIEW_STORAGE_KEY = 'heatcalc.tableView.v2.guest';
export const HEATCALC_REGISTERED_TABLE_VIEW_CACHE_KEY = 'heatcalc.tableView.v2.registered.cache';
export const HEATCALC_SIDE_FORM_WIDTH_DEFAULT = 34;
export const HEATCALC_SIDE_FORM_WIDTH_MIN = 22;
export const HEATCALC_SIDE_FORM_WIDTH_MAX = 62;
export const HEATCALC_FORM_SECTION_WEIGHTS_DEFAULT = [1.655, 1.35, 1.2] as const;
export const HEATCALC_FORM_SECTION_WEIGHT_MIN = 0.35;
export const HEATCALC_FORM_SECTION_WEIGHT_MAX = 3;
export const HEATCALC_FORCED_TABLE_FONT_SIZE: HeatCalcTableFontSize = 'compact';
export type HeatCalcFormSectionWeights = [number, number, number];
export const HEATCALC_FORM_PLACEMENT_OPTIONS: Array<{ key: HeatCalcFormPlacement; label: string }> = [
  { key: 'top', label: 'Вверху' },
  { key: 'bottom', label: 'Внизу' },
  { key: 'left', label: 'Слева' },
  { key: 'right', label: 'Справа' },
];
export const HEATCALC_TABLE_LABEL_FORMAT_OPTIONS: Array<{ key: HeatCalcTableLabelFormat; label: string }> = [
  { key: 'full', label: 'Полные' },
  { key: 'short', label: 'Краткие' },
  { key: 'compact', label: 'Компактные' },
];

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
      { key: HEATCALC_FORCED_TABLE_FONT_SIZE, label: 'Компактный', fontSizePx: 10, lineHeight: 1.18, cellPaddingY: 1 },
    ];
}

export const HEATCALC_TABLE_FONT_SIZE_OPTIONS: HeatCalcResolvedTableFontSize[] = configuredFontSizeOptions();

const FONT_SIZE_BY_KEY = new Map<HeatCalcTableFontSize, HeatCalcResolvedTableFontSize>(
  HEATCALC_TABLE_FONT_SIZE_OPTIONS.map((option) => [option.key, option]),
);

function defaultFontSize(): HeatCalcTableFontSize {
  return HEATCALC_FORCED_TABLE_FONT_SIZE;
}

function normalizeFontSize(value: unknown): HeatCalcTableFontSize {
  void value;
  return HEATCALC_FORCED_TABLE_FONT_SIZE;
}

function normalizeFormPlacement(value: unknown): HeatCalcFormPlacement {
  return value === 'bottom' || value === 'left' || value === 'right' || value === 'top'
    ? value
    : 'top';
}

function normalizeLabelFormat(value: unknown, fallback: HeatCalcTableLabelFormat): HeatCalcTableLabelFormat {
  return value === 'full' || value === 'short' || value === 'compact'
    ? value
    : fallback;
}

function normalizeSideFormWidthPct(value: unknown): number {
  if (typeof value === 'boolean') return HEATCALC_SIDE_FORM_WIDTH_DEFAULT;
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) return HEATCALC_SIDE_FORM_WIDTH_DEFAULT;
  const clamped = Math.min(
    HEATCALC_SIDE_FORM_WIDTH_MAX,
    Math.max(HEATCALC_SIDE_FORM_WIDTH_MIN, numeric),
  );
  return Math.round(clamped * 10) / 10;
}

export function normalizeFormSectionWeights(value: unknown): HeatCalcFormSectionWeights {
  if (!Array.isArray(value)) {
    return [...HEATCALC_FORM_SECTION_WEIGHTS_DEFAULT] as HeatCalcFormSectionWeights;
  }
  const rawWeights = value.length === HEATCALC_FORM_SECTION_WEIGHTS_DEFAULT.length
    ? value
    : value.length === 4
      ? [Number(value[0]) + Number(value[3]), value[1], value[2]]
      : null;
  if (!rawWeights) {
    return [...HEATCALC_FORM_SECTION_WEIGHTS_DEFAULT] as HeatCalcFormSectionWeights;
  }
  const normalized = rawWeights.map((item) => {
    const numeric = Number(item);
    if (!Number.isFinite(numeric)) return null;
    const clamped = Math.min(
      HEATCALC_FORM_SECTION_WEIGHT_MAX,
      Math.max(HEATCALC_FORM_SECTION_WEIGHT_MIN, numeric),
    );
    return Math.round(clamped * 1000) / 1000;
  });
  if (normalized.some((item) => item == null)) {
    return [...HEATCALC_FORM_SECTION_WEIGHTS_DEFAULT] as HeatCalcFormSectionWeights;
  }
  return normalized as HeatCalcFormSectionWeights;
}

export function areFormSectionWeightsEqual(
  left: HeatCalcFormSectionWeights,
  right: HeatCalcFormSectionWeights,
) {
  return left.length === right.length && left.every((value, index) => value === right[index]);
}

export function getDefaultTableViewSettings(): HeatCalcTableViewSettings {
  return {
    version: HEATCALC_TABLE_VIEW_VERSION,
    fontSize: defaultFontSize(),
    tableLabelFormat: 'short',
    settingsLabelFormat: 'full',
    formPlacement: 'top',
    sideFormWidthPct: HEATCALC_SIDE_FORM_WIDTH_DEFAULT,
    formSectionWeights: [...HEATCALC_FORM_SECTION_WEIGHTS_DEFAULT] as HeatCalcFormSectionWeights,
  };
}

export function normalizeTableViewSettings(value: unknown): HeatCalcTableViewSettings {
  const source = isRecord(value) ? value : {};
  return {
    version: HEATCALC_TABLE_VIEW_VERSION,
    fontSize: normalizeFontSize(source.fontSize),
    tableLabelFormat: normalizeLabelFormat(source.tableLabelFormat, 'short'),
    settingsLabelFormat: normalizeLabelFormat(source.settingsLabelFormat, 'full'),
    formPlacement: normalizeFormPlacement(source.formPlacement),
    sideFormWidthPct: normalizeSideFormWidthPct(source.sideFormWidthPct),
    formSectionWeights: normalizeFormSectionWeights(source.formSectionWeights),
  };
}

export function isDefaultTableViewSettings(settings: HeatCalcTableViewSettings) {
  const normalized = normalizeTableViewSettings(settings);
  const defaults = getDefaultTableViewSettings();
  return normalized.fontSize === defaults.fontSize
    && normalized.tableLabelFormat === defaults.tableLabelFormat
    && normalized.settingsLabelFormat === defaults.settingsLabelFormat
    && normalized.formPlacement === defaults.formPlacement
    && normalized.sideFormWidthPct === defaults.sideFormWidthPct
    && areFormSectionWeightsEqual(normalized.formSectionWeights, defaults.formSectionWeights);
}

export function resolveTableFontSize(
  settings: HeatCalcTableViewSettings,
): HeatCalcResolvedTableFontSize {
  const normalized = normalizeTableViewSettings(settings);
  return resolveTableFontSizeByKey(normalized.fontSize);
}

export function resolveTableFontSizeByKey(
  fontSize: string | null | undefined,
): HeatCalcResolvedTableFontSize {
  return FONT_SIZE_BY_KEY.get(fontSize as HeatCalcTableFontSize) ?? FONT_SIZE_BY_KEY.get(defaultFontSize()) ?? {
    key: HEATCALC_FORCED_TABLE_FONT_SIZE,
    label: 'Компактный',
    fontSizePx: 10,
    lineHeight: 1.18,
    cellPaddingY: 1,
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
