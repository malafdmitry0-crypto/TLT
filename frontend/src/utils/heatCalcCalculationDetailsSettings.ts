export type HeatCalcCalculationDetailPreset = 'brief' | 'standard' | 'detailed' | 'custom';

export type HeatCalcCalculationDetailMetric =
  | 'delta_t'
  | 'applied_alpha_vnesh'
  | 'applied_safety_factor'
  | 'insulation_resistance'
  | 'external_resistance'
  | 'ground_resistance'
  | 'effective_length'
  | 'surface_area'
  | 'wall_resistance'
  | 'thermal_resistance'
  | 'wind_speed'
  | 'temperature_source'
  | 'wind_speed_source'
  | 'air_surface_area'
  | 'ground_surface_area'
  | 'ground_conductivity';

export interface HeatCalcCalculationDetailsSettings {
  version: number;
  preset: HeatCalcCalculationDetailPreset;
  visibleMetrics: HeatCalcCalculationDetailMetric[];
}

interface RegisteredCalculationDetailsCache {
  userId: string;
  settings: HeatCalcCalculationDetailsSettings;
  cachedAt: string;
}

export const HEATCALC_CALCULATION_DETAILS_VERSION = 1;
export const HEATCALC_CALCULATION_DETAILS_PREF_KEY = 'heatcalc.calculationDetails.v1';
export const HEATCALC_GUEST_CALCULATION_DETAILS_STORAGE_KEY = 'heatcalc.calculationDetails.v1.guest';
export const HEATCALC_REGISTERED_CALCULATION_DETAILS_CACHE_KEY = 'heatcalc.calculationDetails.v1.registered.cache';

export const HEATCALC_CALCULATION_DETAIL_PRESETS: Array<{
  key: HeatCalcCalculationDetailPreset;
  label: string;
}> = [
  { key: 'brief', label: 'Кратко' },
  { key: 'standard', label: 'Стандарт' },
  { key: 'detailed', label: 'Подробно' },
  { key: 'custom', label: 'Свой' },
];

export const HEATCALC_CALCULATION_DETAIL_METRIC_OPTIONS: Array<{
  key: HeatCalcCalculationDetailMetric;
  label: string;
}> = [
  { key: 'delta_t', label: 'ΔT' },
  { key: 'applied_alpha_vnesh', label: 'α примен.' },
  { key: 'applied_safety_factor', label: 'Kзап примен.' },
  { key: 'insulation_resistance', label: 'Rиз' },
  { key: 'external_resistance', label: 'Rвнеш/гр' },
  { key: 'ground_resistance', label: 'Rгр' },
  { key: 'effective_length', label: 'Lэфф' },
  { key: 'surface_area', label: 'Sпов.' },
  { key: 'wall_resistance', label: 'Rст' },
  { key: 'thermal_resistance', label: 'RΣ' },
  { key: 'wind_speed', label: 'Ветер' },
  { key: 'temperature_source', label: 'Источник T окр.' },
  { key: 'wind_speed_source', label: 'Источник ветра' },
  { key: 'air_surface_area', label: 'Sвозд' },
  { key: 'ground_surface_area', label: 'Sгр' },
  { key: 'ground_conductivity', label: 'λгр' },
];

const PRESET_METRICS: Record<
  Exclude<HeatCalcCalculationDetailPreset, 'custom'>,
  HeatCalcCalculationDetailMetric[]
> = {
  brief: [
    'delta_t',
    'applied_alpha_vnesh',
    'applied_safety_factor',
    'insulation_resistance',
    'effective_length',
    'surface_area',
  ],
  standard: [
    'delta_t',
    'applied_alpha_vnesh',
    'applied_safety_factor',
    'insulation_resistance',
    'external_resistance',
    'ground_resistance',
    'effective_length',
    'surface_area',
  ],
  detailed: [
    'delta_t',
    'applied_alpha_vnesh',
    'applied_safety_factor',
    'insulation_resistance',
    'external_resistance',
    'ground_resistance',
    'effective_length',
    'surface_area',
    'wall_resistance',
    'thermal_resistance',
    'wind_speed',
    'temperature_source',
    'wind_speed_source',
    'air_surface_area',
    'ground_surface_area',
    'ground_conductivity',
  ],
};

const ALL_METRIC_KEYS = new Set(HEATCALC_CALCULATION_DETAIL_METRIC_OPTIONS.map((option) => option.key));

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function uniqueMetrics(metrics: unknown): HeatCalcCalculationDetailMetric[] {
  if (!Array.isArray(metrics)) return [];
  const result: HeatCalcCalculationDetailMetric[] = [];
  for (const metric of metrics) {
    if (typeof metric !== 'string' || !ALL_METRIC_KEYS.has(metric as HeatCalcCalculationDetailMetric)) continue;
    if (!result.includes(metric as HeatCalcCalculationDetailMetric)) {
      result.push(metric as HeatCalcCalculationDetailMetric);
    }
  }
  return result;
}

function sameMetricSet(
  left: HeatCalcCalculationDetailMetric[],
  right: HeatCalcCalculationDetailMetric[],
) {
  return left.length === right.length && left.every((metric) => right.includes(metric));
}

function presetForMetrics(metrics: HeatCalcCalculationDetailMetric[]): HeatCalcCalculationDetailPreset {
  for (const [preset, presetMetrics] of Object.entries(PRESET_METRICS)) {
    if (sameMetricSet(metrics, presetMetrics)) return preset as HeatCalcCalculationDetailPreset;
  }
  return 'custom';
}

