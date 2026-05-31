import type { SelectionPolicy } from '@/api/calculations';
import type { ElectricalCalcSummary } from '@/types/calculation';
import type { ProjectObject } from '@/types/project';
import { formatNumber, formatPower } from '@/utils/formatters';

export type CableMarkSource = 'auto' | 'manual';
export type ThreadSource = 'auto' | 'manual' | 'default' | 'previous_result';

export type ThreadSourceTag = {
  color: 'purple' | 'blue' | 'gold' | 'default';
  label: string;
  tooltip: string;
};

const RESULT_SELECTION_POLICY_LABEL: Record<SelectionPolicy, string> = {
  technical_minimum: 'Технический',
  lowest_cost: 'Дешевле',
  fastest_delivery: 'Быстрее',
  in_stock: 'В наличии',
  preferred_supplier: 'Приоритет',
  balanced: 'Баланс',
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

export function cablePowerPerMeterValue(calc: ElectricalCalcSummary | undefined) {
  return finiteNumber(calc?.results?.power_per_meter);
}

export function installedPowerPerMeterValue(calc: ElectricalCalcSummary | undefined) {
  return finiteNumber(calc?.results?.installed_power_per_meter);
}

export function orderCableLengthValue(calc: ElectricalCalcSummary | undefined) {
  if (!calc?.results) return undefined;
  const explicitRaw = calc.results.order_cable_length;
  if (explicitRaw !== null && explicitRaw !== undefined && explicitRaw !== '') {
    const explicitLength = Number(explicitRaw);
    if (Number.isFinite(explicitLength)) return explicitLength;
  }
  return undefined;
}

export function commercialValue(calc: ElectricalCalcSummary | undefined, key: string) {
  const commercial = calc?.results?.commercial;
  if (typeof commercial !== 'object' || commercial === null || Array.isArray(commercial)) return undefined;
  return (commercial as Record<string, unknown>)[key];
}

export function commercialNumber(calc: ElectricalCalcSummary | undefined, key: string, digits = 2) {
  return numberText(commercialValue(calc, key), digits);
}

export function selectionPolicyText(value: unknown) {
  if (typeof value !== 'string') return '—';
  return RESULT_SELECTION_POLICY_LABEL[value as SelectionPolicy]
    ?? (value === 'manual_selection' ? 'Ручной' : value);
}

export function objectResultNumber(obj: ProjectObject, key: string, digits = 2) {
  return numberText(obj.results?.[key], digits);
}
