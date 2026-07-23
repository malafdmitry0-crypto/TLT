import { memo } from 'react';
import { Checkbox, InputNumber, Select, Typography } from 'antd';
import type { CSSProperties, ReactNode } from 'react';

import type { CableTypeKey } from '@/domain/electrical/elecCalcMainTableModel';
import {
  SINGLE_CORE_CONNECTION_OPTIONS,
  THREE_CORE_CONNECTION_OPTIONS,
  type ElecCalcTypeControlSetters,
  type ElecCalcTypeControlValues,
} from '@/pages/electrical/elecCalcTypeControlModel';

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

type ElecCalcElectricalTypeControlsProps = {
  disabled?: boolean;
  cableType: CableTypeKey | null;
  block?: boolean;
  recalc: ElecCalcTypeControlValues;
  setRecalc: ElecCalcTypeControlSetters;
};

function ElecCalcElectricalTypeControls({
  disabled = false,
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
        disabled={disabled}
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
          disabled={disabled}
          size="small"
          value={recalc.vaporTemperature}
          onChange={setRecalc.vaporTemperature}
          style={INPUT_W92}
        />
        <Text style={HINT_STYLE}>T3, °C:</Text>
        <InputNumber<number>
          aria-label="T3 поддержания"
          disabled={disabled}
          size="small"
          value={recalc.maintainTemperature}
          onChange={setRecalc.maintainTemperature}
          style={INPUT_W92}
        />
        <Checkbox
          disabled={disabled}
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
          disabled={disabled}
          size="small"
          value={recalc.connectionType}
          onChange={setRecalc.connectionType}
          options={connectionOptions}
          style={SELECT_W118}
        />
        <Text style={HINT_STYLE}>U:</Text>
        <InputNumber<number> disabled={disabled} size="small" min={1} value={recalc.supplyVoltage} onChange={setRecalc.supplyVoltage} style={INPUT_W76} />
        <Text style={HINT_STYLE}>w:</Text>
        <InputNumber<number> disabled={disabled} size="small" min={1} max={1.5} step={0.05} value={recalc.windingCoefficient} onChange={setRecalc.windingCoefficient} style={INPUT_W72} />
        <Text style={HINT_STYLE}>h:</Text>
        <InputNumber<number> disabled={disabled} size="small" min={0} step={0.1} value={recalc.heatingHeight} onChange={setRecalc.heatingHeight} style={INPUT_W76} />
        <Text style={HINT_STYLE}>шаг:</Text>
        <InputNumber<number> disabled={disabled} size="small" min={0.1} max={0.4} step={0.01} value={recalc.layingStep} onChange={setRecalc.layingStep} style={INPUT_W76} />
      </>,
    );
  }
  return null;
}

export default memo(ElecCalcElectricalTypeControls);
