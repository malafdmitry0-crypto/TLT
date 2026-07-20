import { Card, Typography } from 'antd';

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

function formatSections(bucket: SystemSummaryBucket) {
  const sections =
    bucket.sectionCount === null || bucket.sectionCount === undefined
      ? '—'
      : String(bucket.sectionCount);
  return sections;
}

function SummaryTableRow({
  title,
  bucket,
  testId,
}: {
  title: string;
  bucket: SystemSummaryBucket;
  testId: string;
}) {
  return (
    <tr data-testid={testId}>
      <th scope="row">{title}</th>
      <td>{bucket.objectCount}</td>
      <td>{formatLength(bucket.cableLengthM)}</td>
      <td>{formatSections(bucket)}</td>
      <td>{formatPowerKw(bucket.powerW)}</td>
      <td>{formatCurrent(bucket.workingCurrentA)}</td>
      <td>{formatCurrent(bucket.startCurrentA)}</td>
    </tr>
  );
}

/**
 * One compact system summary table (Самрег / Резистив / Скин / Итого).
 * Success-only totals, without duplicating the system tabs below.
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
    <Card
      size="small"
      className="elec-summary-table-card"
      title={<Text strong style={{ fontSize: 13 }}>Итоги по кабелю</Text>}
      data-testid="elec-summary-table"
    >
      <div className="elec-summary-table-scroll">
        <table className="elec-summary-table">
          <thead>
            <tr>
              <th scope="col">Тип кабеля</th>
              <th scope="col">Объекты</th>
              <th scope="col">Длина, м</th>
              <th scope="col">Секции</th>
              <th scope="col">Мощность, кВт</th>
              <th scope="col">Рабочий ток, А</th>
              <th scope="col">Пусковой ток, А</th>
            </tr>
          </thead>
          <tbody>
            <SummaryTableRow title="Самрег" bucket={resolved.self_regulating} testId="elec-summary-self_regulating" />
            <SummaryTableRow title="Резистив" bucket={resolved.resistive} testId="elec-summary-resistive" />
            <SummaryTableRow title="Скин" bucket={resolved.skin} testId="elec-summary-skin" />
            <SummaryTableRow title="Итого" bucket={resolved.total} testId="elec-summary-total" />
          </tbody>
        </table>
      </div>
    </Card>
  );
}
