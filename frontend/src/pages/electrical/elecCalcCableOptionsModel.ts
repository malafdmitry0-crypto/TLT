/**
 * Map BE GET /calc/cable-options → mark-select options (E7 / FE-25).
 */
import type { CableOptionOut } from '@/api/calculations';
import {
  cableMarkOptionValue,
  type CableMarkSelectOption,
} from '@/pages/electrical/elecCalcCableOptionModel';

const REASON_LABELS: Record<string, string> = {
  ELECTRICAL_CABLE_TEMPERATURE_LIMIT_EXCEEDED: 'температурные пределы не подходят',
  ELECTRICAL_POWER_CATALOG_PROVISIONAL: 'каталог provisional',
  ELECTRICAL_CATALOG_ROW_INVALID: 'строка каталога некорректна',
};

export function cableOptionUnavailableLabel(reason: string | null | undefined): string | null {
  if (!reason) return null;
  return REASON_LABELS[reason] ?? reason;
}

export function formatCableOptionSearchLabel(option: CableOptionOut): string {
  const mark = option.model || '—';
  const series = option.series ?? '—';
  const power = option.passport_power_w_per_m;
  const powerText = typeof power === 'number' && Number.isFinite(power)
    ? `${power.toFixed(2)} Вт/м`
    : '—';
  const minTemperature = option.min_ambient_temperature_c;
  const minTemperatureText = typeof minTemperature === 'number' && Number.isFinite(minTemperature)
    ? `Tmin ${minTemperature.toLocaleString('ru-RU', { maximumFractionDigits: 1 })} °C`
    : 'Tmin —';
  const maxTemperature = option.max_product_temperature_c;
  const maxTemperatureText = typeof maxTemperature === 'number' && Number.isFinite(maxTemperature)
    ? `Tmax ${maxTemperature.toLocaleString('ru-RU', { maximumFractionDigits: 1 })} °C`
    : 'Tmax —';
  const reason = !option.eligible
    ? cableOptionUnavailableLabel(option.unavailable_reason)
    : null;
  const base = `${mark} · ${series} · ${powerText} · ${minTemperatureText} · ${maxTemperatureText}`;
  return reason ? `${base} · ${reason}` : base;
}

/** Exact technical full mark for select-cable API. */
export function cableOptionSelectMark(option: CableOptionOut): string | null {
  const fullMark = (option.model || '').trim();
  return fullMark || null;
}

export function mapBackendCableOptionsToSelectOptions(
  options: readonly CableOptionOut[],
): CableMarkSelectOption[] {
  return options.flatMap<CableMarkSelectOption>((option) => {
    const mark = cableOptionSelectMark(option);
    if (!mark) return [];
    const searchLabel = formatCableOptionSearchLabel(option);
    return [{
        value: cableMarkOptionValue('builtin', mark),
        label: searchLabel,
        searchLabel,
        mark,
        optionSource: 'builtin' as const,
        cableSource: 'builtin' as const,
        disabled: !option.eligible,
    }];
  });
}
