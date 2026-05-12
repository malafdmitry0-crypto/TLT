import { Form, InputNumber, Typography } from 'antd';
import type { ReactElement } from 'react';
import { findDN } from '@/utils/objectWizardUtils';
import {
  heatCalcFormFieldRules,
  heatCalcNumberInputProps,
} from '@/utils/heatCalcWizardFieldRules';
import HelpedControl from '../HelpedControl';
import FieldLabel from '../FieldLabel';

const { Text } = Typography;

function withHelp(control: ReactElement, hint: string) {
  return <HelpedControl hint={hint}>{control}</HelpedControl>;
}

function fieldLabel(text: string) {
  return <FieldLabel text={text} />;
}

export default function PipeGeometryStep() {
  const form = Form.useFormInstance();

  return (
    <>
      <Form.Item noStyle shouldUpdate={(prev, cur) => prev.outer_diameter_mm !== cur.outer_diameter_mm}>
        {({ getFieldValue }) => {
          const mm: number | undefined = getFieldValue('outer_diameter_mm');
          const dn = mm ? findDN(mm) : null;
          return (
            <Form.Item
              className="fit-label-form-item short-number-form-item helped-form-item"
              label={fieldLabel('Наружный Ø трубопровода')}
              name="outer_diameter_mm"
              rules={heatCalcFormFieldRules(form, 'pipe', 'outer_diameter_mm')}
              extra={
                dn != null ? (
                  <Text type="secondary" style={{ fontSize: 9, whiteSpace: 'nowrap' }}>
                    Соответствует DN{dn}
                  </Text>
                ) : mm ? (
                  <Text type="secondary" style={{ fontSize: 9, whiteSpace: 'nowrap' }}>
                    Нестандартный размер
                  </Text>
                ) : null
              }
            >
              {withHelp(
                <InputNumber
                  data-testid="outer-diameter-input"
                  {...heatCalcNumberInputProps('pipe', 'outer_diameter_mm')}
                  addonAfter="мм"
                />,
                'Наружный диаметр трубопровода Ø, мм. Диапазон ТНП: 10,8–3000 мм. Стандартные размеры DN10–DN1000.',
              )}
            </Form.Item>
          );
        }}
      </Form.Item>

      <Form.Item
        className="fit-label-form-item long-number-form-item helped-form-item"
        label={fieldLabel('Длина трубопровода')}
        name="pipe_length"
        rules={heatCalcFormFieldRules(form, 'pipe', 'pipe_length')}
      >
        {withHelp(
          <InputNumber
            data-testid="pipe-length-input"
            {...heatCalcNumberInputProps('pipe', 'pipe_length')}
            addonAfter="м"
          />,
          'Длина обогреваемого участка. Диапазон ТНП: 0,5–200 000 м.',
        )}
      </Form.Item>
    </>
  );
}