function normalizePreset(value: unknown): HeatCalcCalculationDetailPreset {
  return value === 'brief' || value === 'standard' || value === 'detailed' || value === 'custom'
    ? value
    : 'standard';
}

export function getCalculationDetailPresetMetrics(
  preset: HeatCalcCalculationDetailPreset,
): HeatCalcCalculationDetailMetric[] {
  if (preset === 'custom') return [...PRESET_METRICS.standard];
  return [...PRESET_METRICS[preset]];
}

export function getDefaultCalculationDetailsSettings(): HeatCalcCalculationDetailsSettings {
  return {
    version: HEATCALC_CALCULATION_DETAILS_VERSION,
    preset: 'standard',
    visibleMetrics: getCalculationDetailPresetMetrics('standard'),
  };
}

export function normalizeCalculationDetailsSettings(value: unknown): HeatCalcCalculationDetailsSettings {
  if (!isRecord(value)) return getDefaultCalculationDetailsSettings();
  const preset = normalizePreset(value.preset);
  const hasVisibleMetrics = Array.isArray(value.visibleMetrics);
  const rawMetrics = uniqueMetrics(value.visibleMetrics);
  const visibleMetrics = hasVisibleMetrics
    ? rawMetrics
    : getCalculationDetailPresetMetrics(preset === 'custom' ? 'standard' : preset);
  return {
    version: HEATCALC_CALCULATION_DETAILS_VERSION,
    preset: hasVisibleMetrics ? presetForMetrics(visibleMetrics) : preset,
    visibleMetrics,
  };
}

export function setCalculationDetailsPreset(
  settings: HeatCalcCalculationDetailsSettings,
  preset: HeatCalcCalculationDetailPreset,
) {
  if (preset === 'custom') {
    return {
      ...normalizeCalculationDetailsSettings(settings),
      preset: 'custom' as HeatCalcCalculationDetailPreset,
    };
  }
  return normalizeCalculationDetailsSettings({
    version: HEATCALC_CALCULATION_DETAILS_VERSION,
    preset,
    visibleMetrics: getCalculationDetailPresetMetrics(preset),
  });
}

export function setCalculationDetailsMetrics(
  settings: HeatCalcCalculationDetailsSettings,
  metrics: HeatCalcCalculationDetailMetric[],
) {
  const visibleMetrics = uniqueMetrics(metrics);
  return normalizeCalculationDetailsSettings({
    ...settings,
    preset: presetForMetrics(visibleMetrics),
    visibleMetrics,
  });
}

export function isDefaultCalculationDetailsSettings(settings: HeatCalcCalculationDetailsSettings) {
  const normalized = normalizeCalculationDetailsSettings(settings);
  const defaults = getDefaultCalculationDetailsSettings();
  return normalized.preset === defaults.preset
    && sameMetricSet(normalized.visibleMetrics, defaults.visibleMetrics);
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

export function readGuestCalculationDetailsSettings() {
  const stored = readStorageJson(HEATCALC_GUEST_CALCULATION_DETAILS_STORAGE_KEY);
  return stored ? normalizeCalculationDetailsSettings(stored) : getDefaultCalculationDetailsSettings();
}

export function writeGuestCalculationDetailsSettings(settings: HeatCalcCalculationDetailsSettings) {
  if (typeof localStorage === 'undefined') return;
  localStorage.setItem(
    HEATCALC_GUEST_CALCULATION_DETAILS_STORAGE_KEY,
    JSON.stringify(normalizeCalculationDetailsSettings(settings)),
  );
}

export function clearGuestCalculationDetailsSettings() {
  if (typeof localStorage === 'undefined') return;
  localStorage.removeItem(HEATCALC_GUEST_CALCULATION_DETAILS_STORAGE_KEY);
}

export function readRegisteredCalculationDetailsCache(userId?: string | null) {
  if (!userId) return null;
  const stored = readStorageJson(HEATCALC_REGISTERED_CALCULATION_DETAILS_CACHE_KEY);
  if (!isRecord(stored) || stored.userId !== userId) return null;
  return normalizeCalculationDetailsSettings(stored.settings);
}

export function writeRegisteredCalculationDetailsCache(
  userId: string,
  settings: HeatCalcCalculationDetailsSettings,
) {
  if (typeof localStorage === 'undefined') return;
  const payload: RegisteredCalculationDetailsCache = {
    userId,
    settings: normalizeCalculationDetailsSettings(settings),
    cachedAt: new Date().toISOString(),
  };
  localStorage.setItem(HEATCALC_REGISTERED_CALCULATION_DETAILS_CACHE_KEY, JSON.stringify(payload));
}

export function clearRegisteredCalculationDetailsCache(userId?: string | null) {
  if (typeof localStorage === 'undefined') return;
  if (!userId) {
    localStorage.removeItem(HEATCALC_REGISTERED_CALCULATION_DETAILS_CACHE_KEY);
    return;
  }
  const stored = readStorageJson(HEATCALC_REGISTERED_CALCULATION_DETAILS_CACHE_KEY);
  if (!isRecord(stored) || stored.userId === userId) {
    localStorage.removeItem(HEATCALC_REGISTERED_CALCULATION_DETAILS_CACHE_KEY);
  }
}
