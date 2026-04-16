import { Card, Space, Statistic } from 'antd';

interface ElectricalSummaryProps {
  totalCableLength: number;
  totalPower: number;
  totalCurrent: number;
  calcedCount: number;
  totalObjects: number;
}

/**
 * Зелёная карточка-сводка в верхней части электрорасчёта:
 * общая длина кабеля, суммарная мощность (Вт/кВт), ток, количество
 * рассчитанных объектов. Показывается только если есть ≥ 1 успешный расчёт.
 */
export default function ElectricalSummary({
  totalCableLength,
  totalPower,
  totalCurrent,
  calcedCount,
  totalObjects,
}: ElectricalSummaryProps) {
  const showInKW = totalPower >= 1000;
  const powerValue = showInKW ? (totalPower / 1000).toFixed(2) : totalPower.toFixed(0);

  return (
    <Card
      size="small"
      style={{ marginBottom: 16, background: '#f6ffed', border: '1px solid #b7eb8f' }}
    >
      <Space size="large" wrap>
        <Statistic
          title="Общая длина кабеля"
          value={totalCableLength.toFixed(1)}
          suffix="м"
          valueStyle={{ color: '#1890ff', fontSize: 20 }}
        />
        <Statistic
          title="Суммарная мощность"
          value={powerValue}
          suffix={showInKW ? 'кВт' : 'Вт'}
          valueStyle={{ color: '#fa8c16', fontSize: 20 }}
        />
        <Statistic
          title="Суммарный ток"
          value={totalCurrent.toFixed(2)}
          suffix="А"
          valueStyle={{ color: '#52c41a', fontSize: 20 }}
        />
        <Statistic
          title="Объектов рассчитано"
          value={calcedCount}
          suffix={`/ ${totalObjects}`}
          valueStyle={{ fontSize: 20 }}
        />
      </Space>
    </Card>
  );
}
