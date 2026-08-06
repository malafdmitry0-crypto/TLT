import type { ElectricalCalcSummary } from '@/types/calculation';
import type { ProjectObject } from '@/types/project';
import { formatNumber, formatPower } from '@/utils/formatters';
export { selectionPolicyText } from '@/domain/electrical/elecCalcSelectionPolicyModel';

export type CableMarkSource = 'auto' | 'manual';
export type ThreadSource = 'auto' | 'manual' | 'default' | 'previous_result';

export type ThreadSourceTag = {
  color: 'purple' | 'blue' | 'gold' | 'default';
  label: string;
  tooltip: string;
};

export function getCableMark(calc: ElectricalCalcSummary | undefined) {
  const selectedCable = calc?.results?.selected_cable;
  return calc?.cable_mark ?? (typeof selectedCable === 'string' ? selectedCable : undefined);
}

export function finiteNumber(value: unknown): number | undefined {
  if (value === null || value === undefined || value === '') return undefined;
  const numericValue = Number(value);
  return Number.isFinite(numericValue) ? numericValue : undefined;
}

export function currentElectricalCalc(calc: ElectricalCalcSummary | undefined) {
  if (!calc?.results) return undefined;
  const results = calc.results as Record<string, unknown>;
  if (
    results.error_code
    || results.category
    || results.stale === true
    || results.stale === 'true'
  ) {
    return undefined;
  }
  return getCableMark(calc) ? calc : undefined;
}

export function getCableMarkSource(calc: ElectricalCalcSummary | undefined): CableMarkSource {
  const value = calc?.cable_mark_source ?? calc?.params?.cable_mark_source;
  return value === 'manual' ? 'manual' : 'auto';
}

export function getThreadSource(calc: ElectricalCalcSummary | undefined): ThreadSource | null {
  const value = calc?.results?.number_of_threads_source ?? calc?.params?.number_of_threads_source;
  return value === 'auto'
    || value === 'manual'
    || value === 'default'
    || value === 'previous_result'
    ? value
    : null;
}

export function threadSourceTag(source: ThreadSource | null): ThreadSourceTag | null {
  if (source === 'manual') {
    return { color: 'purple', label: 'ручн.', tooltip: 'Количество ниток задано вручную' };
  }
  if (source === 'auto') {
    return { color: 'blue', label: 'авто', tooltip: 'Количество ниток подобрано алгоритмом' };
  }
  if (source === 'previous_result') {
    return { color: 'gold', label: 'пред.', tooltip: 'Количество ниток взято из предыдущего результата' };
  }
  if (source === 'default') {
    return { color: 'default', label: 'по ум.', tooltip: 'Использовано значение по умолчанию' };
  }
  return null;
}

export function calcLayoutValues(calc: ElectricalCalcSummary | undefined) {
  return {
    windingPitchMm: Number(calc?.results?.winding_pitch ?? 0),
    numberOfThreads: Number(calc?.results?.num_circuits ?? 1),
  };
}

export function valueText(value: unknown) {
  if (value === null || value === undefined || value === '') return '—';
  if (typeof value === 'boolean') return value ? 'Да' : 'Нет';
  return String(value);
}

export function numberText(value: unknown, digits = 2) {
  if (value === null || value === undefined || value === '') return formatNumber(null, digits);
  return formatNumber(Number(value), digits);
}

export function powerText(value: unknown) {
  if (value === null || value === undefined || value === '') return '—';
  return formatPower(Number(value));
}

export function resultNumber(calc: ElectricalCalcSummary | undefined, key: string, digits = 2) {
  return numberText(calc?.results?.[key], digits);
}

type ResultPath = readonly string[];

const ENGINEERING_RESULT_PATHS: Readonly<Record<string, readonly ResultPath[]>> = {
  installed_cable_length: [
    ['layout', 'actual_installed_length_m'],
    ['installed_cable_length'],
  ],
  order_cable_length: [
    ['layout', 'required_order_length_m'],
    ['order_cable_length'],
  ],
  required_installed_length_m: [
    ['layout', 'required_installed_length_m'],
    ['required_installed_length_m'],
    ['section_l_required_m'],
  ],
  section_l_max_m: [['section_plan', 'l_max_m'], ['section_l_max_m']],
  section_l_tok_m: [['section_plan', 'l_tok_m'], ['section_l_tok_m']],
  section_l_ogr_m: [['section_plan', 'l_ogr_m'], ['section_l_ogr_m']],
  section_l_excess_m: [
    ['layout', 'excess_installed_length_m'],
    ['section_l_excess_m'],
  ],
};

