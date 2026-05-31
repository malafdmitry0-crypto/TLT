import { Form, InputNumber } from 'antd';
import type { ReactElement } from 'react';
import UnitInputNumber from '@/components/common/UnitInputNumber';
import { TltSelect } from '@/components/form-controls';
import {
  heatCalcFormFieldRules,
  heatCalcNumberInputProps,
  heatCalcSelectInputProps,
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

export default function ElectricalAndFittingsStep({ objectType, fieldInputSettings }: Props) {
  const form = Form.useFormInstance();
  const numberInputProps = (
    fieldId: string,
    options: { includeStep?: boolean } = {},
  ) => heatCalcNumberInputProps(objectType, fieldId, {
    ...options,
    fieldInputSettings,
    form,
  });
  const selectInputProps = (fieldId: string) =>
    heatCalcSelectInputProps(objectType, fieldId, { form });

  return (
    <>
      <Form.Item
        className="numeric-form-item temperature-number-form-item helped-form-item"
        label={fieldLabel('min_switch_temperature', objectType)}
        name="min_switch_temperature"
        rules={heatCalcFormFieldRules(form, objectType, 'min_switch_temperature')}
      >
        {withHelp(
          <UnitInputNumber
            data-testid="min-switch-temperature-input"
            {...numberInputProps('min_switch_temperature')}
            unit="°C"
          />,
          fieldHelp('min_switch_temperature', objectType),
        )}
      </Form.Item>
      <Form.Item
        className="compact-select-form-item helped-form-item"
        label={fieldLabel('supply_voltage', objectType)}
        name="supply_voltage"
      >
        {withHelp(
          <TltSelect
            data-testid="supply-voltage-select"
            {...selectInputProps('supply_voltage')}
            options={heatCalcSelectOptions(objectType, 'supply_voltage')}
            placeholder="Выберите"
          />,
          fieldHelp('supply_voltage', objectType),
        )}
      </Form.Item>
      <Form.Item
        className="numeric-form-item coefficient-form-item helped-form-item"
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
      <Form.Item
        className="compact-select-form-item helped-form-item"
        label={fieldLabel('steam_tracing', objectType)}
        name="steam_tracing"
      >
        {withHelp(
          <TltSelect
            data-testid="steam-tracing-select"
            {...selectInputProps('steam_tracing')}
            options={heatCalcSelectOptions(objectType, 'steam_tracing')}
            placeholder="Выберите"
          />,
          fieldHelp('steam_tracing', objectType),
        )}
      </Form.Item>
      <Form.Item
        className="numeric-form-item temperature-number-form-item helped-form-item"
        label={fieldLabel('vapor_temperature', objectType)}
        name="vapor_temperature"
        rules={heatCalcFormFieldRules(form, objectType, 'vapor_temperature')}
      >
        {withHelp(
          <UnitInputNumber
            data-testid="vapor-temperature-input"
            {...numberInputProps('vapor_temperature')}
            unit="°C"
          />,
          fieldHelp('vapor_temperature', objectType),
        )}
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
            className="numeric-form-item coefficient-form-item helped-form-item"
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
