import { Card, Col, Row, Typography } from 'antd';

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
  return (powerW / 1000).toFixed(1);
}

function formatLength(m: number): string {
  if (!Number.isFinite(m) || m === 0) return '0';
  return m >= 100 ? m.toLocaleString('ru-RU', { maximumFractionDigits: 0 }) : m.toFixed(1);
}

function formatCurrent(a: number): string {
  return Number.isFinite(a) ? a.toFixed(1) : '0';
}

function MetricRow({ label, value }: { label: string; value: string }) {
  return (
    <div
      style={{
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'baseline',
        gap: 12,
        padding: '3px 0',
        borderBottom: '1px solid #f0f0f0',
        fontSize: 12,
        lineHeight: 1.35,
      }}
    >
      <Text type="secondary" style={{ fontSize: 12 }}>{label}</Text>
      <Text strong style={{ fontSize: 13, fontVariantNumeric: 'tabular-nums' }}>{value}</Text>
    </div>
  );
}

function SummaryCard({
  title,
  bucket,
  testId,
}: {
  title: string;
  bucket: SystemSummaryBucket;
  testId: string;
}) {
  const sections =
    bucket.sectionCount === null || bucket.sectionCount === undefined
      ? '—'
      : String(bucket.sectionCount);

  return (
    <Card
      size="small"
      title={(
        <Text strong style={{ fontSize: 13 }}>
          {title}
        </Text>
      )}
      styles={{
        header: {
          minHeight: 36,
          padding: '6px 12px',
          borderBottom: '1px solid #f0f0f0',
        },
        body: { padding: '4px 12px 8px' },
      }}
      style={{ height: '100%', borderRadius: 8 }}
      data-testid={testId}
    >
      <MetricRow label="Объектов" value={String(bucket.objectCount)} />
      <MetricRow label="Суммарная длина кабеля, м" value={formatLength(bucket.cableLengthM)} />
      <MetricRow label="Количество секций" value={sections} />
      <MetricRow label="Общая мощность, кВт" value={formatPowerKw(bucket.powerW)} />
      <MetricRow
        label="Суммарный рабочий ток, А"
        value={formatCurrent(bucket.workingCurrentA)}
      />
      <MetricRow
        label="Суммарный стартовый ток, А"
        value={formatCurrent(bucket.startCurrentA)}
      />
    </Card>
  );
}

/**
 * PDF UI-PDF-02: four summary cards (Самрег / Резистив / Скин / Итого).
 * Compact metric rows (PDF page 35), success-only totals.
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
    <div data-testid="elec-summary-four-cards" className="elec-summary-four-cards">
      <Row gutter={[10, 10]}>
        <Col xs={24} sm={12} xl={6}>
          <SummaryCard
            title="Саммари Самрег"
            bucket={resolved.self_regulating}
            testId="elec-summary-self_regulating"
          />
        </Col>
        <Col xs={24} sm={12} xl={6}>
          <SummaryCard
            title="Саммари Резистив"
            bucket={resolved.resistive}
            testId="elec-summary-resistive"
          />
        </Col>
        <Col xs={24} sm={12} xl={6}>
          <SummaryCard
            title="Саммари Скин"
            bucket={resolved.skin}
            testId="elec-summary-skin"
          />
        </Col>
        <Col xs={24} sm={12} xl={6}>
          <SummaryCard
            title="Саммари Итого"
            bucket={resolved.total}
            testId="elec-summary-total"
          />
        </Col>
      </Row>
    </div>
  );
}
