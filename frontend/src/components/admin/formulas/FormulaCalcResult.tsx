import { Descriptions, Typography } from 'antd';
import { TltCard } from '@/components/ui-kit';

import { C, V } from '@/components/admin/formulas/formulaPrimitives';

import '@/components/admin/formulas/formula-primitives.css';

const { Text } = Typography;

// ─── Результат расчёта ────────────────────────────────────────────────────────

export default function CalcResult({ result, type }: { result: Record<string, unknown>; type: string }) {
  if (type === 'pipe') {
    return (
      <TltCard
        padding="compact"
        className="formula-result-card formula-result-card--result"
        title={<span className="formula-result-card__title--result">Результат расчёта трубопровода</span>}
      >
        <Descriptions size="small" column={1} bordered>
          <Descriptions.Item label={<><V c={C.result}>q base</V> — до K, Вт/м</>}>
            <Text strong className="formula-result-card__value--result">{Number(result.heat_loss_per_meter_base).toFixed(2)}</Text>
          </Descriptions.Item>
          <Descriptions.Item label={<><V c={C.result}>Q design</V> — проектные теплопотери, Вт</>}>
            <Text strong className="formula-result-card__value--result">{Number(result.total_heat_loss_design).toFixed(0)}</Text>
          </Descriptions.Item>
          <Descriptions.Item label={<><V c={C.geom}>L</V><sub>эфф</sub> — расчётная длина, м</>}>
            {Number(result.effective_length).toFixed(2)}
          </Descriptions.Item>
          <Descriptions.Item label={<>Σ<V c={C.resist}>R</V> — сумм. терм. сопр., м·К/Вт</>}>
            {Number(result.thermal_resistance).toFixed(4)}
          </Descriptions.Item>
          {result.alpha_vnesh_applied != null && (
            <Descriptions.Item label={<><V c={C.coeff}>α</V> — коэф. теплоотдачи, Вт/(м²·К)</>}>
              {Number(result.alpha_vnesh_applied).toFixed(2)}
            </Descriptions.Item>
          )}
        </Descriptions>
      </TltCard>
    );
  }

  if (type === 'tank') {
    return (
      <TltCard
        padding="compact"
        className="formula-result-card formula-result-card--result"
        title={<span className="formula-result-card__title--result">Результат расчёта резервуара</span>}
      >
        <Descriptions size="small" column={1} bordered>
          <Descriptions.Item label={<><V c={C.result}>q base</V> — до K, Вт/м²</>}>
            <Text strong className="formula-result-card__value--result">{Number(result.heat_loss_per_m2_bare_base).toFixed(2)}</Text>
          </Descriptions.Item>
          <Descriptions.Item label={<><V c={C.result}>Q design</V> — проектные теплопотери, Вт</>}>
            <Text strong className="formula-result-card__value--result">{Number(result.total_heat_loss_design).toFixed(0)}</Text>
          </Descriptions.Item>
          <Descriptions.Item label={<><V c={C.geom}>S</V> — площадь поверхности, м²</>}>
            {Number(result.surface_area_bare).toFixed(2)}
          </Descriptions.Item>
          {result.alpha_vnesh_applied != null && (
            <Descriptions.Item label={<><V c={C.coeff}>α</V> — коэф. теплоотдачи, Вт/(м²·К)</>}>
              {Number(result.alpha_vnesh_applied).toFixed(2)}
            </Descriptions.Item>
          )}
        </Descriptions>
      </TltCard>
    );
  }

  if (type === 'tank_cable_geometry') {
    return (
      <TltCard
        padding="compact"
        className="formula-result-card formula-result-card--result"
        title={<span className="formula-result-card__title--result">Результат расчёта укладки</span>}
      >
        <Descriptions size="small" column={1} bordered>
          <Descriptions.Item label={<><V c={C.geom}>L</V><sub>кабеля</sub> — длина, м</>}>
            <Text strong className="formula-result-card__value--result">{Number(result.cable_length).toFixed(3)}</Text>
          </Descriptions.Item>
        </Descriptions>
      </TltCard>
    );
  }

  return (
    <TltCard
      padding="compact"
      className="formula-result-card formula-result-card--cable"
      title={<span className="formula-result-card__title--cable">Результат подбора кабеля</span>}
    >
      <Descriptions size="small" column={1} bordered>
        <Descriptions.Item label="Выбранный кабель">
          <Text strong className="formula-result-card__value--cable">{String(result.selected_cable)}</Text>
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
    </TltCard>
  );
}
