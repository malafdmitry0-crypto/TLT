import { Checkbox, InputNumber, Select, Typography } from 'antd';
import type { ReactNode } from 'react';

import type { CableTypeKey } from '@/pages/electrical/elecCalcMainTableModel';

const { Text } = Typography;

type ElecCalcTypeControlValues = {
  aggressiveProduct: boolean;
  connectionType: string;
  heatingHeight: number | null;
  layingStep: number | null;
  maintainTemperature: number | null;
  supplyVoltage: number | null;
  vaporTemperature: number | null;
  windingCoefficient: number | null;
};

type ElecCalcTypeControlSetters = {
  aggressiveProduct: (value: boolean) => void;
  connectionType: (value: string) => void;
  heatingHeight: (value: number | null) => void;
  layingStep: (value: number | null) => void;
  maintainTemperature: (value: number | null) => void;
  supplyVoltage: (value: number | null) => void;
  vaporTemperature: (value: number | null) => void;
  windingCoefficient: (value: number | null) => void;
};

type ElecCalcElectricalTypeControlsProps = {
  cableType: CableTypeKey | null;
  block?: boolean;
  recalc: ElecCalcTypeControlValues;
  setRecalc: ElecCalcTypeControlSetters;
};

export default function ElecCalcElectricalTypeControls({
  cableType,
  block = false,
  recalc,
  setRecalc,
}: ElecCalcElectricalTypeControlsProps) {
  if (!cableType) return null;
  if (cableType === 'self_regulating') return null;

  const wrap = (content: ReactNode) =>
    block ? (
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, alignItems: 'center' }}>
        {content}
      </div>
    ) : content;

  if (cableType === 'self_regulating_tt') {
    return wrap(
      <>
        <Text style={{ fontSize: 11, color: '#607080', alignSelf: 'center' }}>T проп., °C:</Text>
        <InputNumber<number>
          aria-label="T пропарки"
          size="small"
          value={recalc.vaporTemperature}
          onChange={setRecalc.vaporTemperature}
          style={{ width: 92 }}
        />
        <Text style={{ fontSize: 11, color: '#607080', alignSelf: 'center' }}>T3, °C:</Text>
        <InputNumber<number>
          aria-label="T3 поддержания"
          size="small"
          value={recalc.maintainTemperature}
          onChange={setRecalc.maintainTemperature}
          style={{ width: 92 }}
        />
        <Checkbox
          checked={recalc.aggressiveProduct}
          onChange={(event) => setRecalc.aggressiveProduct(event.target.checked)}
        >
          <span style={{ fontSize: 12 }}>агр.</span>
        </Checkbox>
      </>,
    );
  }
  if (cableType === 'single_core' || cableType === 'three_core') {
    const connectionOptions = cableType === 'single_core'
      ? [
          { value: 'line_1ph', label: 'Линия' },
          { value: 'loop_1ph', label: 'Петля' },
          { value: 'star_3ph', label: 'Звезда' },
        ]
      : [
          { value: 'line_1ph', label: 'Линия' },
          { value: 'loop_2x3', label: 'Петля 2×3' },
          { value: 'loop_1x3', label: 'Петля 1×3' },
          { value: 'star_3x3', label: 'Звезда 3×3' },
          { value: 'star_1x3', label: 'Звезда 1×3' },
        ];
    return wrap(
      <>
        <Select
          aria-label="Схема подключения"
          size="small"
          value={recalc.connectionType}
          onChange={setRecalc.connectionType}
          options={connectionOptions}
          style={{ width: 118 }}
        />
        <Text style={{ fontSize: 11, color: '#607080', alignSelf: 'center' }}>U:</Text>
        <InputNumber<number> size="small" min={1} value={recalc.supplyVoltage} onChange={setRecalc.supplyVoltage} style={{ width: 76 }} />
        <Text style={{ fontSize: 11, color: '#607080', alignSelf: 'center' }}>w:</Text>
        <InputNumber<number> size="small" min={1} max={1.5} step={0.05} value={recalc.windingCoefficient} onChange={setRecalc.windingCoefficient} style={{ width: 72 }} />
        <Text style={{ fontSize: 11, color: '#607080', alignSelf: 'center' }}>h:</Text>
        <InputNumber<number> size="small" min={0} step={0.1} value={recalc.heatingHeight} onChange={setRecalc.heatingHeight} style={{ width: 76 }} />
        <Text style={{ fontSize: 11, color: '#607080', alignSelf: 'center' }}>шаг:</Text>
        <InputNumber<number> size="small" min={0.1} max={0.4} step={0.01} value={recalc.layingStep} onChange={setRecalc.layingStep} style={{ width: 76 }} />
      </>,
    );
  }
  return null;
}
