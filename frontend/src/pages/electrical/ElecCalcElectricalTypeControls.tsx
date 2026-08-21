import { memo } from 'react';
import { Typography } from 'antd';
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

  // U is a system constant (230 V, CHECK-constrained project setting) — no
  // control is rendered for it in any branch.
  if (cableType === 'self_regulating') {
    return null;
  }

  if (cableType === 'self_regulating_tt') {
    return wrap(
      <>
        <Text className="electrical-params-label">h рез., м:</Text>
        <TltNumberField
          aria-label="Высота обогрева резервуара"
          disabled={disabled}
          min={0.001}
          step={0.1}
          value={recalc.heatingHeight}
          onChange={setRecalc.heatingHeight}
          className="electrical-type-control electrical-type-control--w76"
        />
        <Text className="electrical-params-label">шаг рез., м:</Text>
        <TltNumberField
          aria-label="Шаг укладки резервуара"
          disabled={disabled}
          min={0.1}
          max={0.4}
          step={0.01}
          value={recalc.layingStep}
          onChange={setRecalc.layingStep}
          className="electrical-type-control electrical-type-control--w76"
        />
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
