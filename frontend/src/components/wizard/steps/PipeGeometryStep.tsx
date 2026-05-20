import { Form, Typography } from 'antd';
import type { ReactElement } from 'react';
import UnitInputNumber from '@/components/common/UnitInputNumber';
import { findDN } from '@/utils/objectWizardUtils';
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

const { Text } = Typography;

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
  const outerDiameterMm = Form.useWatch('outer_diameter_mm', form) as number | undefined;
  const dn = outerDiameterMm ? findDN(outerDiameterMm) : null;

  return (
    <>
      <Form.Item
        className="fit-label-form-item short-number-form-item helped-form-item"
        label={fieldLabel('outer_diameter_mm')}
        name="outer_diameter_mm"
        rules={heatCalcFormFieldRules(form, 'pipe', 'outer_diameter_mm')}
        extra={
          dn != null ? (
            <Text type="secondary" style={{ fontSize: 9, whiteSpace: 'nowrap' }}>
              Соответствует DN{dn}
            </Text>
          ) : outerDiameterMm ? (
            <Text type="secondary" style={{ fontSize: 9, whiteSpace: 'nowrap' }}>
              Нестандартный размер
            </Text>
          ) : null
        }
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
        className="fit-label-form-item long-number-form-item helped-form-item"
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
