import { Form, InputNumber, Select } from 'antd';
import type { ReactElement } from 'react';
import {
  heatCalcFormFieldRules,
  heatCalcNumberInputProps,
  heatCalcSelectOptions,
} from '@/utils/heatCalcWizardFieldRules';
import type { HeatCalcFieldInputSettings } from '@/utils/heatCalcFieldInputSettings';
import {
  getHeatCalcFieldDescription,
  getHeatCalcFieldLabel,
} from '@/domain/heatCalcFields';
import HelpedControl from '../HelpedControl';
import FieldLabel from '../FieldLabel';

function withHelp(control: ReactElement, hint: string) {
  return <HelpedControl hint={hint}>{control}</HelpedControl>;
}

function fieldLabel(fieldId: string) {
  return <FieldLabel text={getHeatCalcFieldLabel(fieldId, { context: 'form', objectType: 'tank' })} />;
}

function fieldHelp(fieldId: string) {
  return getHeatCalcFieldDescription(fieldId, { objectType: 'tank' });
}

interface Props {
  fieldInputSettings?: HeatCalcFieldInputSettings;
}

export default function TankGeometryStep({ fieldInputSettings }: Props) {
  const form = Form.useFormInstance();
  const numberInputProps = (fieldId: string) =>
    heatCalcNumberInputProps('tank', fieldId, { fieldInputSettings });

  return (
    <>
      <Form.Item
        className="fixed-select-form-item helped-form-item"
        label={fieldLabel('shape')}
        name="shape"
        rules={[{ required: true, message: 'Выберите форму резервуара' }]}
      >
        {withHelp(
          <Select
            data-testid="tank-shape-select"
            options={heatCalcSelectOptions('tank', 'shape')}
            placeholder="Выберите форму"
          />,
          fieldHelp('shape'),
        )}
      </Form.Item>

      <Form.Item
        noStyle
        shouldUpdate={(prev, cur) => prev.shape !== cur.shape}
      >
        {({ getFieldValue }) => {
          const shape: string | undefined = getFieldValue('shape');
          const needDiameter = shape === 'cylindrical' || shape === 'spherical';
          const needHeight = shape === 'cylindrical' || shape === 'rectangular';
          const needLength = shape === 'rectangular';
          const needWidth = shape === 'rectangular';

          return (
            <>
              {needDiameter && (
                <Form.Item
                  className="numeric-form-item tank-size-form-item helped-form-item"
                  label={fieldLabel('diameter_mm')}
                  name="diameter_mm"
                  rules={heatCalcFormFieldRules(form, 'tank', 'diameter_mm')}
                >
                  {withHelp(
                    <InputNumber
                      data-testid="tank-diameter-input"
                      {...numberInputProps('diameter_mm')}
                      addonAfter="мм"
                    />,
                    fieldHelp('diameter_mm'),
                  )}
                </Form.Item>
              )}

              {needHeight && (
                <Form.Item
                  className="numeric-form-item tank-size-form-item helped-form-item"
                  label={fieldLabel('height_mm')}
                  name="height_mm"
                  rules={heatCalcFormFieldRules(form, 'tank', 'height_mm')}
                >
                  {withHelp(
                    <InputNumber
                      data-testid="tank-height-input"
                      {...numberInputProps('height_mm')}
                      addonAfter="мм"
                    />,
                    fieldHelp('height_mm'),
                  )}
                </Form.Item>
              )}

              {needLength && (
                <Form.Item
                  className="numeric-form-item tank-size-form-item helped-form-item"
                  label={fieldLabel('length_mm')}
                  name="length_mm"
                  rules={heatCalcFormFieldRules(form, 'tank', 'length_mm')}
                >
                  {withHelp(
                    <InputNumber
                      data-testid="tank-length-input"
                      {...numberInputProps('length_mm')}
                      addonAfter="мм"
                    />,
                    fieldHelp('length_mm'),
                  )}
                </Form.Item>
              )}

              {needWidth && (
                <Form.Item
                  className="numeric-form-item tank-size-form-item helped-form-item"
                  label={fieldLabel('width_mm')}
                  name="width_mm"
                  rules={heatCalcFormFieldRules(form, 'tank', 'width_mm')}
                >
                  {withHelp(
                    <InputNumber
                      data-testid="tank-width-input"
                      {...numberInputProps('width_mm')}
                      addonAfter="мм"
                    />,
                    fieldHelp('width_mm'),
                  )}
                </Form.Item>
              )}
            </>
          );
        }}
      </Form.Item>

      <Form.Item
        className="numeric-form-item tank-size-form-item helped-form-item"
        label={fieldLabel('wall_thickness_mm')}
        name="wall_thickness_mm"
        rules={heatCalcFormFieldRules(form, 'tank', 'wall_thickness_mm')}
      >
        {withHelp(
          <InputNumber
            data-testid="tank-wall-thickness-input"
            {...numberInputProps('wall_thickness_mm')}
            addonAfter="мм"
          />,
          fieldHelp('wall_thickness_mm'),
        )}
      </Form.Item>

      <Form.Item
        className="numeric-form-item tank-size-form-item helped-form-item"
        label={fieldLabel('wall_lambda')}
        name="wall_lambda"
        rules={heatCalcFormFieldRules(form, 'tank', 'wall_lambda')}
      >
        {withHelp(
          <InputNumber
            data-testid="tank-wall-lambda-input"
            {...numberInputProps('wall_lambda')}
            addonAfter="Вт/мК"
          />,
          fieldHelp('wall_lambda'),
        )}
      </Form.Item>
    </>
  );
}
