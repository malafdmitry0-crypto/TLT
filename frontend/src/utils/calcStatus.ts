import type { ElectricalCalcSummary } from '@/types/calculation';

/**
 * Успешным электрорасчётом считается запись, в которой есть выбранная марка
 * кабеля и нет поля `error` в `results`. Записи с ошибкой создаются бэкендом,
 * чтобы причина сбоя была видна после перезагрузки страницы — но как «выполненный
 * расчёт» они не считаются.
 */
export function isElectricalCalcSuccess(
  calc: ElectricalCalcSummary | null | undefined
): boolean {
  if (!calc) return false;
  const r = calc.results;
  if (!r) return false;
  if ((r as Record<string, unknown>).error) return false;
  return !!(r as Record<string, unknown>).selected_cable || !!calc.cable_mark;
}

export function electricalCalcError(
  calc: ElectricalCalcSummary | null | undefined
): string | null {
  const err = calc?.results?.error;
  return typeof err === 'string' ? err : null;
}
