import { memo } from 'react';
import { Checkbox, Typography } from 'antd';
import type { ReactNode } from 'react';

import type { CableTypeKey } from '@/domain/electrical/elecCalcMainTableModel';
import {
  SINGLE_CORE_CONNECTION_OPTIONS,
  THREE_CORE_CONNECTION_OPTIONS,
  type ElecCalcTypeControlSetters,
  type ElecCalcTypeControlValues,
} from '@/pages/electrical/elecCalcTypeControlModel';
import { TltNumberField, TltSelect } from '@/components/ui-kit';

import '@/pages/electrical/elec-workspace.css';

const { Text } = Typography;

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
    block ? <div className="electrical-type-controls">{content}</div> : content;

  // E1 / FE-28: U is always 230 V read-only (DEC-11).
  const voltageControl = (
    <>
      <Text className="electrical-params-label">U, В:</Text>
      <TltNumberField
        aria-label="Напряжение питания"
        disabled
        readOnly
        min={1}
        value={recalc.supplyVoltage ?? 230}
        className="electrical-type-control electrical-type-control--w76"
      />
    </>
  );

  if (cableType === 'self_regulating') {
    return wrap(voltageControl);
  }

  if (cableType === 'self_regulating_tt') {
    return wrap(
      <>
        <Text className="electrical-params-label">T проп., °C:</Text>
        <TltNumberField
          aria-label="T пропарки"
          disabled={disabled}
          value={recalc.vaporTemperature}
          onChange={setRecalc.vaporTemperature}
          className="electrical-type-control electrical-type-control--w92"
        />
        <Text className="electrical-params-label">T3, °C:</Text>
        <TltNumberField
          aria-label="T3 поддержания"
          disabled={disabled}
          value={recalc.maintainTemperature}
          onChange={setRecalc.maintainTemperature}
          className="electrical-type-control electrical-type-control--w92"
        />
        <Checkbox
          disabled={disabled}
          checked={recalc.aggressiveProduct}
          onChange={(event) => setRecalc.aggressiveProduct(event.target.checked)}
        >
          <span className="electrical-type-controls__aggr-label">агр.</span>
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
        <TltSelect
          aria-label="Схема подключения"
          disabled={disabled}
          value={recalc.connectionType}
          onChange={(value) => {
            if (value != null) setRecalc.connectionType(String(value));
          }}
          options={connectionOptions}
          className="electrical-type-control electrical-type-control--w118"
        />
        <Text className="electrical-params-label">U:</Text>
        <TltNumberField
          disabled
          readOnly
          min={1}
          value={recalc.supplyVoltage ?? 230}
          className="electrical-type-control electrical-type-control--w76"
          aria-label="Напряжение"
        />
        <Text className="electrical-params-label">w:</Text>
        <TltNumberField
          disabled={disabled}
          min={1}
          max={1.5}
          step={0.05}
          value={recalc.windingCoefficient}
          onChange={setRecalc.windingCoefficient}
          className="electrical-type-control electrical-type-control--w72"
          aria-label="Коэффициент навива"
        />
        <Text className="electrical-params-label">h:</Text>
        <TltNumberField
          disabled={disabled}
          min={0}
          step={0.1}
          value={recalc.heatingHeight}
          onChange={setRecalc.heatingHeight}
          className="electrical-type-control electrical-type-control--w76"
          aria-label="Высота обогрева"
        />
        <Text className="electrical-params-label">шаг:</Text>
        <TltNumberField
          disabled={disabled}
          min={0.1}
          max={0.4}
          step={0.01}
          value={recalc.layingStep}
          onChange={setRecalc.layingStep}
          className="electrical-type-control electrical-type-control--w76"
          aria-label="Шаг укладки"
        />
      </>,
    );
  }
  return null;
}

export default memo(ElecCalcElectricalTypeControls);
