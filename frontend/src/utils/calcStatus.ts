import type { ElectricalCalcSummary } from '@/types/calculation';

const ERROR_PREFIX_RE = /^[A-Za-z_][\w.]*Error:\s*/;
const UNSUPPORTED_ERROR_CODES = new Set(['unsupported_layout']);

export type CalcIssueCategory = 'validation' | 'formula' | 'unsupported' | 'external';

function cleanCalcErrorText(value: string) {
  return value.replace(ERROR_PREFIX_RE, '').trim();
}

/**
 * Успешным электрорасчётом считается запись, в которой есть выбранная марка
 * кабеля и нет structured issue fields в `results`. Записи с ошибкой
 * создаются бэкендом, чтобы причина сбоя была видна после перезагрузки
 * страницы — но как «выполненный расчёт» они не считаются.
 */
export function isElectricalCalcSuccess(
  calc: ElectricalCalcSummary | null | undefined
): boolean {
  if (!calc) return false;
  const r = calc.results;
  if (!r) return false;
  if (
    (r as Record<string, unknown>).error_code ||
    (r as Record<string, unknown>).category ||
    (r as Record<string, unknown>).message
  ) {
    return false;
  }
  return !!(r as Record<string, unknown>).selected_cable || !!calc.cable_mark;
}

export function electricalCalcError(
  calc: ElectricalCalcSummary | null | undefined
): string | null {
  const message = calc?.results?.message;
  if (typeof message === 'string' && message.trim()) {
    return cleanCalcErrorText(message);
  }
  return null;
}

export function electricalCalcErrorCode(
  calc: ElectricalCalcSummary | null | undefined
): string | null {
  const code = calc?.results?.error_code;
  return typeof code === 'string' && code.trim() ? code : null;
}

export function electricalCalcCategory(
  calc: ElectricalCalcSummary | null | undefined
): CalcIssueCategory | 'stale' | null {
  const category = calc?.results?.category;
  if (
    category === 'validation' ||
    category === 'formula' ||
    category === 'unsupported' ||
    category === 'external' ||
    category === 'stale'
  ) {
    return category;
  }
  return null;
}

export function electricalCalcHint(
  calc: ElectricalCalcSummary | null | undefined
): string | null {
  const hint = calc?.results?.hint;
  return typeof hint === 'string' && hint.trim() ? hint : null;
}

export function isElectricalCalcUnsupported(
  calc: ElectricalCalcSummary | null | undefined
): boolean {
  const code = electricalCalcErrorCode(calc);
  return (
    electricalCalcCategory(calc) === 'unsupported' ||
    !!(code && UNSUPPORTED_ERROR_CODES.has(code))
  );
}

export function isElectricalCalcStale(
  calc: ElectricalCalcSummary | null | undefined
): boolean {
  return electricalCalcCategory(calc) === 'stale';
}

export function electricalCalcSuggestedActions(
  calc: ElectricalCalcSummary | null | undefined
): string[] | null {
  const actions = calc?.results?.suggested_actions;
  if (!Array.isArray(actions)) return null;
  const normalized = actions.filter((action): action is string => typeof action === 'string');
  return normalized.length > 0 ? normalized : null;
}

export function electricalCalcGuidanceContext(
  calc: ElectricalCalcSummary | null | undefined
): Record<string, unknown> | null {
  if (!calc) return null;
  const params = calc.params && typeof calc.params === 'object' && !Array.isArray(calc.params)
    ? calc.params
    : {};
  const resultContext = calc.results?.error_context;
  const errorContext = resultContext && typeof resultContext === 'object' && !Array.isArray(resultContext)
    ? resultContext as Record<string, unknown>
    : {};

  return {
    ...params,
    ...errorContext,
    cable_type: calc.cable_type,
  };
}
