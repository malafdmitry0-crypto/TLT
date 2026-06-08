import { memo } from 'react';
import { Checkbox, InputNumber, Select, Typography } from 'antd';
import type { CSSProperties, ReactNode } from 'react';

import type { CableTypeKey } from '@/pages/electrical/elecCalcMainTableModel';

const { Text } = Typography;

// Стабильные литералы на уровне модуля — иначе пересоздаются на каждый рендер
// (компонент перерисовывается на каждый InputNumber.onChange родителя).
const WRAP_STYLE: CSSProperties = { display: 'flex', flexWrap: 'wrap', gap: 8, alignItems: 'center' };
const HINT_STYLE: CSSProperties = { fontSize: 11, color: '#607080', alignSelf: 'center' };
const AGGR_LABEL_STYLE: CSSProperties = { fontSize: 12 };
const SELECT_W118: CSSProperties = { width: 118 };
const INPUT_W92: CSSProperties = { width: 92 };
const INPUT_W76: CSSProperties = { width: 76 };
const INPUT_W72: CSSProperties = { width: 72 };

const SINGLE_CORE_CONNECTION_OPTIONS = [
  { value: 'line_1ph', label: 'Линия' },
  { value: 'loop_1ph', label: 'Петля' },
  { value: 'star_3ph', label: 'Звезда' },
];

const THREE_CORE_CONNECTION_OPTIONS = [
  { value: 'line_1ph', label: 'Линия' },
  { value: 'loop_2x3', label: 'Петля 2×3' },
  { value: 'loop_1x3', label: 'Петля 1×3' },
  { value: 'star_3x3', label: 'Звезда 3×3' },
  { value: 'star_1x3', label: 'Звезда 1×3' },
];

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

function ElecCalcElectricalTypeControls({
  cableType,
  block = false,
  recalc,
  setRecalc,
}: ElecCalcElectricalTypeControlsProps) {
  if (!cableType) return null;

  const wrap = (content: ReactNode) =>
    block ? <div style={WRAP_STYLE}>{content}</div> : content;

  const voltageControl = (
    <>
      <Text style={HINT_STYLE}>U, В:</Text>
      <InputNumber<number>
        aria-label="Напряжение питания"
        size="small"
        min={1}
        value={recalc.supplyVoltage}
        onChange={setRecalc.supplyVoltage}
        style={INPUT_W76}
      />
    </>
  );

  if (cableType === 'self_regulating') {
    return wrap(voltageControl);
  }

  if (cableType === 'self_regulating_tt') {
    return wrap(
      <>
        <Text style={HINT_STYLE}>T проп., °C:</Text>
        <InputNumber<number>
          aria-label="T пропарки"
          size="small"
          value={recalc.vaporTemperature}
          onChange={setRecalc.vaporTemperature}
          style={INPUT_W92}
        />
        <Text style={HINT_STYLE}>T3, °C:</Text>
        <InputNumber<number>
          aria-label="T3 поддержания"
          size="small"
          value={recalc.maintainTemperature}
          onChange={setRecalc.maintainTemperature}
          style={INPUT_W92}
        />
        <Checkbox
          checked={recalc.aggressiveProduct}
          onChange={(event) => setRecalc.aggressiveProduct(event.target.checked)}
        >
          <span style={AGGR_LABEL_STYLE}>агр.</span>
        </Checkbox>
        {voltageControl}
      </>,
    );
  }
  if (cableType === 'single_core' || cableType === 'three_core') {
    const connectionOptions = cableType === 'single_core'
      ? SINGLE_CORE_CONNECTION_OPTIONS
      : THREE_CORE_CONNECTION_OPTIONS;
    return wrap(
      <>
        <Select
          aria-label="Схема подключения"
          size="small"
          value={recalc.connectionType}
          onChange={setRecalc.connectionType}
          options={connectionOptions}
          style={SELECT_W118}
        />
        <Text style={HINT_STYLE}>U:</Text>
        <InputNumber<number> size="small" min={1} value={recalc.supplyVoltage} onChange={setRecalc.supplyVoltage} style={INPUT_W76} />
        <Text style={HINT_STYLE}>w:</Text>
        <InputNumber<number> size="small" min={1} max={1.5} step={0.05} value={recalc.windingCoefficient} onChange={setRecalc.windingCoefficient} style={INPUT_W72} />
        <Text style={HINT_STYLE}>h:</Text>
        <InputNumber<number> size="small" min={0} step={0.1} value={recalc.heatingHeight} onChange={setRecalc.heatingHeight} style={INPUT_W76} />
        <Text style={HINT_STYLE}>шаг:</Text>
        <InputNumber<number> size="small" min={0.1} max={0.4} step={0.01} value={recalc.layingStep} onChange={setRecalc.layingStep} style={INPUT_W76} />
      </>,
    );
  }
  return null;
}

export default memo(ElecCalcElectricalTypeControls);
