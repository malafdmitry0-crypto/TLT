/**
 * Electrical candidate table column catalog:
 * service columns, field priority, default widths, and registry projection.
 */
import {
  ELECTRICAL_TABLE_COLUMN_CATALOG,
  clampElectricalTableColumnWidthPct,
  electricalTableColumnWidthPctToPx,
  electricalTableColumnWidthPxToPct,
  type ElectricalColumnKey,
  type ElectricalColumnLabels,
  type ElectricalColumnMeta,
} from '@/utils/electricalTableColumns';

export type ElectricalCandidateColumnKey = string;

export interface ElectricalCandidateColumnMeta {
  key: ElectricalCandidateColumnKey;
  labels: ElectricalColumnLabels;
  label: string;
  title: string;
  group: string;
  source: string;
  valueType: string;
  width: number;
  defaultWidthPct: number;
  minWidthPx: number;
  required?: boolean;
  ellipsis?: boolean;
  helpText?: string;
  fixed?: 'left';
  align?: 'left' | 'center' | 'right';
}

export interface ElectricalCandidateColumnLayout {
  widthPct: number;
}

const CANDIDATE_FIELD_EXCLUDED_KEYS = new Set<ElectricalColumnKey>([
  'index',
  'object_name',
  'object_type',
  'heat_loss_status',
  'electrical_status',
  'cable_snapshot_status',
]);

const CANDIDATE_COLUMN_PRIORITY = [
  'cable_type',
  'cable_mark',
  'power_per_meter',
  'applied_selection_policy',
  'selection_reason',
  'winding_pitch_mm',
  'number_of_threads',
  'laying_step',
  'heating_height',
  'connection_type',
  'supply_voltage',
  'winding_coefficient',
] as const;

const CANDIDATE_COLUMN_PRIORITY_INDEX = new Map<string, number>(
  CANDIDATE_COLUMN_PRIORITY.map((key, index) => [key, index]),
);

const CANDIDATE_COLUMN_WIDTH_PCT_BY_KEY: Record<string, number> = {
  marked: 6.8,
  actions: 16.2,
  mode: 8.6,
  cable_mark: 19,
  power_per_meter: 10,
  selection_policy: 13,
  applied_selection_policy: 15,
  selection_reason: 32,
  winding_pitch_mm: 12,
  number_of_threads: 11,
  laying_step: 12,
  heating_height: 12,
  connection_type: 11,
  supply_voltage: 11,
  winding_coefficient: 8.6,
  installed_cable_length: 13,
  order_cable_length: 13,
  total_power: 12,
  installed_power_per_meter: 12,
  current: 10,
  voltage: 11,
  price_per_meter: 12,
  required_order_length: 14,
  total_cost: 12,
  stock_status: 12,
  lead_time_days: 11,
};

const SERVICE_CANDIDATE_COLUMNS: ElectricalCandidateColumnMeta[] = [
  {
    key: 'marked',
    labels: {
      short: 'Пометка',
      full: 'Пометка варианта',
      compact: 'Пом.',
    },
    label: 'Пометка варианта',
    title: 'Пометка',
    group: 'Действия',
    source: 'candidate_ui',
    valueType: 'service',
    width: electricalTableColumnWidthPctToPx(CANDIDATE_COLUMN_WIDTH_PCT_BY_KEY.marked),
    defaultWidthPct: CANDIDATE_COLUMN_WIDTH_PCT_BY_KEY.marked,
    minWidthPx: 56,
    ellipsis: false,
    fixed: 'left',
    align: 'center',
    helpText: 'Временная отметка варианта в открытой модалке. Не выбирает кабель.',
  },
  {
    key: 'actions',
    labels: {
      short: 'Действия',
      full: 'Действия с вариантом',
      compact: 'Действ.',
    },
    label: 'Действия с вариантом',
    title: 'Действия',
    group: 'Действия',
    source: 'candidate_ui',
    valueType: 'service',
    width: electricalTableColumnWidthPctToPx(CANDIDATE_COLUMN_WIDTH_PCT_BY_KEY.actions),
    defaultWidthPct: CANDIDATE_COLUMN_WIDTH_PCT_BY_KEY.actions,
    minWidthPx: 156,
    required: true,
    ellipsis: false,
    fixed: 'left',
    helpText: 'Применить вариант, положить в папку или исключить вариант из подбора.',
  },
  {
    key: 'mode',
    labels: {
      short: 'Режим',
      full: 'Режим расчёта',
      compact: 'Режим',
    },
    label: 'Режим расчёта',
    title: 'Режим',
    group: 'Основные',
    source: 'electrical_candidates',
    valueType: 'computed',
    width: electricalTableColumnWidthPctToPx(CANDIDATE_COLUMN_WIDTH_PCT_BY_KEY.mode),
    defaultWidthPct: CANDIDATE_COLUMN_WIDTH_PCT_BY_KEY.mode,
    minWidthPx: 72,
    ellipsis: false,
    fixed: 'left',
    helpText: 'Автоматический или ручной вариант подбора.',
  },
];

function candidateWidthPct(column: ElectricalColumnMeta) {
  const configured = CANDIDATE_COLUMN_WIDTH_PCT_BY_KEY[column.key];
  if (Number.isFinite(configured)) return clampElectricalTableColumnWidthPct(configured);
  return electricalTableColumnWidthPxToPct(Math.max(column.minWidthPx, Math.min(column.width, 150)));
}

function normalizeCandidateColumn(column: ElectricalColumnMeta): ElectricalCandidateColumnMeta {
  const widthPct = candidateWidthPct(column);
  return {
    ...column,
    width: electricalTableColumnWidthPctToPx(widthPct),
    defaultWidthPct: widthPct,
    minWidthPx: Math.max(column.minWidthPx, column.key === 'cable_mark' ? 130 : 48),
    required: column.key === 'cable_mark' || column.required,
    fixed: undefined,
    align: column.key === 'cable_mark' || column.key === 'selection_reason' ? 'left' : undefined,
  };
}

export const ELECTRICAL_CANDIDATE_TABLE_COLUMN_CATALOG: ElectricalCandidateColumnMeta[] = [
  ...SERVICE_CANDIDATE_COLUMNS,
  ...ELECTRICAL_TABLE_COLUMN_CATALOG
    .filter((column) =>
      !CANDIDATE_FIELD_EXCLUDED_KEYS.has(column.key) &&
      (
        column.source === 'electrical_calculations' ||
        column.source === 'params' ||
        column.source === 'results' ||
        column.source === 'results.commercial'
      ),
    )
    .sort((left, right) => {
      const leftPriority = CANDIDATE_COLUMN_PRIORITY_INDEX.get(left.key) ?? Number.MAX_SAFE_INTEGER;
      const rightPriority = CANDIDATE_COLUMN_PRIORITY_INDEX.get(right.key) ?? Number.MAX_SAFE_INTEGER;
      if (leftPriority !== rightPriority) return leftPriority - rightPriority;
      return 0;
    })
    .map(normalizeCandidateColumn),
];
