import type { CableSource } from '@/api/calculations';

export type CableCatalogRow = {
  model?: string | null;
  brand?: string | null;
  source?: string | null;
  cable_type?: string | null;
  series?: string | null;
  power_per_meter?: number | null;
  nominal_power?: number | null;
  q1?: number | null;
  q2?: number | null;
  voltage?: number | null;
  max_temperature?: number | null;
  min_temperature?: number | null;
  max_product_temp?: number | null;
  max_vapor_temp?: number | null;
  resistance_per_meter?: number | null;
  resistance_ohm_km?: number | null;
  conductor_section_mm2?: number | null;
  conductor_cross_section?: number | null;
  diameter_mm?: number | null;
  nominal_size_mm?: string | number | null;
  params?: Record<string, unknown> | null;
};

const CABLE_TECHNICAL_KEYS = [
  'model',
  'brand',
  'series',
  'power_per_meter',
  'nominal_power',
  'q1',
  'q2',
  'voltage',
  'min_temperature',
  'max_temperature',
  'max_product_temp',
  'max_vapor_temp',
  'resistance_ohm_km',
  'conductor_section_mm2',
  'diameter_mm',
  'nominal_size_mm',
] as const;

const COPPER_RESISTANCE_OHM_MM2_KM = 17.5;

function finiteNumber(value: unknown): number | null {
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (typeof value === 'string' && value.trim() !== '') {
    const parsed = Number(value.replace(',', '.'));
    return Number.isFinite(parsed) ? parsed : null;
  }
  return null;
}

function conductorSectionFromModel(model: unknown): number | null {
  const text = String(model ?? '').toLowerCase();
  const markerIndex = [...text].findIndex((char) => char === 'х' || char === 'x' || char === '×');
  if (markerIndex < 0) return null;
  const tail = text.slice(markerIndex + 1).trimStart();
  let value = '';
  for (const char of tail) {
    if ((char >= '0' && char <= '9') || char === '.' || char === ',') {
      value += char;
      continue;
    }
    break;
  }
  return finiteNumber(value);
}

function normalizedTechnicalValue(
  row: CableCatalogRow,
  params: Record<string, unknown>,
  key: (typeof CABLE_TECHNICAL_KEYS)[number],
) {
  if (key === 'resistance_ohm_km') {
    const direct = finiteNumber(row.resistance_ohm_km ?? params.resistance_ohm_km);
    if (direct !== null) return direct;
    const perMeter = finiteNumber(row.resistance_per_meter ?? params.resistance_per_meter);
    if (perMeter !== null) return perMeter * 1000;
    const conductorSection = finiteNumber(
      row.conductor_section_mm2
        ?? row.conductor_cross_section
        ?? params.conductor_section_mm2
        ?? params.conductor_cross_section
        ?? params.cross_section
        ?? conductorSectionFromModel(row.model),
    );
    return conductorSection === null || conductorSection <= 0
      ? undefined
      : COPPER_RESISTANCE_OHM_MM2_KM / conductorSection;
  }
  if (key === 'conductor_section_mm2') {
    return row.conductor_section_mm2
      ?? row.conductor_cross_section
      ?? params.conductor_section_mm2
      ?? params.conductor_cross_section
      ?? params.cross_section
      ?? conductorSectionFromModel(row.model);
  }
  const source = row as Record<string, unknown>;
  return source[key] ?? params[key];
}

export function cableTechnicalSignature(row: CableCatalogRow | null | undefined) {
  if (!row) return '';
  const params =
    typeof row.params === 'object' && row.params !== null && !Array.isArray(row.params)
      ? row.params
      : {};
  const technical: Record<string, unknown> = {};
  for (const key of CABLE_TECHNICAL_KEYS) {
    const value = normalizedTechnicalValue(row, params, key);
    if (value === null || value === undefined || value === '') continue;
    technical[key] = typeof value === 'number' ? Number(value.toFixed(8)) : value;
  }
  return JSON.stringify(technical);
}

export function hasIdenticalBuiltinCable(
  row: CableCatalogRow,
  builtinRows: CableCatalogRow[],
) {
  if (row.source !== 'extended' || !row.model) return false;
  const signature = cableTechnicalSignature(row);
  return builtinRows.some((builtin) =>
    builtin.model === row.model && cableTechnicalSignature(builtin) === signature);
}

export function shouldShowExternalCableLabel(
  row: CableCatalogRow,
  builtinRows: CableCatalogRow[],
  source: CableSource,
) {
  return source === 'all'
    && row.source === 'extended'
    && !hasIdenticalBuiltinCable(row, builtinRows);
}

export function comparisonBuiltinRowsForSource<TRow extends CableCatalogRow>(
  rows: TRow[],
  builtinRows: CableCatalogRow[],
  source: CableSource,
) {
  if (source !== 'all' || builtinRows.length > 0) return builtinRows;
  return rows.filter((row) => row.source === 'builtin');
}

export function externalLabelSourceForCableRow<TRow extends CableCatalogRow>(
  row: TRow,
  rows: TRow[],
  builtinRows: CableCatalogRow[],
  source: CableSource,
) {
  return shouldShowExternalCableLabel(
    row,
    comparisonBuiltinRowsForSource(rows, builtinRows, source),
    source,
  )
    ? 'extended'
    : null;
}

export function visibleCableRowsForSource<TRow extends CableCatalogRow>(
  rows: TRow[],
  builtinRows: CableCatalogRow[],
  source: CableSource,
) {
  if (source !== 'all') return rows;
  const comparisonBuiltinRows = comparisonBuiltinRowsForSource(rows, builtinRows, source);
  return rows.filter((row) => !hasIdenticalBuiltinCable(row, comparisonBuiltinRows));
}
