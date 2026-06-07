import { Card, Descriptions, Typography } from 'antd';

import { C, V } from '@/components/admin/formulas/formulaPrimitives';

const { Text } = Typography;

// ─── Результат расчёта ────────────────────────────────────────────────────────

export default function CalcResult({ result, type }: { result: Record<string, unknown>; type: string }) {
  if (type === 'pipe') {
    return (
      <Card
        size="small"
        style={{ marginTop: 16, borderColor: '#1677ff' }}
        styles={{ header: { background: '#e6f4ff', borderBottom: '1px solid #91caff' } }}
        title={<span style={{ color: C.result }}>Результат расчёта трубопровода</span>}
      >
        <Descriptions size="small" column={1} bordered>
          <Descriptions.Item label={<><V c={C.result}>q</V> — теплопотери, Вт/м</>}>
            <Text strong style={{ color: C.result, fontSize: 16 }}>{Number(result.heat_loss_per_meter).toFixed(2)}</Text>
          </Descriptions.Item>
          <Descriptions.Item label={<><V c={C.result}>Q</V> — суммарные теплопотери, Вт</>}>
            <Text strong style={{ color: C.result, fontSize: 16 }}>{Number(result.total_heat_loss).toFixed(0)}</Text>
          </Descriptions.Item>
          <Descriptions.Item label={<><V c={C.geom}>L</V><sub>эфф</sub> — расчётная длина, м</>}>
            {Number(result.effective_length).toFixed(2)}
          </Descriptions.Item>
          <Descriptions.Item label={<>Σ<V c={C.resist}>R</V> — сумм. терм. сопр., м·К/Вт</>}>
            {Number(result.thermal_resistance).toFixed(4)}
          </Descriptions.Item>
          {result.alpha_vnesh != null && (
            <Descriptions.Item label={<><V c={C.coeff}>α</V> — коэф. теплоотдачи, Вт/(м²·К)</>}>
              {Number(result.alpha_vnesh).toFixed(2)}
            </Descriptions.Item>
          )}
        </Descriptions>
      </Card>
    );
  }

  if (type === 'tank') {
    return (
      <Card
        size="small"
        style={{ marginTop: 16, borderColor: '#1677ff' }}
        styles={{ header: { background: '#e6f4ff', borderBottom: '1px solid #91caff' } }}
        title={<span style={{ color: C.result }}>Результат расчёта резервуара</span>}
      >
        <Descriptions size="small" column={1} bordered>
          <Descriptions.Item label={<><V c={C.result}>q</V> — теплопотери, Вт/м²</>}>
            <Text strong style={{ color: C.result, fontSize: 16 }}>{Number(result.heat_loss_per_m2).toFixed(2)}</Text>
          </Descriptions.Item>
          <Descriptions.Item label={<><V c={C.result}>Q</V> — суммарные теплопотери, Вт</>}>
            <Text strong style={{ color: C.result, fontSize: 16 }}>{Number(result.total_heat_loss).toFixed(0)}</Text>
          </Descriptions.Item>
          <Descriptions.Item label={<><V c={C.geom}>S</V> — площадь поверхности, м²</>}>
            {Number(result.surface_area).toFixed(2)}
          </Descriptions.Item>
          {result.alpha_vnesh != null && (
            <Descriptions.Item label={<><V c={C.coeff}>α</V> — коэф. теплоотдачи, Вт/(м²·К)</>}>
              {Number(result.alpha_vnesh).toFixed(2)}
            </Descriptions.Item>
          )}
        </Descriptions>
      </Card>
    );
  }

  if (type === 'tank_cable_geometry') {
    return (
      <Card
        size="small"
        style={{ marginTop: 16, borderColor: '#1677ff' }}
        styles={{ header: { background: '#e6f4ff', borderBottom: '1px solid #91caff' } }}
        title={<span style={{ color: C.result }}>Результат расчёта укладки</span>}
      >
        <Descriptions size="small" column={1} bordered>
          <Descriptions.Item label={<><V c={C.geom}>L</V><sub>кабеля</sub> — длина, м</>}>
            <Text strong style={{ color: C.result, fontSize: 16 }}>{Number(result.cable_length).toFixed(3)}</Text>
          </Descriptions.Item>
        </Descriptions>
      </Card>
    );
  }

  return (
    <Card
      size="small"
      style={{ marginTop: 16, borderColor: '#fa8c16' }}
      styles={{ header: { background: '#fff7e6', borderBottom: '1px solid #ffd591' } }}
      title={<span style={{ color: '#fa8c16' }}>Результат подбора кабеля</span>}
    >
      <Descriptions size="small" column={1} bordered>
        <Descriptions.Item label="Выбранный кабель">
          <Text strong style={{ color: '#fa8c16', fontSize: 16 }}>{String(result.selected_cable)}</Text>
        </Descriptions.Item>
        <Descriptions.Item label={<><V c={C.geom}>L</V><sub>кабеля</sub> — расчётная длина, м</>}>
          {Number(result.cable_length).toFixed(1)}
        </Descriptions.Item>
        {result.order_cable_length != null && (
          <Descriptions.Item label={<><V c={C.geom}>L</V><sub>заказ</sub> — длина для заказа, м</>}>
            {Number(result.order_cable_length).toFixed(1)}
          </Descriptions.Item>
        )}
        <Descriptions.Item label={<><V c={C.result} bold>P</V> — суммарная мощность, Вт</>}>
          <Text strong>{Number(result.total_power).toFixed(0)}</Text>
        </Descriptions.Item>
        <Descriptions.Item label={<><V c={C.result} bold>I</V> — ток секции, А</>}>
          {Number(result.current).toFixed(2)}
        </Descriptions.Item>
        <Descriptions.Item label={<><V c={C.geom}>U</V> — напряжение, В</>}>
          {Number(result.voltage).toFixed(0)}
        </Descriptions.Item>
      </Descriptions>
    </Card>
  );
}
