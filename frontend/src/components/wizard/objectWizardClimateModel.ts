import type { ObjectType } from '@/constants/objectTypes';
import type { ClimateEntry } from '@/types/reference';

export type ClimateBasis = 't_0_92' | 't_0_98' | 't_abs_min';

export function climateKey(entry: ClimateEntry) {
  if (entry.key) return entry.key;
  return `${entry.region}|||${entry.city ?? entry.region}`;
}

function isClimateBasis(value: unknown): value is ClimateBasis {
  return value === 't_0_92' || value === 't_0_98' || value === 't_abs_min';
}

export function climateBasisLabel(basis: ClimateBasis) {
  if (basis === 't_abs_min') return 'Абс. мин.';
  if (basis === 't_0_98') return '0,98';
  return '0,92';
}

export function climateTemperature(entry: ClimateEntry, basis: ClimateBasis) {
  if (basis === 't_abs_min') return entry.t_abs_min;
  if (basis === 't_0_98') return entry.t_0_98 ?? entry.t_cold_day_0_98;
  return entry.t_0_92 ?? entry.t_cold_fiveday_0_92;
}

export function climateWind(entry: ClimateEntry) {
  return entry.wind_avg_cold ?? entry.wind_max_jan;
}

export function numericFormValue(value: unknown) {
  if (typeof value === 'number') return Number.isFinite(value) ? value : null;
  if (typeof value === 'string' && value.trim() !== '') {
    const numeric = Number(value.replace(',', '.'));
    return Number.isFinite(numeric) ? numeric : null;
  }
  return null;
}

export function climatePolicyBasisForObject(
  objectType: ObjectType,
  outerDiameterMm: number | null,
  fallback: unknown,
): ClimateBasis | undefined {
  if (objectType === 'tank') return 't_0_92';
  if (objectType === 'pipe') {
    if (outerDiameterMm != null && outerDiameterMm > 0) {
      return outerDiameterMm >= 100 ? 't_0_92' : 't_abs_min';
    }
    return isClimateBasis(fallback) ? fallback : undefined;
  }
  return undefined;
}

export function climatePolicyBasisReason(objectType: ObjectType, outerDiameterMm: number | null) {
  if (objectType === 'tank') return 'резервуар';
  if (objectType === 'pipe') {
    if (outerDiameterMm == null || outerDiameterMm <= 0) return 'задайте Ø трубы';
    return outerDiameterMm >= 100 ? 'D >= 100 мм' : 'D < 100 мм';
  }
  return 'по алгоритму';
}
