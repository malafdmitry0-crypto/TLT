/**
 * Map BE GET /calc/cable-options → mark-select options (E7 / FE-25).
 */
import type { CableOptionOut } from '@/api/calculations';
import {
  cableMarkOptionValue,
  type CableMarkSelectOption,
} from '@/pages/electrical/elecCalcCableOptionModel';

const REASON_LABELS: Record<string, string> = {
  ELECTRICAL_CABLE_SERIES_MISMATCH: 'серия не подходит',
  ELECTRICAL_CABLE_POWER_CURVE_INVALID: 'некорректная кривая мощности',
  ELECTRICAL_CABLE_POWER_NON_POSITIVE: 'мощность при T3 ≤ 0',
  ELECTRICAL_POWER_CATALOG_PROVISIONAL: 'каталог provisional',
  ELECTRICAL_CATALOG_ROW_INVALID: 'строка каталога некорректна',
};

export function cableOptionUnavailableLabel(reason: string | null | undefined): string | null {
  if (!reason) return null;
  return REASON_LABELS[reason] ?? reason;
}

export function formatCableOptionSearchLabel(option: CableOptionOut): string {
  const mark = option.full_mark_preview || option.model || '—';
  const series = option.series ?? '—';
  const power = option.power_at_t3_w_per_m;
  const powerText = typeof power === 'number' && Number.isFinite(power)
    ? `${power.toFixed(2)} Вт/м @T3`
    : '—';
  const reason = !option.eligible
    ? cableOptionUnavailableLabel(option.unavailable_reason)
    : null;
  const base = `${mark} · ${series} · ${powerText}`;
  return reason ? `${base} · ${reason}` : base;
}

/** Base model for select-cable API (no -СТ/-СР suffix). */
export function cableOptionSelectMark(option: CableOptionOut): string | null {
  const base = (option.base_model || option.model || '').trim();
  return base || null;
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
