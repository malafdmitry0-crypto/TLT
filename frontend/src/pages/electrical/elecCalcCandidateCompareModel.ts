import { selectionPolicyText } from '@/pages/electrical/elecCalcSelectionPolicyModel';
import type { ElectricalCandidate } from '@/types/calculation';
import type { ElectricalCandidateColumnKey } from '@/utils/electricalCandidateTableColumns';
import { formatNumber, formatPower } from '@/utils/formatters';

type CandidateCableTypeKey =
  | 'self_regulating'
  | 'self_regulating_tt'
  | 'single_core'
  | 'three_core'
  | 'mineral'
  | 'skin';

export type CandidateThreadSource = 'auto' | 'manual' | 'default' | 'previous_result';

const CANDIDATE_CABLE_TYPE_LABEL: Record<CandidateCableTypeKey, string> = {
  self_regulating: 'Саморегулирующийся',
  self_regulating_tt: 'ТТН/ТТВ/ТТХ',
  single_core: 'Однож. пост. мощн.',
  three_core: 'Трёхж. пост. мощн.',
  mineral: 'С мин. изоляцией',
  skin: 'Скин-система',
};

const CANDIDATE_CONNECTION_TYPE_LABEL: Record<string, string> = {
  line_1ph: 'Линия',
  loop_1ph: 'Петля',
  star_3ph: 'Звезда',
  loop_2x3: 'Петля 2×3',
  loop_1x3: 'Петля 1×3',
  star_3x3: 'Звезда 3×3',
  star_1x3: 'Звезда 1×3',
};

const CANDIDATE_STOCK_STATUS_LABEL: Record<string, string> = {
  in_stock: 'В наличии',
  limited: 'Ограничено',
  on_order: 'Под заказ',
  unknown: 'Неизвестно',
};

const CANDIDATE_COMPARE_SERVICE_COLUMN_KEYS = new Set<ElectricalCandidateColumnKey>([
  'marked',
  'actions',
]);

export const CANDIDATE_COMPARE_EMPTY_VALUE = '__empty__';

function finiteCandidateNumber(value: unknown): number | undefined {
  if (value === null || value === undefined || value === '') return undefined;
  const numericValue = Number(value);
  return Number.isFinite(numericValue) ? numericValue : undefined;
}

function candidateValueText(value: unknown) {
  if (value === null || value === undefined || value === '') return '—';
  if (typeof value === 'boolean') return value ? 'Да' : 'Нет';
  return String(value);
}

function candidateNumberText(value: unknown, digits = 2) {
  if (value === null || value === undefined || value === '') return formatNumber(null, digits);
  return formatNumber(Number(value), digits);
}

function candidatePowerText(value: unknown) {
  if (value === null || value === undefined || value === '') return '—';
  return formatPower(Number(value));
}

function candidateCableTypeText(value: unknown) {
  return CANDIDATE_CABLE_TYPE_LABEL[value as CandidateCableTypeKey] ?? value;
}

export function candidateOrderCableLengthValue(candidate: ElectricalCandidate) {
  const explicitRaw = candidate.results?.order_cable_length;
  return finiteCandidateNumber(explicitRaw);
}

export function candidateCommercialValue(candidate: ElectricalCandidate, key: string) {
  const commercial = candidate.results?.commercial;
  if (typeof commercial !== 'object' || commercial === null || Array.isArray(commercial)) return undefined;
  return (commercial as Record<string, unknown>)[key];
}

export function candidatePowerPerMeterValue(candidate: ElectricalCandidate) {
  return finiteCandidateNumber(candidate.results?.power_per_meter);
}

export function candidateInstalledPowerPerMeterValue(candidate: ElectricalCandidate) {
  return finiteCandidateNumber(candidate.results?.installed_power_per_meter);
}

export function candidateThreadSource(candidate: ElectricalCandidate): CandidateThreadSource | null {
  const value = candidate.results?.number_of_threads_source ?? candidate.params?.number_of_threads_source;
  return value === 'auto'
    || value === 'manual'
    || value === 'default'
    || value === 'previous_result'
    ? value
    : null;
}

export function candidateElectricalFieldValue(
  key: ElectricalCandidateColumnKey,
  candidate: ElectricalCandidate,
  marked = false,
) {
  switch (key) {
    case 'marked':
      return marked;
    case 'mode':
      return candidate.mode === 'auto' ? 'Авто' : 'Ручной';
    case 'cable_type':
      return candidateCableTypeText(candidate.cable_type);
    case 'cable_mark':
      return candidate.cable_mark;
    case 'selection_policy':
      return selectionPolicyText(candidate.results?.selection_policy);
    case 'applied_selection_policy':
      return selectionPolicyText(candidate.results?.applied_selection_policy);
    case 'selection_reason':
      return candidate.reason_message ?? candidate.results?.selection_reason;
    case 'winding_pitch_mm':
      return candidate.results?.winding_pitch;
    case 'number_of_threads':
      return candidate.results?.num_circuits;
    case 'laying_step':
      return candidate.params?.laying_step;
    case 'heating_height':
      return candidate.params?.heating_height;
    case 'connection_type': {
      const value = candidate.params?.connection_type;
      return CANDIDATE_CONNECTION_TYPE_LABEL[String(value)] ?? value;
    }
    case 'supply_voltage':
      return candidate.params?.supply_voltage;
    case 'winding_coefficient':
      return candidate.params?.winding_coefficient;
    case 'vapor_temperature':
      return candidate.params?.vapor_temperature;
    case 'maintain_temperature':
      return candidate.params?.maintain_temperature ?? candidate.params?.process_temperature;
    case 'aggressive_product':
      return typeof candidate.params?.aggressive_product === 'boolean'
        ? candidate.params.aggressive_product
        : undefined;
    case 'installed_cable_length':
      return candidate.results?.installed_cable_length;
    case 'order_cable_length':
      return candidateOrderCableLengthValue(candidate);
    case 'total_power':
      return candidate.results?.total_power;
    case 'power_per_meter':
      return candidatePowerPerMeterValue(candidate);
    case 'installed_power_per_meter':
      return candidateInstalledPowerPerMeterValue(candidate);
    case 'current':
      return candidate.results?.current;
    case 'voltage':
      return candidate.results?.voltage;
    case 'price_per_meter':
      return candidateCommercialValue(candidate, 'price_per_meter');
    case 'required_order_length':
      return candidateCommercialValue(candidate, 'required_order_length');
    case 'total_cost':
      return candidateCommercialValue(candidate, 'total_cost');
    case 'stock_status': {
      const value = candidateCommercialValue(candidate, 'stock_status');
      return typeof value === 'string' ? CANDIDATE_STOCK_STATUS_LABEL[value] ?? value : undefined;
    }
    case 'lead_time_days':
      return candidateCommercialValue(candidate, 'lead_time_days');
    default:
      return candidate.results?.[key] ?? candidate.params?.[key];
  }
}

