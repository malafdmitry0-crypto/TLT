import { Form } from 'antd';
import type { ReactElement } from 'react';
import UnitInputNumber from '@/components/common/UnitInputNumber';
import { TltSelect } from '@/components/form-controls';
import {
  heatCalcFormFieldRules,
  heatCalcNumberInputProps,
  heatCalcSelectOptions,
} from '@/utils/heatCalcWizardFieldRules';
import type { HeatCalcFieldInputSettings } from '@/utils/heatCalcFieldInputSettings';
import type { HeatCalcObjectType } from '@/types/project';
import {
  getHeatCalcFieldDescription,
  getHeatCalcFieldLabel,
} from '@/domain/heatCalcFields';
import HelpedControl from '../HelpedControl';
import FieldLabel from '../FieldLabel';

function withHelp(control: ReactElement, hint: string) {
  return <HelpedControl hint={hint}>{control}</HelpedControl>;
}

function fieldLabel(fieldId: string, objectType: HeatCalcObjectType) {
  return <FieldLabel text={getHeatCalcFieldLabel(fieldId, { context: 'form', objectType })} />;
}

function fieldHelp(fieldId: string, objectType: HeatCalcObjectType) {
  return getHeatCalcFieldDescription(fieldId, { objectType });
}

interface Props {
  objectType: HeatCalcObjectType;
  fieldInputSettings?: HeatCalcFieldInputSettings;
}

export default function ElectricalAndFittingsStep({
  objectType,
  fieldInputSettings,
}: Props) {
  const form = Form.useFormInstance();
  const numberInputProps = (
    fieldId: string,
    options: { includeStep?: boolean } = {},
  ) => heatCalcNumberInputProps(objectType, fieldId, {
    ...options,
    fieldInputSettings,
    form,
  });

  return (
    <>
      {/* Электрические параметры (supply_voltage, min_switch_temperature,
          steam_tracing, vapor_temperature) не относятся к теплорасчёту и
          вводятся на странице «Электрорасчёт» (recalc-контролы). Здесь они
          держатся скрытыми только для сохранения значения при редактировании
          объекта (round-trip) — видимый ввод из SC-03 намеренно убран.
          См. docs/analysis/sc03-heat-form-cleanup-2026-06-10.md. */}
      <Form.Item name="min_switch_temperature" hidden>
        <UnitInputNumber data-testid="min-switch-temperature-input" unit="°C" />
      </Form.Item>
      <Form.Item name="supply_voltage" hidden>
        <TltSelect
          data-testid="supply-voltage-select"
          options={heatCalcSelectOptions(objectType, 'supply_voltage')}
        />
      </Form.Item>
      {objectType === 'tank' && (
        <Form.Item
          className="numeric-form-item coefficient-form-item tank-additional-heat-loss-form-item helped-form-item"
          label={fieldLabel('q_additional', objectType)}
          name="q_additional"
          preserve={false}
          rules={heatCalcFormFieldRules(form, objectType, 'q_additional')}
        >
          {withHelp(
            <UnitInputNumber
              data-testid="q-additional-input"
              {...numberInputProps('q_additional')}
              unit="Вт"
            />,
            fieldHelp('q_additional', objectType),
          )}
        </Form.Item>
      )}
      <Form.Item name="steam_tracing" hidden>
        <TltSelect
          data-testid="steam-tracing-select"
          options={heatCalcSelectOptions(objectType, 'steam_tracing')}
        />
      </Form.Item>
      <Form.Item name="vapor_temperature" hidden>
        <UnitInputNumber data-testid="vapor-temperature-input" unit="°C" />
      </Form.Item>
      {objectType === 'pipe' && (
        <Form.Item
          className="numeric-form-item fitting-count-form-item local-elements-count-form-item helped-form-item"
          label={<span>Количество локальных элементов</span>}
          name="num_local_elements"
        >
          {withHelp(
            <UnitInputNumber
              data-testid="local-elements-count-input"
              {...numberInputProps('valve_count')}
              unit="шт"
            />,
            'Суммарное количество локальных элементов трубопровода.',
          )}
        </Form.Item>
      )}
    </>
  );
}
