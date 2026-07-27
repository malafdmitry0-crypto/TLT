import { Form } from 'antd';
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
  part?: 'all' | 'wide' | 'numeric';
}

export default function TankGeometryStep({ fieldInputSettings, part = 'all' }: Props) {
  const form = Form.useFormInstance();
  const numberInputProps = (fieldId: string) =>
    heatCalcNumberInputProps('tank', fieldId, { fieldInputSettings, form });
  const selectInputProps = (fieldId: string) =>
    heatCalcSelectInputProps('tank', fieldId, { form });
  const shape = Form.useWatch('shape', form) as string | undefined;
  const needDiameter = shape === 'cylindrical' || shape === 'spherical';
  const needHeight = shape === 'cylindrical' || shape === 'rectangular';
  const needLength = shape === 'rectangular';
  const needWidth = shape === 'rectangular';

  return (
    <>
      {(part === 'all' || part === 'wide') && <Form.Item
        className="fixed-select-form-item tank-shape-form-item helped-form-item"
        label={fieldLabel('shape')}
        name="shape"
        rules={heatCalcFormFieldRules(form, 'tank', 'shape')}
      >
        {withHelp(
          <TltSelect
            data-testid="tank-shape-select"
            {...selectInputProps('shape')}
            options={heatCalcSelectOptions('tank', 'shape')}
            placeholder="Выберите форму"
          />,
          fieldHelp('shape'),
        )}
      </Form.Item>}

      {(part === 'all' || part === 'numeric') && needDiameter && (
        <Form.Item
          className="numeric-form-item tank-size-form-item tank-diameter-form-item helped-form-item"
          label={fieldLabel('diameter_mm')}
          name="diameter_mm"
          rules={heatCalcFormFieldRules(form, 'tank', 'diameter_mm')}
        >
          {withHelp(
            <UnitInputNumber
              data-testid="tank-diameter-input"
              {...numberInputProps('diameter_mm')}
              unit="мм"
            />,
            fieldHelp('diameter_mm'),
          )}
        </Form.Item>
      )}

      {(part === 'all' || part === 'numeric') && needHeight && (
        <Form.Item
          className="numeric-form-item tank-size-form-item tank-height-form-item helped-form-item"
          label={fieldLabel('height_mm')}
          name="height_mm"
          rules={heatCalcFormFieldRules(form, 'tank', 'height_mm')}
        >
          {withHelp(
            <UnitInputNumber
              data-testid="tank-height-input"
              {...numberInputProps('height_mm')}
              unit="мм"
            />,
            fieldHelp('height_mm'),
          )}
        </Form.Item>
      )}

      {(part === 'all' || part === 'numeric') && needLength && (
        <Form.Item
          className="numeric-form-item tank-size-form-item tank-length-form-item helped-form-item"
          label={fieldLabel('length_mm')}
          name="length_mm"
          rules={heatCalcFormFieldRules(form, 'tank', 'length_mm')}
        >
          {withHelp(
            <UnitInputNumber
              data-testid="tank-length-input"
              {...numberInputProps('length_mm')}
              unit="мм"
            />,
            fieldHelp('length_mm'),
          )}
        </Form.Item>
      )}

      {(part === 'all' || part === 'numeric') && needWidth && (
        <Form.Item
          className="numeric-form-item tank-size-form-item tank-width-form-item helped-form-item"
          label={fieldLabel('width_mm')}
          name="width_mm"
          rules={heatCalcFormFieldRules(form, 'tank', 'width_mm')}
        >
          {withHelp(
            <UnitInputNumber
              data-testid="tank-width-input"
              {...numberInputProps('width_mm')}
              unit="мм"
            />,
            fieldHelp('width_mm'),
          )}
        </Form.Item>
      )}

      {(part === 'all' || part === 'numeric') && <Form.Item
        className="numeric-form-item tank-size-form-item tank-wall-thickness-form-item helped-form-item"
        label={fieldLabel('wall_thickness_mm')}
        name="wall_thickness_mm"
        rules={heatCalcFormFieldRules(form, 'tank', 'wall_thickness_mm')}
      >
        {withHelp(
          <UnitInputNumber
            data-testid="tank-wall-thickness-input"
            {...numberInputProps('wall_thickness_mm')}
                    unit="мм"
          />,
          fieldHelp('wall_thickness_mm'),
        )}
      </Form.Item>}

      {(part === 'all' || part === 'numeric') && <Form.Item
        className="numeric-form-item tank-size-form-item tank-wall-lambda-form-item helped-form-item"
        label={fieldLabel('wall_lambda')}
        name="wall_lambda"
        rules={heatCalcFormFieldRules(form, 'tank', 'wall_lambda')}
      >
        {withHelp(
          <UnitInputNumber
            data-testid="tank-wall-lambda-input"
            {...numberInputProps('wall_lambda')}
                    unit="Вт/мК"
          />,
          fieldHelp('wall_lambda'),
        )}
      </Form.Item>}
    </>
  );
}
