import { Typography } from 'antd';
import { TltCard } from '@/components/ui-kit';

const { Text } = Typography;

/** PDF §6.2 / UI-PDF-02: one system summary bucket. */
export interface SystemSummaryBucket {
  objectCount: number;
  cableLengthM: number;
  /** Real section count when available; null → show "—" (no invent). */
  sectionCount: number | null;
  powerW: number;
  startCurrentA: number;
  /** Working (operating) current, А — PDF §6.2. */
  workingCurrentA: number;
}

export interface ElectricalSystemSummaries {
  self_regulating: SystemSummaryBucket;
  resistive: SystemSummaryBucket;
  skin: SystemSummaryBucket;
  total: SystemSummaryBucket;
}

interface ElectricalSummaryProps {
  /** Legacy flat totals (kept for callers that only have aggregate). */
  totalCableLength?: number;
  totalPower?: number;
  totalCurrent?: number;
  calcedCount?: number;
  totalObjects?: number;
  /** Preferred: four PDF cards. */
  systems?: ElectricalSystemSummaries;
}

const EMPTY: SystemSummaryBucket = {
  objectCount: 0,
  cableLengthM: 0,
  sectionCount: null,
  powerW: 0,
  startCurrentA: 0,
  workingCurrentA: 0,
};

function formatPowerKw(powerW: number): string {
  return (powerW / 1000).toFixed(1).replace('.', ',');
}

function formatLength(m: number): string {
  if (!Number.isFinite(m) || m === 0) return '0';
  return m >= 100
    ? m.toLocaleString('ru-RU', { maximumFractionDigits: 0 })
    : m.toFixed(1).replace('.', ',');
}

function formatCurrent(a: number): string {
  if (!Number.isFinite(a)) return '0';
  return a.toFixed(1).replace('.', ',');
}

function formatSections(bucket: SystemSummaryBucket): string {
  if (bucket.sectionCount === null || bucket.sectionCount === undefined) return '—';
  return String(bucket.sectionCount);
}

type SummaryCardDef = {
  key: keyof ElectricalSystemSummaries;
  title: string;
  testId: string;
};

// E1 / FE-28: MVP summary shows Samreg + Total only (Resistive/Skin hidden).
const SUMMARY_CARDS: readonly SummaryCardDef[] = [
  { key: 'self_regulating', title: 'Саммари Самрег', testId: 'elec-summary-card-self_regulating' },
  { key: 'total', title: 'Саммари Итого', testId: 'elec-summary-card-total' },
] as const;

function MetricRow({
  label,
  value,
  testId,
}: {
  label: string;
  value: string | number;
  testId: string;
}) {
  return (
    <div className="elec-summary-card__row" data-testid={testId}>
      <span className="elec-summary-card__label">{label}</span>
      <span className="elec-summary-card__value">{value}</span>
    </div>
  );
}

/**
 * Four system-summary cards (mockup / PDF §6.2).
 * Success-only totals; does not replace the system-scope tabs below.
 */
export default function ElectricalSummary({
  totalCableLength = 0,
  totalPower = 0,
  totalCurrent = 0,
  calcedCount = 0,
  systems,
}: ElectricalSummaryProps) {
  const resolved: ElectricalSystemSummaries = systems ?? {
    self_regulating: EMPTY,
    resistive: EMPTY,
    skin: EMPTY,
    total: {
      objectCount: calcedCount,
      cableLengthM: totalCableLength,
      sectionCount: null,
      powerW: totalPower,
      startCurrentA: totalCurrent,
      workingCurrentA: totalCurrent,
    },
  };

  return (
    <div
      className="elec-summary-four-cards"
      data-testid="elec-summary-table"
      role="region"
      aria-label="Саммари по типам кабеля"
    >
      {SUMMARY_CARDS.map((card) => {
        const bucket = resolved[card.key];
        const prefix = `elec-summary-${card.key}`;
        return (
          <TltCard
            key={card.key}
            padding="compact"
            className={`elec-summary-card${card.key === 'total' ? ' elec-summary-card--total' : ''}`}
            data-testid={card.testId}
            title={<Text strong className="elec-summary-card__title">{card.title}</Text>}
          >
            <div className="elec-summary-card__body">
              <MetricRow
                label="Объектов"
                value={bucket.objectCount}
                testId={`${prefix}-objects`}
              />
              <MetricRow
                label="Суммарная длина кабеля, м"
                value={formatLength(bucket.cableLengthM)}
                testId={`${prefix}-length`}
              />
              <MetricRow
                label="Количество секций"
                value={formatSections(bucket)}
                testId={`${prefix}-sections`}
              />
              <MetricRow
                label="Общая мощность, кВт"
                value={formatPowerKw(bucket.powerW)}
                testId={`${prefix}-power`}
              />
              <MetricRow
                label="Суммарный стартовый ток, А"
                value={formatCurrent(bucket.startCurrentA)}
                testId={`${prefix}-start-current`}
              />
              {/* Working current kept for PDF completeness, compact secondary row */}
              <MetricRow
                label="Рабочий ток, А"
                value={formatCurrent(bucket.workingCurrentA)}
                testId={`${prefix}-working-current`}
              />
            </div>
          </TltCard>
        );
      })}
    </div>
  );
}
