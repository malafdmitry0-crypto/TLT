import { memo } from 'react';
import { Typography } from 'antd';

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
        <h4 data-step={2}><span>Расчётные входы</span></h4>
        {!isTt && row('Напряжение питания U, В', (
          <TltNumberField
            aria-label="Напряжение питания"
            disabled
            readOnly
            min={1}
            value={recalc.supplyVoltage ?? 230}
            className="workflow-params-input"
          />
        ))}
        {isTt && (
          <>
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
            <Text className="workflow-params-hint">
              Tокр, Tпрод и коэффициент запаса K берутся из исходных данных
              Heat каждого объекта. Напряжение применяется после выбора марки —
              для тока и секционирования.
            </Text>
            <Text className="workflow-params-hint">
              Критерий подбора: Технический минимум. Коммерческие критерии
              применяются отдельно только при наличии данных.
            </Text>
          </>
        )}
      </div>

      <div className="form-col-srs">
        <h4 data-step={3}><span>Укладка кабеля</span></h4>
        {isResistive || isTt ? (
          <>
            {isResistive && row('Коэффициент навива w (1–1,5)', (
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
            {row(isTt ? 'Высота обогрева резервуара, м' : 'Высота обогрева h, м', (
              <TltNumberField
                aria-label={isTt ? 'Высота обогрева резервуара' : 'Высота обогрева'}
                disabled={disabled}
                min={isTt ? 0.001 : 0}
                step={0.1}
                value={recalc.heatingHeight}
                onChange={setRecalc.heatingHeight}
                className="workflow-params-input"
              />
            ))}
            {row(isTt ? 'Шаг укладки резервуара, м' : 'Шаг укладки, м', (
              <TltNumberField
                aria-label={isTt ? 'Шаг укладки резервуара' : 'Шаг укладки'}
                disabled={disabled}
                min={0.1}
                max={0.4}
                step={0.01}
                value={recalc.layingStep}
                onChange={setRecalc.layingStep}
                className="workflow-params-input"
              />
            ))}
            {isTt && (
              <Text className="workflow-params-hint">
                Шаг навива и количество ниток задаются для каждой трубы в
                таблице или в «Подборе»; для резервуара используются высота и
                шаг укладки выше.
              </Text>
            )}
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