function resultPathValue(results: Record<string, unknown>, path: ResultPath): unknown {
  let value: unknown = results;
  for (const segment of path) {
    if (typeof value !== 'object' || value === null || Array.isArray(value)) return undefined;
    value = (value as Record<string, unknown>)[segment];
  }
  return value;
}

/** Canonical TT fields live in nested snapshots; older responses keep flat aliases. */
export function engineeringResultValueFromResults(
  results: Record<string, unknown> | null | undefined,
  key: string,
) {
  if (!results) return undefined;
  const paths = ENGINEERING_RESULT_PATHS[key] ?? [[key]];
  for (const path of paths) {
    const value = resultPathValue(results, path);
    if (value !== null && value !== undefined && value !== '') return value;
  }
  return undefined;
}

export function engineeringResultValue(calc: ElectricalCalcSummary | undefined, key: string) {
  return engineeringResultValueFromResults(calc?.results, key);
}

export function engineeringResultNumber(calc: ElectricalCalcSummary | undefined, key: string, digits = 1) {
  return numberText(engineeringResultValue(calc, key), digits);
}

export function compactProvenanceFromResults(results: Record<string, unknown> | null | undefined) {
  const raw = results?.provenance;
  if (typeof raw !== 'object' || raw === null || Array.isArray(raw)) return '—';
  const provenance = raw as Record<string, unknown>;
  const layout = results?.layout;
  const layoutRecord = typeof layout === 'object' && layout !== null && !Array.isArray(layout)
    ? layout as Record<string, unknown>
    : {};
  const rawSources = provenance.input_sources ?? results?.input_sources;
  const sources = typeof rawSources === 'object' && rawSources !== null && !Array.isArray(rawSources)
    ? rawSources as Record<string, unknown>
    : {};
  const rawCatalogs = provenance.catalogs ?? results?.catalogs;
  const catalogs = typeof rawCatalogs === 'object' && rawCatalogs !== null && !Array.isArray(rawCatalogs)
    ? rawCatalogs as Record<string, unknown>
    : {};
  const rawSectionCatalog = catalogs.section;
  const sectionCatalog = typeof rawSectionCatalog === 'object' && rawSectionCatalog !== null && !Array.isArray(rawSectionCatalog)
    ? rawSectionCatalog as Record<string, unknown>
    : {};
  const threadSource = layoutRecord.thread_selection_source ?? sources.thread_count;
  const layingSource = sources.winding_pitch_mm ?? sources.winding_coefficient;
  const catalogSource = sectionCatalog.source ?? sectionCatalog.authority;
  const catalogVersion = sectionCatalog.version ?? sectionCatalog.id;
  const formulaVersion = provenance.formula_version;
  const formulaFingerprint = provenance.formula_fingerprint;
  const formula = [
    typeof formulaVersion === 'string' ? formulaVersion : '',
    typeof formulaFingerprint === 'string' ? `fp ${formulaFingerprint.slice(0, 12)}` : '',
  ].filter(Boolean).join('; ');
  const sectionCatalogLabel = [catalogSource, catalogVersion]
    .filter((value) => value !== null && value !== undefined && value !== '')
    .join('/');
  return [
    threadSource && `нитки: ${String(threadSource)}`,
    layingSource && `укладка: ${String(layingSource)}`,
    sectionCatalogLabel && `секции: ${sectionCatalogLabel}`,
    formula && `формула: ${formula}`,
  ]
    .filter(Boolean)
    .join(' · ') || '—';
}

export function compactProvenanceValue(calc: ElectricalCalcSummary | undefined) {
  return compactProvenanceFromResults(calc?.results);
}

export function cablePowerPerMeterValue(calc: ElectricalCalcSummary | undefined) {
  return finiteNumber(calc?.results?.power_per_meter);
}

export function installedPowerPerMeterValue(calc: ElectricalCalcSummary | undefined) {
  return finiteNumber(calc?.results?.installed_power_per_meter);
}

export function orderCableLengthValue(calc: ElectricalCalcSummary | undefined) {
  return finiteNumber(engineeringResultValue(calc, 'order_cable_length'));
}

export function commercialValue(calc: ElectricalCalcSummary | undefined, key: string) {
  const commercial = calc?.results?.commercial;
  if (typeof commercial !== 'object' || commercial === null || Array.isArray(commercial)) return undefined;
  return (commercial as Record<string, unknown>)[key];
}

export function commercialNumber(calc: ElectricalCalcSummary | undefined, key: string, digits = 2) {
  return numberText(commercialValue(calc, key), digits);
}

export function objectResultNumber(obj: ProjectObject, key: string, digits = 2) {
  return numberText(obj.results?.[key], digits);
}
