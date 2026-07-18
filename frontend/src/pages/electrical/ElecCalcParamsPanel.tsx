import { memo } from 'react';
import { Checkbox, InputNumber, Select, Typography } from 'antd';

import type { CableTypeKey } from '@/pages/electrical/elecCalcMainTableModel';
import {
  SINGLE_CORE_CONNECTION_OPTIONS,
  THREE_CORE_CONNECTION_OPTIONS,
  type ElecCalcTypeControlSetters,
  type ElecCalcTypeControlValues,
} from '@/pages/electrical/elecCalcTypeControlModel';

const { Text } = Typography;

type ElecCalcParamsPanelProps = {
  disabled?: boolean;
  cableType: CableTypeKey | null;
  cableTypeOptions: Array<{ label: string; value: CableTypeKey }>;
  onCableTypeChange: (next: CableTypeKey) => void;
  recalc: ElecCalcTypeControlValues;
  setRecalc: ElecCalcTypeControlSetters;
};

function row(label: string, control: React.ReactNode) {
  return (
    <div className="workflow-params-row">
      <Text className="workflow-params-label">{label}</Text>
      {control}
    </div>
  );
}

/**
 * Блок заполнения параметров электрорасчёта — оранжевый блок листа ТНП
 * «Список переменных» (алгоритм выбора кабеля). Визуально повторяет секции
 * SC-03 на теплорасчёте. Пишет в тот же recalc-state, что и компактные
 * контролы тулбара (которые скрываются, пока панель видима).
 */
function ElecCalcParamsPanel({
  disabled = false,
  cableType,
  cableTypeOptions,
  onCableTypeChange,
  recalc,
  setRecalc,
}: ElecCalcParamsPanelProps) {
  const isTt = cableType === 'self_regulating_tt';
  const isResistive = cableType === 'single_core' || cableType === 'three_core';
  const connectionOptions = cableType === 'single_core'
    ? SINGLE_CORE_CONNECTION_OPTIONS
    : THREE_CORE_CONNECTION_OPTIONS;

  return (
    <div className="form-grid-srs workflow-params-panel" data-testid="eleccalc-params-panel">
      <div className="form-col-srs">
        <h4 data-step={1}><span>Кабель и схема подключения</span></h4>
        {row('Тип кабеля', (
          <Select<CableTypeKey>
            aria-label="Тип кабеля"
            disabled={disabled}
            size="small"
            value={cableType ?? undefined}
            onChange={onCableTypeChange}
            options={cableTypeOptions}
            style={{ minWidth: 190, flex: 1 }}
          />
        ))}
        {isResistive && row('Схема соединения', (
          <Select
            aria-label="Схема подключения"
            disabled={disabled}
            size="small"
            value={recalc.connectionType}
            onChange={setRecalc.connectionType}
            options={connectionOptions}
            style={{ minWidth: 190, flex: 1 }}
          />
        ))}
        {!isResistive && (
          <Text className="workflow-params-hint">
            Марка кабеля — авторасчёт или ручной выбор по объекту
            (кнопки «Выбор» / «Подбор» в таблице).
          </Text>
        )}
      </div>

      <div className="form-col-srs">
        <h4 data-step={2}><span>Электропитание и температуры</span></h4>
        {row('Напряжение питания U, В', (
          <InputNumber<number>
            aria-label="Напряжение питания"
            disabled={disabled}
            size="small"
            min={1}
            value={recalc.supplyVoltage}
            onChange={setRecalc.supplyVoltage}
            className="workflow-params-input"
          />
        ))}
        {isTt && (
          <>
            {row('Температура пропарки (T2), °C', (
              <InputNumber<number>
                aria-label="T пропарки"
                disabled={disabled}
                size="small"
                value={recalc.vaporTemperature}
                onChange={setRecalc.vaporTemperature}
                className="workflow-params-input"
              />
            ))}
            {row('Температура поддержания (T3), °C', (
              <InputNumber<number>
                aria-label="T3 поддержания"
                disabled={disabled}
                size="small"
                value={recalc.maintainTemperature}
                onChange={setRecalc.maintainTemperature}
                className="workflow-params-input"
              />
            ))}
            {row('Среда воздействия на кабель (продукт)', (
              <Checkbox
                disabled={disabled}
                checked={recalc.aggressiveProduct}
                onChange={(event) => setRecalc.aggressiveProduct(event.target.checked)}
              >
                <span style={{ fontSize: 12 }}>агрессивная (-СР)</span>
              </Checkbox>
            ))}
          </>
        )}
      </div>

      <div className="form-col-srs">
        <h4 data-step={3}><span>Укладка кабеля</span></h4>
        {isResistive ? (
          <>
            {row('Коэффициент навива w (1–1,5)', (
              <InputNumber<number>
                aria-label="Коэффициент навива"
                disabled={disabled}
                size="small"
                min={1}
                max={1.5}
                step={0.05}
                value={recalc.windingCoefficient}
                onChange={setRecalc.windingCoefficient}
                className="workflow-params-input"
              />
            ))}
            {row('Высота обогрева h, м', (
              <InputNumber<number>
                aria-label="Высота обогрева"
                disabled={disabled}
                size="small"
                min={0}
                step={0.1}
                value={recalc.heatingHeight}
                onChange={setRecalc.heatingHeight}
                className="workflow-params-input"
              />
            ))}
            {row('Шаг укладки, м', (
              <InputNumber<number>
                aria-label="Шаг укладки"
                disabled={disabled}
                size="small"
                min={0.1}
                max={0.4}
                step={0.01}
                value={recalc.layingStep}
                onChange={setRecalc.layingStep}
                className="workflow-params-input"
              />
            ))}
          </>
        ) : (
          <Text className="workflow-params-hint">
            Шаг навива и количество ниток задаются для каждого объекта
            (колонки таблицы или модалка «Подбор»). Лимит Kn по диаметру —
            по таблице ТНП.
          </Text>
        )}
      </div>
    </div>
  );
}

export default memo(ElecCalcParamsPanel);
