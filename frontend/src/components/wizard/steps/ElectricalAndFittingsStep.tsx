import { Form, InputNumber } from 'antd';
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
  showSafetyFactor?: boolean;
}

export function SafetyFactorField({ objectType, fieldInputSettings }: Pick<Props, 'objectType' | 'fieldInputSettings'>) {
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
    <Form.Item
      className="numeric-form-item coefficient-form-item safety-factor-form-item helped-form-item"
      label={fieldLabel('safety_factor', objectType)}
      name="safety_factor"
      rules={heatCalcFormFieldRules(form, objectType, 'safety_factor')}
    >
      {withHelp(
        <InputNumber
          data-testid="safety-factor-input"
          {...numberInputProps('safety_factor')}
        />,
        fieldHelp('safety_factor', objectType),
      )}
    </Form.Item>
  );
}

export default function ElectricalAndFittingsStep({
  objectType,
  fieldInputSettings,
  showSafetyFactor = true,
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
      {showSafetyFactor && (
        <SafetyFactorField
          objectType={objectType}
          fieldInputSettings={fieldInputSettings}
        />
      )}
      {objectType === 'tank' && (
        <Form.Item
          className="numeric-form-item coefficient-form-item helped-form-item"
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
        <>
          <Form.Item
            className="numeric-form-item fitting-count-form-item helped-form-item"
            label={fieldLabel('valve_count', objectType)}
            name="valve_count"
            rules={heatCalcFormFieldRules(form, objectType, 'valve_count')}
          >
            {withHelp(
              <UnitInputNumber
                data-testid="valve-count-input"
                {...numberInputProps('valve_count')}
                unit="шт"
              />,
              fieldHelp('valve_count', objectType),
            )}
          </Form.Item>
          <Form.Item
            className="numeric-form-item fitting-count-form-item helped-form-item"
            label={fieldLabel('flange_count', objectType)}
            name="flange_count"
            rules={heatCalcFormFieldRules(form, objectType, 'flange_count')}
          >
            {withHelp(
              <UnitInputNumber
                data-testid="flange-count-input"
                {...numberInputProps('flange_count')}
                unit="шт"
              />,
              fieldHelp('flange_count', objectType),
            )}
          </Form.Item>
          <Form.Item
            className="numeric-form-item fitting-count-form-item helped-form-item"
            label={fieldLabel('support_count', objectType)}
            name="support_count"
            rules={heatCalcFormFieldRules(form, objectType, 'support_count')}
          >
            {withHelp(
              <UnitInputNumber
                data-testid="support-count-input"
                {...numberInputProps('support_count')}
                unit="шт"
              />,
              fieldHelp('support_count', objectType),
            )}
          </Form.Item>
          <Form.Item
            className="numeric-form-item coefficient-form-item local-element-equiv-length-form-item helped-form-item"
            label={fieldLabel('local_element_equiv_length', objectType)}
            name="local_element_equiv_length"
            rules={heatCalcFormFieldRules(form, objectType, 'local_element_equiv_length')}
          >
            {withHelp(
              <UnitInputNumber
                data-testid="local-element-equiv-length-input"
                {...numberInputProps('local_element_equiv_length')}
                unit="м"
              />,
              fieldHelp('local_element_equiv_length', objectType),
            )}
          </Form.Item>
        </>
      )}
    </>
  );
}