export function isCandidateCompareColumn(key: ElectricalCandidateColumnKey) {
  return !CANDIDATE_COMPARE_SERVICE_COLUMN_KEYS.has(key);
}

export function normalizeCandidateCompareText(value: string) {
  const trimmed = value.trim();
  if (!trimmed || trimmed === '—') return CANDIDATE_COMPARE_EMPTY_VALUE;
  return trimmed.toLocaleLowerCase('ru');
}

export function candidateCompareDisplayValue(
  key: ElectricalCandidateColumnKey,
  candidate: ElectricalCandidate,
) {
  switch (key) {
    case 'marked':
    case 'actions':
      return CANDIDATE_COMPARE_EMPTY_VALUE;
    case 'mode':
      return candidate.mode === 'auto' ? 'Авто' : 'Ручной';
    case 'cable_type':
      return candidateCableTypeText(candidate.cable_type);
    case 'cable_mark':
      return candidateValueText(candidate.cable_mark);
    case 'selection_policy':
      return selectionPolicyText(candidate.results?.selection_policy);
    case 'applied_selection_policy':
      return selectionPolicyText(candidate.results?.applied_selection_policy);
    case 'selection_reason':
      return candidateValueText(candidate.reason_message ?? candidate.results?.selection_reason);
    case 'winding_pitch_mm':
      return candidateNumberText(candidate.results?.winding_pitch, 0);
    case 'number_of_threads':
      return candidateNumberText(candidate.results?.num_circuits, 0);
    case 'laying_step':
      return candidateNumberText(candidate.params?.laying_step, 2);
    case 'heating_height':
      return candidateNumberText(candidate.params?.heating_height, 1);
    case 'connection_type': {
      const value = candidate.params?.connection_type;
      return CANDIDATE_CONNECTION_TYPE_LABEL[String(value)] ?? candidateValueText(value);
    }
    case 'supply_voltage':
      return candidateNumberText(candidate.params?.supply_voltage, 0);
    case 'winding_coefficient':
      return candidateNumberText(candidate.params?.winding_coefficient, 2);
    case 'vapor_temperature':
      return candidateNumberText(candidate.params?.vapor_temperature, 1);
    case 'maintain_temperature':
      return candidateNumberText(candidate.params?.maintain_temperature ?? candidate.params?.process_temperature, 1);
    case 'aggressive_product':
      return candidateValueText(candidate.params?.aggressive_product);
    case 'installed_cable_length':
      return candidateNumberText(candidate.results?.installed_cable_length, 1);
    case 'order_cable_length':
      return candidateNumberText(candidateOrderCableLengthValue(candidate), 1);
    case 'total_power':
      return candidatePowerText(candidate.results?.total_power);
    case 'power_per_meter':
      return candidateNumberText(candidatePowerPerMeterValue(candidate), 2);
    case 'installed_power_per_meter':
      return candidateNumberText(candidateInstalledPowerPerMeterValue(candidate), 2);
    case 'current':
      return candidateNumberText(candidate.results?.current, 2);
    case 'voltage':
      return candidateNumberText(candidate.results?.voltage, 0);
    case 'price_per_meter':
      return candidateNumberText(candidateCommercialValue(candidate, 'price_per_meter'), 2);
    case 'required_order_length':
      return candidateNumberText(candidateCommercialValue(candidate, 'required_order_length'), 1);
    case 'total_cost':
      return candidateNumberText(candidateCommercialValue(candidate, 'total_cost'), 2);
    case 'stock_status': {
      const value = candidateCommercialValue(candidate, 'stock_status');
      return typeof value === 'string' ? CANDIDATE_STOCK_STATUS_LABEL[value] ?? value : '—';
    }
    case 'lead_time_days':
      return candidateNumberText(candidateCommercialValue(candidate, 'lead_time_days'), 0);
    default:
      return candidateValueText(candidate.results?.[key] ?? candidate.params?.[key]);
  }
}

export function candidateCompareValue(
  key: ElectricalCandidateColumnKey,
  candidate: ElectricalCandidate,
) {
  return normalizeCandidateCompareText(candidateCompareDisplayValue(key, candidate));
}
