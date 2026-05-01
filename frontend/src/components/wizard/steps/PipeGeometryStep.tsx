import { Form, InputNumber, Typography } from 'antd';
import type { ReactElement } from 'react';
import { findDN } from '@/utils/objectWizardUtils';
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
  return (
    <>
      <Form.Item noStyle shouldUpdate={(prev, cur) => prev.outer_diameter_mm !== cur.outer_diameter_mm}>
        {({ getFieldValue }) => {
          const mm: number | undefined = getFieldValue('outer_diameter_mm');
          const dn = mm ? findDN(mm) : null;
          return (
            <Form.Item
              className="fit-label-form-item helped-form-item"
              label={fieldLabel('Ø')}
              name="outer_diameter_mm"
              rules={[
                { required: true, message: 'Укажите наружный диаметр' },
                { type: 'number', min: 10.8, message: 'Минимальный диаметр — 10,8 мм (DN10)' },
                { type: 'number', max: 3000, message: 'Максимальный диаметр — 3000 мм' },
              ]}
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
                  min={10.8}
                  max={3000}
                  step={1}
                  addonAfter="мм"
                />,
                'Наружный диаметр трубопровода Ø, мм. Диапазон: 10,8–3000 мм. Стандартные размеры DN10–DN1000.',
              )}
            </Form.Item>
          );
        }}
      </Form.Item>

      <Form.Item
        className="fit-label-form-item helped-form-item"
        label={fieldLabel('Длина трубопровода')}
        name="pipe_length"
        rules={[
          { required: true, message: 'Укажите длину трубопровода' },
          { type: 'number', min: 0.5, message: 'Минимальная длина — 0,5 м' },
          { type: 'number', max: 200000, message: 'Максимальная длина — 200 000 м' },
        ]}
      >
        {withHelp(
          <InputNumber min={0.5} max={200000} step={1} style={{ width: '100%' }} addonAfter="м" />,
          'Длина обогреваемого участка. Диапазон: 0,5–200 000 м.',
        )}
      </Form.Item>
    </>
  );
}
