import { Card, Col, Row, Statistic, Typography } from 'antd';

const { Text } = Typography;

/** PDF §6.2 / UI-PDF-02: one system summary bucket. */
export interface SystemSummaryBucket {
  objectCount: number;
  cableLengthM: number;
  /** Real section count when available; null/undefined → show "—" (no invent). */
  sectionCount: number | null;
  powerW: number;
  startCurrentA: number;
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
};

function formatPower(powerW: number): { value: string; suffix: string } {
  if (powerW >= 1000) {
    return { value: (powerW / 1000).toFixed(2), suffix: 'кВт' };
  }
  return { value: powerW.toFixed(0), suffix: 'Вт' };
}

function SummaryCard({
  title,
  bucket,
  accent,
}: {
  title: string;
  bucket: SystemSummaryBucket;
  accent: string;
}) {
  const power = formatPower(bucket.powerW);
  const sections =
    bucket.sectionCount === null || bucket.sectionCount === undefined
      ? '—'
      : String(bucket.sectionCount);

  return (
    <Card
      size="small"
      title={<Text strong style={{ fontSize: 13 }}>{title}</Text>}
      styles={{ body: { padding: '8px 12px' } }}
      style={{ borderTop: `3px solid ${accent}`, height: '100%' }}
      data-testid={`elec-summary-${title}`}
    >
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 4 }}>
        <Statistic
          title="Объектов"
          value={bucket.objectCount}
          valueStyle={{ fontSize: 16 }}
        />
        <Statistic
          title="Длина кабеля"
          value={bucket.cableLengthM.toFixed(1)}
          suffix="м"
          valueStyle={{ fontSize: 16, color: '#1890ff' }}
        />
        <Statistic
          title="Секций"
          value={sections}
          valueStyle={{ fontSize: 16 }}
        />
        <Statistic
          title="Мощность"
          value={power.value}
          suffix={power.suffix}
          valueStyle={{ fontSize: 16, color: '#fa8c16' }}
        />
        <Statistic
          title="Стартовый ток"
          value={bucket.startCurrentA.toFixed(2)}
          suffix="А"
          valueStyle={{ fontSize: 16, color: '#52c41a' }}
        />
      </div>
    </Card>
  );
}

/**
 * PDF UI-PDF-02: four summary cards (Самрег / Резистив / Скин / Итого).
 * Success-only totals; skin unsupported stays zero without polluting success.
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
    },
  };

  return (
    <div data-testid="elec-summary-four-cards" style={{ marginBottom: 12 }}>
      <Row gutter={[8, 8]}>
        <Col xs={24} sm={12} lg={6}>
          <SummaryCard title="Саммари Самрег" bucket={resolved.self_regulating} accent="#1677ff" />
        </Col>
        <Col xs={24} sm={12} lg={6}>
          <SummaryCard title="Саммари Резистив" bucket={resolved.resistive} accent="#722ed1" />
        </Col>
        <Col xs={24} sm={12} lg={6}>
          <SummaryCard title="Саммари Скин" bucket={resolved.skin} accent="#8c8c8c" />
        </Col>
        <Col xs={24} sm={12} lg={6}>
          <SummaryCard title="Саммари Итого" bucket={resolved.total} accent="#52c41a" />
        </Col>
      </Row>
    </div>
  );
}
