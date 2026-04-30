import { Form, InputNumber, Tooltip, Typography } from 'antd';
import { InfoCircleOutlined } from '@ant-design/icons';
import { findDN } from '@/utils/objectWizardUtils';

const { Text } = Typography;

function HelpIcon({ text }: { text: string }) {
  return (
    <Tooltip title={text}>
      <InfoCircleOutlined style={{ color: '#8c8c8c', cursor: 'help', flexShrink: 0 }} />
    </Tooltip>
  );
}

function label(text: string, hint: string) {
  return (
    <>
      <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', flex: 1, minWidth: 0 }}>
        {text}
      </span>
      <HelpIcon text={hint} />
    </>
  );
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
              label={label(
                'Наружный диаметр трубы, мм',
                'Наружный диаметр трубопровода. Диапазон: 10,8–3000 мм. Стандартные размеры DN10–DN1000.'
              )}
              name="outer_diameter_mm"
              rules={[
                { required: true, message: 'Укажите наружный диаметр' },
                { type: 'number', min: 10.8, message: 'Минимальный диаметр — 10,8 мм (DN10)' },
                { type: 'number', max: 3000, message: 'Максимальный диаметр — 3000 мм' },
              ]}
              extra={
                dn != null ? (
                  <Text type="secondary" style={{ fontSize: 12 }}>
                    Соответствует DN{dn}
                  </Text>
                ) : mm ? (
                  <Text type="secondary" style={{ fontSize: 12 }}>
                    Нестандартный размер
                  </Text>
                ) : null
              }
            >
              <InputNumber
                min={10.8}
                max={3000}
                step={1}
                               addonAfter="мм"
              />
            </Form.Item>
          );
        }}
      </Form.Item>

      <Form.Item
        label={label(
          'Длина трубопровода, м',
          'Длина обогреваемого участка. Диапазон: 0,5–200 000 м.'
        )}
        name="pipe_length"
        rules={[
          { required: true, message: 'Укажите длину трубопровода' },
          { type: 'number', min: 0.5, message: 'Минимальная длина — 0,5 м' },
          { type: 'number', max: 200000, message: 'Максимальная длина — 200 000 м' },
        ]}
      >
        <InputNumber min={0.5} max={200000} step={1} style={{ width: '100%' }} addonAfter="м" />
      </Form.Item>
    </>
  );
}
