import { Form } from 'antd';
import type { ReactElement } from 'react';
import UnitInputNumber from '@/components/common/UnitInputNumber';
import {
  heatCalcFormFieldRules,
  heatCalcNumberInputProps,
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
  return <FieldLabel text={getHeatCalcFieldLabel(fieldId, { context: 'form', objectType: 'pipe' })} />;
}

function fieldHelp(fieldId: string) {
  return getHeatCalcFieldDescription(fieldId, { objectType: 'pipe' });
}

interface Props {
  fieldInputSettings?: HeatCalcFieldInputSettings;
}

export default function PipeGeometryStep({ fieldInputSettings }: Props) {
  const form = Form.useFormInstance();
  const numberInputProps = (fieldId: string) =>
    heatCalcNumberInputProps('pipe', fieldId, { fieldInputSettings, form });

  return (
    <>
      <Form.Item
        className="fit-label-form-item short-number-form-item outer-diameter-form-item helped-form-item"
        label={fieldLabel('outer_diameter_mm')}
        name="outer_diameter_mm"
        rules={heatCalcFormFieldRules(form, 'pipe', 'outer_diameter_mm')}
      >
        {withHelp(
          <UnitInputNumber
            data-testid="outer-diameter-input"
            {...numberInputProps('outer_diameter_mm')}
            unit="мм"
          />,
          fieldHelp('outer_diameter_mm'),
        )}
      </Form.Item>

      <Form.Item
        className="fit-label-form-item long-number-form-item pipe-length-form-item helped-form-item"
        label={fieldLabel('pipe_length')}
        name="pipe_length"
        rules={heatCalcFormFieldRules(form, 'pipe', 'pipe_length')}
      >
        {withHelp(
          <UnitInputNumber
            data-testid="pipe-length-input"
            {...numberInputProps('pipe_length')}
            unit="м"
          />,
          fieldHelp('pipe_length'),
        )}
      </Form.Item>
    </>
  );
}
