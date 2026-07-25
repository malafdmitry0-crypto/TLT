import { memo } from 'react';
import { Checkbox, Typography } from 'antd';

import type { CableTypeKey } from '@/domain/electrical/elecCalcMainTableModel';
import {
  SINGLE_CORE_CONNECTION_OPTIONS,
  THREE_CORE_CONNECTION_OPTIONS,
  type ElecCalcTypeControlSetters,
  type ElecCalcTypeControlValues,
} from '@/pages/electrical/elecCalcTypeControlModel';
import '../workflow-params.css';
import { TltNumberField, TltSelect } from '@/components/ui-kit';

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
          <TltSelect
            aria-label="Тип кабеля"
            disabled={disabled}
            value={cableType ?? undefined}
            onChange={(value) => {
              if (value == null) return;
              onCableTypeChange(String(value) as CableTypeKey);
            }}
            options={cableTypeOptions} className="tlt-field--min-w190"
          />
        ))}
        {isResistive && row('Схема соединения', (
          <TltSelect
            aria-label="Схема подключения"
            disabled={disabled}
            value={recalc.connectionType}
            onChange={(value) => {
              if (value != null) setRecalc.connectionType(String(value));
            }}
            options={connectionOptions} className="tlt-field--min-w190"
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
          <TltNumberField
            aria-label="Напряжение питания"
            disabled={disabled}
            min={1}
            value={recalc.supplyVoltage}
            onChange={setRecalc.supplyVoltage}
            className="workflow-params-input"
          />
        ))}
        {isTt && (
          <>
            {row('Температура пропарки (T2), °C', (
              <TltNumberField
                aria-label="T пропарки"
                disabled={disabled}
                value={recalc.vaporTemperature}
                onChange={setRecalc.vaporTemperature}
                className="workflow-params-input"
              />
            ))}
            {row('Температура поддержания (T3), °C', (
              <TltNumberField
                aria-label="T3 поддержания"
                disabled={disabled}
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
                <span className="electrical-params-label">агрессивная (-СР)</span>
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
              <TltNumberField
                aria-label="Коэффициент навива"
                disabled={disabled}
                min={1}
                max={1.5}
                step={0.05}
                value={recalc.windingCoefficient}
                onChange={setRecalc.windingCoefficient}
                className="workflow-params-input"
              />
            ))}
            {row('Высота обогрева h, м', (
              <TltNumberField
                aria-label="Высота обогрева"
                disabled={disabled}
                min={0}
                step={0.1}
                value={recalc.heatingHeight}
                onChange={setRecalc.heatingHeight}
                className="workflow-params-input"
              />
            ))}
            {row('Шаг укладки, м', (
              <TltNumberField
                aria-label="Шаг укладки"
                disabled={disabled}
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
